"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const NAV_ITEMS = [
  {
    section: "RESUMEN",
    items: [{ href: "/dashboard", label: "Panel de control" }],
  },
  {
    section: "GESTIÓN",
    items: [
      { href: "/dashboard#agents", label: "Asistentes conectados" },
      { href: "/dashboard#keys", label: "Claves de acceso" },
      { href: "/dashboard#licenses", label: "Instalaciones" },
    ],
  },
  {
    section: "RECURSOS",
    items: [
      { href: "/dashboard#actions", label: "Descargas" },
      { href: "/dashboard#billing", label: "Facturación" },
    ],
  },
];

const ADMIN_ITEMS = [
  {
    section: "ADMIN",
    items: [{ href: "/admin", label: "Panel de admin" }],
  },
];

export function Sidebar({ userRole }: { userRole?: string }) {
  const pathname = usePathname();
  const isAdmin = userRole === "SUPERADMIN";
  const sections = isAdmin ? [...NAV_ITEMS, ...ADMIN_ITEMS] : NAV_ITEMS;

  return (
    <nav
      style={{
        position: "fixed", top: 0, left: 0, width: 240, height: "100vh",
        background: "var(--paper)", borderRight: `3px double var(--ink)`,
        display: "flex", flexDirection: "column", zIndex: 50, overflowY: "auto",
        backgroundImage: "repeating-linear-gradient(0deg, transparent 0, transparent 23px, rgba(0,0,0,0.022) 23px, rgba(0,0,0,0.022) 24px)",
      }}
    >
      {/* Logo */}
      <div style={{ padding: "24px 20px", borderBottom: `3px double var(--ink)` }}>
        <Link href="/" style={{ textDecoration: "none", display: "block" }}>
          <img src="/logo.svg" alt="Flux Agent" style={{ height: 28, display: "block" }} />
          <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 9, fontWeight: 500, letterSpacing: "0.16em", textTransform: "uppercase", color: "var(--muted)", marginTop: 8 }}>
            By Simplex Latam
          </div>
        </Link>
      </div>

      {/* Live badge */}
      <div style={{ padding: "12px 20px", borderBottom: `1px solid var(--rule)` }}>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 6, background: "var(--neon-pale)", border: `1px solid rgba(0,201,92,0.3)`, borderRadius: 100, padding: "4px 12px", fontFamily: "'Inter', sans-serif", fontSize: 11, fontWeight: 600, color: "var(--neon-dim)" }}>
          <span style={{ width: 6, height: 6, borderRadius: "50%", background: "var(--neon)", display: "inline-block" }} />
          Activo 24/7
        </span>
      </div>

      {/* Nav items */}
      <div style={{ flex: 1, padding: "12px 0", overflowY: "auto" }}>
        {sections.map((section) => (
          <div key={section.section} style={{ paddingBottom: 8 }}>
            <div style={{ fontSize: 10, fontWeight: 500, letterSpacing: "0.22em", color: "var(--muted)", padding: "12px 20px 6px", textTransform: "uppercase", fontFamily: "'DM Mono', monospace" }}>
              {section.section}
            </div>
            {section.items.map((item) => {
              const isActive = pathname === item.href || (item.href !== "/dashboard" && pathname.startsWith(item.href.split("#")[0]));
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  style={{
                    display: "flex", alignItems: "center", gap: 10,
                    padding: "9px 20px", fontSize: 13.5, fontWeight: isActive ? 700 : 500,
                    color: isActive ? "var(--ink)" : "var(--muted)", textDecoration: "none",
                    background: isActive ? "transparent" : "transparent",
                    borderLeft: isActive ? `3px solid var(--ink)` : `3px solid transparent`,
                    fontFamily: "'Inter', sans-serif",
                    transition: "all 0.15s",
                  }}
                >
                  {item.label}
                </Link>
              );
            })}
          </div>
        ))}
      </div>

      {/* Footer / Logout */}
      <div style={{ padding: "16px 20px", borderTop: `3px double var(--ink)`, background: "var(--paper-warm)" }}>
        <button
          onClick={() => { fetch("/api/v1/auth/logout", { method: "POST" }); window.location.href = "/login"; }}
          style={{
            display: "flex", alignItems: "center", gap: 8, background: "none", border: "none",
            color: "var(--muted)", fontSize: 12, fontWeight: 600, cursor: "pointer",
            width: "100%", textAlign: "left", textTransform: "uppercase", letterSpacing: "0.08em",
            fontFamily: "'DM Mono', monospace", padding: 0, transition: "color 0.15s",
          }}
        >
          ← Cerrar sesión
        </button>
      </div>
    </nav>
  );
}
