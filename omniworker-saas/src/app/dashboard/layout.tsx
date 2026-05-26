"use client";

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ minHeight: "100vh", background: "#F5F0E8" }}>
      <main
        style={{
          maxWidth: 1200,
          margin: "0 auto",
          padding: "48px 24px",
          color: "#0D0D0D",
          fontFamily: "'Inter', sans-serif",
          minWidth: 0,
          backgroundImage: "repeating-linear-gradient(0deg, transparent 0, transparent 23px, rgba(0,0,0,0.018) 23px, rgba(0,0,0,0.018) 24px)",
        }}
      >
        <div>
          {children}
        </div>
      </main>
    </div>
  );
}
