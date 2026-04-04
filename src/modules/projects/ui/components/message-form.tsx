import { z } from "zod";
import { toast } from "sonner";
import Image from "next/image";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { useRouter } from "next/navigation";
import { zodResolver } from "@hookform/resolvers/zod";
import TextareaAutosize from "react-textarea-autosize";
import {
  ArrowUpIcon,
  DownloadIcon,
  GitBranchIcon,
  ImageIcon,
  Loader2Icon,
  SparklesIcon,
  XIcon,
} from "lucide-react";
import { UploadButton } from "@uploadthing/react";
import { useQuery, useAction } from "convex/react";
import { api } from "@/lib/convex-api";
import type { ModelId } from "@/agents/types";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Form, FormField } from "@/components/ui/form";
import {
  Popover,
  PopoverTrigger,
  PopoverContent,
} from "@/components/ui/popover";

import { Usage } from "./usage";
import type { OurFileRouter } from "@/lib/uploadthing";

interface Props {
  projectId: string;
  onStreamingFiles?: (files: Record<string, string>) => void;
};

const formSchema = z.object({
  value: z.string()
    .min(1, { message: "Value is required" })
    .max(10000, { message: "Value is too long" }),
})

interface AttachmentData {
  url: string;
  size: number;
  width?: number;
  height?: number;
}

