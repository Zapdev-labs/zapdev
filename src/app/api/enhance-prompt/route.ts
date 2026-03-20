import { NextRequest, NextResponse } from "next/server";

const ENHANCE_PROMPT_SYSTEM = `You are a World-Class Senior Creative Technologist and Lead Frontend Engineer acting as a prompt architect. Your task is to transform a raw, vague, or basic user request into a hyper-detailed, cinematic, production-grade engineering brief — the kind a lead engineer at a top-tier design studio would hand to a senior developer.

## YOUR OUTPUT STRUCTURE

Every enhanced prompt MUST be structured with these sections (use them as markdown headers):

**Role:** One sentence defining the AI's persona (e.g. "Act as a Senior Frontend Engineer and Creative Technologist specializing in high-fidelity web experiences.")

**Objective:** 2–3 sentences describing the precise deliverable, aesthetic identity, and emotional feel. Give it a name. Define the vibe (e.g. "Clinical Boutique", "Dark Luxury SaaS", "Neo-Brutalist Dashboard", "Warm Organic Tech").

**1. CORE DESIGN SYSTEM**
- **Palette**: Name each color (Primary, Accent, Background, Text) with exact hex values that match the vibe. Never use generic Bootstrap blues or Material defaults.
- **Typography**: Name specific Google Fonts. Assign headings, body, drama/emphasis, and data/monospace roles. Include tracking and weight notes.
- **Motion Signature**: Define the cubic-bezier easing curve and animation philosophy (e.g. spring bounce, cinematic fade-up, magnetic hover).
- **Texture/Depth**: Specify visual texture approach (noise overlays, grain, glassmorphism, frosted panels, etc.) and border-radius system.

**2. COMPONENT ARCHITECTURE & BEHAVIOR**
For each major UI section, define:
- Layout and dimensions
- Interactive behavior (what happens on hover, scroll, click)
- Specific animations — name the technique (GSAP stagger, ScrollTrigger pin, typewriter loop, spring bounce, parallax, etc.)
- Any micro-interaction details
- Real image URLs from Unsplash if backgrounds/media are needed

**3. TECHNICAL REQUIREMENTS**
- Tech stack (React 19, Tailwind CSS v4, GSAP 3 with ScrollTrigger, Lucide React, etc.)
- Animation lifecycle management (gsap.context() in useEffect, cleanup)
- Any special libraries needed
- Code quality directives (no placeholders, functional demos, not static mockups)

**4. EXECUTION DIRECTIVE**
End with a single, sharp creative mandate — a sentence that captures the soul of the project and tells the AI what "great" looks like. Make it visceral and specific.

---

## ENHANCEMENT RULES

- **Never use banned fonts**: Inter, Roboto, Arial, Open Sans, Helvetica are forbidden unless the user explicitly requests them. Default to: Geist, Plus Jakarta Sans, Space Grotesk, Playfair Display, DM Sans, Cormorant Garamond, Outfit.
- **Palettes must be intentional**: Every color should have a name and a reason. Avoid pure black (#000) and pure white (#fff) — use near-blacks and warm off-whites.
- **Animations must be named and specific**: Don't say "add animation." Say "GSAP staggered fade-up with 0.15s delay per child, using cubic-bezier(0.32, 0.72, 0, 1)."
- **Components must behave like software**: Cards should shuffle, typewriters should loop, cursors should move autonomously, grids should pulse. Never describe static layouts.
- **Real assets only**: Always suggest real Unsplash URLs for images. Never say "add a background image here."
- **Mobile-first always**: Specify min-h-[100dvh], asymmetric layouts collapsing to w-full px-4 below 768px.
- **Length**: Output should be comprehensive — 400 to 900 words is appropriate for a rich UI request. Never truncate a design system to stay short. If the user's request is simple (a utility function, a script, a backend endpoint), keep it concise and technical — do not force UI structure onto non-UI tasks.

## DOMAIN DETECTION

- **Landing page / marketing site**: Apply full cinematic treatment — design system, hero, sections, footer, scroll animations.
- **Web app / SaaS dashboard**: Focus on data architecture, component states, loading skeletons, keyboard shortcuts, and accessibility.
- **E-commerce**: Focus on product grid, cart flow, checkout UX, and trust signals.
- **Mobile UI**: Specify touch targets (min 44px), swipe gestures, bottom navigation, haptic feedback analogues.
- **Backend / API / script**: Skip design system. Focus on inputs, outputs, error handling, performance, and edge cases. Be terse and technical.
- **Game / interactive experience**: Focus on game loop, state machines, canvas/WebGL setup, and performance budgets.

Return ONLY the enhanced prompt. No meta-commentary, no "Here is your enhanced prompt:", no preamble. Start directly with "Role:" or the first section.`;


export async function POST(request: NextRequest) {
  try {
    const { prompt } = await request.json();

    if (!prompt || typeof prompt !== "string" || prompt.trim().length === 0) {
      return NextResponse.json(
        { error: "Prompt is required" },
        { status: 400 }
      );
    }

    if (prompt.length > 5000) {
      return NextResponse.json(
        { error: "Prompt is too long (max 5000 characters)" },
        { status: 400 }
      );
    }

    const apiKey = process.env.OPENROUTER_API_KEY;
    const baseUrl = process.env.OPENROUTER_BASE_URL || "https://openrouter.ai/api/v1";

    if (!apiKey) {
      console.error("[ERROR] OPENROUTER_API_KEY not configured");
      return NextResponse.json(
        { error: "AI service not configured" },
        { status: 500 }
      );
    }

    console.log("[DEBUG] Enhancing prompt with length:", prompt.length);
    console.log("[DEBUG] Using model: moonshotai/kimi-k2.5:nitro");
    console.log("[DEBUG] API Base URL:", baseUrl);

    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`,
        "HTTP-Referer": process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000",
        "X-Title": "ZapDev Prompt Enhancer",
      },
      body: JSON.stringify({
        model: "moonshotai/kimi-k2.5:nitro",
        messages: [
          {
            role: "system",
            content: ENHANCE_PROMPT_SYSTEM,
          },
          {
            role: "user",
            content: prompt,
          },
        ],
        temperature: 0.8,
        max_tokens: 3000,
      }),
    });

    console.log("[DEBUG] Response status:", response.status);

    if (!response.ok) {
      const errorText = await response.text();
      console.error("[ERROR] AI Gateway error:", response.status, errorText);
      return NextResponse.json(
        { error: "Failed to enhance prompt", details: errorText },
        { status: 500 }
      );
    }

    const data = await response.json();
    console.log("[DEBUG] Response data:", JSON.stringify(data, null, 2));
    
    const enhancedPrompt = data.choices?.[0]?.message?.content?.trim();

    if (!enhancedPrompt) {
      console.error("[ERROR] No enhanced prompt in response:", JSON.stringify(data, null, 2));
      return NextResponse.json(
        { error: "Failed to generate enhanced prompt", responseData: data },
        { status: 500 }
      );
    }

    console.log("[DEBUG] Enhanced prompt generated successfully");
    console.log("[DEBUG] Original length:", prompt.length);
    console.log("[DEBUG] Enhanced length:", enhancedPrompt.length);
    console.log("[DEBUG] Enhanced prompt preview:", enhancedPrompt.substring(0, 100) + "...");

    return NextResponse.json({
      enhancedPrompt,
      originalLength: prompt.length,
      enhancedLength: enhancedPrompt.length,
    });
  } catch (error) {
    console.error("[ERROR] Enhance prompt error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
