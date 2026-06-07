// src/app/[slug]/opengraph-image.tsx — Dynamic OG Image Generation per page
import { ImageResponse } from "next/og";
import { getProgrammaticData } from "@/lib/programmatic-data";

export const alt = "Flux Agent — Fuerza Laboral Digital";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function Image({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const data = getProgrammaticData(slug);

  const title = data?.title || "Flux Agent";
  const badge = data?.badge || "Agente de IA";
  const targetName = data?.targetName || "tu empresa";

  // Category-based accent color
  const accentColor =
    data?.category === "integration" ? "#00C95C" :
    data?.category === "alternative" ? "#FF6B35" :
    "#3B82F6";

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          background: "#111111",
          padding: "60px 72px",
          fontFamily: "system-ui, sans-serif",
        }}
      >
        {/* Top: badge */}
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div
            style={{
              width: 8,
              height: 8,
              borderRadius: "50%",
              background: accentColor,
            }}
          />
          <span
            style={{
              fontSize: 16,
              fontWeight: 600,
              letterSpacing: "0.12em",
              textTransform: "uppercase" as const,
              color: accentColor,
            }}
          >
            {badge}
          </span>
        </div>

        {/* Middle: Title */}
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <h1
            style={{
              fontSize: title.length > 50 ? 44 : 56,
              fontWeight: 700,
              color: "#F5F0E8",
              lineHeight: 1.1,
              letterSpacing: "-0.03em",
              margin: 0,
              maxWidth: "90%",
            }}
          >
            {title}
          </h1>
          <p
            style={{
              fontSize: 22,
              fontWeight: 400,
              color: "rgba(245,240,232,0.5)",
              margin: 0,
              lineHeight: 1.4,
            }}
          >
            Agente autónomo 24/7 para {targetName}
          </p>
        </div>

        {/* Bottom bar */}
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            borderTop: "1px solid rgba(245,240,232,0.1)",
            paddingTop: 24,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div
              style={{
                width: 36,
                height: 36,
                borderRadius: 8,
                background: accentColor,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 18,
                fontWeight: 900,
                color: "#111",
              }}
            >
              F
            </div>
            <span style={{ fontSize: 20, fontWeight: 700, color: "#F5F0E8" }}>
              Flux Agent
            </span>
          </div>
          <span
            style={{
              fontSize: 14,
              fontWeight: 500,
              color: "rgba(245,240,232,0.3)",
              letterSpacing: "0.04em",
            }}
          >
            flux.simplex.lat · By Simplex Latam
          </span>
        </div>
      </div>
    ),
    { ...size }
  );
}
