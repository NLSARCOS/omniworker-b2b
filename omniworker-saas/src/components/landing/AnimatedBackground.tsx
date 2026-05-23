"use client";

import React from "react";
import GradientMesh from "./GradientMesh";

interface AnimatedBackgroundProps {
  children: React.ReactNode;
  className?: string;
  variant?: "light" | "dark";
  animated?: boolean;
}

export default function AnimatedBackground({
  children,
  className = "",
  variant = "light",
  animated = true,
}: AnimatedBackgroundProps) {
  const meshVariant = variant === "light" ? "hero" : "stats";

  return (
    <div className={`relative overflow-hidden ${className}`}>
      {animated && (
        <>
          <GradientMesh variant={meshVariant} />
          <svg
            className="absolute inset-0 w-full h-full pointer-events-none"
            aria-hidden="true"
          >
            <defs>
              <filter id="noiseFilter">
                <feTurbulence
                  type="fractalNoise"
                  baseFrequency="0.8"
                  numOctaves="4"
                  stitchTiles="stitch"
                />
              </filter>
            </defs>
            <rect
              width="100%"
              height="100%"
              filter="url(#noiseFilter)"
              opacity="0.03"
            />
          </svg>
        </>
      )}
      <div className="relative z-10">{children}</div>
    </div>
  );
}
