"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { useReducedMotion } from "./useReducedMotion";
import { EASE_OUT_QUAD } from "./easing";

interface GlowCardProps {
  children: React.ReactNode;
  className?: string;
  glowColor?: string;
}

export function GlowCard({
  children,
  className = "",
  glowColor = "#D4A853",
}: GlowCardProps) {
  const [isHovered, setIsHovered] = useState(false);
  const reduced = useReducedMotion();

  return (
    <motion.div
      className={`relative overflow-hidden rounded-lg p-[2px] transition-shadow duration-300 hover:shadow-lg ${className}`}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      whileHover={reduced ? undefined : { scale: 1.01 }}
      transition={{ duration: 0.3, ease: EASE_OUT_QUAD }}
    >
      {/* Rotating glow layer */}
      <span
        aria-hidden
        className="pointer-events-none absolute left-1/2 top-1/2 z-0 aspect-square w-[200%] -translate-x-1/2 -translate-y-1/2 rounded-none"
        style={{
          opacity: isHovered && !reduced ? 1 : 0,
          transition: reduced ? "none" : "opacity 0.4s ease",
        }}
      >
        <span
          className="block h-full w-full"
          style={{
            background: `conic-gradient(from 0deg, transparent, ${glowColor}, transparent, transparent)`,
            animation: isHovered && !reduced ? "glow-spin 3s linear infinite" : "none",
          }}
        />
      </span>

      {/* Static subtle border */}
      <span
        aria-hidden
        className="pointer-events-none absolute inset-0 z-0 rounded-lg border border-gray-200"
        style={{
          opacity: isHovered ? 0 : 1,
          transition: "opacity 0.3s ease",
        }}
      />

      {/* Content */}
      <div className="relative z-10 h-full rounded-[calc(0.5rem-2px)] bg-white">
        {children}
      </div>
    </motion.div>
  );
}
