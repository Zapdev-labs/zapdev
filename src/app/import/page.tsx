"use client";

import { useState, useEffect, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { toast } from "sonner";
import Link from "next/link";
import { ArrowLeftIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { GitHubImportFlow } from "@/components/import/github-import-flow";
import { sanitizeErrorMessage } from "@/lib/security";

function ImportPageContent() {
  const searchParams = useSearchParams();
  const [isLoading, setIsLoading] = useState(true);

  const status = searchParams?.get("status");
  const rawError = searchParams?.get("error");

  useEffect(() => {
    if (rawError) {
      // Sanitize error message to prevent XSS
      const sanitizedError = sanitizeErrorMessage(decodeURIComponent(rawError));
      toast.error(`Import error: ${sanitizedError}`);
    }
    if (status === "connected") {
      toast.success("Successfully connected!");
    }
    setIsLoading(false);
  }, [rawError, status]);

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-muted-foreground">Loading import flow...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-muted">
      <div className="max-w-2xl mx-auto px-4 py-8">
        <div className="flex items-center justify-between mb-8">
          <h1 className="text-3xl font-bold">Import from GitHub</h1>
          <Link href="/">
            <Button variant="ghost" size="icon">
              <ArrowLeftIcon className="size-4" />
            </Button>
          </Link>
        </div>

        <GitHubImportFlow />
      </div>
    </div>
  );
}

export default function ImportPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-muted-foreground">Loading import flow...</p>
        </div>
      </div>
    }>
      <ImportPageContent />
    </Suspense>
  );
}
