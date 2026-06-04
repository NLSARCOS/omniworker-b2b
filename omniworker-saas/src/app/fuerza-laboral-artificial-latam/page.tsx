import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Fuerza Laboral Artificial Latam — Flux Agent",
  description: "Descubrí cómo fuerza laboral artificial LATAM puede transformar tu empresa. Solución inteligente para automatizar procesos y escalar sin contratar. By Simplex Latam.",
  keywords: "fuerza laboral artificial LATAM, automatización, IA, LATAM",
  openGraph: {
    title: "Fuerza Laboral Artificial Latam — Flux Agent",
    description: "Descubrí cómo fuerza laboral artificial LATAM puede transformar tu empresa. Solución inteligente para automatizar procesos y escalar sin contratar. By Simplex Latam.",
    url: "https://flux.simplex.lat/fuerza-laboral-artificial-latam",
    siteName: "Flux Agent",
    locale: "es_LA",
    type: "website",
  },
};

const FEATURES = [["⚡", "Resultados en 14 días", "Implementación express"], ["🔄", "Escalado automático", "Crece sin límites"], ["🔗", "Integración total", "CRM, WhatsApp, y más"], ["🔒", "Seguridad empresarial", "Datos protegidos"]];
const STATS = [{"num": "85%", "label": "Tareas automatizadas"}, {"num": "24/7", "label": "Disponibilidad total"}, {"num": "1/10", "label": "Costo vs empleado"}, {"num": "<30s", "label": "Tiempo respuesta"}];
const STEPS = [{"n": "01", "title": "Diagnóstico gratuito", "desc": "Analizamos tu proceso de fuerza laboral artificial LATAM y detectamos oportunidades."}, {"n": "02", "title": "Configuración express", "desc": "Implementamos la solución conectada a tus herramientas en 14 días."}, {"n": "03", "title": "Resultados medibles", "desc": "Monitoreá el impacto en tiempo real con soporte dedicado."}];
const TESTIMONIALS = [{"quote": "Implementar fuerza laboral artificial LATAM con Flux Agent cambió nuestra operación. Ahorramos 40hs semanales.", "name": "María González", "role": "CEO · TechStart MX", "result": "↓ 40hs/semana"}, {"quote": "El ROI fue inmediato. En el primer mes ya habíamos recuperado la inversión.", "name": "Carlos Ruiz", "role": "Director · InnovateAR", "result": "↑ 300% ROI"}];

