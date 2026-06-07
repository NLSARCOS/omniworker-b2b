// src/app/[slug]/page.tsx — Programmatic SEO Dynamic Landing Page Template
import { notFound } from "next/navigation";
import Link from "next/link";
import React from "react";
import type { Metadata } from "next";
import { PROGRAMMATIC_KEYWORDS, getProgrammaticData, getRelatedPages } from "@/lib/programmatic-data";
import { ContactForm } from "@/components/contact-form";

interface Props {
  params: Promise<{ slug: string }>;
}

export async function generateStaticParams() {
  return PROGRAMMATIC_KEYWORDS.map((k) => ({
    slug: k.slug,
  }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const data = getProgrammaticData(slug);
  if (!data) return {};

  const canonicalUrl = `https://flux.simplex.lat/${slug}`;

  return {
    title: `${data.title} — Flux Agent`,
    description: data.description,
    keywords: `${data.keyword}, automatización, IA, LATAM, agente autónomo, simplex latam`,
    alternates: {
      canonical: canonicalUrl,
    },
    openGraph: {
      title: `${data.title} — Flux Agent`,
      description: data.description,
      url: canonicalUrl,
      siteName: "Flux Agent",
      locale: "es_LA",
      type: "website",
    },
    twitter: {
      card: "summary_large_image",
      title: `${data.title} — Flux Agent`,
      description: data.description,
      site: "@simplexlatam",
    },
  };
}

const S = {
  sectionLabel: {
    fontFamily: "'DM Mono', monospace",
    fontSize: 11,
    fontWeight: 500,
    letterSpacing: "0.22em",
    textTransform: "uppercase" as const,
    color: "var(--neon-dim)",
    marginBottom: 16,
    display: "flex",
    alignItems: "center",
    gap: 10,
  } as React.CSSProperties,
  sectionTitle: {
    fontFamily: "'Fraunces', serif",
    fontVariationSettings: '"opsz" 80, "SOFT" 30',
    fontWeight: 500,
    fontSize: "clamp(34px, 4vw, 54px)",
    lineHeight: 1.05,
    letterSpacing: "-0.025em",
    color: "var(--ink)",
    marginBottom: 20,
  } as React.CSSProperties,
  sectionLead: {
    fontSize: 18,
    fontWeight: 400,
    color: "var(--muted)",
    maxWidth: 680,
    lineHeight: 1.65,
    marginBottom: 56,
  } as React.CSSProperties,
};

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div style={S.sectionLabel}>
      <span style={{ color: "var(--muted)" }}>§</span>
      {children}
    </div>
  );
}

