import { defaultAxiosInstance as axios } from '@clerk/tanstack-react-start/server';
import { convexQuery } from '@convex-dev/react-query';
import { createServerFn } from '@tanstack/react-start';
import { auth } from '@clerk/tanstack-react-start/server';
import { ConvexHttpClient } from 'convex/browser';

const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL;
const clerkJwtTemplate = process.env.CLERK_JWT_TEMPLATE_NAME || "convex";

// Server function to get auth state
export const getAuthState = createServerFn({ method: 'GET' }).handler(async () => {
  const { isAuthenticated, userId } = await auth();
  return { isAuthenticated, userId };
});

// Server function to get current user
export const getCurrentUser = createServerFn({ method: 'GET' }).handler(async () => {
  try {
    const { isAuthenticated, userId } = await auth();
    
    if (!isAuthenticated || !userId) {
      return null;
    }

    // Get user details from Clerk's backend API
    // This would need to be implemented based on your Clerk setup
    return {
      id: userId,
      primaryEmail: null, // Would need to fetch from Clerk
      displayName: null,
      imageUrl: null,
    };
  } catch (error) {
    console.error("Failed to get user:", error);
    return null;
  }
});

// Server function to get auth token
export const getAuthToken = createServerFn({ method: 'GET' }).handler(async () => {
  try {
    const clerkAuth = await auth();
    // Get token from Clerk's auth object
    // Note: In TanStack Start, tokens are handled differently than Next.js
    return { token: null }; // Placeholder - actual implementation depends on Clerk setup
  } catch (error) {
    console.error("Failed to get token:", error);
    return { token: null };
  }
});

// Server function to get Convex client with auth
export const getConvexClientWithAuth = createServerFn({ method: 'GET' }).handler(async () => {
  if (!convexUrl) {
    throw new Error("NEXT_PUBLIC_CONVEX_URL environment variable is not set");
  }

  const httpClient = new ConvexHttpClient(convexUrl);

  // Get auth token and set it on client
  const authResult = await getAuthToken();
  if (authResult.token) {
    httpClient.setAuth(authResult.token);
  }

  return httpClient;
});
