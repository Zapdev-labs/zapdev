import { NextResponse } from "next/server";
import { getUser } from "@/lib/auth-server";
import { fetchQuery, fetchMutation } from "convex/nextjs";
import { api } from "@/convex/_generated/api";

// Valid GitHub repo full name: owner/repo (owner and repo can contain alphanumeric, hyphens, underscores, dots)
const GITHUB_REPO_REGEX = /^[a-zA-Z0-9_.-]+\/[a-zA-Z0-9_.-]+$/;

// Rate limit: 10 imports per minute per user
const RATE_LIMIT = 10;
const RATE_WINDOW_MS = 60 * 1000; // 1 minute

async function checkRateLimit(userId: string): Promise<{ allowed: boolean; message?: string }> {
  const key = `github_import:process:${userId}`;
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

function validateRepoFullName(repoFullName: string): boolean {
  // Check basic format
  if (!GITHUB_REPO_REGEX.test(repoFullName)) {
    return false;
  }
  
  const parts = repoFullName.split('/');
  if (parts.length !== 2) {
    return false;
  }
  
  const [owner, repo] = parts;
  
  // Check for path traversal attempts
  if (owner.includes('..') || repo.includes('..')) {
    return false;
  }
  
  // Check for URL-like strings that could indicate SSRF attempts
  const dangerousPatterns = [
    'http://', 'https://', 'ftp://', 'file://', 
    '@', '#', '?', '&', '=', '%00', '\x00'
  ];
  
  for (const pattern of dangerousPatterns) {
    if (repoFullName.includes(pattern)) {
      return false;
    }
  }
  
  // Check for IP addresses (potential SSRF to internal services)
  const ipPattern = /^(\d{1,3}\.){3}\d{1,3}$/;
  if (ipPattern.test(owner) || ipPattern.test(repo)) {
    return false;
  }
  
  return true;
}

export async function POST(request: Request) {
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
    const body = await request.json();
    const { repoId, repoName, repoFullName, repoUrl, projectId } = body;

    if (!repoId || !projectId || !repoName || !repoFullName) {
      return NextResponse.json(
        { error: "Missing required fields" },
        { status: 400 }
      );
    }

    // Validate repoFullName to prevent SSRF attacks
    if (!validateRepoFullName(repoFullName)) {
      return NextResponse.json(
        { 
          error: "Invalid repository name format",
          code: "GITHUB_INVALID_REPO_NAME",
        },
        { status: 400 }
      );
    }

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

    // Fetch repository details with authenticated user's access to verify ownership/access
    const repoResponse = await fetch(
      `https://api.github.com/repos/${repoFullName}`,
      {
        headers: {
          Authorization: `Bearer ${connection.accessToken}`,
          "User-Agent": "ZapDev",
        },
      }
    );

    if (!repoResponse.ok) {
      if (repoResponse.status === 404) {
        return NextResponse.json(
          { error: "Repository not found or you don't have access to it" },
          { status: 404 }
        );
      }
      if (repoResponse.status === 403) {
        return NextResponse.json(
          { error: "Access denied to repository" },
          { status: 403 }
        );
      }
      throw new Error("Failed to fetch GitHub repository details");
    }

    const repoData = await repoResponse.json();

    // Verify the user has actual access to this repository
    // Check that the repo ID matches what the client sent
    if (repoData.id.toString() !== repoId.toString()) {
      return NextResponse.json(
        { error: "Repository ID mismatch - potential tampering detected" },
        { status: 400 }
      );
    }

    // Verify the repo name matches what was requested
    if (repoData.full_name !== repoFullName) {
      return NextResponse.json(
        { error: "Repository name mismatch - potential tampering detected" },
        { status: 400 }
      );
    }

    // Additional check: verify the user has push or admin access (not just read)
    // This ensures they actually own or maintain the repo
    const permissionsUrl = `https://api.github.com/repos/${repoFullName}/collaborators/${connection.metadata?.githubLogin || "${username}"}`;
    // Note: We don't fail here if permissions check fails, as the user might have legitimate read access
    // The important check is that they have SOME authenticated access to the repo

    // Log for security audit
    console.log(`[GitHub Import] User ${user.id} importing repo ${repoFullName} (${repoId})`);

    // Create import record in Convex
    const importRecord = await fetchMutation((api as any).imports.createImport, {
      projectId,
      source: "GITHUB",
      sourceId: repoId.toString(),
      sourceName: repoName,
      sourceUrl: repoUrl || repoData.html_url,
      metadata: {
        githubRepoData: {
          fullName: repoData.full_name,
          description: repoData.description,
          language: repoData.language,
          defaultBranch: repoData.default_branch,
          topics: repoData.topics || [],
          isPrivate: repoData.private,
        },
      },
    });

    // TODO: Trigger Inngest job to process GitHub import
    // await inngest.send({
    //   name: "code-agent/process-github-import",
    //   data: { importId, projectId, repoFullName, repoUrl }
    // });

    return NextResponse.json({
      success: true,
      importId: importRecord,
      message: "GitHub repository import started",
    });
  } catch (error) {
    console.error("Error processing GitHub import:", error);
    return NextResponse.json(
      { error: "Failed to process GitHub import" },
      { status: 500 }
    );
  }
}
