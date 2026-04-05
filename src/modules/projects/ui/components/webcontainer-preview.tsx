"use client";

import { useEffect, useMemo, useRef, useState, forwardRef } from "react";
import type { WebContainerProcess } from "@webcontainer/api";

interface Props {
  files: Record<string, string>;
  refreshKey: number;
  onPreviewUrlChange?: (url: string | null) => void;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const isNextJsProject = (files: Record<string, string>): boolean =>
  Object.keys(files).some(
    (f) =>
      f === "app/page.tsx" ||
      f === "app/page.ts" ||
      f === "app/layout.tsx" ||
      (f.startsWith("app/") && f.endsWith(".tsx"))
  );

const isNpmProject = (files: Record<string, string>): boolean =>
  "package.json" in files;

const hasLocalServerEntry = (files: Record<string, string>): boolean =>
  "server.mjs" in files || "server.js" in files;

const safeParseJson = <T,>(value: string): T | null => {
  try {
    return JSON.parse(value) as T;
  } catch {
    return null;
  }
};

// ─── Vite project injection for Next.js files ─────────────────────────────────
// When the agent generates Next.js source files, WebContainer can't run Next.js
// (too slow to install + pre-installed Shadcn not available). Instead, wrap the
// files in a lightweight Vite+React project with Next.js stubs and Shadcn stubs.

const VITE_PACKAGE_JSON = JSON.stringify(
  {
    name: "zapdev-preview",
    version: "1.0.0",
    type: "module",
    scripts: { dev: "vite --host --port 3000" },
    dependencies: {
      react: "^18.3.1",
      "react-dom": "^18.3.1",
      "lucide-react": "^0.469.0",
      "class-variance-authority": "^0.7.1",
      clsx: "^2.1.1",
      "tailwind-merge": "^2.5.4",
    },
    devDependencies: {
      "@vitejs/plugin-react": "^4.3.4",
      vite: "^6.0.7",
      tailwindcss: "^3.4.17",
      autoprefixer: "^10.4.20",
      postcss: "^8.5.3",
    },
  },
  null,
  2
);

const VITE_CONFIG = `import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, '.'),
      'next/link': path.resolve(__dirname, '__stubs__/next-link.tsx'),
      'next/image': path.resolve(__dirname, '__stubs__/next-image.tsx'),
      'next/navigation': path.resolve(__dirname, '__stubs__/next-navigation.ts'),
      'next/headers': path.resolve(__dirname, '__stubs__/next-headers.ts'),
      'next/font/google': path.resolve(__dirname, '__stubs__/next-font.ts'),
    },
  },
})`;

const TAILWIND_CONFIG = `/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./**/*.{ts,tsx}", "!./node_modules/**"],
  theme: {
    extend: {
      colors: {
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
        },
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
      },
    },
  },
  plugins: [],
}`;

const POSTCSS_CONFIG = `export default { plugins: { tailwindcss: {}, autoprefixer: {} } }`;

const INDEX_HTML = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>ZapDev Preview</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>`;

const SRC_MAIN_TSX = `import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from '../app/page'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)`;

const SRC_INDEX_CSS = `@tailwind base;
@tailwind components;
@tailwind utilities;

