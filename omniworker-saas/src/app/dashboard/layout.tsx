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
    <div style={{ display: "flex", minHeight: "100vh" }}>
      <Sidebar userRole={role} />
      <main
        style={{
          flex: 1,
          marginLeft: 240,
          padding: "48px 56px",
          background: "#F5F0E8",
          color: "#0D0D0D",
          fontFamily: "'Inter', sans-serif",
          minWidth: 0,
          backgroundImage: "repeating-linear-gradient(0deg, transparent 0, transparent 23px, rgba(0,0,0,0.018) 23px, rgba(0,0,0,0.018) 24px)",
        }}
      >
        <div style={{ maxWidth: 1100 }}>
          {children}
        </div>
      </main>
    </div>
  );
}
