import { NextResponse } from "next/server";
import { getUser } from "@/lib/auth-server";
import { fetchQuery, fetchMutation } from "convex/nextjs";
import { api } from "@/convex/_generated/api";
import { headers } from "next/headers";

interface GitHubRepo {
  id: number;
  name: string;
  full_name: string;
  description: string | null;
  html_url: string;
  private: boolean;
  language: string | null;
  updated_at: string;
  stargazers_count: number;
}

// Rate limit: 30 requests per minute per user
const RATE_LIMIT = 30;
const RATE_WINDOW_MS = 60 * 1000; // 1 minute

async function checkRateLimit(userId: string): Promise<{ allowed: boolean; message?: string }> {
  const key = `github_import:repos:${userId}`;
  const result = await fetchMutation(api.rateLimit.checkRateLimit, {
    key,
    limit: RATE_LIMIT,
    windowMs: RATE_WINDOW_MS,
  });

  if (!result.success) {
    return {
      allowed: false,
      message: result.message || "Rate limit exceeded. Please try again later.",
    };
  }

  return { allowed: true };
}

export async function GET() {
  const user = await getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!user.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Check rate limit
  const rateLimitCheck = await checkRateLimit(user.id);
  if (!rateLimitCheck.allowed) {
    return NextResponse.json(
      { error: rateLimitCheck.message },
      { status: 429 }
    );
  }

  try {
    // Get OAuth connection
    const connection = await fetchQuery((api as any).oauth.getConnection, {
      provider: "github",
    });

    if (!connection) {
      return NextResponse.json(
        { error: "GitHub not connected" },
        { status: 401 }
      );
    }

    // Fetch repositories from GitHub API
    const response = await fetch(
      "https://api.github.com/user/repos?per_page=100&sort=updated",
      {
        headers: {
          Authorization: `Bearer ${connection.accessToken}`,
          "User-Agent": "ZapDev",
        },
      }
    );

    if (!response.ok) {
      if (response.status === 401) {
        // Token might be expired or revoked
        return NextResponse.json(
          { error: "GitHub token invalid, please reconnect" },
          { status: 401 }
        );
      }
      throw new Error("Failed to fetch GitHub repositories");
    }

    const repos = await response.json() as GitHubRepo[];

    return NextResponse.json({
      repositories: repos.map((repo) => ({
        id: repo.id,
        name: repo.name,
        fullName: repo.full_name,
        description: repo.description,
        url: repo.html_url,
        private: repo.private,
        language: repo.language,
        updatedAt: repo.updated_at,
        starsCount: repo.stargazers_count,
      })),
    });
  } catch (error) {
    console.error("Error fetching GitHub repositories:", error);
    return NextResponse.json(
      { error: "Failed to fetch GitHub repositories" },
      { status: 500 }
    );
  }
}
