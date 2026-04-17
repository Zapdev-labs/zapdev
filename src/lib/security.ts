/**
 * Security utilities for input sanitization and validation
 */

// XSS sanitization - escape HTML special characters
export function escapeHtml(unsafe: string): string {
  return unsafe
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

// Sanitize error messages for display (remove newlines and limit length)
export function sanitizeErrorMessage(error: string): string {
  return escapeHtml(error.slice(0, 200).replace(/[\r\n]/g, " "));
}

// Validate and sanitize filename to prevent path traversal
export function sanitizeFilename(filename: string): { valid: boolean; sanitized?: string; error?: string } {
  if (!filename || typeof filename !== "string") {
    return { valid: false, error: "Invalid filename" };
  }

  // Remove path traversal sequences
  const sanitized = filename
    .replace(/\.{2,}[\\/]/g, "") // Remove ../ and ..\
    .replace(/[\\/]/g, "_") // Replace remaining path separators with underscore
    .replace(/[<>:"|?*\x00-\x1f]/g, "") // Remove invalid characters
    .trim();

  // Check for empty or suspicious filenames
  if (sanitized.length === 0) {
    return { valid: false, error: "Filename is empty after sanitization" };
  }

  if (sanitized.length > 255) {
    return { valid: false, error: "Filename too long (max 255 characters)" };
  }

  // Check for hidden/system files
  if (sanitized.startsWith(".")) {
    return { valid: false, error: "Hidden files are not allowed" };
  }

  return { valid: true, sanitized };
}

// Validate file extension against allowed list
export function validateFileExtension(filename: string, allowedExtensions: string[]): boolean {
  const ext = filename.toLowerCase().split(".").pop();
  if (!ext) return false;
  return allowedExtensions.includes(ext);
}

// Check if content type matches expected (basic magic number check for common types)
export function validateFileContent(buffer: Buffer, expectedType: "fig" | "image"): boolean {
  if (buffer.length === 0) return false;

  switch (expectedType) {
    case "fig":
      // Figma files are SQLite databases - check for SQLite magic number
      // SQLite files start with "SQLite format 3\0"
      const sqliteMagic = Buffer.from("SQLite format 3");
      return buffer.slice(0, 15).equals(sqliteMagic);
    case "image":
      // Check for common image magic numbers
      const pngMagic = Buffer.from([0x89, 0x50, 0x4e, 0x47]);
      const jpegMagic = Buffer.from([0xff, 0xd8, 0xff]);
      const gifMagic = Buffer.from([0x47, 0x49, 0x46]);
      const webpMagic = Buffer.from([0x52, 0x49, 0x46, 0x46]);

      return (
        buffer.slice(0, 4).equals(pngMagic) ||
        buffer.slice(0, 3).equals(jpegMagic) ||
        buffer.slice(0, 3).equals(gifMagic) ||
        buffer.slice(0, 4).equals(webpMagic)
      );
    default:
      return false;
  }
}

// SSRF protection - validate URLs don't point to private/internal networks
export function isValidExternalUrl(url: string): { valid: boolean; error?: string } {
  try {
    const parsed = new URL(url);

    // Only allow HTTPS
    if (parsed.protocol !== "https:") {
      return { valid: false, error: "Only HTTPS URLs are allowed" };
    }

    // Block private IP ranges
    const hostname = parsed.hostname;

    // Check for IP addresses
    const ipPattern = /^(\d{1,3}\.){3}\d{1,3}$/;
    if (ipPattern.test(hostname)) {
      const parts = hostname.split(".").map(Number);

      // Check private ranges
      if (parts[0] === 10) return { valid: false, error: "Private IP range not allowed" };
      if (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) return { valid: false, error: "Private IP range not allowed" };
      if (parts[0] === 192 && parts[1] === 168) return { valid: false, error: "Private IP range not allowed" };
      if (parts[0] === 127) return { valid: false, error: "Loopback address not allowed" };
      if (parts[0] === 0) return { valid: false, error: "Invalid IP range" };
      if (parts[0] >= 224) return { valid: false, error: "Multicast/reserved IP range not allowed" };
    }

    // Block localhost and common internal hostnames
    const blockedHostnames = [
      "localhost",
      "127.0.0.1",
      "0.0.0.0",
      "::1",
      "[::1]",
      "metadata.google.internal",
      "169.254.169.254", // AWS metadata
      "metadata.azure.internal",
      "metadata.alibaba-inc.com",
    ];

    if (blockedHostnames.includes(hostname.toLowerCase())) {
      return { valid: false, error: "Internal hostnames not allowed" };
    }

    return { valid: true };
  } catch {
    return { valid: false, error: "Invalid URL format" };
  }
}

// Rate limiting helper - generate key for rate limit
export function generateRateLimitKey(identifier: string, action: string): string {
  return `${action}:${identifier}`;
}
