"use client";

import { z } from "zod";
import { toast } from "sonner";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import TextareaAutosize from "react-textarea-autosize";
import { ArrowUpIcon, Loader2Icon, ImageIcon, XIcon, DownloadIcon, GitBranchIcon, SparklesIcon, ZapIcon, CpuIcon, CrownIcon } from "lucide-react";
import { UploadButton } from "@uploadthing/react";
import { useAction } from "convex/react";
import { api } from "@/lib/convex-api";
import type { ModelTier } from "@/agents/types";
import { TIER_CONFIGS, getDefaultModelForTier, getCreditMultiplier } from "@/agents/types";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Form, FormField } from "@/components/ui/form";
import {
  Popover,
  PopoverTrigger,
  PopoverContent,
} from "@/components/ui/popover";

import { PROJECT_TEMPLATES } from "../../constants";
import type { OurFileRouter } from "@/lib/uploadthing";

const formSchema = z.object({
  value: z.string()
    .min(1, { message: "Value is required" })
    .max(10000, { message: "Value is too long" }),
});

interface AttachmentData {
  url: string;
  size: number;
  width?: number;
  height?: number;
}

const TIER_ICONS = {
  cheap: ZapIcon,
  pro: CpuIcon,
  best: CrownIcon,
};

export const ProjectForm = () => {
  const router = useRouter();
  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      value: "",
    },
    mode: "onSubmit",
  });

  const createProjectWithMessageAndAttachments = useAction(api.projects.createWithMessageAndAttachments);
  const [isCreating, setIsCreating] = useState(false);
  const [attachments, setAttachments] = useState<AttachmentData[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [isImportMenuOpen, setIsImportMenuOpen] = useState(false);
  const [isTierMenuOpen, setIsTierMenuOpen] = useState(false);
  const [selectedTier, setSelectedTier] = useState<ModelTier>("pro");
  const [isEnhancing, setIsEnhancing] = useState(false);

  const onSubmit = async (values: z.infer<typeof formSchema>) => {
    try {
      setIsCreating(true);
      
      // Get the actual model ID from the tier
      const modelId = getDefaultModelForTier(selectedTier);
      
      const result = await createProjectWithMessageAndAttachments({
        value: values.value,
        model: selectedTier, // Send the tier, backend will resolve
        attachments: attachments.length > 0 ? attachments : undefined,
      });

      const agentResponse = await fetch("/api/agent/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId: result.id,
          value: result.value,
          model: selectedTier, // Send the tier
        }),
      });

      if (!agentResponse.ok) {
        throw new Error("Failed to start agent");
      }

      form.reset();
      setAttachments([]);
      router.push(`/projects/${result.id}`);
    } catch (error) {
      if (error instanceof Error) {
        toast.error(error.message);

        if (error.message.includes("Unauthenticated") || error.message.includes("Not authenticated")) {
          router.push("/sign-in");
        }

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
      window.location.href = "/import?source=github";
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

  const onSelect = (value: string) => {
    form.setValue("value", value, {
      shouldDirty: true,
      shouldValidate: true,
      shouldTouch: true,
    });
  };

  const [isFocused, setIsFocused] = useState(false);
  const isPending = isCreating;
  const isButtonDisabled = isPending || !form.formState.isValid || isUploading;
  const isEnhanceDisabled = isEnhancing || isPending || isUploading;

  const currentTier = TIER_CONFIGS[selectedTier];
  const creditMultiplier = getCreditMultiplier(selectedTier);
  const TierIcon = TIER_ICONS[selectedTier];

  return (
    <Form {...form}>
      <section className="space-y-6">
        <form
          onSubmit={form.handleSubmit(onSubmit)}
          className={cn(
            "relative border p-4 pt-1 rounded-xl bg-sidebar dark:bg-sidebar transition-all",
            isFocused && "shadow-xs",
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
                  <img
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
              
              {/* Tier Selector */}
              <Popover open={isTierMenuOpen} onOpenChange={setIsTierMenuOpen}>
                <PopoverTrigger asChild>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-8 gap-1.5 px-2 text-xs font-medium"
                    type="button"
                    disabled={isPending || isUploading}
                    title="Select AI Model Tier"
                    style={{ 
                      borderColor: currentTier.color,
                      color: currentTier.color 
                    }}
                  >
                    <TierIcon className="size-3.5" style={{ color: currentTier.color }} />
                    <span>{currentTier.name}</span>
                    {creditMultiplier !== 1 && (
                      <span className="text-[10px] opacity-70">
                        {creditMultiplier < 1 ? `${Math.round(1/creditMultiplier)}x` : `${creditMultiplier}x`}
                      </span>
                    )}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-80 p-3" align="start">
                  <div className="flex flex-col gap-2">
                    <div className="px-1 py-1 text-xs font-semibold text-muted-foreground">
                      Select Model Tier
                    </div>
                    {(Object.keys(TIER_CONFIGS) as ModelTier[]).map((tier) => {
                      const config = TIER_CONFIGS[tier];
                      const isSelected = selectedTier === tier;
                      const TierIconComponent = TIER_ICONS[tier];
                      const multiplier = config.creditMultiplier;
                      
                      return (
                        <button
                          key={tier}
                          type="button"
                          onClick={() => {
                            setSelectedTier(tier);
                            setIsTierMenuOpen(false);
                          }}
                          className={cn(
                            "flex flex-col gap-1.5 w-full px-3 py-3 rounded-lg hover:bg-accent text-left transition-colors border",
                            isSelected && "bg-accent border-primary"
                          )}
                          style={{ borderColor: isSelected ? config.color : undefined }}
                        >
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <TierIconComponent className="size-4" style={{ color: config.color }} />
                              <span className="font-semibold text-sm">{config.emoji} {config.name}</span>
                            </div>
                            <span 
                              className="text-[10px] font-medium px-2 py-0.5 rounded-full"
                              style={{ 
                                backgroundColor: `${config.color}20`,
                                color: config.color 
                              }}
                            >
                              {multiplier < 1 ? `${Math.round(1/multiplier)}x gens` : multiplier === 1 ? "1x" : `${multiplier}x cost`}
                            </span>
                          </div>
                          <p className="text-xs text-muted-foreground">
                            {config.description}
                          </p>
                          <div className="flex flex-wrap gap-1 mt-1">
                            {config.features.map((feature, idx) => (
                              <span 
                                key={idx}
                                className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground"
                              >
                                {feature}
                              </span>
                            ))}
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
        <div className="flex-wrap justify-center gap-2 hidden md:flex max-w-3xl">
          {PROJECT_TEMPLATES.map((template) => (
            <Button 
              key={template.title}
              variant="outline"
              size="sm"
              className="bg-white dark:bg-sidebar"
              onClick={() => onSelect(template.prompt)}
            >
              {template.emoji} {template.title}
            </Button>
          ))}
        </div>
      </section>
    </Form>
  );
};
