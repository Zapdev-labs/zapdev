"use client";

import { useState, useCallback } from "react";

interface DeployOptions {
  siteId: string;
  files: Record<string, string>;
  netlifyToken?: string;
}

interface DeployResult {
  success: boolean;
  deployId?: string;
  deployUrl?: string;
  message?: string;
  suggestions?: string[];
  error?: string;
  code?: string;
}

interface UseNetlifyDeployReturn {
  deploy: (options: DeployOptions) => Promise<DeployResult>;
  isDeploying: boolean;
  lastError: string | null;
  lastSuggestions: string[];
}

const NETLIFY_TOKEN_KEY = "zapdev_netlify_token";

export function useNetlifyDeploy(): UseNetlifyDeployReturn {
  const [isDeploying, setIsDeploying] = useState(false);
  const [lastError, setLastError] = useState<string | null>(null);
  const [lastSuggestions, setLastSuggestions] = useState<string[]>([]);

  const deploy = useCallback(async (options: DeployOptions): Promise<DeployResult> => {
    setIsDeploying(true);
    setLastError(null);
    setLastSuggestions([]);

    try {
      // Get token from options or localStorage
      const token = options.netlifyToken || localStorage.getItem(NETLIFY_TOKEN_KEY);

      if (!token) {
        const suggestions = [
          "Please set your Netlify Personal Access Token in Settings",
          "Go to https://app.netlify.com/user/applications/personal to generate a token",
          "Your token is stored locally in your browser and is never shared with our servers",
        ];
        setLastError("Netlify token not found");
        setLastSuggestions(suggestions);
        return {
          success: false,
          error: "Netlify token not found",
          code: "NETLIFY_TOKEN_MISSING",
          suggestions,
        };
      }

      // Validate siteId
      if (!options.siteId) {
        const suggestions = [
          "Please provide a Netlify site ID",
          "Find your site ID in Netlify Dashboard → Site settings → General",
          "It looks like: 'abc123-def456-ghi789'",
        ];
        setLastError("Site ID is required");
        setLastSuggestions(suggestions);
        return {
          success: false,
          error: "Site ID is required",
          code: "NETLIFY_SITE_ID_MISSING",
          suggestions,
        };
      }

      // Validate files
      if (!options.files || Object.keys(options.files).length === 0) {
        const suggestions = [
          "Please provide files to deploy",
          "Make sure your project has built successfully",
          "Check that your build output contains the expected files",
        ];
        setLastError("No files to deploy");
        setLastSuggestions(suggestions);
        return {
          success: false,
          error: "No files to deploy",
          code: "DEPLOY_FILES_EMPTY",
          suggestions,
        };
      }

      // Make the deployment request
      const response = await fetch("/api/deploy/netlify", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          siteId: options.siteId,
          files: options.files,
          netlifyToken: token,
        }),
      });

      const result = await response.json();

      if (!response.ok) {
        setLastError(result.error || "Deployment failed");
        setLastSuggestions(result.suggestions || []);
        return {
          success: false,
          error: result.error || "Deployment failed",
          code: result.code,
          suggestions: result.suggestions || [],
        };
      }

      return {
        success: true,
        deployId: result.deployId,
        deployUrl: result.deployUrl,
        message: result.message,
        suggestions: result.suggestions,
      };

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Unknown error occurred";
      const suggestions = [
        "Check your internet connection",
        "Make sure you have a stable network connection",
        "Try again in a few moments",
      ];
      setLastError(errorMessage);
      setLastSuggestions(suggestions);
      return {
        success: false,
        error: errorMessage,
        code: "DEPLOY_CLIENT_ERROR",
        suggestions,
      };
    } finally {
      setIsDeploying(false);
    }
  }, []);

  return {
    deploy,
    isDeploying,
    lastError,
    lastSuggestions,
  };
}

// Helper functions for token management
export function getStoredNetlifyToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(NETLIFY_TOKEN_KEY);
}

export function setStoredNetlifyToken(token: string): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(NETLIFY_TOKEN_KEY, token);
}

export function removeStoredNetlifyToken(): void {
  if (typeof window === "undefined") return;
  localStorage.removeItem(NETLIFY_TOKEN_KEY);
}

export function hasStoredNetlifyToken(): boolean {
  if (typeof window === "undefined") return false;
  return !!localStorage.getItem(NETLIFY_TOKEN_KEY);
}