@layer base {
  :root {
    --background: 0 0% 100%;
    --foreground: 222.2 84% 4.9%;
    --card: 0 0% 100%;
    --card-foreground: 222.2 84% 4.9%;
    --border: 214.3 31.8% 91.4%;
    --input: 214.3 31.8% 91.4%;
    --primary: 222.2 47.4% 11.2%;
    --primary-foreground: 210 40% 98%;
    --secondary: 210 40% 96.1%;
    --secondary-foreground: 222.2 47.4% 11.2%;
    --muted: 210 40% 96.1%;
    --muted-foreground: 215.4 16.3% 46.9%;
    --accent: 210 40% 96.1%;
    --accent-foreground: 222.2 47.4% 11.2%;
    --destructive: 0 84.2% 60.2%;
    --destructive-foreground: 210 40% 98%;
    --ring: 222.2 84% 4.9%;
    --radius: 0.5rem;
  }
  .dark {
    --background: 222.2 84% 4.9%;
    --foreground: 210 40% 98%;
    --card: 222.2 84% 4.9%;
    --card-foreground: 210 40% 98%;
    --border: 217.2 32.6% 17.5%;
    --input: 217.2 32.6% 17.5%;
    --primary: 210 40% 98%;
    --primary-foreground: 222.2 47.4% 11.2%;
    --secondary: 217.2 32.6% 17.5%;
    --secondary-foreground: 210 40% 98%;
    --muted: 217.2 32.6% 17.5%;
    --muted-foreground: 215 20.2% 65.1%;
    --accent: 217.2 32.6% 17.5%;
    --accent-foreground: 210 40% 98%;
    --destructive: 0 62.8% 30.6%;
    --destructive-foreground: 210 40% 98%;
    --ring: 212.7 26.8% 83.9%;
  }
}`;

const LIB_UTILS = `import { type ClassValue, clsx } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}`;

// Next.js stubs — prevent import errors for next/* packages
const STUB_NEXT_LINK = `import React from 'react'
export default function Link({ href, children, className, ...props }: any) {
  return <a href={href} className={className} {...props}>{children}</a>
}`;

const STUB_NEXT_IMAGE = `import React from 'react'
export default function Image({ src, alt, width, height, className, fill, ...props }: any) {
  return <img src={src} alt={alt || ''} width={fill ? '100%' : width} height={fill ? '100%' : height} className={className} style={fill ? { width: '100%', height: '100%', objectFit: 'cover' } : undefined} {...props} />
}`;

const STUB_NEXT_NAVIGATION = `export const useRouter = () => ({ push: (_: string) => {}, replace: (_: string) => {}, back: () => {}, forward: () => {}, refresh: () => {} })
export const usePathname = () => "/"
export const useSearchParams = () => new URLSearchParams()
export const useParams = () => ({})
export const redirect = (_: string) => {}
export const notFound = () => {}`;

const STUB_NEXT_HEADERS = `export const headers = () => new Headers()
export const cookies = () => ({ get: (_: string) => null, getAll: () => [], set: () => {}, delete: () => {} })`;

const STUB_NEXT_FONT = `export const Inter = () => ({ className: '', style: {} })
export const Geist = () => ({ className: '', style: {} })
export const GeistMono = () => ({ className: '', style: {} })
export const Plus_Jakarta_Sans = () => ({ className: '', style: {} })
export const Space_Grotesk = () => ({ className: '', style: {} })`;

// Shadcn UI component stubs — lightweight implementations matching the shadcn API
const SHADCN_STUBS: Record<string, string> = {
  "components/ui/button.tsx": `import React from 'react'
import { cn } from '@/lib/utils'

const variants: Record<string, string> = {
  default: 'bg-primary text-primary-foreground hover:bg-primary/90',
  destructive: 'bg-destructive text-destructive-foreground hover:bg-destructive/90',
  outline: 'border border-input bg-background hover:bg-accent hover:text-accent-foreground',
  secondary: 'bg-secondary text-secondary-foreground hover:bg-secondary/80',
  ghost: 'hover:bg-accent hover:text-accent-foreground',
  link: 'text-primary underline-offset-4 hover:underline',
}
const sizes: Record<string, string> = {
  default: 'h-10 px-4 py-2',
  sm: 'h-9 rounded-md px-3',
  lg: 'h-11 rounded-md px-8',
  icon: 'h-10 w-10',
}

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: keyof typeof variants
  size?: keyof typeof sizes
  asChild?: boolean
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = 'default', size = 'default', asChild, children, ...props }, ref) => (
    <button ref={ref} className={cn('inline-flex items-center justify-center whitespace-nowrap rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50', variants[variant], sizes[size], className)} {...props}>{children}</button>
  )
)
Button.displayName = 'Button'
export const buttonVariants = (opts: { variant?: string; size?: string; className?: string } = {}) =>
  cn('inline-flex items-center justify-center rounded-md text-sm font-medium', variants[opts.variant ?? 'default'], sizes[opts.size ?? 'default'], opts.className)`,

  "components/ui/card.tsx": `import React from 'react'
import { cn } from '@/lib/utils'

export const Card = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(({ className, ...props }, ref) => (
  <div ref={ref} className={cn('rounded-lg border bg-card text-card-foreground shadow-sm', className)} {...props} />
))
Card.displayName = 'Card'
export const CardHeader = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(({ className, ...props }, ref) => (
  <div ref={ref} className={cn('flex flex-col space-y-1.5 p-6', className)} {...props} />
))
CardHeader.displayName = 'CardHeader'
export const CardTitle = React.forwardRef<HTMLParagraphElement, React.HTMLAttributes<HTMLHeadingElement>>(({ className, ...props }, ref) => (
  <h3 ref={ref} className={cn('text-2xl font-semibold leading-none tracking-tight', className)} {...props} />
))
CardTitle.displayName = 'CardTitle'
export const CardDescription = React.forwardRef<HTMLParagraphElement, React.HTMLAttributes<HTMLParagraphElement>>(({ className, ...props }, ref) => (
  <p ref={ref} className={cn('text-sm text-muted-foreground', className)} {...props} />
))
CardDescription.displayName = 'CardDescription'
export const CardContent = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(({ className, ...props }, ref) => (
  <div ref={ref} className={cn('p-6 pt-0', className)} {...props} />
))
CardContent.displayName = 'CardContent'
export const CardFooter = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(({ className, ...props }, ref) => (
  <div ref={ref} className={cn('flex items-center p-6 pt-0', className)} {...props} />
))
CardFooter.displayName = 'CardFooter'`,

  "components/ui/input.tsx": `import React from 'react'
