import { useEffect, useRef, useState } from "react";
import { ExternalLinkIcon, RefreshCcwIcon } from "lucide-react";

import { Hint } from "@/components/hint";
import { Button } from "@/components/ui/button";
import type { Doc } from "@/convex/_generated/dataModel";
import { WebContainerPreview } from "./webcontainer-preview";
import { VisualSelector, type SelectedElement } from "./visual-selector";
import { ElementEditor } from "./element-editor";

interface Props {
  data: Doc<"fragments">;
  onElementAskAI?: (element: SelectedElement, instruction: string) => void;
}

const WEB_CONTAINER_PREVIEW_URL = "__WEBCONTAINER_PREVIEW__";

export function FragmentWeb({ data, onElementAskAI }: Props) {
  const [copied, setCopied] = useState(false);
  const [fragmentKey, setFragmentKey] = useState(0);
  const [livePreviewUrl, setLivePreviewUrl] = useState<string | null>(null);
  const [isSelectorActive, setIsSelectorActive] = useState(false);
  const [selectedElement, setSelectedElement] = useState<SelectedElement | null>(null);
  const [isEditorOpen, setIsEditorOpen] = useState(false);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const webContainerRef = useRef<HTMLIFrameElement>(null);

  const isWebContainerPreview = data.sandboxUrl === WEB_CONTAINER_PREVIEW_URL;

  useEffect(() => {
    setLivePreviewUrl(null);
  }, [data._id]);
  const normalizedFiles =
    typeof data.files === "object" && data.files !== null
      ? Object.entries(data.files as Record<string, unknown>).reduce<Record<string, string>>(
          (acc, [path, content]) => {
            if (typeof content === "string") {
              acc[path] = content;
            }
            return acc;
          },
          {}
        )
      : {};

  const handleRefresh = () => {
    setFragmentKey((prev) => prev + 1);
  };

  const handleToggleSelector = () => {
    setIsSelectorActive((prev) => !prev);
  };

  const handleAskAI = (element: SelectedElement) => {
    setSelectedElement(element);
    setIsEditorOpen(true);
  };

  const handleEdit = (element: SelectedElement) => {
    setSelectedElement(element);
    setIsEditorOpen(true);
  };

  const handleAskAISubmit = (element: SelectedElement, instruction: string) => {
    if (onElementAskAI) {
      onElementAskAI(element, instruction);
    }
  };

  const copyTargetUrl = isWebContainerPreview ? livePreviewUrl : data.sandboxUrl;

  const handleCopy = () => {
    if (!copyTargetUrl) return;
    navigator.clipboard.writeText(copyTargetUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="flex flex-col w-full h-full">
      <div className="p-2 border-b bg-sidebar flex items-center gap-x-2">
        <Hint text="Refresh" side="bottom" align="start">
          <Button size="sm" variant="outline" onClick={handleRefresh}>
            <RefreshCcwIcon />
          </Button>
        </Hint>
        
        {/* Visual Selector Toggle */}
        <VisualSelector
          iframeRef={isWebContainerPreview ? webContainerRef : iframeRef}
          isActive={isSelectorActive}
          onToggle={handleToggleSelector}
          onAskAI={handleAskAI}
          onEdit={handleEdit}
        />

        <Hint text="Click to copy" side="bottom">
          <Button
            size="sm"
            variant="outline"
            onClick={handleCopy}
            disabled={!copyTargetUrl || copied}
            className="flex-1 justify-start text-start font-normal"
          >
            <span className="truncate">
              {isWebContainerPreview
                ? livePreviewUrl ?? "In-browser preview (starting…)"
                : data.sandboxUrl}
            </span>
          </Button>
        </Hint>
        <Hint text="Open in a new tab" side="bottom" align="start">
          <Button
            size="sm"
            disabled={!copyTargetUrl}
            variant="outline"
            onClick={() => {
              if (!copyTargetUrl) return;
              window.open(copyTargetUrl, "_blank");
            }}
          >
            <ExternalLinkIcon />
          </Button>
        </Hint>
      </div>
      {isWebContainerPreview ? (
        <WebContainerPreview
          ref={webContainerRef}
          files={normalizedFiles}
          refreshKey={fragmentKey}
          onPreviewUrlChange={setLivePreviewUrl}
        />
      ) : (
        <iframe
          ref={iframeRef}
          key={fragmentKey}
          className="h-full w-full"
          sandbox="allow-forms allow-scripts allow-same-origin"
          loading="lazy"
          src={data.sandboxUrl}
        />
      )}

      {/* Element Editor Modal */}
      <ElementEditor
        element={selectedElement}
        isOpen={isEditorOpen}
        onClose={() => setIsEditorOpen(false)}
        onAskAI={handleAskAISubmit}
      />
    </div>
  );
};
