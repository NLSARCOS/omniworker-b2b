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
    <nav className="fixed top-0 left-0 w-60 h-screen bg-zinc-950 border-r border-zinc-900 flex flex-col z-50 overflow-y-auto">
      {/* Header */}
      <div className="px-5 py-6 border-b border-zinc-900">
        <Link href="/" className="text-xl font-black tracking-[0.2em] uppercase text-white font-mono flex items-center gap-2 hover:text-lime-400 transition-colors">
          <div className="w-3 h-3 bg-lime-500" /> OMNIWORKER
        </Link>
      </div>

      {/* Nav */}
      <div className="flex-1 py-3 overflow-y-auto">
        {sections.map((section) => (
          <div key={section.section} className="pb-2">
            <div className="text-[10px] font-bold tracking-[0.2em] text-zinc-500 px-5 pt-3 pb-2 uppercase font-mono">
              {section.section}
            </div>
            {section.items.map((item) => {
              const isActive = pathname === item.href || (item.href !== "/dashboard" && pathname.startsWith(item.href.split("#")[0]));
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`flex items-center gap-3 px-5 py-2.5 text-xs font-mono transition-all duration-150 border-l-[3px] ${
                    isActive 
                      ? "font-semibold text-white bg-zinc-900 border-lime-500" 
                      : "font-medium text-zinc-400 bg-transparent border-transparent hover:text-zinc-200 hover:bg-zinc-900/50"
                  }`}
                >
                  {item.label}
                </Link>
              );
            })}
          </div>
        ))}
      </div>

      {/* Footer */}
      <div className="px-5 py-4 border-t border-zinc-900 bg-zinc-950">
        <button
          onClick={() => { fetch("/api/v1/auth/logout", { method: "POST" }); window.location.href = "/login"; }}
          className="flex items-center gap-2 w-full text-left text-xs font-bold text-red-500 uppercase tracking-widest font-mono pt-3 pb-1 hover:text-red-400 transition-colors"
        >
          SIGN OUT
        </button>
      </div>
    </nav>
  );
}