export const MessageForm = ({ projectId }: Props) => {
  const router = useRouter();

  const usage = useQuery(api.usage.getUsage);
  const createMessageWithAttachments = useAction(api.messages.createWithAttachments);

  const [attachments, setAttachments] = useState<AttachmentData[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [isImportMenuOpen, setIsImportMenuOpen] = useState(false);
  const [isModelMenuOpen, setIsModelMenuOpen] = useState(false);
  const [selectedModel, setSelectedModel] = useState<ModelId>("auto");
  const [isEnhancing, setIsEnhancing] = useState(false);

  // Model configurations matching backend
  const modelOptions = [
    { id: "auto" as ModelId, name: "Auto", image: "/auto.svg", description: "Auto-selects the best model" },
    { id: "anthropic/claude-haiku-4.5" as ModelId, name: "Claude Haiku 4.5", image: "/haiku.svg", description: "Fast and efficient" },
    { id: "google/gemini-3.1-pro-preview" as ModelId, name: "Gemini 3.1 Pro", image: "/gemini.svg", description: "Google's most intelligent model with state-of-the-art reasoning" },
    { id: "openai/gpt-5.1-codex" as ModelId, name: "GPT-5.1 Codex", image: "/openai.svg", description: "OpenAI's flagship model for complex tasks" },
    { id: "z-ai/glm-5" as ModelId, name: "Z-AI GLM 5", image: "/globe.svg", description: "Ultra-fast inference for speed-critical tasks" },
    { id: "moonshotai/kimi-k2.5" as ModelId, name: "Kimi K2.5", image: "/globe.svg", description: "Moonshot's advanced reasoning model for complex development tasks" },
    { id: "accounts/fireworks/routers/kimi-k2p5-turbo" as ModelId, name: "Kimi on Crack", image: "/fireworks.svg", description: "Kimi K2.5 Turbo via Fireworks — ultra-fast inference with extended context" },
  ];

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      value: "",
    },
    mode: "onSubmit",
  });

  const onSubmit = async (values: z.infer<typeof formSchema>) => {
    try {
      setIsCreating(true);
      const result = await createMessageWithAttachments({
        value: values.value,
        projectId,
        attachments: attachments.length > 0 ? attachments : undefined,
      });

      const response = await fetch("/api/agent/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId: result.projectId,
          value: result.value,
          model: selectedModel,
          messageId: result.messageId,
        }),
      });

      if (!response.ok) {
        throw new Error("Failed to start agent");
      }

      form.reset();
      setAttachments([]);
    } catch (error) {
      if (error instanceof Error) {
        toast.error(error.message);

        if (error.message.includes("credits") || error.message.includes("out of credits")) {
          router.push("/pricing");
        }
      } else {
        toast.error("Something went wrong");
      }
    } finally {
      setIsCreating(false);
    }
  };

  const removeAttachment = (index: number) => {
    setAttachments((prev) => prev.filter((_, i) => i !== index));
  };

  const handleGitHubImport = async () => {
    setIsImportMenuOpen(false);
    try {
      const url = new URL("/import", window.location.origin);
      url.searchParams.set("source", "github");
      url.searchParams.set("projectId", projectId);
      window.location.href = url.toString();
    } catch {
      toast.error("Failed to open GitHub import");
    }
  };

  const handleEnhancePrompt = async () => {
    const currentValue = form.getValues("value").trim();
    
    if (!currentValue) {
      toast.error("Please enter a prompt first");
      return;
    }

    if (currentValue.length < 10) {
      toast.error("Prompt is too short to enhance");
      return;
    }

    try {
      setIsEnhancing(true);
      
      console.log("[ENHANCE] Starting enhancement for prompt:", currentValue.substring(0, 50) + "...");
      
      const response = await fetch("/api/enhance-prompt", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ prompt: currentValue }),
      });

      console.log("[ENHANCE] Response status:", response.status);

      if (!response.ok) {
        const errorData = await response.json();
        console.error("[ENHANCE] Error response:", errorData);
        throw new Error(errorData.error || "Failed to enhance prompt");
      }

      const data = await response.json();
      console.log("[ENHANCE] Response data:", data);
      
      if (data.enhancedPrompt) {
        console.log("[ENHANCE] Setting enhanced prompt, length:", data.enhancedPrompt.length);
        form.setValue("value", data.enhancedPrompt, {
          shouldDirty: true,
          shouldValidate: true,
          shouldTouch: true,
        });
        console.log("[ENHANCE] Form value after setting:", form.getValues("value").substring(0, 50) + "...");
        toast.success("Prompt enhanced successfully!");
      } else {
        console.error("[ENHANCE] No enhancedPrompt in response:", data);
        throw new Error("No enhanced prompt received");
      }
    } catch (error) {
      console.error("[ENHANCE] Enhance prompt error:", error);
      toast.error(error instanceof Error ? error.message : "Failed to enhance prompt. Please try again.");
    } finally {
      setIsEnhancing(false);
    }
  };

  const [isFocused, setIsFocused] = useState(false);
  const isPending = isCreating;
  const isButtonDisabled = isPending || !form.formState.isValid || isUploading;
  const isEnhanceDisabled = isEnhancing || isPending || isUploading;
  const showUsage = !!usage;

  return (
    <Form {...form}>
      {showUsage && usage && (
        <Usage
          points={usage.remainingPoints}
          msBeforeNext={usage.msBeforeNext}
          planType={usage.planType}
        />
      )}
      <form
        onSubmit={form.handleSubmit(onSubmit)}
        className={cn(
          "relative border p-4 pt-1 rounded-xl bg-sidebar dark:bg-sidebar transition-all",
          isFocused && "shadow-xs",
          showUsage && "rounded-t-none",
        )}
      >
        <FormField
          control={form.control}
          name="value"
          render={({ field }) => (
            <TextareaAutosize
              {...field}
              disabled={isPending}
              onFocus={() => setIsFocused(true)}
              onBlur={() => setIsFocused(false)}
              minRows={2}
              maxRows={8}
              className="pt-4 resize-none border-none w-full outline-none bg-transparent"
              placeholder="What would you like to build?"
              onKeyDown={(e) => {
                if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
                  e.preventDefault();
                  const currentValue = form.getValues("value").trim();
                  if (!currentValue) {
                    void form.trigger("value");
                    return;
                  }
                  form.handleSubmit(onSubmit)(e).catch(() => null);
                }
              }}
            />
          )}
        />
        {attachments.length > 0 && (
          <div className="flex flex-wrap gap-2 pt-2">
            {attachments.map((attachment, index) => (
              <div key={index} className="relative group">
                <Image
                  src={attachment.url}
                  alt="Attachment"
                  width={80}
                  height={80}
                  className="rounded-lg object-cover border"
                />
                <button
                  type="button"
                  onClick={() => removeAttachment(index)}
                  className="absolute -top-2 -right-2 bg-destructive text-destructive-foreground rounded-full p-1 opacity-0 group-hover:opacity-100 transition-opacity"
                >
                  <XIcon className="size-3" />
                </button>
              </div>
            ))}
          </div>
        )}
        <div className="flex gap-x-2 items-end justify-between pt-2">
          <div className="flex items-center gap-2 flex-1">
            <Button
              variant="ghost"
              size="icon"
              className="size-8"
              type="button"
              onClick={handleEnhancePrompt}
              disabled={isEnhanceDisabled}
              title="Enhance prompt with AI"
            >
              {isEnhancing ? (
                <Loader2Icon className="size-4 animate-spin text-muted-foreground" />
              ) : (
                <SparklesIcon className="size-4 text-muted-foreground" />
              )}
            </Button>
            <UploadButton<OurFileRouter, "imageUploader">
              endpoint="imageUploader"
              onClientUploadComplete={(res) => {
                if (res) {
                  const newAttachments = res.map((file) => ({
                    url: file.ufsUrl,
                    size: file.size,
                  }));
                  setAttachments((prev) => [...prev, ...newAttachments]);
                  toast.success("Images uploaded successfully");
                }
                setIsUploading(false);
              }}
              onUploadError={(error: Error) => {
                toast.error(`Upload failed: ${error.message}`);
                setIsUploading(false);
              }}
              onUploadBegin={() => {
                setIsUploading(true);
              }}
              appearance={{
                button: "size-8 bg-transparent border-none p-0 hover:bg-transparent focus-within:ring-0 focus-within:ring-offset-0",
                allowedContent: "hidden",
              }}
              content={{
                button: isUploading ? (
                  <Loader2Icon className="size-4 animate-spin text-muted-foreground" />
                ) : (
                  <ImageIcon className="size-4 text-muted-foreground" />
                ),
              }}
            />
            <Popover open={isImportMenuOpen} onOpenChange={setIsImportMenuOpen}>
              <PopoverTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-8"
                  type="button"
                  disabled={isPending || isUploading}
                >
                  <DownloadIcon className="size-4 text-muted-foreground" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-48 p-2" align="start">
                <div className="flex flex-col gap-2">
                  <button
                    type="button"
                    onClick={handleGitHubImport}
                    className="flex items-center gap-2 w-full px-3 py-2 rounded-md hover:bg-accent text-left text-sm"
                  >
                    <GitBranchIcon className="size-4" />
                    <span>Import from GitHub</span>
                  </button>
                </div>
              </PopoverContent>
            </Popover>
            <Popover open={isModelMenuOpen} onOpenChange={setIsModelMenuOpen}>
              <PopoverTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-8"
                  type="button"
                  disabled={isPending || isUploading}
                  title="Select AI Model"
                >
                  {(() => {
                    const selectedOption = modelOptions.find((opt) => opt.id === selectedModel);
                    const imageSrc = selectedOption?.image || "/auto.svg";
                    return <Image src={imageSrc} alt="Model" width={16} height={16} className="size-4" unoptimized />;
                  })()}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-72 p-2" align="start">
                <div className="flex flex-col gap-1">
                  <div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground">
                    Select Model
                  </div>
                  {modelOptions.map((option) => {
                    const isSelected = selectedModel === option.id;
                    return (
                      <button
                        key={option.id}
                        type="button"
                        onClick={() => {
                          setSelectedModel(option.id);
                          setIsModelMenuOpen(false);
                        }}
                        className={cn(
                          "flex items-start gap-3 w-full px-3 py-2.5 rounded-md hover:bg-accent text-left transition-colors",
                          isSelected && "bg-accent"
                        )}
                      >
                        <Image src={option.image} alt={option.name} width={16} height={16} className="size-4 mt-0.5 flex-shrink-0" unoptimized />
                        <div className="flex-1 min-w-0">
                          <div className="font-medium text-sm">{option.name}</div>
                          <div className="text-xs text-muted-foreground">
                            {option.description}
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </PopoverContent>
            </Popover>
            <div className="text-[10px] text-muted-foreground font-mono">
              <kbd className="ml-auto pointer-events-none inline-flex h-5 select-none items-center gap-1 rounded border bg-muted px-1.5 font-mono text-[10px] font-medium text-muted-foreground">
                <span>&#8984;</span>Enter
              </kbd>
              &nbsp;to submit
            </div>
          </div>
          <Button
            disabled={isButtonDisabled}
            className={cn(
              "size-8 rounded-full",
              isButtonDisabled && "bg-muted-foreground border"
            )}
            type="submit"
          >
            {isPending ? (
              <Loader2Icon className="size-4 animate-spin" />
            ) : (
              <ArrowUpIcon />
            )}
          </Button>
        </div>
      </form>
    </Form>
  );
};
