"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { MousePointerClick, Wand2, Code2, X, Eye } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Hint } from "@/components/hint";
import { cn } from "@/lib/utils";

interface SelectedElement {
  tagName: string;
  id?: string;
  className?: string;
  textContent?: string;
  rect: DOMRect;
  outerHTML: string;
  xpath: string;
  selector: string;
}

interface VisualSelectorProps {
  iframeRef: React.RefObject<HTMLIFrameElement | null>;
  isActive: boolean;
  onToggle: () => void;
  onAskAI: (element: SelectedElement) => void;
  onEdit: (element: SelectedElement) => void;
}

export function VisualSelector({
  iframeRef,
  isActive,
  onToggle,
  onAskAI,
  onEdit,
}: VisualSelectorProps) {
  const [selectedElement, setSelectedElement] = useState<SelectedElement | null>(null);
  const [hoveredElement, setHoveredElement] = useState<HTMLElement | null>(null);
  const selectionRef = useRef<HTMLDivElement>(null);

  // Generate a CSS selector for an element
  const generateSelector = useCallback((el: HTMLElement): string => {
    const parts: string[] = [];
    let current: HTMLElement | null = el;

    while (current && current !== iframeRef.current?.contentDocument?.body) {
      let selector = current.tagName.toLowerCase();
      
      if (current.id) {
        selector += `#${current.id}`;
        parts.unshift(selector);
        break;
      }
      
      if (current.className && typeof current.className === "string") {
        const classes = current.className.split(" ").filter(c => c.trim());
        if (classes.length > 0) {
          // Limit to first 2 meaningful classes
          const meaningfulClasses = classes.slice(0, 2);
          selector += `.${meaningfulClasses.join(".")}`;
        }
      }

      // Add nth-child if needed for specificity
      const siblings = Array.from(current.parentElement?.children || []);
      const sameTagSiblings = siblings.filter(s => s.tagName === current!.tagName);
      if (sameTagSiblings.length > 1) {
        const index = siblings.indexOf(current) + 1;
        selector += `:nth-child(${index})`;
      }

      parts.unshift(selector);
      current = current.parentElement;
    }

    return parts.join(" > ");
  }, [iframeRef]);

  // Generate XPath for an element
  const generateXPath = useCallback((el: HTMLElement): string => {
    const parts: string[] = [];
    let current: HTMLElement | null = el;

    while (current && current.nodeType === Node.ELEMENT_NODE) {
      let part = current.tagName.toLowerCase();
      
      if (current.id) {
        parts.unshift(`//${part}[@id="${current.id}"]`);
        return parts.join("");
      }

      const siblings = Array.from(current.parentElement?.children || []);
      const sameTagSiblings = siblings.filter(s => s.tagName === current!.tagName);
      if (sameTagSiblings.length > 1) {
        const index = siblings.filter(s => s.tagName === current!.tagName).indexOf(current) + 1;
        part += `[${index}]`;
      }

      parts.unshift(part);
      current = current.parentElement;
    }

    return "//" + parts.join("/");
  }, []);

  // Get element info
  const getElementInfo = useCallback((el: HTMLElement): SelectedElement => {
    return {
      tagName: el.tagName.toLowerCase(),
      id: el.id || undefined,
      className: el.className && typeof el.className === "string" ? el.className : undefined,
      textContent: el.textContent?.slice(0, 200) || undefined,
      rect: el.getBoundingClientRect(),
      outerHTML: el.outerHTML.slice(0, 500),
      xpath: generateXPath(el),
      selector: generateSelector(el),
    };
  }, [generateSelector, generateXPath]);

  // Handle click on iframe content
  useEffect(() => {
    if (!isActive || !iframeRef.current) return;

    const iframe = iframeRef.current;
    let doc: Document | null = null;
    
    try {
      doc = iframe.contentDocument || iframe.contentWindow?.document || null;
    } catch {
      // Cross-origin iframe - can't access document
      console.warn("[VisualSelector] Cannot access cross-origin iframe document");
      return;
    }
    
    if (!doc) return;

    const handleClick = (e: MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      
      const target = e.target as HTMLElement;
      if (!target || target === doc.body) return;

      const info = getElementInfo(target);
      setSelectedElement(info);
    };

    const handleMouseOver = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!target || target === doc.body) return;
      setHoveredElement(target);
    };

    const handleMouseOut = () => {
      setHoveredElement(null);
    };

    // Add visual feedback styles to iframe
    const style = doc.createElement("style");
    style.id = "visual-selector-styles";
    style.textContent = `
      * { cursor: crosshair !important; }
      .visual-selector-highlight {
        outline: 2px dashed #3b82f6 !important;
        outline-offset: 2px !important;
        background-color: rgba(59, 130, 246, 0.1) !important;
      }
      .visual-selector-selected {
        outline: 2px solid #3b82f6 !important;
        outline-offset: 2px !important;
        background-color: rgba(59, 130, 246, 0.2) !important;
      }
    `;
    doc.head.appendChild(style);

    doc.addEventListener("click", handleClick, true);
    doc.addEventListener("mouseover", handleMouseOver, true);
    doc.addEventListener("mouseout", handleMouseOut, true);

    return () => {
      doc.removeEventListener("click", handleClick, true);
      doc.removeEventListener("mouseover", handleMouseOver, true);
      doc.removeEventListener("mouseout", handleMouseOut, true);
      const existingStyle = doc.getElementById("visual-selector-styles");
      if (existingStyle) {
        existingStyle.remove();
      }
    };
  }, [isActive, iframeRef, getElementInfo]);

  // Update highlight on hovered element
  useEffect(() => {
    if (!isActive || !iframeRef.current) return;

    const iframe = iframeRef.current;
    let doc: Document | null = null;
    
    try {
      doc = iframe.contentDocument || iframe.contentWindow?.document || null;
    } catch {
      // Cross-origin iframe - can't access document
      return;
    }
    
    if (!doc) return;

    // Clear previous highlights
    doc.querySelectorAll(".visual-selector-highlight").forEach(el => {
      el.classList.remove("visual-selector-highlight");
    });

    if (hoveredElement) {
      hoveredElement.classList.add("visual-selector-highlight");
    }

    // Clear previous selection highlight
    doc.querySelectorAll(".visual-selector-selected").forEach(el => {
      el.classList.remove("visual-selector-selected");
    });

    if (selectedElement && hoveredElement) {
      const selector = selectedElement.selector;
      try {
        const el = doc.querySelector(selector);
        if (el) {
          el.classList.add("visual-selector-selected");
        }
      } catch {
        // Invalid selector, ignore
      }
    }
  }, [hoveredElement, selectedElement, isActive, iframeRef]);

  const handleClose = () => {
    setSelectedElement(null);
    setHoveredElement(null);
    
    // Clear highlights
    if (iframeRef.current) {
      let doc: Document | null = null;
      try {
        doc = iframeRef.current.contentDocument || iframeRef.current.contentWindow?.document || null;
      } catch {
        // Cross-origin iframe - can't access document
        return;
      }
      if (doc) {
        doc.querySelectorAll(".visual-selector-highlight, .visual-selector-selected").forEach(el => {
          el.classList.remove("visual-selector-highlight", "visual-selector-selected");
        });
      }
    }
  };

  const handleAskAI = () => {
    if (selectedElement) {
      onAskAI(selectedElement);
      handleClose();
      onToggle();
    }
  };

  const handleEdit = () => {
    if (selectedElement) {
      onEdit(selectedElement);
      handleClose();
      onToggle();
    }
  };

  return (
    <div className="flex items-center gap-x-2">
      <Hint text={isActive ? "Exit selector mode" : "Select page elements"} side="bottom">
        <Button
          size="sm"
          variant={isActive ? "default" : "outline"}
          onClick={onToggle}
          className={cn(
            "gap-2",
            isActive && "bg-blue-600 hover:bg-blue-700"
          )}
        >
          {isActive ? <Eye className="w-4 h-4" /> : <MousePointerClick className="w-4 h-4" />}
          {isActive ? "Done" : "Select"}
        </Button>
      </Hint>

      {/* Element Info Panel */}
      {selectedElement && (
        <div
          ref={selectionRef}
          className="absolute z-50 bg-background border rounded-lg shadow-lg p-4 w-80 animate-in fade-in zoom-in-95"
          style={{
            top: Math.min(selectedElement.rect.bottom + 10, window.innerHeight - 300),
            left: Math.min(selectedElement.rect.left, window.innerWidth - 320),
          }}
        >
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <code className="text-sm font-semibold bg-muted px-2 py-1 rounded">
                &lt;{selectedElement.tagName}&gt;
              </code>
              {selectedElement.id && (
                <span className="text-xs text-muted-foreground">#{selectedElement.id}</span>
              )}
            </div>
            <Button size="icon" variant="ghost" className="h-6 w-6" onClick={handleClose}>
              <X className="w-4 h-4" />
            </Button>
          </div>

          {selectedElement.className && (
            <div className="text-xs text-muted-foreground mb-2 truncate">
              class: {selectedElement.className}
            </div>
          )}

          {selectedElement.textContent && (
            <div className="text-sm text-muted-foreground mb-3 line-clamp-2">
              &quot;{selectedElement.textContent}&quot;
            </div>
          )}

          <div className="text-xs font-mono text-muted-foreground bg-muted p-2 rounded mb-3 truncate">
            {selectedElement.selector}
          </div>

          <div className="flex gap-2">
            <Button
              size="sm"
              className="flex-1 gap-2"
              onClick={handleAskAI}
            >
              <Wand2 className="w-4 h-4" />
              Ask AI
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="flex-1 gap-2"
              onClick={handleEdit}
            >
              <Code2 className="w-4 h-4" />
              Edit
            </Button>
          </div>
        </div>
      )}

      {/* Hover Tooltip */}
      {isActive && hoveredElement && !selectedElement && (
        <div
          className="fixed z-50 pointer-events-none bg-background/95 border rounded px-2 py-1 text-xs shadow-sm"
          style={{
            top: hoveredElement.getBoundingClientRect().bottom + 5,
            left: hoveredElement.getBoundingClientRect().left,
          }}
        >
          <code>&lt;{hoveredElement.tagName.toLowerCase()}&gt;</code>
          {hoveredElement.id && <span className="ml-1 text-muted-foreground">#{hoveredElement.id}</span>}
        </div>
      )}
    </div>
  );
}

export type { SelectedElement };
