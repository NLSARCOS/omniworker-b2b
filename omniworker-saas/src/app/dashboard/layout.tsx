"use client";

import { useEffect, useState } from "react";
import { Sidebar } from "@/components/sidebar";

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const [role, setRole] = useState<string>("USER");

  useEffect(() => {
    fetch("/api/v1/auth/me")
      .then(r => r.json())
      .then(d => { if (d.success) setRole(d.user.role); })
      .catch(() => {});
  }, []);

  return (
    <>
      {/* Fonts */}
      <link rel="preconnect" href="https://fonts.googleapis.com" />
      <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
      <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&family=Space+Mono:wght@400;700&display=swap" rel="stylesheet" />

      <div style={{ display: "flex", minHeight: "100vh" }}>
        <Sidebar userRole={role} />
        <main style={{
          flex: 1, marginLeft: 240, padding: 32,
          background: "#F4F4F0", color: "#111",
          fontFamily: "'Inter', sans-serif",
          minWidth: 0,
        }}>
          <div style={{ maxWidth: 1320 }}>
            {children}
          </div>
        </main>
      </div>
    </>
  );
}
