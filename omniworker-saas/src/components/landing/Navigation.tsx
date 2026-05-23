"use client";

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";
import { COLORS } from "./design-tokens";

const navLinks = [
  { label: "Producto", href: "#producto" },
  { label: "Cómo funciona", href: "#como-funciona" },
  { label: "FAQ", href: "#faq" },
  { label: "Precios", href: "#precios" },
];

export function Navigation() {
  const [scrolled, setScrolled] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    const handleScroll = () => {
      setScrolled(window.scrollY > 20);
    };
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  const handleLinkClick = (href: string) => {
    setMobileOpen(false);
    const el = document.querySelector(href);
    if (el) {
      el.scrollIntoView({ behavior: "smooth" });
    }
  };

  return (
    <motion.header
      initial={{ y: -24, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ duration: 0.5, ease: [0.4, 0, 0.2, 1] }}
      className={cn(
        "sticky top-0 z-50 transition-colors duration-300",
        "bg-white/80 backdrop-blur-xl border-b border-gray-200/60",
        scrolled && "bg-white/95 border-gray-200/80"
      )}
    >
      <nav className="mx-auto max-w-7xl px-6 flex items-center justify-between h-16">
        {/* Logo */}
        <a
          href="#"
          className="flex items-center gap-2 font-[family-name:var(--font-geist-mono)] font-bold text-lg tracking-tight"
        >
          <span
            className="inline-block w-2 h-2 rounded-full"
            style={{ backgroundColor: COLORS.accent }}
          />
          OmniWorker
        </a>

        {/* Desktop links */}
        <div className="hidden md:flex items-center gap-8">
          {navLinks.map((link) => (
            <button
              key={link.href}
              onClick={() => handleLinkClick(link.href)}
              className="text-sm font-medium text-gray-600 hover:text-black transition-colors cursor-pointer"
            >
              {link.label}
            </button>
          ))}
        </div>

        {/* Desktop CTAs */}
        <div className="hidden md:flex items-center gap-4">
          <button className="text-sm font-medium text-gray-600 hover:text-black transition-colors cursor-pointer">
            Iniciar sesión
          </button>
          <button
            className="text-sm font-medium px-4 py-2 bg-black text-white rounded-lg hover:bg-[#D4A853] hover:text-black transition-colors cursor-pointer"
          >
            Empezar gratis
          </button>
        </div>

        {/* Mobile hamburger */}
        <button
          className="md:hidden flex flex-col justify-center items-center w-8 h-8 gap-1.5 cursor-pointer"
          onClick={() => setMobileOpen((o) => !o)}
          aria-label="Toggle menu"
        >
          <motion.span
            animate={{
              rotate: mobileOpen ? 45 : 0,
              y: mobileOpen ? 6 : 0,
            }}
            className="block w-5 h-0.5 bg-black origin-center"
          />
          <motion.span
            animate={{ opacity: mobileOpen ? 0 : 1 }}
            className="block w-5 h-0.5 bg-black"
          />
          <motion.span
            animate={{
              rotate: mobileOpen ? -45 : 0,
              y: mobileOpen ? -6 : 0,
            }}
            className="block w-5 h-0.5 bg-black origin-center"
          />
        </button>
      </nav>

      {/* Mobile menu */}
      <AnimatePresence>
        {mobileOpen && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.3, ease: [0.4, 0, 0.2, 1] }}
            className="md:hidden overflow-hidden bg-white border-b border-gray-200/60"
          >
            <div className="px-6 py-6 flex flex-col gap-4">
              {navLinks.map((link) => (
                <button
                  key={link.href}
                  onClick={() => handleLinkClick(link.href)}
                  className="text-left text-base font-medium text-gray-600 hover:text-black transition-colors cursor-pointer"
                >
                  {link.label}
                </button>
              ))}
              <div className="pt-4 flex flex-col gap-3 border-t border-gray-100">
                <button className="text-left text-base font-medium text-gray-600 hover:text-black transition-colors cursor-pointer">
                  Iniciar sesión
                </button>
                <button className="text-base font-medium px-4 py-2.5 bg-black text-white rounded-lg hover:bg-[#D4A853] hover:text-black transition-colors cursor-pointer text-center">
                  Empezar gratis
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.header>
  );
}
