"use client";

import { useRef } from "react";
import Link from "next/link";
import {
  motion,
  useMotionValue,
  useSpring,
  type SpringOptions,
} from "framer-motion";
import { useReducedMotion } from "./useReducedMotion";
import { EASE_OUT_QUAD } from "./easing";

interface MagneticButtonProps {
  children: React.ReactNode;
  className?: string;
  variant?: "primary" | "secondary" | "outline";
  href?: string;
  onClick?: () => void;
}

const MAX_DISPLACEMENT = 15;

const springConfig: SpringOptions = {
  stiffness: 150,
  damping: 15,
  mass: 0.1,
};

const variantStyles = {
  primary:
    "bg-gray-900 text-white hover:bg-gray-800 border-2 border-gray-900",
  secondary:
    "bg-white text-gray-900 border-2 border-gray-900 hover:bg-gray-50",
  outline:
    "bg-transparent text-gray-900 border-2 border-gray-900 hover:bg-gray-50",
};

export function MagneticButton({
  children,
  className = "",
  variant = "primary",
  href,
  onClick,
}: MagneticButtonProps) {
  const ref = useRef<HTMLDivElement>(null);
  const reduced = useReducedMotion();

  const x = useMotionValue(0);
  const y = useMotionValue(0);

  const springX = useSpring(x, springConfig);
  const springY = useSpring(y, springConfig);

  const handleMouseMove = (e: React.MouseEvent) => {
    if (reduced || !ref.current) return;

    const rect = ref.current.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;

    const deltaX = e.clientX - centerX;
    const deltaY = e.clientY - centerY;

    const distance = Math.sqrt(deltaX * deltaX + deltaY * deltaY);
    const maxDist = Math.max(rect.width, rect.height) / 2;
    const factor = Math.min(distance / maxDist, 1) * MAX_DISPLACEMENT;

    const angle = Math.atan2(deltaY, deltaX);
    x.set(Math.cos(angle) * factor);
    y.set(Math.sin(angle) * factor);
  };

  const handleMouseLeave = () => {
    x.set(0);
    y.set(0);
  };

  const baseClass =
    "relative inline-flex items-center justify-center px-8 py-4 text-base font-semibold tracking-tight rounded-none transition-shadow duration-300 cursor-pointer";

  const glowClass =
    variant === "primary"
      ? "hover:shadow-[0_0_24px_rgba(212,168,83,0.35)]"
      : "";

  const combinedClass = `${baseClass} ${variantStyles[variant]} ${glowClass} ${className}`;

  const motionStyle = reduced
    ? undefined
    : { x: springX, y: springY };

  return (
    <motion.div
      ref={ref}
      className="inline-block"
      style={motionStyle}
      whileHover={reduced ? undefined : { scale: 1.02 }}
      whileTap={reduced ? undefined : { scale: 0.98 }}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
      transition={{ duration: 0.3, ease: EASE_OUT_QUAD }}
    >
      {href ? (
        <Link href={href} className={combinedClass} onClick={onClick}>
          {children}
        </Link>
      ) : (
        <button type="button" className={combinedClass} onClick={onClick}>
          {children}
        </button>
      )}
    </motion.div>
  );
}
