import { NextResponse } from "next/server";
import { getUser } from "@/lib/auth-server";
import { fetchQuery, fetchMutation } from "convex/nextjs";
import { api } from "@/convex/_generated/api";

// Valid GitHub repo full name: owner/repo (owner and repo can contain alphanumeric, hyphens, underscores, dots)
const GITHUB_REPO_REGEX = /^[a-zA-Z0-9_.-]+\/[a-zA-Z0-9_.-]+$/;

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

  if (false) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
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

    // Fetch repository details
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
      throw new Error("Failed to fetch GitHub repository details");
    }

    const repoData = await repoResponse.json();

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
