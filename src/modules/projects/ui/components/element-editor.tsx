"use client";

import { useState, useCallback } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Code2, Wand2, Copy, Check } from "lucide-react";
import { cn } from "@/lib/utils";
import type { SelectedElement } from "./visual-selector";

interface ElementEditorProps {
  element: SelectedElement | null;
  isOpen: boolean;
  onClose: () => void;
  onAskAI: (element: SelectedElement, instruction: string) => void;
  onSave?: (element: SelectedElement, newHtml: string) => void;
}

export function ElementEditor({
  element,
  isOpen,
  onClose,
  onAskAI,
  onSave,
}: ElementEditorProps) {
  const [instruction, setInstruction] = useState("");
  const [activeTab, setActiveTab] = useState<"ask" | "edit">("ask");
  const [copied, setCopied] = useState(false);

  const handleAskAI = () => {
    if (element && instruction.trim()) {
      onAskAI(element, instruction.trim());
      setInstruction("");
      onClose();
    }
  };

  const handleCopySelector = () => {
    if (element) {
      navigator.clipboard.writeText(element.selector);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const getDefaultPrompt = useCallback(() => {
    if (!element) return "";
    return `Modify the ${element.tagName} element${element.id ? ` with id "${element.id}"` : ""}${element.className ? ` and classes "${element.className}"` : ""}. It's currently: "${element.textContent?.slice(0, 100)}..."`;
  }, [element]);

  if (!element) return null;

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <code className="bg-muted px-2 py-1 rounded text-sm">
              &lt;{element.tagName}&gt;
            </code>
            {activeTab === "ask" ? "Ask AI to Modify" : "Quick Edit"}
          </DialogTitle>
        </DialogHeader>

        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as "ask" | "edit")}>
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="ask" className="gap-2">
              <Wand2 className="w-4 h-4" />
              Ask AI
            </TabsTrigger>
            <TabsTrigger value="edit" className="gap-2">
              <Code2 className="w-4 h-4" />
              Quick Edit
            </TabsTrigger>
          </TabsList>

          {/* Element Info Card */}
          <div className="mt-4 p-3 bg-muted/50 rounded-lg border">
            <div className="flex items-start justify-between gap-2">
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium mb-1">Selected Element:</div>
                <div className="text-xs text-muted-foreground break-all font-mono">
                  {element.selector}
                </div>
                {element.textContent && (
                  <div className="mt-2 text-sm text-muted-foreground line-clamp-2">
                    &quot;{element.textContent}&quot;
                  </div>
                )}
              </div>
              <Button
                size="icon"
                variant="ghost"
                className="h-8 w-8 shrink-0"
                onClick={handleCopySelector}
              >
                {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
              </Button>
            </div>
          </div>

          <TabsContent value="ask" className="mt-4">
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="instruction">What would you like to change?</Label>
                <Textarea
                  id="instruction"
                  placeholder={getDefaultPrompt()}
                  value={instruction}
                  onChange={(e) => setInstruction(e.target.value)}
                  className="min-h-[120px] resize-y"
                />
              </div>

              <div className="text-sm text-muted-foreground">
                <p className="font-medium mb-1">Examples:</p>
                <ul className="space-y-1 list-disc list-inside">
                  <li>&quot;Make this button larger and change the color to blue&quot;</li>
                  <li>&quot;Add a dropdown menu to this navigation item&quot;</li>
                  <li>&quot;Change the text to be more professional&quot;</li>
                  <li>&quot;Add a loading spinner inside this button&quot;</li>
                </ul>
              </div>
            </div>

            <DialogFooter className="mt-6">
              <Button variant="outline" onClick={onClose}>
                Cancel
              </Button>
              <Button
                onClick={handleAskAI}
                disabled={!instruction.trim()}
                className="gap-2"
              >
                <Wand2 className="w-4 h-4" />
                Send to AI
              </Button>
            </DialogFooter>
          </TabsContent>

          <TabsContent value="edit" className="mt-4">
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Element HTML</Label>
                <div className="relative">
                  <pre className="p-4 bg-muted rounded-lg text-xs font-mono overflow-x-auto whitespace-pre-wrap break-all max-h-[200px] overflow-y-auto">
                    {element.outerHTML}
                  </pre>
                </div>
                <p className="text-sm text-muted-foreground">
                  Copy the HTML above and modify it in the code tab, or use the &quot;Ask AI&quot; tab for natural language changes.
                </p>
              </div>

              <div className="space-y-2">
                <Label>CSS Selector</Label>
                <code className="block p-3 bg-muted rounded text-sm font-mono">
                  {element.selector}
                </code>
                <p className="text-sm text-muted-foreground">
                  Use this selector to find and modify the element in your code.
                </p>
              </div>
            </div>

            <DialogFooter className="mt-6">
              <Button variant="outline" onClick={onClose}>
                Close
              </Button>
              <Button
                variant="secondary"
                onClick={handleCopySelector}
                className="gap-2"
              >
                {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                Copy Selector
              </Button>
            </DialogFooter>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
