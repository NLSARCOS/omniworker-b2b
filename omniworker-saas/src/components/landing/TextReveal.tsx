"use client";

import { motion } from "framer-motion";
import { useReducedMotion } from "./useReducedMotion";
import { EASE_OUT_QUAD } from "./easing";

interface TextRevealProps {
  text: string;
  className?: string;
  type?: "chars" | "words";
  stagger?: number;
  delay?: number;
}

export function TextReveal({
  text,
  className = "",
  type = "words",
  stagger = 0.05,
  delay = 0,
}: TextRevealProps) {
  const reduced = useReducedMotion();

  const items = type === "words" ? text.split(" ") : text.split("");

  const containerVariants = {
    hidden: {},
    visible: {
      transition: {
        staggerChildren: stagger,
        delayChildren: delay,
      },
    },
  };

  const itemVariants = {
    hidden: { opacity: 0, y: 20 },
    visible: {
      opacity: 1,
      y: 0,
      transition: {
        duration: 0.5,
        ease: EASE_OUT_QUAD,
      },
    },
  };

  if (reduced) {
    return <span className={className}>{text}</span>;
  }

  return (
    <motion.span
      className={`inline-flex flex-wrap ${className}`}
      initial="hidden"
      whileInView="visible"
      viewport={{ once: true, margin: "-50px" }}
      variants={containerVariants}
      aria-label={text}
    >
      {items.map((item, index) => (
        <motion.span
          key={`${item}-${index}`}
          variants={itemVariants}
          className="inline-block"
          style={{ whiteSpace: "pre" }}
        >
          {item}
          {type === "words" && index < items.length - 1 ? "\u00A0" : ""}
        </motion.span>
      ))}
    </motion.span>
  );
}
