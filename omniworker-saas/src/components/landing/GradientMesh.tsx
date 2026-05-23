"use client";

import React from "react";
import { useReducedMotion } from "./useReducedMotion";

interface GradientMeshProps {
  className?: string;
  variant?: "hero" | "cta" | "stats";
}

const variantStyles: Record<string, React.CSSProperties> = {
  hero: {
    background: `
      radial-gradient(ellipse at 20% 30%, rgba(212, 168, 83, 0.08) 0%, transparent 50%),
      radial-gradient(ellipse at 80% 70%, rgba(229, 229, 229, 0.15) 0%, transparent 50%),
      radial-gradient(ellipse at 50% 50%, rgba(255, 255, 255, 0.6) 0%, transparent 70%)
    `,
  },
  cta: {
    background: `
      radial-gradient(ellipse at 30% 20%, rgba(212, 168, 83, 0.1) 0%, transparent 50%),
      radial-gradient(ellipse at 70% 80%, rgba(40, 40, 40, 0.4) 0%, transparent 50%),
      radial-gradient(ellipse at 50% 50%, rgba(20, 20, 20, 0.8) 0%, transparent 70%)
    `,
  },
  stats: {
    background: `
      radial-gradient(ellipse at 25% 25%, rgba(60, 60, 60, 0.3) 0%, transparent 50%),
      radial-gradient(ellipse at 75% 75%, rgba(30, 30, 30, 0.5) 0%, transparent 50%),
      radial-gradient(ellipse at 50% 50%, rgba(10, 10, 10, 0.9) 0%, transparent 70%)
    `,
  },
};

export default function GradientMesh({
  className = "",
  variant = "hero",
}: GradientMeshProps) {
  const reduced = useReducedMotion();

  return (
    <div
      className={`absolute inset-0 pointer-events-none gradient-mesh ${className}`}
      style={{
        ...variantStyles[variant],
        opacity: variant === "hero" ? 0.5 : 0.4,
        animation: reduced ? "none" : "meshMove 18s ease-in-out infinite alternate",
      }}
      aria-hidden="true"
    >
      <style jsx>{`
        @keyframes meshMove {
          0% {
            transform: translate(0, 0) scale(1);
          }
          33% {
            transform: translate(2%, -1%) scale(1.02);
          }
          66% {
            transform: translate(-1%, 2%) scale(0.98);
          }
          100% {
            transform: translate(1%, -2%) scale(1.01);
          }
        }
      `}</style>
    </div>
  );
}