import { cn } from '@/lib/utils'
export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {}
export const Input = React.forwardRef<HTMLInputElement, InputProps>(({ className, type, ...props }, ref) => (
  <input ref={ref} type={type} className={cn('flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50', className)} {...props} />
))
Input.displayName = 'Input'`,

  "components/ui/label.tsx": `import React from 'react'
import { cn } from '@/lib/utils'
export interface LabelProps extends React.LabelHTMLAttributes<HTMLLabelElement> {}
export const Label = React.forwardRef<HTMLLabelElement, LabelProps>(({ className, ...props }, ref) => (
  <label ref={ref} className={cn('text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70', className)} {...props} />
))
Label.displayName = 'Label'`,

  "components/ui/badge.tsx": `import React from 'react'
import { cn } from '@/lib/utils'
const variants: Record<string, string> = {
  default: 'border-transparent bg-primary text-primary-foreground hover:bg-primary/80',
  secondary: 'border-transparent bg-secondary text-secondary-foreground hover:bg-secondary/80',
  destructive: 'border-transparent bg-destructive text-destructive-foreground hover:bg-destructive/80',
  outline: 'text-foreground',
}
export interface BadgeProps extends React.HTMLAttributes<HTMLDivElement> { variant?: keyof typeof variants }
export function Badge({ className, variant = 'default', ...props }: BadgeProps) {
  return <div className={cn('inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2', variants[variant], className)} {...props} />
}`,

  "components/ui/separator.tsx": `import React from 'react'
import { cn } from '@/lib/utils'
export const Separator = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement> & { orientation?: 'horizontal' | 'vertical'; decorative?: boolean }>(
  ({ className, orientation = 'horizontal', decorative = true, ...props }, ref) => (
    <div ref={ref} role={decorative ? 'none' : 'separator'} aria-orientation={decorative ? undefined : orientation} className={cn('shrink-0 bg-border', orientation === 'horizontal' ? 'h-[1px] w-full' : 'h-full w-[1px]', className)} {...props} />
  )
)
Separator.displayName = 'Separator'`,

  "components/ui/tabs.tsx": `import React, { createContext, useContext, useState } from 'react'
import { cn } from '@/lib/utils'
const TabsCtx = createContext<{ value: string; onChange: (v: string) => void }>({ value: '', onChange: () => {} })
export function Tabs({ defaultValue, value: controlled, onValueChange, children, className, ...props }: any) {
  const [inner, setInner] = useState(defaultValue ?? '')
  const value = controlled ?? inner
  const onChange = (v: string) => { setInner(v); onValueChange?.(v) }
  return <TabsCtx.Provider value={{ value, onChange }}><div className={cn('', className)} {...props}>{children}</div></TabsCtx.Provider>
}
export function TabsList({ className, ...props }: any) {
  return <div className={cn('inline-flex h-10 items-center justify-center rounded-md bg-muted p-1 text-muted-foreground', className)} {...props} />
}
export function TabsTrigger({ value, className, children, ...props }: any) {
  const { value: active, onChange } = useContext(TabsCtx)
  return <button onClick={() => onChange(value)} className={cn('inline-flex items-center justify-center whitespace-nowrap rounded-sm px-3 py-1.5 text-sm font-medium ring-offset-background transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50', active === value && 'bg-background text-foreground shadow-sm', className)} {...props}>{children}</button>
}
export function TabsContent({ value, className, ...props }: any) {
  const { value: active } = useContext(TabsCtx)
  if (active !== value) return null
  return <div className={cn('mt-2 ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2', className)} {...props} />
}`,

  "components/ui/textarea.tsx": `import React from 'react'
import { cn } from '@/lib/utils'
export interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {}
export const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(({ className, ...props }, ref) => (
  <textarea ref={ref} className={cn('flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50', className)} {...props} />
))
Textarea.displayName = 'Textarea'`,

  "components/ui/select.tsx": `import React, { createContext, useContext, useState, useRef } from 'react'
