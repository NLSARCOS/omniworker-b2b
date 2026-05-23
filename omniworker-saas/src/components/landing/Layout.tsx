"use client";

import { cn } from "@/lib/utils";

interface LayoutProps {
  children: React.ReactNode;
  className?: string;
  fullWidth?: boolean;
}

export function Layout({ children, className, fullWidth = false }: LayoutProps) {
  return (
    <div
      className={cn(
        "mx-auto px-6",
        fullWidth ? "w-full" : "max-w-7xl",
        className
      )}
    >
      {children}
    </div>
  );
}
