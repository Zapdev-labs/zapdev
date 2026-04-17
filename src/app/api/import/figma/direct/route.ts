import { Buffer } from "node:buffer";
import { NextResponse } from "next/server";
import { getUser } from "@/lib/auth-server";
import { fetchMutation } from "convex/nextjs";
import type { FunctionReference } from "convex/server";
import { api } from "@/convex/_generated/api";
import { inngest } from "@/inngest/client";
import { sanitizeFilename, validateFileExtension, validateFileContent } from "@/lib/security";

// Maximum file size: 50MB (Figma files can be large)
const MAX_FILE_SIZE = 50 * 1024 * 1024;

// Rate limit: 5 uploads per minute per user
const RATE_LIMIT = 5;
const RATE_WINDOW_MS = 60 * 1000; // 1 minute

async function checkRateLimit(userId: string): Promise<{ allowed: boolean; message?: string }> {
  const key = `figma_import:${userId}`;
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

export async function POST(request: Request) {
  const user = await getUser();
  if (!user?.id) {
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
    const contentType = request.headers.get("content-type") || "";
    if (!contentType.toLowerCase().includes("multipart/form-data")) {
      return NextResponse.json({ error: "Use multipart/form-data" }, { status: 400 });
    }

    const form = await request.formData();
    const projectId = form.get("projectId")?.toString();
    const file = form.get("figmaFile") as File | null;

    if (!projectId) {
      return NextResponse.json({ error: "Missing projectId" }, { status: 400 });
    }

    if (!file) {
      return NextResponse.json({ error: "Please upload a .fig file" }, { status: 400 });
    }

    // Check file size first (before processing)
    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        { error: `File too large. Maximum size is ${MAX_FILE_SIZE / 1024 / 1024}MB` },
        { status: 400 }
      );
    }

    // Sanitize filename to prevent path traversal
    const fileNameResult = sanitizeFilename(file.name);
    if (!fileNameResult.valid || !fileNameResult.sanitized) {
      return NextResponse.json(
        { error: fileNameResult.error || "Invalid filename" },
        { status: 400 }
      );
    }
    const fileName = fileNameResult.sanitized;

    // Validate file extension
    if (!validateFileExtension(fileName, ["fig"])) {
      return NextResponse.json({ error: "Only .fig files are supported" }, { status: 400 });
    }

    // Read file content
    const fileBuffer = Buffer.from(await file.arrayBuffer());

    // Validate file is not empty
    if (fileBuffer.length === 0) {
      return NextResponse.json({ error: "File is empty" }, { status: 400 });
    }

    // Validate file content (magic number check for SQLite/Figma format)
    if (!validateFileContent(fileBuffer, "fig")) {
      return NextResponse.json(
        { error: "Invalid file format. File does not appear to be a valid Figma file." },
        { status: 400 }
      );
    }

    const fileBase64 = fileBuffer.toString("base64");

    const sourceId = fileName;
    const sourceUrl = "figma-file-upload";

    const importId = await fetchMutation(api.imports.createImport as unknown as FunctionReference<"mutation">, {
      projectId,
      source: "FIGMA",
      sourceId,
      sourceName: fileName,
      sourceUrl,
      metadata: {
        inputType: "file",
        fileName,
      },
    });

    await inngest.send({
      name: "agent/figma-import.run",
      data: {
        projectId,
        importId,
        fileBase64,
        fileName,
      },
    });

    return NextResponse.json({
      success: true,
      importId,
      message: "Figma import started",
    });
  } catch (error) {
    console.error("Error processing direct Figma import:", error);
    return NextResponse.json({ error: "Failed to process Figma import" }, { status: 500 });
  }
}