import { cn } from '@/lib/utils'
import { ChevronDown } from 'lucide-react'
const SelectCtx = createContext<any>({})
export function Select({ value, defaultValue, onValueChange, children }: any) {
  const [v, setV] = useState(defaultValue ?? '')
  const val = value ?? v
  return <SelectCtx.Provider value={{ value: val, onChange: (x: string) => { setV(x); onValueChange?.(x) } }}>{children}</SelectCtx.Provider>
}
export function SelectTrigger({ className, children, ...props }: any) {
  return <button className={cn('flex h-10 w-full items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50', className)} {...props}>{children}<ChevronDown className="h-4 w-4 opacity-50" /></button>
}
export function SelectValue({ placeholder }: any) {
  const { value } = useContext(SelectCtx)
  return <span>{value || placeholder}</span>
}
export function SelectContent({ className, children, ...props }: any) {
  return <div className={cn('relative z-50 min-w-[8rem] overflow-hidden rounded-md border bg-popover text-popover-foreground shadow-md', className)} {...props}>{children}</div>
}
export function SelectItem({ value, className, children, ...props }: any) {
  const { onChange } = useContext(SelectCtx)
  return <div onClick={() => onChange(value)} className={cn('relative flex w-full cursor-pointer select-none items-center rounded-sm py-1.5 pl-8 pr-2 text-sm outline-none hover:bg-accent hover:text-accent-foreground', className)} {...props}>{children}</div>
}
export const SelectGroup = ({ children }: any) => <div>{children}</div>
export const SelectLabel = ({ children, className }: any) => <div className={cn('py-1.5 pl-8 pr-2 text-sm font-semibold', className)}>{children}</div>`,

  "components/ui/dialog.tsx": `import React, { createContext, useContext } from 'react'
import { cn } from '@/lib/utils'
import { X } from 'lucide-react'
const DialogCtx = createContext<{ open: boolean; onClose: () => void }>({ open: false, onClose: () => {} })
export function Dialog({ open, onOpenChange, children }: any) {
  return <DialogCtx.Provider value={{ open: open ?? false, onClose: () => onOpenChange?.(false) }}>{children}</DialogCtx.Provider>
}
export function DialogTrigger({ children, asChild, ...props }: any) {
  return <span {...props}>{children}</span>
}
export function DialogContent({ className, children, ...props }: any) {
  const { open, onClose } = useContext(DialogCtx)
  if (!open) return null
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="fixed inset-0 bg-black/80" onClick={onClose} />
      <div className={cn('relative z-50 grid w-full max-w-lg gap-4 border bg-background p-6 shadow-lg sm:rounded-lg', className)} {...props}>
        {children}
        <button onClick={onClose} className="absolute right-4 top-4 rounded-sm opacity-70 hover:opacity-100"><X className="h-4 w-4" /></button>
      </div>
    </div>
  )
}
export function DialogHeader({ className, ...props }: any) {
  return <div className={cn('flex flex-col space-y-1.5 text-center sm:text-left', className)} {...props} />
}
export function DialogTitle({ className, ...props }: any) {
  return <h2 className={cn('text-lg font-semibold leading-none tracking-tight', className)} {...props} />
}
export function DialogDescription({ className, ...props }: any) {
  return <p className={cn('text-sm text-muted-foreground', className)} {...props} />
}
export function DialogFooter({ className, ...props }: any) {
  return <div className={cn('flex flex-col-reverse sm:flex-row sm:justify-end sm:space-x-2', className)} {...props} />
}`,

  "components/ui/avatar.tsx": `import React from 'react'
import { cn } from '@/lib/utils'
export const Avatar = React.forwardRef<HTMLSpanElement, React.HTMLAttributes<HTMLSpanElement>>(({ className, ...props }, ref) => (
  <span ref={ref} className={cn('relative flex h-10 w-10 shrink-0 overflow-hidden rounded-full', className)} {...props} />
))
Avatar.displayName = 'Avatar'
export const AvatarImage = React.forwardRef<HTMLImageElement, React.ImgHTMLAttributes<HTMLImageElement>>(({ className, ...props }, ref) => (
  <img ref={ref} className={cn('aspect-square h-full w-full', className)} {...props} />
))
AvatarImage.displayName = 'AvatarImage'
export const AvatarFallback = React.forwardRef<HTMLSpanElement, React.HTMLAttributes<HTMLSpanElement>>(({ className, ...props }, ref) => (
  <span ref={ref} className={cn('flex h-full w-full items-center justify-center rounded-full bg-muted', className)} {...props} />
))
AvatarFallback.displayName = 'AvatarFallback'`,

  "components/ui/switch.tsx": `import React, { useState } from 'react'
import { cn } from '@/lib/utils'
export interface SwitchProps extends Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, 'onChange'> {
  checked?: boolean
  onCheckedChange?: (checked: boolean) => void
}
export const Switch = React.forwardRef<HTMLButtonElement, SwitchProps>(({ className, checked, onCheckedChange, ...props }, ref) => {
  const [inner, setInner] = useState(false)
  const on = checked ?? inner
  return (
    <button ref={ref} role="switch" aria-checked={on} onClick={() => { setInner(!on); onCheckedChange?.(!on) }}
      className={cn('peer inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:cursor-not-allowed disabled:opacity-50', on ? 'bg-primary' : 'bg-input', className)} {...props}>
      <span className={cn('pointer-events-none block h-5 w-5 rounded-full bg-background shadow-lg ring-0 transition-transform', on ? 'translate-x-5' : 'translate-x-0')} />
    </button>
  )
})
Switch.displayName = 'Switch'`,

  "components/ui/checkbox.tsx": `import React, { useState } from 'react'
