/**
 * Fonts a user can pick for headings / body text. The "web" fonts are loaded
 * with next/font in the root layout (self-hosted, downloaded only when used);
 * the rest are fonts every device already has.
 */
export interface FontOption {
  id: string;
  label: string;
  /** CSS font-family list; "" = keep the app default. */
  stack: string;
  group: "App" | "Web fonts" | "System fonts";
}

export const FONT_OPTIONS: FontOption[] = [
  { id: "default", label: "Default (Geist)", stack: "", group: "App" },
  { id: "inter", label: "Inter", stack: 'var(--font-inter), "Segoe UI", system-ui, sans-serif', group: "Web fonts" },
  { id: "roboto", label: "Roboto", stack: 'var(--font-roboto), "Segoe UI", system-ui, sans-serif', group: "Web fonts" },
  { id: "poppins", label: "Poppins", stack: 'var(--font-poppins), "Segoe UI", system-ui, sans-serif', group: "Web fonts" },
  { id: "opensans", label: "Open Sans", stack: 'var(--font-open-sans), "Segoe UI", system-ui, sans-serif', group: "Web fonts" },
  { id: "lato", label: "Lato", stack: 'var(--font-lato), "Segoe UI", system-ui, sans-serif', group: "Web fonts" },
  { id: "montserrat", label: "Montserrat", stack: 'var(--font-montserrat), "Segoe UI", system-ui, sans-serif', group: "Web fonts" },
  { id: "nunito", label: "Nunito", stack: 'var(--font-nunito), "Segoe UI", system-ui, sans-serif', group: "Web fonts" },
  { id: "arial", label: "Arial", stack: 'Arial, Helvetica, sans-serif', group: "System fonts" },
  { id: "verdana", label: "Verdana", stack: 'Verdana, Geneva, sans-serif', group: "System fonts" },
  { id: "tahoma", label: "Tahoma", stack: 'Tahoma, Geneva, sans-serif', group: "System fonts" },
  { id: "trebuchet", label: "Trebuchet MS", stack: '"Trebuchet MS", Helvetica, sans-serif', group: "System fonts" },
  { id: "georgia", label: "Georgia", stack: 'Georgia, "Times New Roman", serif', group: "System fonts" },
  { id: "times", label: "Times New Roman", stack: '"Times New Roman", Times, serif', group: "System fonts" },
  { id: "courier", label: "Courier New", stack: '"Courier New", Courier, monospace', group: "System fonts" },
];

export function isFontId(v: unknown): v is string {
  return typeof v === "string" && FONT_OPTIONS.some((f) => f.id === v);
}

export function fontStack(id: string): string {
  return FONT_OPTIONS.find((f) => f.id === id)?.stack ?? "";
}

export const BODY_WEIGHTS: { value: number; label: string }[] = [
  { value: 0, label: "Default" },
  { value: 300, label: "Light" },
  { value: 400, label: "Regular" },
  { value: 500, label: "Medium" },
  { value: 600, label: "Semibold" },
  { value: 700, label: "Bold" },
];

export const HEADING_WEIGHTS: { value: number; label: string }[] = [
  { value: 0, label: "Default" },
  { value: 500, label: "Medium" },
  { value: 600, label: "Semibold" },
  { value: 700, label: "Bold" },
  { value: 800, label: "Extra bold" },
  { value: 900, label: "Black" },
];
