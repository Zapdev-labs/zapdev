"use client";

import { useState } from "react";
import { AlertCircle, ChevronDown, ChevronUp } from "lucide-react";
import { Button } from "@/components/ui/button";

interface ErrorFallbackProps {
  error: Error;
  resetErrorBoundary?: () => void;
}

export function ErrorFallback({ error, resetErrorBoundary }: ErrorFallbackProps) {
  const [showDetails, setShowDetails] = useState(false);

  return (
    <div className="flex flex-col items-center justify-center min-h-[50vh] p-6">
      <div className="flex flex-col items-center gap-4 max-w-2xl w-full">
        <div className="flex items-center gap-2 text-destructive">
          <AlertCircle className="w-8 h-8" />
          <h2 className="text-2xl font-bold">Something went wrong</h2>
        </div>
        
        <p className="text-muted-foreground text-center">
          {error.message || "An unexpected error occurred. Please try again."}
        </p>

        {resetErrorBoundary && (
          <Button onClick={resetErrorBoundary} variant="outline">
            Try Again
          </Button>
        )}

        <Button
          variant="ghost"
          size="sm"
          onClick={() => setShowDetails(!showDetails)}
          className="gap-2"
        >
          {showDetails ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          {showDetails ? "Hide Details" : "Show Details"}
        </Button>

        {showDetails && (
          <div className="w-full bg-muted rounded-lg p-4 overflow-auto max-h-[400px]">
            <pre className="text-xs font-mono text-muted-foreground whitespace-pre-wrap">
              {error.stack || error.message || "No error details available"}
            </pre>
          </div>
        )}
      </div>
    </div>
  );
}