import { cn } from '@/lib/utils'
import { Check } from 'lucide-react'
export interface CheckboxProps extends Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, 'onChange'> {
  checked?: boolean
  onCheckedChange?: (checked: boolean) => void
}
export const Checkbox = React.forwardRef<HTMLButtonElement, CheckboxProps>(({ className, checked, onCheckedChange, ...props }, ref) => {
  const [inner, setInner] = useState(false)
  const on = checked ?? inner
  return (
    <button ref={ref} role="checkbox" aria-checked={on} onClick={() => { setInner(!on); onCheckedChange?.(!on) }}
      className={cn('peer h-4 w-4 shrink-0 rounded-sm border border-primary ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50', on && 'bg-primary text-primary-foreground', className)} {...props}>
      {on && <Check className="h-3 w-3" />}
    </button>
  )
})
Checkbox.displayName = 'Checkbox'`,

  "components/ui/slider.tsx": `import React from 'react'
import { cn } from '@/lib/utils'
export interface SliderProps extends React.InputHTMLAttributes<HTMLInputElement> {
  defaultValue?: number[]
  value?: number[]
  onValueChange?: (value: number[]) => void
  min?: number
  max?: number
  step?: number
}
export const Slider = React.forwardRef<HTMLInputElement, SliderProps>(({ className, defaultValue, value, onValueChange, min = 0, max = 100, step = 1, ...props }, ref) => (
  <input ref={ref} type="range" min={min} max={max} step={step}
    defaultValue={defaultValue?.[0] ?? 0} value={value?.[0]}
    onChange={(e) => onValueChange?.([Number(e.target.value)])}
    className={cn('w-full accent-primary', className)} {...props} />
))
Slider.displayName = 'Slider'`,

  "components/ui/alert.tsx": `import React from 'react'
import { cn } from '@/lib/utils'
const variants: Record<string, string> = {
  default: 'bg-background text-foreground',
  destructive: 'border-destructive/50 text-destructive dark:border-destructive',
}
export interface AlertProps extends React.HTMLAttributes<HTMLDivElement> { variant?: keyof typeof variants }
export const Alert = React.forwardRef<HTMLDivElement, AlertProps>(({ className, variant = 'default', ...props }, ref) => (
  <div ref={ref} role="alert" className={cn('relative w-full rounded-lg border p-4', variants[variant], className)} {...props} />
))
Alert.displayName = 'Alert'
export const AlertTitle = React.forwardRef<HTMLParagraphElement, React.HTMLAttributes<HTMLHeadingElement>>(({ className, ...props }, ref) => (
  <h5 ref={ref} className={cn('mb-1 font-medium leading-none tracking-tight', className)} {...props} />
))
AlertTitle.displayName = 'AlertTitle'
export const AlertDescription = React.forwardRef<HTMLParagraphElement, React.HTMLAttributes<HTMLParagraphElement>>(({ className, ...props }, ref) => (
  <div ref={ref} className={cn('text-sm [&_p]:leading-relaxed', className)} {...props} />
))
AlertDescription.displayName = 'AlertDescription'`,

  "components/ui/progress.tsx": `import React from 'react'
