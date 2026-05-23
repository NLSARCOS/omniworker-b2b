export const COLORS = {
  black: "#000000",
  white: "#ffffff",
  gray50: "#fafafa",
  gray100: "#f5f5f5",
  gray200: "#e5e5e5",
  gray400: "#a3a3a3",
  gray500: "#737373",
  gray600: "#525252",
  gray900: "#171717",
  accent: "#D4A853",
  accentLight: "#F5E6C8",
} as const;

export const SPACING = {
  section: "py-24 md:py-32",
  sectionSm: "py-16 md:py-24",
} as const;

export const TYPOGRAPHY = {
  h1: "text-4xl md:text-5xl lg:text-6xl font-bold tracking-tight leading-[1.1]",
  h2: "text-3xl md:text-4xl lg:text-5xl font-bold tracking-tight leading-[1.15]",
  h3: "text-2xl md:text-3xl font-semibold tracking-tight leading-[1.2]",
  h4: "text-xl md:text-2xl font-semibold tracking-tight leading-[1.25]",
  body: "text-base md:text-lg font-normal leading-relaxed",
  caption: "text-sm font-normal leading-snug text-gray-500",
  mono: "font-[family-name:var(--font-geist-mono)] text-sm",
} as const;

export const TRANSITIONS = {
  default: "all 0.3s cubic-bezier(0.4, 0, 0.2, 1)",
  fast: "all 0.15s ease",
} as const;