export default function Page() {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify({
          "@context": "https://schema.org",
          "@type": "SoftwareApplication",
          "name": "Fuerza Laboral Artificial Latam — Flux Agent",
          "description": "Descubrí cómo fuerza laboral artificial LATAM puede transformar tu empresa. Solución inteligente para automatizar procesos y escalar sin contratar. By Simplex Latam.",
          "provider": { "@type": "Organization", "name": "Simplex Latam" },
          "url": "https://flux.simplex.lat/fuerza-laboral-artificial-latam",
          "applicationCategory": "BusinessApplication",
          "operatingSystem": "Web",
          "offers": { "@type": "Offer", "price": "0", "priceCurrency": "USD" },
        }) }}
      />
      <div style={{ background: "var(--paper)", color: "var(--ink)", fontFamily: "'Inter', sans-serif", fontSize: 16, lineHeight: 1.65 }}>
        {/* NAV */}
        <nav style={{ position: "sticky", top: 0, zIndex: 100, background: "var(--paper)", borderBottom: `3px double var(--ink)`, padding: "0 5vw" }}>
          <div style={{ maxWidth: 1280, margin: "0 auto", display: "flex", alignItems: "center", justifyContent: "space-between", height: 68 }}>
            <a href="/" style={{ textDecoration: "none", display: "flex", alignItems: "center" }}>
              <img src="/logo.svg" alt="Flux Agent" style={{ height: 28 }} />
            </a>
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <a href="/#problema" style={{ fontSize: 13.5, fontWeight: 500, color: "var(--muted)", textDecoration: "none", padding: "6px 12px", borderRadius: 6 }}>El problema</a>
              <a href="/#casos" style={{ fontSize: 13.5, fontWeight: 500, color: "var(--muted)", textDecoration: "none", padding: "6px 12px", borderRadius: 6 }}>Casos de uso</a>
              <a href="/#como" style={{ fontSize: 13.5, fontWeight: 500, color: "var(--muted)", textDecoration: "none", padding: "6px 12px", borderRadius: 6 }}>Cómo funciona</a>
              <div style={{ width: 1, height: 28, background: "var(--rule)", margin: "0 8px" }} />
              <Link href="/login" style={{ fontSize: 13.5, fontWeight: 600, color: "var(--ink)", textDecoration: "none", padding: "9px 18px", border: `1.5px solid var(--rule)`, borderRadius: 6 }}>Iniciar sesión</Link>
              <Link href="/register" style={{ fontSize: 13.5, fontWeight: 600, color: "var(--ink)", textDecoration: "none", padding: "9px 20px", background: "var(--neon)", borderRadius: 6, display: "inline-flex", alignItems: "center", gap: 6 }}>Registrarse →</Link>
            </div>
          </div>
        </nav>
        {/* TOPBAR */}
        <div style={{ maxWidth: 1280, margin: "0 auto", padding: "0 5vw" }}>
          <div style={{ borderBottom: `1px solid var(--rule)`, padding: "10px 0", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 11, fontWeight: 400, letterSpacing: "0.14em", textTransform: "uppercase", color: "var(--muted)" }}>By Simplex Latam · 2026</span>
            <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 11, fontWeight: 500, letterSpacing: "0.14em", textTransform: "uppercase", color: "var(--neon-dim)", display: "flex", alignItems: "center", gap: 6 }}>
              <span style={{ width: 7, height: 7, borderRadius: "50%", background: "var(--neon)", display: "inline-block", animation: "blink 2s ease-in-out infinite" }} />
              Asistentes activos ahora mismo
            </span>
          </div>
        </div>
        {/* HERO */}
        <div style={{ maxWidth: 1280, margin: "0 auto", padding: "72px 5vw 88px", display: "grid", gridTemplateColumns: "1fr 360px", gap: 80, alignItems: "start" }}>
          <div>
            <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 11, fontWeight: 500, letterSpacing: "0.2em", textTransform: "uppercase", color: "var(--neon-dim)", background: "var(--neon-pale)", padding: "8px 14px", display: "inline-block", marginBottom: 28, borderLeft: `3px solid var(--neon)` }}>
              Fuerza Laboral Artificial Latam · By Simplex Latam
            </div>
            <h1 style={{ fontFamily: "'Fraunces', serif", fontWeight: 500, fontSize: "clamp(52px, 6vw, 88px)", lineHeight: 0.93, letterSpacing: "-0.04em", color: "var(--ink)", marginBottom: 32 }}>Fuerza Laboral Artificial Latam</h1>
            <p style={{ fontSize: 20, fontWeight: 400, lineHeight: 1.6, color: "var(--ink-soft)", maxWidth: 600, marginBottom: 48, borderLeft: `3px solid var(--rule)`, paddingLeft: 20 }}>
              Descubrí cómo fuerza laboral artificial LATAM puede transformar tu empresa. Solución inteligente para automatizar procesos y escalar sin contratar. By Simplex Latam.
            </p>
            <Link href="/register" style={{ display: "inline-flex", alignItems: "center", gap: 10, background: "var(--neon)", color: "var(--paper)", padding: "18px 36px", borderRadius: 8, fontWeight: 600, fontSize: 17, textDecoration: "none" }}>
              Configurá tu asistente →
              <span style={{ fontSize: 13, opacity: 0.7 }}>14 días gratis</span>
            </Link>
          </div>
          <aside style={{ border: "2px solid var(--ink)", borderRadius: 2, background: "var(--paper)", padding: 28, position: "sticky", top: 100 }}>
            <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 10, fontWeight: 500, letterSpacing: "0.18em", textTransform: "uppercase", color: "var(--muted)", marginBottom: 18, borderBottom: "1px solid var(--rule)", paddingBottom: 10 }}>
              métricas reales
            </div>
            <div style={{ display: "grid", gap: 18 }}>
              {STATS.map((s) => (
                <div key={s.num} style={{ display: "grid", gridTemplateColumns: "70px 1fr", gap: 12, alignItems: "start" }}>
                  <div style={{ fontFamily: "'Fraunces', serif", fontSize: 32, fontWeight: 600, color: "var(--ink)", lineHeight: 1 }}>{s.num}</div>
                  <div style={{ fontSize: 13, color: "var(--ink-soft)", lineHeight: 1.4, paddingTop: 6 }}>{s.label}</div>
                </div>
              ))}
            </div>
            <div style={{ border: "1px solid var(--rule)", borderRadius: 4, padding: "16px 18px", marginTop: 22, background: "var(--neon-pale)" }}>
              <div style={{ fontSize: 12, fontWeight: 600, letterSpacing: "0.04em", color: "var(--ink)", marginBottom: 6 }}>¿Listo para automatizar?</div>
              <div style={{ fontSize: 13, color: "var(--ink-soft)", marginBottom: 14 }}>Empresas como la tuya ahorran 40-70% en tareas repetitivas.</div>
              <Link href="/register" style={{ display: "block", textAlign: "center", background: "var(--neon)", color: "var(--paper)", padding: "10px 16px", borderRadius: 6, fontWeight: 600, fontSize: 14, textDecoration: "none" }}>Empezar ahora</Link>
            </div>
          </aside>
        </div>
        {/* FEATURES */}
        <div style={{ background: "var(--ink)", color: "var(--paper)", padding: "80px 5vw" }}>
          <div style={{ maxWidth: 1280, margin: "0 auto" }}>
            <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 11, fontWeight: 500, letterSpacing: "0.2em", textTransform: "uppercase", color: "var(--neon)", marginBottom: 20 }}>características</div>
            <h2 style={{ fontFamily: "'Fraunces', serif", fontSize: "clamp(32px, 4vw, 52px)", fontWeight: 500, lineHeight: 1.1, marginBottom: 60, maxWidth: 900 }}>Todo lo que necesitás para automatizar fuerza laboral artificial LATAM.</h2>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 2 }}>
              {FEATURES.map((f) => (
                <div key={f.name} style={{ background: "var(--paper)", color: "var(--ink)", padding: "32px 28px", borderRadius: 2 }}>
                  <div style={{ fontSize: 28, marginBottom: 16 }}>{f.icon}</div>
                  <div style={{ fontFamily: "'Fraunces', serif", fontSize: 22, fontWeight: 600, marginBottom: 6 }}>{f.name}</div>
                  <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 11, fontWeight: 400, textTransform: "uppercase", letterSpacing: "0.14em", opacity: 0.6 }}>{f.dept}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
        {/* STEPS */}
        <div style={{ background: "var(--paper)", padding: "80px 5vw" }}>
          <div style={{ maxWidth: 1000, margin: "0 auto" }}>
            <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 11, fontWeight: 500, letterSpacing: "0.2em", textTransform: "uppercase", color: "var(--neon-dim)", marginBottom: 20 }}>cómo funciona</div>
            <h2 style={{ fontFamily: "'Fraunces', serif", fontSize: "clamp(28px, 3.5vw, 44px)", fontWeight: 500, lineHeight: 1.15, marginBottom: 60 }}>En 3 pasos, tu equipo empieza a trabajar 4x más rápido.</h2>
            <div style={{ display: "grid", gap: 0 }}>
              {STEPS.map((s) => (
                <div key={s.n} style={{ display: "grid", gridTemplateColumns: "120px 1fr", gap: 32, padding: "36px 0", borderBottom: "1px solid var(--rule)" }}>
                  <div style={{ fontFamily: "'Fraunces', serif", fontSize: 72, fontWeight: 600, color: "var(--neon-dim)", lineHeight: 1 }}>{s.n}</div>
                  <div>
                    <div style={{ fontFamily: "'Fraunces', serif", fontSize: 26, fontWeight: 600, marginBottom: 10, color: "var(--ink)" }}>{s.title}</div>
                    <div style={{ fontSize: 16, color: "var(--ink-soft)", lineHeight: 1.6, maxWidth: 560 }}>{s.desc}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
        {/* TESTIMONIALS */}
        <div style={{ background: "var(--rule)", padding: "80px 5vw" }}>
          <div style={{ maxWidth: 1200, margin: "0 auto" }}>
            <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 11, fontWeight: 500, letterSpacing: "0.2em", textTransform: "uppercase", color: "var(--neon-dim)", marginBottom: 20 }}>testimonios</div>
            <h2 style={{ fontFamily: "'Fraunces', serif", fontSize: "clamp(28px, 3.5vw, 44px)", fontWeight: 500, lineHeight: 1.15, marginBottom: 48 }}>Empresas que ya automatizaron con Flux Agent.</h2>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(340px, 1fr))", gap: 24 }}>
              {TESTIMONIALS.map((t, i) => (
                <div key={i} style={{ background: "var(--paper)", border: "2px solid var(--ink)", borderRadius: 2, padding: 32, display: "flex", flexDirection: "column", justifyContent: "space-between" }}>
                  <div>
                    <div style={{ fontFamily: "'Fraunces', serif", fontSize: 20, fontWeight: 500, lineHeight: 1.5, marginBottom: 24 }}>"{t.quote}"</div>
                  </div>
                  <div style={{ borderTop: "1px solid var(--rule)", paddingTop: 18, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <div>
                      <div style={{ fontWeight: 600, fontSize: 14 }}>{t.name}</div>
                      <div style={{ fontSize: 12, color: "var(--muted)" }}>{t.role}</div>
                    </div>
                    <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 11, fontWeight: 600, color: "var(--neon-dim)", textTransform: "uppercase", letterSpacing: "0.06em" }}>{t.result}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
        {/* CTA FINAL */}
        <div style={{ background: "var(--neon)", padding: "80px 5vw", textAlign: "center" }}>
          <div style={{ maxWidth: 800, margin: "0 auto" }}>
            <h2 style={{ fontFamily: "'Fraunces', serif", fontSize: "clamp(36px, 5vw, 64px)", fontWeight: 600, lineHeight: 1.05, marginBottom: 24, color: "var(--paper)" }}>¿Listo para automatizar fuerza laboral artificial LATAM?</h2>
            <p style={{ fontSize: 18, color: "var(--paper)", opacity: 0.85, marginBottom: 40 }}>Configurá tu asistente en 14 días. Resultados medibles desde la semana 1.</p>
            <Link href="/register" style={{ display: "inline-flex", alignItems: "center", gap: 10, background: "var(--paper)", color: "var(--neon)", padding: "18px 36px", borderRadius: 8, fontWeight: 700, fontSize: 17, textDecoration: "none" }}>
              Empezar ahora →
            </Link>
          </div>
        </div>
        {/* FOOTER */}
        <footer style={{ background: "var(--ink)", color: "var(--paper)", padding: "40px 5vw" }}>
          <div style={{ maxWidth: 1280, margin: "0 auto", display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 20 }}>
            <div style={{ fontFamily: "'Fraunces', serif", fontSize: 22, fontWeight: 600 }}>Flux Agent</div>
            <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 11, letterSpacing: "0.1em", opacity: 0.5 }}>By Simplex Latam · 2026</div>
          </div>
        </footer>
      </div>
    </>
  );
}