import { cn } from '@/lib/utils'
export interface ProgressProps extends React.HTMLAttributes<HTMLDivElement> { value?: number }
export const Progress = React.forwardRef<HTMLDivElement, ProgressProps>(({ className, value = 0, ...props }, ref) => (
  <div ref={ref} className={cn('relative h-4 w-full overflow-hidden rounded-full bg-secondary', className)} {...props}>
    <div className="h-full w-full flex-1 bg-primary transition-all" style={{ transform: \`translateX(-\${100 - (value ?? 0)}%)\` }} />
  </div>
))
Progress.displayName = 'Progress'`,

  "components/ui/skeleton.tsx": `import React from 'react'
import { cn } from '@/lib/utils'
export function Skeleton({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('animate-pulse rounded-md bg-muted', className)} {...props} />
}`,

  "components/ui/tooltip.tsx": `import React, { useState } from 'react'
import { cn } from '@/lib/utils'
export function TooltipProvider({ children }: any) { return <>{children}</> }
export function Tooltip({ children }: any) { return <>{children}</> }
export function TooltipTrigger({ children, asChild, ...props }: any) {
  return <span {...props}>{children}</span>
}
export function TooltipContent({ className, children, ...props }: any) {
  return null // simplified: don't show tooltips in preview
}`,

  "components/ui/scroll-area.tsx": `import React from 'react'
import { cn } from '@/lib/utils'
export const ScrollArea = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(({ className, children, ...props }, ref) => (
  <div ref={ref} className={cn('relative overflow-auto', className)} {...props}>{children}</div>
))
ScrollArea.displayName = 'ScrollArea'
export const ScrollBar = () => null`,

  "components/ui/sheet.tsx": `import React from 'react'
import { cn } from '@/lib/utils'
import { X } from 'lucide-react'
import { createContext, useContext } from 'react'
const SheetCtx = createContext<{ open: boolean; onClose: () => void }>({ open: false, onClose: () => {} })
export function Sheet({ open, onOpenChange, children }: any) {
  return <SheetCtx.Provider value={{ open: open ?? false, onClose: () => onOpenChange?.(false) }}>{children}</SheetCtx.Provider>
}
export function SheetTrigger({ children, ...props }: any) { return <span {...props}>{children}</span> }
export function SheetContent({ className, side = 'right', children, ...props }: any) {
  const { open, onClose } = useContext(SheetCtx)
  if (!open) return null
  const positions: Record<string, string> = {
    right: 'inset-y-0 right-0 h-full w-3/4 border-l sm:max-w-sm',
    left: 'inset-y-0 left-0 h-full w-3/4 border-r sm:max-w-sm',
    top: 'inset-x-0 top-0 border-b',
    bottom: 'inset-x-0 bottom-0 border-t',
  }
  return (
    <div className="fixed inset-0 z-50">
      <div className="fixed inset-0 bg-black/80" onClick={onClose} />
      <div className={cn('fixed z-50 gap-4 bg-background p-6 shadow-lg transition ease-in-out', positions[side], className)} {...props}>
        {children}
        <button onClick={onClose} className="absolute right-4 top-4"><X className="h-4 w-4" /></button>
      </div>
    </div>
  )
}
export function SheetHeader({ className, ...props }: any) {
  return <div className={cn('flex flex-col space-y-2 text-center sm:text-left', className)} {...props} />
}
export function SheetTitle({ className, ...props }: any) {
  return <h2 className={cn('text-lg font-semibold text-foreground', className)} {...props} />
}
export function SheetDescription({ className, ...props }: any) {
  return <p className={cn('text-sm text-muted-foreground', className)} {...props} />
}
export function SheetFooter({ className, ...props }: any) {
  return <div className={cn('flex flex-col-reverse sm:flex-row sm:justify-end sm:space-x-2', className)} {...props} />
}`,

  "components/ui/table.tsx": `import React from 'react'
import { cn } from '@/lib/utils'
export const Table = React.forwardRef<HTMLTableElement, React.HTMLAttributes<HTMLTableElement>>(({ className, ...props }, ref) => (
  <div className="relative w-full overflow-auto"><table ref={ref} className={cn('w-full caption-bottom text-sm', className)} {...props} /></div>
))
Table.displayName = 'Table'
export const TableHeader = React.forwardRef<HTMLTableSectionElement, React.HTMLAttributes<HTMLTableSectionElement>>(({ className, ...props }, ref) => (
  <thead ref={ref} className={cn('[&_tr]:border-b', className)} {...props} />
))
TableHeader.displayName = 'TableHeader'
export const TableBody = React.forwardRef<HTMLTableSectionElement, React.HTMLAttributes<HTMLTableSectionElement>>(({ className, ...props }, ref) => (
  <tbody ref={ref} className={cn('[&_tr:last-child]:border-0', className)} {...props} />
))
TableBody.displayName = 'TableBody'
export const TableRow = React.forwardRef<HTMLTableRowElement, React.HTMLAttributes<HTMLTableRowElement>>(({ className, ...props }, ref) => (
  <tr ref={ref} className={cn('border-b transition-colors hover:bg-muted/50 data-[state=selected]:bg-muted', className)} {...props} />
))
TableRow.displayName = 'TableRow'
export const TableHead = React.forwardRef<HTMLTableCellElement, React.ThHTMLAttributes<HTMLTableCellElement>>(({ className, ...props }, ref) => (
  <th ref={ref} className={cn('h-12 px-4 text-left align-middle font-medium text-muted-foreground [&:has([role=checkbox])]:pr-0', className)} {...props} />
))
TableHead.displayName = 'TableHead'
export const TableCell = React.forwardRef<HTMLTableCellElement, React.TdHTMLAttributes<HTMLTableCellElement>>(({ className, ...props }, ref) => (
  <td ref={ref} className={cn('p-4 align-middle [&:has([role=checkbox])]:pr-0', className)} {...props} />
))
TableCell.displayName = 'TableCell'
export const TableCaption = React.forwardRef<HTMLTableCaptionElement, React.HTMLAttributes<HTMLTableCaptionElement>>(({ className, ...props }, ref) => (
  <caption ref={ref} className={cn('mt-4 text-sm text-muted-foreground', className)} {...props} />
))
TableCaption.displayName = 'TableCaption'`,
};

function buildViteProjectFiles(
  agentFiles: Record<string, string>
): Record<string, string> {
  const result: Record<string, string> = { ...agentFiles };

  // Core Vite setup
  if (!("package.json" in result)) result["package.json"] = VITE_PACKAGE_JSON;
  if (!("vite.config.ts" in result)) result["vite.config.ts"] = VITE_CONFIG;
  if (!("tailwind.config.js" in result)) result["tailwind.config.js"] = TAILWIND_CONFIG;
  if (!("postcss.config.js" in result)) result["postcss.config.js"] = POSTCSS_CONFIG;
  if (!("index.html" in result)) result["index.html"] = INDEX_HTML;
  if (!("src/main.tsx" in result)) result["src/main.tsx"] = SRC_MAIN_TSX;
  if (!("src/index.css" in result)) result["src/index.css"] = SRC_INDEX_CSS;
  if (!("lib/utils.ts" in result)) result["lib/utils.ts"] = LIB_UTILS;

  // Next.js stubs
  result["__stubs__/next-link.tsx"] = STUB_NEXT_LINK;
  result["__stubs__/next-image.tsx"] = STUB_NEXT_IMAGE;
  result["__stubs__/next-navigation.ts"] = STUB_NEXT_NAVIGATION;
  result["__stubs__/next-headers.ts"] = STUB_NEXT_HEADERS;
  result["__stubs__/next-font.ts"] = STUB_NEXT_FONT;

  // Inject Shadcn stubs only for files the agent didn't generate
  for (const [stubPath, stubContent] of Object.entries(SHADCN_STUBS)) {
    if (!(stubPath in result)) {
      result[stubPath] = stubContent;
    }
  }

  return result;
}

// ─── Component ────────────────────────────────────────────────────────────────

export const WebContainerPreview = forwardRef<HTMLIFrameElement, Props>(function WebContainerPreview({
  files,
  refreshKey,
  onPreviewUrlChange,
}, forwardedRef) {
  const [previewUrl, setPreviewUrl] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState<string>("Booting preview...");
  const [error, setError] = useState<string>("");
  const internalRef = useRef<HTMLIFrameElement>(null);
  const runProcessRef = useRef<WebContainerProcess | null>(null);

  // Determine the final file set to mount
  const projectFiles = useMemo<Record<string, string>>(() => {
    if (Object.keys(files).length === 0) {
      // Truly empty: show a placeholder
      return {
        "server.mjs": `import { createServer } from "node:http"
const server = createServer((_, res) => {
  res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" })
  res.end(\`<!doctype html><html><body style="font-family:sans-serif;padding:2rem"><h2>ZapDev Preview Ready</h2><p>No files were generated yet.</p></body></html>\`)
})
server.listen(3000, () => console.log("ready"))
`,
      };
    }

    if (isNextJsProject(files)) {
      return buildViteProjectFiles(files);
    }

    return files;
  }, [files]);

  const isViteProject = useMemo(
    () => "vite.config.ts" in projectFiles || "vite.config.js" in projectFiles,
    [projectFiles]
  );

  useEffect(() => {
    let cancelled = false;
    let activeTimeout: ReturnType<typeof setTimeout> | null = null;
    let teardown: (() => void) | null = null;

    const run = async () => {
      setLoading(true);
      setError("");
      setPreviewUrl("");
      onPreviewUrlChange?.(null);
      setStatus("Booting WebContainer...");

      try {
        const { WebContainer } = await import("@webcontainer/api");
        const webcontainer = await WebContainer.boot({ coep: "require-corp" });
        teardown = () => {
          runProcessRef.current?.kill();
          runProcessRef.current = null;
          webcontainer.teardown();
        };

        webcontainer.on("server-ready", (_, url) => {
          if (cancelled) return;
          if (activeTimeout) {
            clearTimeout(activeTimeout);
            activeTimeout = null;
          }
          setPreviewUrl(url);
          onPreviewUrlChange?.(url);
          setLoading(false);
        });

        // Write all files
        setStatus("Writing files...");
        for (const [filePath, contents] of Object.entries(projectFiles)) {
          if (cancelled) return;
          const segments = filePath.split("/").filter(Boolean);
          if (segments.length === 0) continue;
          if (segments.length > 1) {
            const dir = segments.slice(0, -1).join("/");
            await webcontainer.fs.mkdir(dir, { recursive: true });
          }
          await webcontainer.fs.writeFile(filePath, contents);
        }

        if (isViteProject) {
          // Install with pnpm (faster than npm for fresh installs)
          setStatus("Installing dependencies (this takes ~30–60s)...");
          const installProcess = await webcontainer.spawn("npm", [
            "install",
            "--prefer-offline",
            "--no-audit",
            "--no-fund",
            "--legacy-peer-deps",
          ]);

          // Stream output so the status updates
          installProcess.output.pipeTo(
            new WritableStream({
              write(chunk) {
                if (!cancelled) setStatus(`Installing… ${String(chunk).trim().slice(-60)}`);
              },
            })
          );

          const installCode = await installProcess.exit;
          if (cancelled) return;
          if (installCode !== 0) {
            throw new Error("npm install failed — check your package.json");
          }

          setStatus("Starting Vite dev server...");
          runProcessRef.current = await webcontainer.spawn("npx", [
            "vite",
            "--host",
            "--port",
            "3000",
          ]);

          // Timeout: Vite + npm install combined should finish in < 3 minutes
          activeTimeout = setTimeout(() => {
            if (cancelled) return;
            setLoading(false);
            setError(
              "Preview timed out. Vite dev server did not start within 3 minutes."
            );
          }, 180_000);
        } else if (isNpmProject(projectFiles)) {
          setStatus("Installing dependencies...");
          const packageJson = safeParseJson<{ scripts?: Record<string, string> }>(
            projectFiles["package.json"]
          );
          const hasDevScript = Boolean(packageJson?.scripts?.dev);
          const installProcess = await webcontainer.spawn("npm", [
            "install",
            "--prefer-offline",
            "--no-audit",
            "--no-fund",
          ]);
          await installProcess.exit;
          if (cancelled) return;
          setStatus("Starting server...");
          runProcessRef.current = hasDevScript
            ? await webcontainer.spawn("npm", ["run", "dev"])
            : await webcontainer.spawn("node", ["server.mjs"]);

          activeTimeout = setTimeout(() => {
            if (cancelled) return;
            setLoading(false);
            setError("Preview timed out before server became ready.");
          }, 120_000);
        } else if (hasLocalServerEntry(projectFiles)) {
          setStatus("Starting server...");
          const entry = "server.mjs" in projectFiles ? "server.mjs" : "server.js";
          runProcessRef.current = await webcontainer.spawn("node", [entry]);

          activeTimeout = setTimeout(() => {
            if (cancelled) return;
            setLoading(false);
            setError("Preview timed out before server became ready.");
          }, 30_000);
        } else {
          // Fallback: inline HTTP server — no file reads, guaranteed to work
          setStatus("Starting preview server...");
          const fileList = Object.keys(projectFiles)
            .map((f) => `<li>${f}</li>`)
            .join("");
          const inlineServer = `import { createServer } from "node:http"
const server = createServer((_, res) => {
  res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" })
  res.end(\`<!doctype html><html><head><meta charset="UTF-8"/><title>ZapDev Preview</title></head><body style="font-family:sans-serif;padding:2rem;max-width:600px;margin:auto"><h2>Generated Files</h2><ul>${fileList}</ul><p style="color:#666;margin-top:1rem">These files are available in the Code tab.</p></body></html>\`)
})
server.listen(3000, () => console.log("ready"))
`;
          await webcontainer.fs.writeFile("__preview_server.mjs", inlineServer);
          runProcessRef.current = await webcontainer.spawn("node", ["__preview_server.mjs"]);

          activeTimeout = setTimeout(() => {
            if (cancelled) return;
            setLoading(false);
            setError("Preview server did not start.");
          }, 15_000);
        }
      } catch (previewError) {
        if (!cancelled) {
          setLoading(false);
          setError(
            previewError instanceof Error ? previewError.message : String(previewError)
          );
        }
      }
    };

    void run();

    return () => {
      cancelled = true;
      if (activeTimeout) clearTimeout(activeTimeout);
      onPreviewUrlChange?.(null);
      teardown?.();
    };
  }, [projectFiles, isViteProject, refreshKey, onPreviewUrlChange]);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-3 text-sm text-muted-foreground p-8">
        <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary" />
        <span className="text-center max-w-xs">{status}</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-2 p-8">
        <p className="text-sm text-destructive font-medium">Preview failed</p>
        <p className="text-xs text-muted-foreground text-center max-w-sm">{error}</p>
      </div>
    );
  }

  if (!previewUrl) {
    return (
      <div className="flex items-center justify-center h-full text-sm text-muted-foreground">
        Waiting for preview URL...
      </div>
    );
  }

  return (
    <iframe
      ref={forwardedRef || internalRef}
      className="h-full w-full"
      sandbox="allow-forms allow-modals allow-scripts allow-same-origin allow-popups"
      loading="lazy"
      src={previewUrl}
    />
  );
});
