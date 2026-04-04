import { NextRequest, NextResponse } from "next/server";
import { getUser } from "@/lib/auth-server";

interface NetlifyDeployRequest {
  siteId: string;
  files: Record<string, string>;
  netlifyToken: string;
}

interface NetlifyErrorResponse {
  message: string;
  code?: string;
  suggestions?: string[];
}

function getErrorDetails(error: unknown): NetlifyErrorResponse {
  const message = error instanceof Error ? error.message : "Unknown error";
  
  // Common Netlify error patterns with fix suggestions
  if (message.includes("Unauthorized") || message.includes("401")) {
    return {
      message: "Netlify authentication failed",
      code: "NETLIFY_UNAUTHORIZED",
      suggestions: [
        "Your Netlify Personal Access Token may be expired or invalid",
        "Go to https://app.netlify.com/user/applications/personal and generate a new token",
        "Update your stored token in the application settings",
      ],
    };
  }
  
  if (message.includes("Not Found") || message.includes("404")) {
    return {
      message: "Netlify site not found",
      code: "NETLIFY_SITE_NOT_FOUND",
      suggestions: [
        "The site ID may be incorrect",
        "Verify your site ID from Netlify dashboard → Site settings → General",
        "Make sure you're using the correct site ID format (e.g., 'abc123-def456')",
      ],
    };
  }
  
  if (message.includes("rate limit") || message.includes("429")) {
    return {
      message: "Netlify API rate limit exceeded",
      code: "NETLIFY_RATE_LIMIT",
      suggestions: [
        "You've made too many requests to the Netlify API",
        "Wait a few minutes before trying again",
        "Consider upgrading your Netlify plan for higher rate limits",
      ],
    };
  }
  
  if (message.includes("deploy") && message.includes("failed")) {
    return {
      message: "Netlify deployment failed",
      code: "NETLIFY_DEPLOY_FAILED",
      suggestions: [
        "Check that all required files are included in the deployment",
        "Verify your build output is correct (should include index.html)",
        "Check Netlify deploy logs at https://app.netlify.com/sites/[your-site]/deploys",
      ],
    };
  }
  
  return {
    message,
    code: "NETLIFY_UNKNOWN_ERROR",
    suggestions: [
      "Check your internet connection",
      "Verify your Netlify token has the required permissions (sites:read, sites:write, deploys:read, deploys:write)",
      "Try again in a few minutes",
      "If the problem persists, check Netlify status at https://www.netlifystatus.com/",
    ],
  };
}

// Validate siteId format to prevent SSRF - only allow alphanumeric, hyphens, and dots
const NETLIFY_SITE_ID_REGEX = /^[a-zA-Z0-9-]+(--[a-zA-Z0-9-]+)?$/;

function validateSiteId(siteId: string): boolean {
  return NETLIFY_SITE_ID_REGEX.test(siteId);
}

export async function POST(request: NextRequest) {
  try {
    const user = await getUser();
    
    if (!user) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    const body = await request.json() as NetlifyDeployRequest;
    const { siteId, files, netlifyToken } = body;

    // Validate required fields
    if (!siteId || typeof siteId !== "string") {
      return NextResponse.json(
        { error: "Missing required field: siteId" },
        { status: 400 }
      );
    }

    // Validate siteId format to prevent SSRF attacks
    if (!validateSiteId(siteId)) {
      return NextResponse.json(
        { 
          error: "Invalid siteId format",
          code: "NETLIFY_INVALID_SITE_ID",
          suggestions: [
            "Site ID should only contain alphanumeric characters, hyphens, and may include a double-hyphen separator",
            "Verify your site ID from Netlify dashboard → Site settings → General",
            "Example format: 'abc123-def456' or 'abc123--def456'",
          ],
        },
        { status: 400 }
      );
    }

    if (!netlifyToken || typeof netlifyToken !== "string") {
      return NextResponse.json(
        { 
          error: "Netlify token is required",
          code: "NETLIFY_TOKEN_MISSING",
          suggestions: [
            "Please provide your Netlify Personal Access Token",
            "You can generate one at https://app.netlify.com/user/applications/personal",
            "Your token is stored locally in your browser and never sent to our servers except for deployment",
          ],
        },
        { status: 400 }
      );
    }

    if (!files || typeof files !== "object" || Object.keys(files).length === 0) {
      return NextResponse.json(
        { error: "Missing required field: files (must be a non-empty object)" },
        { status: 400 }
      );
    }

    // Step 1: Create a new deploy
    const deployResponse = await fetch(`https://api.netlify.com/api/v1/sites/${siteId}/deploys`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${netlifyToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        files: Object.fromEntries(
          Object.entries(files).map(([path, content]) => [
            path,
            // Netlify expects SHA1 hashes of file contents
            require("crypto").createHash("sha1").update(content).digest("hex"),
          ])
        ),
      }),
    });

    if (!deployResponse.ok) {
      const errorText = await deployResponse.text();
      const errorDetails = getErrorDetails(new Error(errorText));
      
      return NextResponse.json(
        {
          error: errorDetails.message,
          code: errorDetails.code,
          suggestions: errorDetails.suggestions,
          rawError: errorText,
        },
        { status: deployResponse.status }
      );
    }

    const deployData = await deployResponse.json() as {
      id: string;
      deploy_url?: string;
      url?: string;
      required?: string[];
    };

    // Step 2: Upload file contents that are required
    const requiredFiles = deployData.required || [];
    
    if (requiredFiles.length > 0) {
      // Upload files in batches
      const uploadPromises = requiredFiles.map(async (filePath) => {
        const content = files[filePath];
        if (!content) {
          console.warn(`[Netlify Deploy] Missing required file: ${filePath}`);
          return;
        }

        const uploadResponse = await fetch(
          `https://api.netlify.com/api/v1/deploys/${deployData.id}/files${filePath}`,
          {
            method: "PUT",
            headers: {
              "Authorization": `Bearer ${netlifyToken}`,
              "Content-Type": "application/octet-stream",
            },
            body: Buffer.from(content),
          }
        );

        if (!uploadResponse.ok) {
          throw new Error(`Failed to upload ${filePath}: ${await uploadResponse.text()}`);
        }
      });

      await Promise.all(uploadPromises);
    }

    return NextResponse.json({
      success: true,
      deployId: deployData.id,
      deployUrl: deployData.deploy_url || deployData.url,
      message: "Deployment successful! Your site will be live in a few moments.",
      suggestions: [
        "Visit your deploy URL to see your live site",
        "It may take a minute for the CDN to propagate",
        "Check deploy logs in Netlify dashboard for any issues",
      ],
    });

  } catch (error) {
    console.error("[Netlify Deploy] Error:", error);
    const errorDetails = getErrorDetails(error);
    
    return NextResponse.json(
      {
        error: errorDetails.message,
        code: errorDetails.code,
        suggestions: errorDetails.suggestions,
      },
      { status: 500 }
    );
  }
}
