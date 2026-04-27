import { generateText } from "ai";
import { openrouter } from "../client";

export interface TasteSkill {
  id: string;
  name: string;
  description: string;
  githubPath: string;
  keywords: string[];
  category: "frontend" | "image" | "output" | "design";
}

export const TASTE_SKILLS: TasteSkill[] = [
  {
    id: "design-taste-frontend",
    name: "Design Taste Frontend",
    description:
      "Senior UI/UX Engineer. Architect digital interfaces overriding default LLM biases. Enforces metric-based rules, strict component architecture, CSS hardware acceleration, and balanced design engineering.",
    githubPath: "skills/taste-skill/SKILL.md",
    keywords: ["frontend", "ui", "ux", "react", "nextjs", "tailwind", "component", "layout", "design system", "premium", "modern", "sleek", "interface"],
    category: "frontend",
  },
  {
    id: "high-end-visual-design",
    name: "High-End Visual Design",
    description:
      "Teaches the AI to design like a high-end agency. Defines the exact fonts, spacing, shadows, card structures, and animations that make a website feel expensive.",
    githubPath: "skills/soft-skill/SKILL.md",
    keywords: ["premium", "expensive", "luxury", "agency", "visual", "aesthetic", "awwwards", "dribbble", "motion", "animation", "glassmorphism", "bento"],
    category: "design",
  },
  {
    id: "redesign-existing-projects",
    name: "Redesign Existing Projects",
    description:
      "Upgrades existing websites and apps to premium quality. Audits current design, identifies generic AI patterns, and applies high-end design standards without breaking functionality.",
    githubPath: "skills/redesign-skill/SKILL.md",
    keywords: ["redesign", "upgrade", "improve", "refactor", "existing", "audit", "fix", "cleanup", "polish", "revamp"],
    category: "design",
  },
  {
    id: "minimalist-ui",
    name: "Minimalist UI",
    description:
      "Clean editorial-style interfaces. Warm monochrome palette, typographic contrast, flat bento grids, muted pastels. No gradients, no heavy shadows.",
    githubPath: "skills/minimalist-skill/SKILL.md",
    keywords: ["minimalist", "clean", "editorial", "simple", "notion", "linear", "white space", "monochrome", "flat", "restrained"],
    category: "design",
  },
  {
    id: "full-output-enforcement",
    name: "Full Output Enforcement",
    description:
      "Overrides default LLM truncation behavior. Enforces complete code generation, bans placeholder patterns, and handles token-limit splits cleanly.",
    githubPath: "skills/output-skill/SKILL.md",
    keywords: ["complete", "full", "exhaustive", "no placeholders", "full file", "entire", "all", "every", "thorough", "comprehensive"],
    category: "output",
  },
  {
    id: "image-taste-frontend",
    name: "Image Taste Frontend",
    description:
      "Elite website image-to-code skill. For visually important web tasks, it must first generate the design image(s) itself, deeply analyze them, then implement the website to match them as closely as possible.",
    githubPath: "skills/image-to-code-skill/SKILL.md",
    keywords: ["image to code", "image first", "visual", "screenshot", "mockup", "design to code", "pixel perfect", "faithful", "reference image"],
    category: "image",
  },
  {
    id: "industrial-brutalist-ui",
    name: "Industrial Brutalist UI",
    description:
      "Raw mechanical interfaces fusing Swiss typographic print with military terminal aesthetics. Rigid grids, extreme type scale contrast, utilitarian color, analog degradation effects.",
    githubPath: "skills/brutalist-skill/SKILL.md",
    keywords: ["brutalist", "industrial", "swiss", "terminal", "crt", "monospace", "grid", "harsh", "raw", "mechanical", "blueprint", "telemetry"],
    category: "design",
  },
  {
    id: "imagegen-frontend-mobile",
    name: "ImageGen Frontend Mobile",
    description:
      "Elite mobile app image-generation skill for creating premium, app-native screen concepts and flows. Designed for iOS, Android, and cross-platform mobile products.",
    githubPath: "imagegen-skills/frontend-mobile/SKILL.md",
    keywords: ["mobile", "ios", "android", "app", "screen", "phone", "native", "app design", "mobile app", "onboarding", "dashboard mobile"],
    category: "image",
  },
  {
    id: "brandkit",
    name: "BrandKit",
    description:
      "Premium brand-kit image generation skill for creating high-end brand-guidelines boards, logo systems, identity decks, and visual-world presentations.",
    githubPath: "imagegen-skills/brandkit/SKILL.md",
    keywords: ["brand", "logo", "identity", "brand kit", "guidelines", "visual identity", "mockup", "presentation", "deck", "branding"],
    category: "image",
  },
];

