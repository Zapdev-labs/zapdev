"use client";

import Link from "next/link";
import dynamic from "next/dynamic";
import { Suspense, useEffect, useMemo, useState, useCallback } from "react";
import { EyeIcon, CodeIcon, CrownIcon } from "lucide-react";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";

import { Button } from "@/components/ui/button";
import { UserControl } from "@/components/user-control";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable";

import { ProjectHeader } from "../components/project-header";
import { MessagesContainer } from "../components/messages-container";
import { ErrorBoundary } from "react-error-boundary";
import type { Doc } from "@/convex/_generated/dataModel";
import { filterAIGeneratedFiles } from "@/lib/filter-ai-files";
import { useWebContainerRunner } from "../hooks/use-webcontainer-runner";
import type { SelectedElement } from "../components/visual-selector";

// Dynamically import heavy components
const FileExplorer = dynamic(() => import("@/components/file-explorer").then(m => m.FileExplorer), {
  loading: () => <p className="p-4">Loading file explorer...</p>,
  ssr: false,
});

const FragmentWeb = dynamic(() => import("../components/fragment-web").then(m => m.FragmentWeb), {
  loading: () => <p className="p-4">Loading preview...</p>,
  ssr: false,
});

interface PendingElementInstruction {
  element: SelectedElement;
  instruction: string;
}

interface Props {
  projectId: string;
};

export const ProjectView = ({ projectId }: Props) => {
  useWebContainerRunner(projectId);

  const usage = useQuery(api.usage.getUsage);
  const hasProAccess = usage?.planType === "pro";

  const [activeFragment, setActiveFragment] = useState<Doc<"fragments"> | null>(null);
  const [tabState, setTabState] = useState<"preview" | "code">("preview");
  const [streamingFiles, setStreamingFiles] = useState<Record<string, string>>({});
  const [pendingElementInstruction, setPendingElementInstruction] = useState<PendingElementInstruction | null>(null);

  const explorerFiles = useMemo(() => {
    let files: Record<string, string> = {};

    // Start with streaming files (real-time updates)
    if (Object.keys(streamingFiles).length > 0) {
      files = { ...streamingFiles };
    }

    // Overlay with active fragment files (final state)
    if (activeFragment && typeof activeFragment.files === "object" && activeFragment.files !== null) {
      const normalizedFiles = Object.entries(activeFragment.files as Record<string, unknown>).reduce<Record<string, string>>(
        (acc, [path, content]) => {
          if (typeof content === "string") {
            acc[path] = content;
          }
          return acc;
        },
        {}
      );
      files = { ...files, ...normalizedFiles };
    }

    // Filter out E2B sandbox system files - only show AI-generated code
    return filterAIGeneratedFiles(files);
  }, [activeFragment, streamingFiles]);

  const handleStreamingFiles = (files: Record<string, string>) => {
    setStreamingFiles(files);
    // Auto-switch to code tab when files start streaming
    if (Object.keys(files).length > 0 && tabState === "preview") {
      setTabState("code");
    }
  };

  // Clear streaming files when fragment is set (generation complete)
  useEffect(() => {
    if (activeFragment) {
      setStreamingFiles({});
    }
  }, [activeFragment]);

  const handleElementAskAI = useCallback((element: SelectedElement, instruction: string) => {
    setPendingElementInstruction({ element, instruction });
  }, []);

  const handleInstructionSent = useCallback(() => {
    setPendingElementInstruction(null);
  }, []);

  return (
    <div className="h-screen">
      <ResizablePanelGroup direction="horizontal">
        <ResizablePanel
          defaultSize={35}
          minSize={20}
          className="flex flex-col min-h-0"
        >
          <ErrorBoundary fallback={<p>Project header error</p>}>
            <Suspense fallback={<p>Loading project...</p>}>
              <ProjectHeader projectId={projectId} />
            </Suspense>
          </ErrorBoundary>
          <ErrorBoundary fallback={<p>Messages container error</p>}>
            <Suspense fallback={<p>Loading messages...</p>}>
              <MessagesContainer
                projectId={projectId}
                activeFragment={activeFragment}
                setActiveFragment={setActiveFragment}
                onStreamingFiles={handleStreamingFiles}
                pendingElementInstruction={pendingElementInstruction}
                onInstructionSent={handleInstructionSent}
              />
            </Suspense>
          </ErrorBoundary>
        </ResizablePanel>
        <ResizableHandle className="hover:bg-primary transition-colors" />
        <ResizablePanel
          defaultSize={65}
          minSize={50}
        >
          <Tabs
            className="h-full gap-y-0"
            defaultValue="preview"
            value={tabState}
            onValueChange={(value) => setTabState(value as "preview" | "code")}
          >
            <div className="w-full flex items-center p-2 border-b gap-x-2">
              <TabsList className="h-8 p-0 border rounded-md">
                <TabsTrigger value="preview" className="rounded-md">
                  <EyeIcon /> <span>Demo</span>
                </TabsTrigger>
                <TabsTrigger value="code" className="rounded-md">
                  <CodeIcon /> <span>Code</span>
                </TabsTrigger>
              </TabsList>
              <div className="ml-auto flex items-center gap-x-2">
                {!hasProAccess && (
                  <Button asChild size="sm" variant="tertiary">
                    <Link href="/pricing">
                      <CrownIcon /> Upgrade
                    </Link>
                  </Button>
                )}
                <UserControl />
              </div>
            </div>
            <TabsContent value="preview">
              {!!activeFragment && (
                <FragmentWeb 
                  data={activeFragment} 
                  onElementAskAI={handleElementAskAI}
                />
              )}
            </TabsContent>
            <TabsContent value="code" className="min-h-0">
              {activeFragment && (
                <FileExplorer files={explorerFiles} />
              )}
            </TabsContent>
          </Tabs>
        </ResizablePanel>
      </ResizablePanelGroup>
    </div>
  );
};