export default async function Page({ params }: Props) {
  const { slug } = await params;
  const data = getProgrammaticData(slug);
  
  if (!data) {
    notFound();
  }

  return (
    <>
      {/* Schema JSON-LD for rich snippets */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            "@context": "https://schema.org",
            "@graph": [
              {
                "@type": "Organization",
                "@id": "https://flux.simplex.lat/#organization",
                "name": "Flux Agent",
                "url": "https://flux.simplex.lat",
                "logo": {
                  "@type": "ImageObject",
                  "url": "https://flux.simplex.lat/logo.svg",
                },
                "description": "Plataforma de agentes de IA autónomos para empresas latinoamericanas. Fuerza laboral digital 24/7.",
                "foundingDate": "2025",
                "areaServed": {
                  "@type": "Place",
                  "name": "Latinoamérica",
                },
                "sameAs": [],
              },
              {
                "@type": "WebSite",
                "@id": "https://flux.simplex.lat/#website",
                "url": "https://flux.simplex.lat",
                "name": "Flux Agent",
                "publisher": { "@id": "https://flux.simplex.lat/#organization" },
                "potentialAction": {
                  "@type": "SearchAction",
                  "target": "https://flux.simplex.lat/?q={search_term_string}",
                  "query-input": "required name=search_term_string",
                },
              },
              {
                "@type": "WebPage",
                "@id": `https://flux.simplex.lat/${slug}#webpage`,
                "url": `https://flux.simplex.lat/${slug}`,
                "name": `${data.title} — Flux Agent`,
                "description": data.description,
                "isPartOf": { "@id": "https://flux.simplex.lat/#website" },
                "about": { "@id": "https://flux.simplex.lat/#organization" },
                "inLanguage": "es",
              },
              {
                "@type": "BreadcrumbList",
                "itemListElement": [
                  {
                    "@type": "ListItem",
                    "position": 1,
                    "name": "Inicio",
                    "item": "https://flux.simplex.lat",
                  },
                  {
                    "@type": "ListItem",
                    "position": 2,
                    "name": data.targetName,
                    "item": `https://flux.simplex.lat/${slug}`,
                  },
                ],
              },
              {
                "@type": "Product",
                "@id": "https://flux.simplex.lat/#product",
                "name": "Flux Agent Platform",
                "description": "Plataforma de agentes de Inteligencia Artificial que aprenden y mejoran autónomamente con almacenamiento local seguro.",
                "brand": {
                  "@type": "Brand",
                  "name": "Flux Agent",
                },
              },
              {
                "@type": "FAQPage",
                "mainEntity": data.faq.map((f) => ({
                  "@type": "Question",
                  "name": f.q,
                  "acceptedAnswer": {
                    "@type": "Answer",
                    "text": f.a,
                  },
                })),
              },
            ],
          }),
        }}
      />

      {/* ── RESPONSIVE MOBILE CSS ── */}
      <style>{`
        /* ── MOBILE-FIRST RESPONSIVE OVERRIDES ── */
        @media (max-width: 768px) {
          /* NAV: hide text links, keep logo + CTA */
          .pg-nav-links { display: none !important; }
          .pg-nav-cta { display: flex !important; }
          /* TOPBAR: hide second span */
          .pg-topbar-right { display: none !important; }
          /* HERO: single column */
          .pg-hero { 
            grid-template-columns: 1fr !important; 
            gap: 40px !important;
            padding: 48px 5vw 60px !important;
          }
          .pg-hero-stats { 
            border-left: none !important;
            border-top: 2px solid var(--ink) !important;
            padding-left: 0 !important;
            padding-top: 24px !important;
            display: grid !important;
            grid-template-columns: 1fr 1fr !important;
            gap: 0 !important;
          }
          /* PROBLEMA: single column */
          .pg-problema-grid {
            grid-template-columns: 1fr !important;
            gap: 0 !important;
          }
          /* CONTACTO: single column */
          .pg-contacto-grid {
            grid-template-columns: 1fr !important;
            gap: 40px !important;
          }
          /* CASOS: 2 columns */
          .pg-casos-grid {
            grid-template-columns: 1fr 1fr !important;
            gap: 12px !important;
          }
          /* STEPS: single column */
          .pg-steps-grid {
            grid-template-columns: 1fr !important;
            gap: 40px !important;
          }
          /* TESTIMONIALS: single column */
          .pg-testimonials-grid {
            grid-template-columns: 1fr !important;
            gap: 40px !important;
          }
          /* FOOTER: single column */
          .pg-footer-grid {
            grid-template-columns: 1fr !important;
            gap: 40px !important;
          }
          .pg-footer-bottom {
            flex-direction: column !important;
            gap: 8px !important;
          }
          /* Padding adjustments */
          .pg-section { padding: 64px 5vw !important; }
          .pg-section-sm { padding: 48px 5vw !important; }
        }
        @media (max-width: 480px) {
          .pg-casos-grid { grid-template-columns: 1fr !important; }
          .pg-hero-stats { grid-template-columns: 1fr 1fr !important; }
        }
      `}</style>

      <div style={{ background: "var(--paper)", color: "var(--ink)", fontFamily: "'Inter', sans-serif", fontSize: 16, lineHeight: 1.65, WebkitFontSmoothing: "antialiased", backgroundImage: "repeating-linear-gradient(0deg, transparent 0, transparent 23px, rgba(0,0,0,0.022) 23px, rgba(0,0,0,0.022) 24px)" }}>
        
        {/* ── NAV ── */}
        <nav style={{ position: "sticky", top: 0, zIndex: 100, background: "var(--paper)", borderBottom: `3px double var(--ink)`, padding: "0 5vw" }}>
          <div style={{ maxWidth: 1280, margin: "0 auto", display: "flex", alignItems: "center", justifyContent: "space-between", height: 68 }}>
            <Link href="/" style={{ textDecoration: "none", display: "flex", alignItems: "center" }}>
              <img src="/logo.svg" alt="Flux Agent" style={{ height: 28 }} />
            </Link>
            <div className="pg-nav-links" style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <a href="#problema" style={{ fontSize: 13.5, fontWeight: 500, color: "var(--muted)", textDecoration: "none", padding: "6px 12px", borderRadius: 6 }}>El problema</a>
              <a href="#contacto" style={{ fontSize: 13.5, fontWeight: 500, color: "var(--muted)", textDecoration: "none", padding: "6px 12px", borderRadius: 6 }}>Solicitar demo</a>
              <a href="#casos" style={{ fontSize: 13.5, fontWeight: 500, color: "var(--muted)", textDecoration: "none", padding: "6px 12px", borderRadius: 6 }}>Casos de uso</a>
              <a href="#como" style={{ fontSize: 13.5, fontWeight: 500, color: "var(--muted)", textDecoration: "none", padding: "6px 12px", borderRadius: 6 }}>Cómo funciona</a>
              <div style={{ width: 1, height: 28, background: "var(--rule)", margin: "0 8px" }} />
              <Link href="/login" style={{ fontSize: 13.5, fontWeight: 600, color: "var(--ink)", textDecoration: "none", padding: "9px 18px", border: `1.5px solid var(--rule)`, borderRadius: 6 }}>
                Iniciar sesión
              </Link>
              <Link href="/register" style={{ fontSize: 13.5, fontWeight: 600, color: "var(--ink)", textDecoration: "none", padding: "9px 20px", background: "var(--neon)", borderRadius: 6, display: "inline-flex", alignItems: "center", gap: 6 }}>
                Registrarse →
              </Link>
            </div>
          </div>
        </nav>

        {/* ── TOPBAR ── */}
        <div style={{ maxWidth: 1280, margin: "0 auto", padding: "0 5vw" }}>
          <div style={{ borderBottom: `1px solid var(--rule)`, padding: "10px 0", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 11, fontWeight: 400, letterSpacing: "0.14em", textTransform: "uppercase", color: "var(--muted)" }}>By Simplex Latam · 2026</span>
            <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 11, fontWeight: 500, letterSpacing: "0.14em", textTransform: "uppercase", color: "var(--neon-dim)", display: "flex", alignItems: "center", gap: 6 }}>
              <span style={{ width: 7, height: 7, borderRadius: "50%", background: "var(--neon)", display: "inline-block", animation: "blink 2s ease-in-out infinite" }} />
              Asistentes activos ahora mismo
            </span>
          </div>
        </div>

        {/* ── HERO ── */}
        <div className="pg-hero" style={{ maxWidth: 1280, margin: "0 auto", padding: "72px 5vw 88px", display: "grid", gridTemplateColumns: "1fr 360px", gap: 80, alignItems: "start" }}>
          <div>
            <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 11, fontWeight: 500, letterSpacing: "0.2em", textTransform: "uppercase", color: "var(--neon-dim)", background: "var(--neon-pale)", padding: "8px 14px", display: "inline-block", marginBottom: 28, borderLeft: `3px solid var(--neon)` }}>
              {data.badge}
            </div>
            <h1 style={{ fontFamily: "'Fraunces', serif", fontVariationSettings: '"opsz" 144, "SOFT" 30, "WONK" 0', fontWeight: 500, fontSize: "clamp(42px, 5.5vw, 72px)", lineHeight: 0.95, letterSpacing: "-0.04em", color: "var(--ink)", marginBottom: 32 }}>
              {data.title}
            </h1>
            <p style={{ fontSize: 20, fontWeight: 400, lineHeight: 1.6, color: "var(--ink-soft)", maxWidth: 600, marginBottom: 48, borderLeft: `3px solid var(--rule)`, paddingLeft: 20 }}>
              {data.heroText}
            </p>
            <div style={{ display: "flex", gap: 14, alignItems: "center", flexWrap: "wrap" }}>
              <a href="#contacto" style={{ background: "var(--neon)", color: "var(--ink)", padding: "15px 32px", fontFamily: "'Inter', sans-serif", fontSize: 14, fontWeight: 700, textDecoration: "none", display: "inline-flex", alignItems: "center", gap: 8, borderRadius: 6 }}>
                Delegar Tareas a mi Agente 24/7 →
              </a>
              <a href="#como" style={{ fontFamily: "'Inter', sans-serif", fontSize: 14, fontWeight: 600, color: "var(--ink)", textDecoration: "none", padding: "15px 0", borderBottom: `2px solid var(--ink)` }}>
                Ver cómo funciona
              </a>
            </div>
            <div style={{ marginTop: 32, fontFamily: "'Inter', sans-serif", fontSize: 13, fontWeight: 500, color: "var(--muted)", display: "flex", gap: 24, flexWrap: "wrap" }}>
              {["Garantía 60 días", "Listo en 14 días", "Ejecución 100% Local"].map((t) => (
                <span key={t} style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <span style={{ color: "var(--neon-dim)", fontWeight: 700 }}>✓</span> {t}
                </span>
              ))}
            </div>
          </div>
          {/* Stats aside */}
          <div className="pg-hero-stats" style={{ borderLeft: `2px solid var(--ink)`, paddingLeft: 32, marginTop: 8 }}>
            {data.stats.map((s, i) => (
              <div key={i} style={{ padding: "24px 0", borderBottom: i < 3 ? `1px solid var(--rule)` : "none" }}>
                <div style={{ fontFamily: "'Fraunces', serif", fontVariationSettings: '"opsz" 100, "WONK" 1', fontWeight: 500, fontSize: 52, lineHeight: 1, letterSpacing: "-0.03em", color: "var(--ink)" }}>{s.num}</div>
                <div style={{ fontFamily: "'Inter', sans-serif", fontSize: 13, fontWeight: 500, color: "var(--muted)", marginTop: 6 }}>{s.label}</div>
              </div>
            ))}
          </div>
        </div>

        {/* ── MARQUEE ── */}
        <div style={{ borderTop: `1px solid var(--rule)`, borderBottom: `1px solid var(--rule)`, background: "var(--paper-warm)", overflow: "hidden", padding: "14px 0" }}>
          <div style={{ display: "flex", animation: "marquee 32s linear infinite", whiteSpace: "nowrap" }}>
            {[...Array(2)].map((_, d) => (
              <div key={d} style={{ display: "flex", flexShrink: 0 }}>
                {[`Integración con ${data.targetName}`, "Atención B2B 24/7", "Fuerza laboral autónoma", "Garantía de 60 días", "Ahorro de tokens del 90%", "Base de datos SQLite local", "Conectores sin API externas"].map((item) => (
                  <span key={item} style={{ display: "inline-flex", alignItems: "center" }}>
                    <span style={{ fontFamily: "'Inter', sans-serif", fontSize: 13, fontWeight: 600, letterSpacing: "0.06em", color: "var(--muted)", padding: "0 32px" }}>{item}</span>
                    <span style={{ color: "var(--neon)" }}>◆</span>
                  </span>
                ))}
              </div>
            ))}
          </div>
        </div>

        {/* ── PROBLEMA ── */}
        <section id="problema" style={{ background: "var(--ink)", padding: "96px 5vw" }}>
          <div style={{ maxWidth: 1280, margin: "0 auto" }}>
            <div style={{ ...S.sectionLabel, color: "rgba(0,201,92,0.8)" }}><span style={{ color: "rgba(255,255,255,0.25)" }}>§</span>El problema</div>
            <h2 style={{ ...S.sectionTitle, color: "var(--paper)" }}>
              Contratar más personas<br />
              <em style={{ color: "var(--neon)", fontStyle: "italic" }}>no resuelve el problema.</em>
            </h2>
            <p style={{ ...S.sectionLead, color: "rgba(245,240,232,0.6)" }}>
              En América Latina, agregar una persona al equipo para {data.benefitPrimary} cuesta tiempo, dinero y energía. Y cuando por fin está lista, el negocio ya creció. Flux Agent lo resuelve de forma inmediata y automática.
            </p>
            <div className="pg-problema-grid" style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 1, background: "rgba(255,255,255,0.08)" }}>
              {[
                { num: "1/10", desc: `Costo mensual de Flux Agent comparado con contratar personal operativo para ${data.targetName} en LATAM.` },
                { num: "14\ndías", desc: `Tiempo de despliegue en tu propia infraestructura para tener el agente productivo en su totalidad.` },
                { num: "24/7", desc: "El asistente digital no renuncia, no se enferma, no tiene vacaciones y opera de forma consistente a toda hora." },
              ].map((s, i) => (
                <div key={i} style={{ background: "var(--ink)", padding: "52px 44px", border: `1px solid rgba(255,255,255,0.06)` }}>
                  <div style={{ fontFamily: "'Fraunces', serif", fontVariationSettings: '"opsz" 100, "WONK" 1', fontWeight: 500, fontSize: 68, lineHeight: 1, color: "var(--paper)", letterSpacing: "-0.03em", marginBottom: 16, whiteSpace: "pre-line" }}>{s.num}</div>
                  <div style={{ fontSize: 15, fontWeight: 400, color: "rgba(245,240,232,0.55)", lineHeight: 1.6 }}>{s.desc}</div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ── INTERACTIVE REGISTRATION & DETAILS ── */}
        <section id="contacto" style={{ background: "var(--paper-warm)", padding: "96px 5vw" }}>
          <div style={{ maxWidth: 1280, margin: "0 auto" }}>
            <SectionLabel>Tu asistente, tu forma</SectionLabel>
            <h2 style={S.sectionTitle}>
              Despliega tu agente para<br />
              <em style={{ color: "var(--neon-dim)", fontStyle: "italic" }}>{data.targetName}.</em>
            </h2>
            <p style={S.sectionLead}>
              Completa el formulario y recibe la guía técnica de inicialización en 5 minutos. Sin compromisos, sin jerga comercial técnica compleja.
            </p>
            <div className="pg-contacto-grid" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 80, alignItems: "center" }}>
              {/* Features list */}
              <div>
                {data.features.map(([icon, title, desc]) => (
                  <div key={title} style={{ background: "var(--paper)", border: `1.5px solid var(--rule)`, borderRadius: 12, padding: "24px 28px", marginBottom: 16 }}>
                    <div style={{ display: "flex", gap: 14, alignItems: "start" }}>
                      <span style={{ fontSize: 24, lineHeight: 1.2 }}>{icon}</span>
                      <div>
                        <div style={{ fontFamily: "'Fraunces', serif", fontVariationSettings: '"opsz" 60, "SOFT" 20', fontWeight: 500, fontSize: 19, letterSpacing: "-0.01em", color: "var(--ink)", marginBottom: 4 }}>{title}</div>
                        <div style={{ fontSize: 13.5, color: "var(--muted)", lineHeight: 1.5 }}>{desc}</div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
              {/* Brutalist Contact Form client component */}
              <ContactForm source={slug} targetName={data.targetName} />
            </div>
          </div>
        </section>

        {/* ── CASOS DE USO ── */}
        <section id="casos" style={{ padding: "96px 5vw" }}>
          <div style={{ maxWidth: 1280, margin: "0 auto" }}>
            <SectionLabel>Casos de uso activos</SectionLabel>
            <h2 style={S.sectionTitle}>
              ¿Qué tareas delegan<br />
              <em style={{ color: "var(--neon-dim)", fontStyle: "italic" }}>las empresas hoy?</em>
            </h2>
            <p style={S.sectionLead}>Múltiples industrias en Latinoamérica ya operan con empleados digitales que ejecutan acciones integradas a su infraestructura.</p>
            <div className="pg-casos-grid" style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 16 }}>
              {[
                { icon: "🎯", name: "Seguimiento de prospectos de ventas", dept: "Ventas" },
                { icon: "💬", name: "Atención al cliente por WhatsApp las 24 hs", dept: "Servicio" },
                { icon: "💰", name: "Recordatorios de pago y conciliación", dept: "Finanzas" },
                { icon: "🛒", name: "Recuperación de compras perdidas", dept: "E-commerce" },
                { icon: "👥", name: "Filtro inicial de postulantes de empleo", dept: "Recursos humanos" },
                { icon: "📅", name: "Confirmación y gestión de citas", dept: "Agenda" },
              ].map((uc) => (
                <div key={uc.name} style={{ background: "var(--paper)", border: `1.5px solid var(--rule)`, borderRadius: 10, padding: "24px 22px" }}>
                  <div style={{ fontSize: 26, marginBottom: 10 }}>{uc.icon}</div>
                  <div style={{ fontFamily: "'Fraunces', serif", fontVariationSettings: '"opsz" 48', fontWeight: 500, fontSize: 15.5, color: "var(--ink)", marginBottom: 6, letterSpacing: "-0.01em", lineHeight: 1.25 }}>{uc.name}</div>
                  <div style={{ fontFamily: "'Inter', sans-serif", fontSize: 12, fontWeight: 600, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.06em" }}>{uc.dept}</div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ── CÓMO FUNCIONA ── */}
        <section id="como" style={{ background: "var(--paper-warm)", padding: "96px 5vw" }}>
          <div style={{ maxWidth: 1280, margin: "0 auto" }}>
            <SectionLabel>Cómo funciona</SectionLabel>
            <h2 style={S.sectionTitle}>
              Tu agente funcionando<br />
              <em style={{ color: "var(--neon-dim)", fontStyle: "italic" }}>en 3 pasos simples.</em>
            </h2>
            <div className="pg-steps-grid" style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 48, marginTop: 56 }}>
              {data.steps.map((step, i) => (
                <div key={step.n} style={{ position: "relative" }}>
                  {i < 2 && (
                    <div style={{ position: "absolute", top: 20, left: "100%", width: "calc(100% - 20px)", height: 1, background: `linear-gradient(90deg, var(--rule), transparent)` }} />
                  )}
                  <div style={{ fontFamily: "'Fraunces', serif", fontVariationSettings: '"opsz" 144, "WONK" 1', fontStyle: "italic", fontWeight: 400, fontSize: 72, lineHeight: 0.85, color: "rgba(0,0,0,0.07)", marginBottom: 16 }}>{step.n}</div>
                  <div style={{ fontFamily: "'Fraunces', serif", fontVariationSettings: '"opsz" 48', fontWeight: 500, fontSize: 22, letterSpacing: "-0.01em", color: "var(--ink)", marginBottom: 12, lineHeight: 1.3 }}>{step.title}</div>
                  <div style={{ fontSize: 15, fontWeight: 400, color: "var(--muted)", lineHeight: 1.7 }}>{step.desc}</div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ── TESTIMONIALS ── */}
        <section style={{ padding: "96px 5vw" }}>
          <div style={{ maxWidth: 1280, margin: "0 auto" }}>
            <SectionLabel>Resultados comprobados</SectionLabel>
            <h2 style={S.sectionTitle}>
              Casos de éxito reales en<br />
              <em style={{ color: "var(--neon-dim)", fontStyle: "italic" }}>Latinoamérica.</em>
            </h2>
            <div className="pg-testimonials-grid" style={{ display: "grid", gridTemplateColumns: "repeat(2,1fr)", gap: 48, marginTop: 56 }}>
              {data.testimonials.map((t, i) => (
                <div key={i} style={{ borderTop: `2px solid var(--ink)`, paddingTop: 28 }}>
                  <div style={{ fontFamily: "'Fraunces', serif", fontVariationSettings: '"opsz" 48, "SOFT" 60', fontStyle: "italic", fontWeight: 400, fontSize: 18, lineHeight: 1.6, color: "var(--ink-soft)", marginBottom: 24 }}>"{t.quote}"</div>
                  <div style={{ fontFamily: "'Inter', sans-serif", fontSize: 13, fontWeight: 500, color: "var(--muted)" }}>
                    <strong style={{ color: "var(--ink)", display: "block", marginBottom: 2, fontWeight: 700, fontSize: 14 }}>{t.name}</strong>
                    {t.role}
                  </div>
                  <div style={{ marginTop: 16, fontSize: 13, fontWeight: 700, color: "var(--neon-dim)", display: "flex", alignItems: "center", gap: 6 }}>{t.result}</div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ── FAQ SECTION (SEO Rich Snippets) ── */}
        <section style={{ background: "var(--paper-warm)", padding: "96px 5vw" }}>
          <div style={{ maxWidth: 900, margin: "0 auto" }}>
            <SectionLabel>Preguntas Frecuentes</SectionLabel>
            <h2 style={{ ...S.sectionTitle, textAlign: "center", marginBottom: 56 }}>Preguntas sobre tu agente</h2>
            <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
              {data.faq.map((f, i) => (
                <div key={i} style={{ border: "1.5px solid var(--rule)", borderRadius: 10, padding: 28, background: "white" }}>
                  <h3 style={{ fontFamily: "'Fraunces', serif", fontSize: 18, fontWeight: 600, color: "var(--ink)", marginBottom: 8 }}>{f.q}</h3>
                  <p style={{ fontSize: 14.5, color: "var(--muted)", lineHeight: 1.6 }}>{f.a}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ── RELATED PAGES (Internal Linking) ── */}
        <section className="pg-section" style={{ padding: "80px 5vw", borderTop: `1px solid var(--rule)` }}>
          <div style={{ maxWidth: 1280, margin: "0 auto" }}>
            <SectionLabel>También te puede interesar</SectionLabel>
            <h2 style={{ ...S.sectionTitle, marginBottom: 40 }}>
              Explora más agentes<br />
              <em style={{ color: "var(--neon-dim)", fontStyle: "italic" }}>para tu empresa.</em>
            </h2>
            <div className="pg-casos-grid" style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 16 }}>
              {getRelatedPages(slug, 6).map((rp) => (
                <Link
                  key={rp.slug}
                  href={`/${rp.slug}`}
                  style={{
                    display: "block",
                    background: "var(--paper)",
                    border: `1.5px solid var(--rule)`,
                    borderRadius: 10,
                    padding: "22px 20px",
                    textDecoration: "none",
                    transition: "border-color 0.2s, box-shadow 0.2s",
                  }}
                >
                  <div style={{
                    fontFamily: "'DM Mono', monospace",
                    fontSize: 10,
                    fontWeight: 500,
                    letterSpacing: "0.14em",
                    textTransform: "uppercase",
                    color: rp.category === "integration" ? "var(--neon-dim)" : rp.category === "alternative" ? "#FF6B35" : "#3B82F6",
                    marginBottom: 8,
                  }}>
                    {rp.category === "integration" ? "Integración" : rp.category === "alternative" ? "Alternativa" : "Caso de uso"}
                  </div>
                  <div style={{
                    fontFamily: "'Fraunces', serif",
                    fontVariationSettings: '"opsz" 48',
                    fontWeight: 500,
                    fontSize: 15,
                    color: "var(--ink)",
                    lineHeight: 1.3,
                    letterSpacing: "-0.01em",
                    marginBottom: 8,
                  }}>
                    {rp.keyword}
                  </div>
                  <div style={{ fontSize: 12.5, fontWeight: 600, color: "var(--neon-dim)", display: "flex", alignItems: "center", gap: 4 }}>
                    Ver más →
                  </div>
                </Link>
              ))}
            </div>
          </div>
        </section>

        {/* ── CTA FINAL ── */}
        <section id="cta" style={{ background: "var(--ink)", padding: "96px 5vw", textAlign: "center" }}>
          <h2 style={{ fontFamily: "'Fraunces', serif", fontVariationSettings: '"opsz" 100, "SOFT" 50', fontWeight: 500, fontSize: "clamp(36px, 5vw, 64px)", lineHeight: 1.05, letterSpacing: "-0.03em", color: "var(--paper)", maxWidth: 820, margin: "0 auto 24px" }}>
            Tu competencia ya está automatizando con agentes.<br />
            <em style={{ color: "var(--neon)", fontStyle: "italic" }}>Cada semana que esperás es un costo de oportunidad real.</em>
          </h2>
          <p style={{ fontSize: 19, fontWeight: 400, color: "rgba(245,240,232,0.5)", maxWidth: 560, margin: "0 auto 48px", lineHeight: 1.6 }}>
            Habla con nosotros hoy y activa tu primer agente de IA hermético local en tu VPS. Sin jerga compleja ni compromisos.
          </p>
          <div style={{ display: "flex", gap: 16, justifyContent: "center", flexWrap: "wrap" }}>
            <a href="#contacto" style={{ background: "var(--neon)", color: "var(--ink)", padding: "16px 36px", fontFamily: "'Inter', sans-serif", fontSize: 15, fontWeight: 700, textDecoration: "none", display: "inline-flex", alignItems: "center", gap: 8, borderRadius: 6 }}>
              Solicitar Demo Técnica de Agente →
            </a>
            <Link href="/register" style={{ color: "rgba(245,240,232,0.5)", fontFamily: "'Inter', sans-serif", fontSize: 14, fontWeight: 500, textDecoration: "none", borderBottom: "1px solid rgba(245,240,232,0.2)", paddingBottom: 2, display: "inline-flex", alignItems: "center" }}>
              Registrarse en la plataforma SaaS →
            </Link>
          </div>
          <div style={{ marginTop: 40, fontFamily: "'Inter', sans-serif", fontSize: 12, color: "rgba(245,240,232,0.2)", letterSpacing: "0.04em" }}>
            By Simplex Latam · Garantía 60 días
          </div>
        </section>

        {/* ── FOOTER ── */}
        <footer style={{ background: "var(--paper-warm)", borderTop: `3px double var(--ink)`, padding: "60px 5vw 40px" }}>
          <div className="pg-footer-grid" style={{ maxWidth: 1280, margin: "0 auto", display: "grid", gridTemplateColumns: "1.2fr repeat(4,1fr)", gap: 56, alignItems: "start", marginBottom: 40, paddingBottom: 40, borderBottom: `1px solid var(--rule)` }}>
            <div>
              <div style={{ marginBottom: 16 }}>
                <img src="/logo.svg" alt="Flux Agent" style={{ height: 32 }} />
              </div>
              <div style={{ fontSize: 14, fontWeight: 400, color: "var(--muted)", maxWidth: 240, lineHeight: 1.6, marginBottom: 20 }}>Asistentes digitales para empresas latinoamericanas. By Simplex Latam.</div>
              <span style={{ display: "inline-flex", alignItems: "center", gap: 6, background: "var(--neon-pale)", border: `1px solid rgba(0,201,92,0.3)`, borderRadius: 100, padding: "5px 14px", fontSize: 12, fontWeight: 600, color: "var(--neon-dim)" }}>● Activos las 24 horas</span>
            </div>
            {[
              { title: "Producto", links: ["Cómo funciona", "Casos de uso", "Integraciones", "Seguridad"] },
              { title: "Industrias", links: ["E-commerce", "Salud", "Propiedades", "Educación"] },
              { title: "Recursos", links: ["Documentación", "Blog", "Calculadora de ahorro", "Estado del servicio"] },
              { title: "Compañía", links: ["Sobre Simplex", "Contacto", "Garantía", "Términos legales"] },
            ].map((col) => (
              <div key={col.title}>
                <h5 style={{ fontFamily: "'Inter', sans-serif", fontSize: 13, fontWeight: 700, color: "var(--ink)", marginBottom: 16, textTransform: "uppercase", letterSpacing: "0.04em" }}>{col.title}</h5>
                {col.links.map((l) => (
                  <a key={l} href="#" style={{ display: "block", fontSize: 14, fontWeight: 400, color: "var(--muted)", textDecoration: "none", marginBottom: 10 }}>{l}</a>
                ))}
              </div>
            ))}
          </div>
          <div className="pg-footer-bottom" style={{ maxWidth: 1280, margin: "0 auto", display: "flex", justifyContent: "space-between", fontFamily: "'Inter', sans-serif", fontSize: 13, fontWeight: 400, color: "var(--muted)" }}>
            <span>© 2026 Flux Agent · By Simplex Latam · Todos los derechos reservados.</span>
            <span>LATAM · Español · Q2 2026</span>
          </div>
        </footer>

      </div>
    </>
  );
}