const OWNER = "Leonxlnx";
const REPO = "taste-skill";
const BRANCH = "main";

const SKILL_CACHE = new Map<string, string>();
const CACHE_TTL_MS = 1000 * 60 * 60; // 1 hour
const CACHE_META = new Map<string, number>();

export async function fetchTasteSkill(skillId: string): Promise<string | null> {
  const skill = TASTE_SKILLS.find((s) => s.id === skillId);
  if (!skill) return null;

  const cached = SKILL_CACHE.get(skillId);
  const cachedAt = CACHE_META.get(skillId) ?? 0;
  if (cached && Date.now() - cachedAt < CACHE_TTL_MS) {
    return cached;
  }

  const url = `https://raw.githubusercontent.com/${OWNER}/${REPO}/${BRANCH}/${skill.githubPath}`;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(15000) });
    if (!res.ok) return null;
    const text = await res.text();
    SKILL_CACHE.set(skillId, text);
    CACHE_META.set(skillId, Date.now());
    return text;
  } catch {
    return null;
  }
}

export function quickMatchTasteSkill(userMessage: string): TasteSkill | null {
  const msg = userMessage.toLowerCase();
  let best: TasteSkill | null = null;
  let bestScore = 0;

  for (const skill of TASTE_SKILLS) {
    let score = 0;
    for (const kw of skill.keywords) {
      if (msg.includes(kw.toLowerCase())) score += 1;
    }
    // Boost exact category matches
    if (skill.category === "image" && /\b(image|screenshot|mockup|figma|design ref)\b/i.test(msg)) {
      score += 2;
    }
    if (skill.category === "output" && /\b(full|complete|entire|all files|every)\b/i.test(msg)) {
      score += 2;
    }
    if (score > bestScore) {
      bestScore = score;
      best = skill;
    }
  }

  return bestScore >= 2 ? best : null;
}

const ROUTER_MODEL = "google/gemini-2.0-flash-001";

export async function aiPickTasteSkill(userMessage: string): Promise<TasteSkill | null> {
  const quick = quickMatchTasteSkill(userMessage);
  if (quick && quick.category !== "frontend") {
    // High-confidence non-frontend match — trust it immediately
    return quick;
  }

  const skillList = TASTE_SKILLS.map(
    (s) => `- ${s.id}: ${s.description} (keywords: ${s.keywords.slice(0, 6).join(", ")})`
  ).join("\n");

  try {
    const { text } = await generateText({
      model: openrouter(ROUTER_MODEL),
      system: `You are a taste-skill router. Given a user's request, pick the single best skill ID from the list below, or reply "none" if no skill fits.

Available skills:
${skillList}

Reply with ONLY the skill ID or "none". No explanation.`,
      prompt: `User request: "${userMessage}"`,
      temperature: 0.1,
      maxOutputTokens: 64,
    });

    const id = text.trim().toLowerCase().replace(/\.$/, "");
    if (id === "none" || id === "null") return quick; // fall back to keyword match
    const found = TASTE_SKILLS.find((s) => s.id === id);
    return found ?? quick;
  } catch {
    return quick;
  }
}
