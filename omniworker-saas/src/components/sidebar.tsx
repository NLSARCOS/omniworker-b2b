"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const NAV_ITEMS = [
  {
    section: "OVERVIEW",
    items: [
      { href: "/dashboard", label: "Dashboard" },
    ],
  },
  {
    section: "MANAGE",
    items: [
      { href: "/dashboard#agents", label: "Edge Agents" },
      { href: "/dashboard#keys", label: "API Keys" },
    ],
  },
  {
    section: "RESOURCES",
    items: [
      { href: "/dashboard#actions", label: "Downloads" },
    ],
  },
];

const ADMIN_ITEMS = [
  {
    section: "ADMIN",
    items: [
      { href: "/admin", label: "Admin Panel" },
    ],
  },
];

export function Sidebar({ userRole }: { userRole?: string }) {
  const pathname = usePathname();
  const isAdmin = userRole === "SUPERADMIN";
  const sections = isAdmin ? [...NAV_ITEMS, ...ADMIN_ITEMS] : NAV_ITEMS;

  return (
    <nav style={{
      position: "fixed", top: 0, left: 0, width: 240, height: "100vh",
      background: "#F4F4F0", borderRight: "3px solid #111",
      display: "flex", flexDirection: "column", zIndex: 50, overflowY: "auto",
    }}>
      {/* Header */}
      <div style={{ padding: "24px 20px", borderBottom: "3px solid #111" }}>
        <Link href="/" style={{
          fontSize: 24, fontWeight: 900, letterSpacing: 6, textTransform: "uppercase",
          color: "#111", textDecoration: "none", fontFamily: "'Space Mono', monospace",
        }}>
          OMNIWORKER
        </Link>
      </div>

      {/* Nav */}
      <div style={{ flex: 1, padding: "12px 0", overflowY: "auto" }}>
        {sections.map((section) => (
          <div key={section.section} style={{ padding: "0 0 8px" }}>
            <div style={{
              fontSize: 10, fontWeight: 700, letterSpacing: 3, color: "#888",
              padding: "12px 20px 8px", textTransform: "uppercase",
              fontFamily: "'Space Mono', monospace",
            }}>
              {section.section}
            </div>
            {section.items.map((item) => {
              const isActive = pathname === item.href || (item.href !== "/dashboard" && pathname.startsWith(item.href.split("#")[0]));
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  style={{
                    display: "flex", alignItems: "center", gap: 12,
                    padding: "10px 20px", fontSize: 13, fontWeight: isActive ? 700 : 600,
                    color: isActive ? "#fff" : "#333", textDecoration: "none",
                    background: isActive ? "#111" : "transparent",
                    borderLeft: isActive ? "3px solid #FFC800" : "3px solid transparent",
                    fontFamily: "'Inter', sans-serif", letterSpacing: 0,
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

      {/* Footer */}
      <div style={{ padding: "16px 20px", borderTop: "3px solid #111", background: "#fff" }}>
        <button
          onClick={() => { fetch("/api/v1/auth/logout", { method: "POST" }); window.location.href = "/login"; }}
          style={{
            display: "flex", alignItems: "center", gap: 8, background: "none", border: "none",
            color: "#888", fontSize: 12, fontWeight: 700, cursor: "pointer", padding: "12px 0 0",
            width: "100%", textAlign: "left", textTransform: "uppercase", letterSpacing: 1,
            fontFamily: "'Space Mono', monospace", transition: "color 0.15s",
          }}
        >
          SIGN OUT
        </button>
      </div>
    </nav>
  );
}
