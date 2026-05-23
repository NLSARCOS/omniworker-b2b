"use client";

import { cn } from "@/lib/utils";

interface SectionProps {
  children: React.ReactNode;
  className?: string;
  id?: string;
  variant?: "default" | "dark" | "muted";
  size?: "default" | "sm" | "lg";
}

const variantStyles = {
  default: "bg-white text-black",
  dark: "bg-gray-900 text-white",
  muted: "bg-gray-50 text-black",
} as const;

const sizeStyles = {
  default: "py-24 md:py-32",
  sm: "py-16 md:py-24",
  lg: "py-32 md:py-40",
} as const;

export function Section({
  children,
  className,
  id,
  variant = "default",
  size = "default",
}: SectionProps) {
  return (
    <section
      id={id}
      className={cn(variantStyles[variant], sizeStyles[size], className)}
    >
      {children}
    </section>
  );
}
