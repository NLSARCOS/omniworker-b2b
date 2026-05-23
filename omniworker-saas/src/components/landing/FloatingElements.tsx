"use client";

import React, { useMemo, useState, useEffect } from "react";
import { useReducedMotion } from "./useReducedMotion";

interface FloatingElementsProps {
  className?: string;
  count?: number;
}

interface Element {
  id: number;
  type: "circle" | "cross";
  x: number;
  y: number;
  size: number;
  color: string;
  opacity: number;
  duration: number;
  delay: number;
  direction: number;
}

function seededRandom(seed: number) {
  const x = Math.sin(seed * 9301 + 49297) * 233280;
  return x - Math.floor(x);
}

function generateElements(count: number): Element[] {
  const items: Element[] = [];
  for (let i = 0; i < count; i++) {
    const isGold = seededRandom(i * 7 + 1) < 0.2;
    items.push({
      id: i,
      type: seededRandom(i * 13 + 2) < 0.6 ? "circle" : "cross",
      x: seededRandom(i * 17 + 3) * 100,
      y: seededRandom(i * 19 + 4) * 100,
      size: seededRandom(i * 23 + 5) * 6 + 3,
      color: isGold ? "#D4A853" : "#e5e5e5",
      opacity: seededRandom(i * 29 + 6) * 0.1 + 0.1,
      duration: seededRandom(i * 31 + 7) * 4 + 6,
      delay: seededRandom(i * 37 + 8) * 5,
      direction: seededRandom(i * 41 + 9) < 0.5 ? 1 : -1,
    });
  }
  return items;
}

export default function FloatingElements({
  className = "",
  count = 12,
}: FloatingElementsProps) {
  const reduced = useReducedMotion();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const elements = useMemo(() => generateElements(count), [count]);

  if (!mounted) {
    return <div className={`absolute inset-0 overflow-hidden pointer-events-none ${className}`} />;
  }

  return (
    <div className={`absolute inset-0 overflow-hidden pointer-events-none ${className}`}>
      {elements.map((el) => (
        <div
          key={el.id}
          className="absolute"
          style={{
            left: `${el.x}%`,
            top: `${el.y}%`,
            opacity: el.opacity,
            color: el.color,
            animation: reduced
              ? "none"
              : `${el.direction > 0 ? "floatUp" : "floatDown"} ${el.duration}s ease-in-out infinite`,
            animationDelay: `${el.delay}s`,
          }}
        >
          {el.type === "circle" ? (
            <div
              className="rounded-full"
              style={{
                width: el.size,
                height: el.size,
                backgroundColor: el.color,
              }}
            />
          ) : (
            <svg
              width={el.size}
              height={el.size}
              viewBox="0 0 12 12"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
            >
              <path
                d="M6 0V12M0 6H12"
                stroke={el.color}
                strokeWidth="1.5"
              />
            </svg>
          )}
        </div>
      ))}
      <style jsx>{`
        @keyframes floatUp {
          0%,
          100% {
            transform: translateY(0);
          }
          50% {
            transform: translateY(-20px);
          }
        }
        @keyframes floatDown {
          0%,
          100% {
            transform: translateY(0);
          }
          50% {
            transform: translateY(20px);
          }
        }
      `}</style>
    </div>
  );
}
