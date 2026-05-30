import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Agentes de IA para Negocios — Flux Agent",
  description: "Agentes de inteligencia artificial que trabajan como empleados digitales en tu empresa. Productividad, ROI y automatización real. By Simplex Latam.",
  keywords: "agentes IA negocios, inteligencia artificial empresa, empleados digitales, agentes autónomos LATAM",
  openGraph: {
    title: "Agentes de IA para Negocios — Flux Agent",
    description: "Agentes de inteligencia artificial que trabajan como empleados digitales en tu empresa. Productividad, ROI y automatización real. By Simplex Latam.",
    url: "https://flux.simplex.lat/agentes-ia-negocios",
    siteName: "Flux Agent",
    locale: "es_LA",
    type: "website",
  },
};

export default function Page() {
  const STATS = [{"num": "800%", "label": "ROI promedio en el primer trimestre"}, {"num": "14 días", "label": "Para tener agentes operativos"}, {"num": "0", "label": "Contrataciones necesarias"}, {"num": "24/7", "label": "Operación continua"}];
  const FEATURES = [{"icon": "💬", "name": "Agente de atención al cliente", "dept": "Servicio"}, {"icon": "🎯", "name": "Agente de seguimiento comercial", "dept": "Ventas"}, {"icon": "📊", "name": "Agente de reportes y datos", "dept": "Analítica"}, {"icon": "💰", "name": "Agente de cobranzas", "dept": "Finanzas"}, {"icon": "👥", "name": "Agente de reclutamiento", "dept": "RRHH"}, {"icon": "📅", "name": "Agente de agendas y citas", "dept": "Operaciones"}, {"icon": "🛒", "name": "Agente de recuperación de ventas", "dept": "E-commerce"}, {"icon": "✏️", "name": "¿Otro agente? Lo creamos", "dept": "Personalizado", "dark": true}];
  const STEPS = [{"n": "01", "title": "Diagnosticamos tu operación", "desc": "Analizamos qué áreas se benefician más de agentes IA y priorizamos las de mayor impacto."}, {"n": "02", "title": "Implementamos los agentes", "desc": "Configuramos, entrenamos y conectamos cada agente a tus herramientas y procesos existentes."}, {"n": "03", "title": "Operan y mejoran", "desc": "Los agentes trabajan 24/7, aprenden de cada interacción y nuestro equipo los optimiza constantemente."}];
  const TESTIMONIALS = [{"quote": "Tenemos 4 agentes operando: uno para ventas, otro para soporte, otro para cobros y otro para RRHH. La eficiencia operativa subió un 300%.", "name": "Patricia Naranjo", "role": "CEO · Innovatec Ecuador", "result": "↑ 300% eficiencia operativa"}, {"quote": "El agente de cobranzas solo recuperó USD 45,000 en el primer trimestre que teníamos perdidos.", "name": "Andrés Mejía", "role": "CFO · CreditosYA Colombia", "result": "↑ USD 45,000 recuperados"}, {"quote": "Lo que más me impresiona es que los agentes aprenden. Cada semana son mejores que la anterior.", "name": "Daniela Ochoa", "role": "COO · Meridian Tech México", "result": "↑ Mejora semanal continua"}];
  const MARQUEE = ["Agentes autónomos", "Multi-tarea", "Aprendizaje continuo", "Integración total", "Reportes automáticos", "Toma de decisiones", "Escalabilidad", "Personalización"];
  const PROBLEMA_STATS = [{"num": "72%", "desc": "De las empresas en LATAM planean implementar IA en 2026. Las que lo hagan primero tendrán ventaja."}, {"num": "40%", "desc": "De aumento en productividad reportan las empresas que ya usan agentes de IA en sus operaciones."}, {"num": "USD\\n20K", "desc": "De ahorro mensual promedio al reemplazar tareas operativas con agentes digitales inteligentes."}];

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify({
          "@context": "https://schema.org",
          "@type": "SoftwareApplication",
          "name": "Agentes de IA para Negocios — Flux Agent",
          "description": "Agentes de inteligencia artificial que trabajan como empleados digitales en tu empresa. Productividad, ROI y automatización real. By Simplex Latam.",
          "provider": { "@type": "Organization", "name": "Simplex Latam" },
          "url": "https://flux.simplex.lat/agentes-ia-negocios",
          "applicationCategory": "BusinessApplication",
          "operatingSystem": "Web",
          "offers": { "@type": "Offer", "price": "0", "priceCurrency": "USD" },
        }) }}
      />
      <div style={{ background: "var(--paper)", color: "var(--ink)", fontFamily: "'Inter', sans-serif", fontSize: 16, lineHeight: 1.65, WebkitFontSmoothing: "antialiased", backgroundImage: "repeating-linear-gradient(0deg, transparent 0, transparent 23px, rgba(0,0,0,0.022) 23px, rgba(0,0,0,0.022) 24px)" }}>

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
              Agentes de IA · By Simplex Latam
            </div>
            <h1 style={{ fontFamily: "'Fraunces', serif", fontVariationSettings: '"opsz" 144, "SOFT" 30, "WONK" 0', fontWeight: 500, fontSize: "clamp(52px, 6vw, 88px)", lineHeight: 0.93, letterSpacing: "-0.04em", color: "var(--ink)", marginBottom: 32 }}>Agentes de IA que<br />trabajan como{" "}<em style={{ fontStyle: "italic", color: "var(--neon-dim)", fontVariationSettings: '"opsz" 144, "SOFT" 80' }}>empleados</em><br />digitales.</h1>
            <p style={{ fontSize: 20, fontWeight: 400, lineHeight: 1.6, color: "var(--ink-soft)", maxWidth: 600, marginBottom: 48, borderLeft: `3px solid var(--rule)`, paddingLeft: 20 }}>
              Flux Agent implementa agentes de inteligencia artificial que operan dentro de tu empresa. Atienden clientes, procesan datos, generan reportes y aprenden de cada interacción.
            </p>
            <div style={{ display: "flex", gap: 14, alignItems: "center", flexWrap: "wrap" }}>
              <Link href="/register" style={{ background: "var(--neon)", color: "var(--ink)", padding: "15px 32px", fontFamily: "'Inter', sans-serif", fontSize: 14, fontWeight: 700, textDecoration: "none", display: "inline-flex", alignItems: "center", gap: 8, borderRadius: 6 }}>
                Implementar agentes IA →
              </Link>
              <a href="#como" style={{ fontFamily: "'Inter', sans-serif", fontSize: 14, fontWeight: 600, color: "var(--ink)", textDecoration: "none", padding: "15px 0", borderBottom: `2px solid var(--ink)` }}>Ver cómo funciona</a>
            </div>
            <div style={{ marginTop: 32, fontFamily: "'Inter', sans-serif", fontSize: 13, fontWeight: 500, color: "var(--muted)", display: "flex", gap: 24, flexWrap: "wrap" }}>
              {["Garantía 60 días", "Listo en 14 días", "Sin contratos largos"].map((t) => (
                <span key={t} style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <span style={{ color: "var(--neon-dim)", fontWeight: 700 }}>✓</span> {t}
                </span>
              ))}
            </div>
          </div>
          <div style={{ borderLeft: `2px solid var(--ink)`, paddingLeft: 32, marginTop: 8 }}>
            {STATS.map((s, i) => (
              <div key={i} style={{ padding: "24px 0", borderBottom: i < STATS.length - 1 ? `1px solid var(--rule)` : "none" }}>
                <div style={{ fontFamily: "'Fraunces', serif", fontVariationSettings: '"opsz" 100, "WONK" 1', fontWeight: 500, fontSize: 52, lineHeight: 1, letterSpacing: "-0.03em", color: "var(--ink)" }}>{s.num}</div>
                <div style={{ fontFamily: "'Inter', sans-serif", fontSize: 13, fontWeight: 500, color: "var(--muted)", marginTop: 6 }}>{s.label}</div>
              </div>
            ))}
          </div>
        </div>

        {/* MARQUEE */}
        <div style={{ borderTop: `1px solid var(--rule)`, borderBottom: `1px solid var(--rule)`, background: "var(--paper-warm)", overflow: "hidden", padding: "14px 0" }}>
          <style>{`@keyframes marquee{from{transform:translateX(0)}to{transform:translateX(-50%)}} @keyframes blink{0%,100%{opacity:1}50%{opacity:.3}}`}</style>
          <div style={{ display: "flex", animation: "marquee 32s linear infinite", whiteSpace: "nowrap" }}>
            {[...Array(2)].map((_, d) => (
              <div key={d} style={{ display: "flex", flexShrink: 0 }}>
                {MARQUEE.map((item) => (
                  <span key={item} style={{ display: "inline-flex", alignItems: "center" }}>
                    <span style={{ fontFamily: "'Inter', sans-serif", fontSize: 13, fontWeight: 600, letterSpacing: "0.06em", color: "var(--muted)", padding: "0 32px" }}>{item}</span>
                    <span style={{ color: "var(--neon)" }}>◆</span>
                  </span>
                ))}
              </div>
            ))}
          </div>
        </div>

        {/* PROBLEMA */}
        <section id="problema" style={{ background: "var(--ink)", padding: "96px 5vw" }}>
          <div style={{ maxWidth: 1280, margin: "0 auto" }}>
            <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 11, fontWeight: 500, letterSpacing: "0.22em", textTransform: "uppercase", color: "rgba(0,201,92,0.8)", marginBottom: 16, display: "flex", alignItems: "center", gap: 10 }}>
              <span style={{ color: "rgba(255,255,255,0.25)" }}>§</span>El problema
            </div>
            <h2 style={{ fontFamily: "'Fraunces', serif", fontVariationSettings: '"opsz" 80, "SOFT" 30', fontWeight: 500, fontSize: "clamp(34px, 4vw, 54px)", lineHeight: 1.05, letterSpacing: "-0.025em", color: "var(--paper)", marginBottom: 20 }}>La IA ya no es el futuro.<br /><em style={{ color: "var(--neon)", fontStyle: "italic" }}>Es lo que tu competencia usa hoy.</em></h2>
            <p style={{ ...{ fontSize: 18, fontWeight: 400, color: "var(--muted)", maxWidth: 680, lineHeight: 1.65, marginBottom: 56 }, color: "rgba(245,240,232,0.6)" }}>
              Las empresas que no implementan IA en sus procesos están perdiendo eficiencia cada día. No se trata de reemplazar personas, sino de que hagan trabajo que realmente importa.
            </p>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 1, background: "rgba(255,255,255,0.08)" }}>
              {PROBLEMA_STATS.map((s, i) => (
                <div key={i} style={{ background: "var(--ink)", padding: "52px 44px", border: `1px solid rgba(255,255,255,0.06)` }}>
                  <div style={{ fontFamily: "'Fraunces', serif", fontVariationSettings: '"opsz" 100, "WONK" 1', fontWeight: 500, fontSize: 68, lineHeight: 1, color: "var(--paper)", letterSpacing: "-0.03em", marginBottom: 16, whiteSpace: "pre-line" }}>{s.num}</div>
                  <div style={{ fontSize: 15, fontWeight: 400, color: "rgba(245,240,232,0.55)", lineHeight: 1.6 }}>{s.desc}</div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* FEATURES */}
        <section id="features" style={{ background: "var(--paper-warm)", padding: "96px 5vw" }}>
          <div style={{ maxWidth: 1280, margin: "0 auto" }}>
            <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 11, fontWeight: 500, letterSpacing: "0.22em", textTransform: "uppercase", color: "var(--neon-dim)", marginBottom: 16, display: "flex", alignItems: "center", gap: 10 }}>
              <span style={{ color: "var(--muted)" }}>§</span>Agentes disponibles
            </div>
            <h2 style={{ fontFamily: "'Fraunces', serif", fontVariationSettings: '"opsz" 80, "SOFT" 30', fontWeight: 500, fontSize: "clamp(34px, 4vw, 54px)", lineHeight: 1.05, letterSpacing: "-0.025em", color: "var(--ink)", marginBottom: 20 }}>Un agente para cada<br /><em style={{ color: "var(--neon-dim)", fontStyle: "italic" }}>necesidad de tu negocio.</em></h2>
            <p style={{ fontSize: 18, fontWeight: 400, color: "var(--muted)", maxWidth: 680, lineHeight: 1.65, marginBottom: 56 }}>
              Cada agente se especializa en un área y se coordina con los demás.
            </p>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 16 }}>
              {FEATURES.map((f) => (
                <div key={f.name} style={{ background: f.dark ? "var(--ink)" : "var(--paper)", border: `1.5px solid ${f.dark ? "var(--ink)" : "var(--rule)"}`, borderRadius: 10, padding: "24px 22px", transition: "all .2s" }}>
                  <div style={{ fontSize: 26, marginBottom: 10 }}>{f.icon}</div>
                  <div style={{ fontFamily: "'Fraunces', serif", fontVariationSettings: '"opsz" 48', fontWeight: 500, fontSize: 15.5, color: f.dark ? "var(--paper)" : "var(--ink)", marginBottom: 6, letterSpacing: "-0.01em", lineHeight: 1.25 }}>{f.name}</div>
                  <div style={{ fontFamily: "'Inter', sans-serif", fontSize: 12, fontWeight: 600, color: f.dark ? "var(--neon)" : "var(--muted)", textTransform: "uppercase", letterSpacing: "0.06em" }}>{f.dept}</div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* HOW IT WORKS */}
        <section id="como" style={{ background: "var(--paper)", padding: "96px 5vw" }}>
          <div style={{ maxWidth: 1280, margin: "0 auto" }}>
            <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 11, fontWeight: 500, letterSpacing: "0.22em", textTransform: "uppercase", color: "var(--neon-dim)", marginBottom: 16, display: "flex", alignItems: "center", gap: 10 }}>
              <span style={{ color: "var(--muted)" }}>§</span>Cómo funciona
            </div>
            <h2 style={{ fontFamily: "'Fraunces', serif", fontVariationSettings: '"opsz" 80, "SOFT" 30', fontWeight: 500, fontSize: "clamp(34px, 4vw, 54px)", lineHeight: 1.05, letterSpacing: "-0.025em", color: "var(--ink)", marginBottom: 20 }}>
              Tu asistente listo<br /><em style={{ color: "var(--neon-dim)", fontStyle: "italic" }}>en tres pasos.</em>
            </h2>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 48, marginTop: 56 }}>
              {STEPS.map((step, i) => (
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

        {/* TESTIMONIALS */}
        <section style={{ padding: "96px 5vw", background: "var(--paper-warm)" }}>
          <div style={{ maxWidth: 1280, margin: "0 auto" }}>
            <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 11, fontWeight: 500, letterSpacing: "0.22em", textTransform: "uppercase", color: "var(--neon-dim)", marginBottom: 16, display: "flex", alignItems: "center", gap: 10 }}>
              <span style={{ color: "var(--muted)" }}>§</span>Resultados reales
            </div>
            <h2 style={{ fontFamily: "'Fraunces', serif", fontVariationSettings: '"opsz" 80, "SOFT" 30', fontWeight: 500, fontSize: "clamp(34px, 4vw, 54px)", lineHeight: 1.05, letterSpacing: "-0.025em", color: "var(--ink)", marginBottom: 20 }}>
              Lo que logran<br /><em style={{ color: "var(--neon-dim)", fontStyle: "italic" }}>quienes ya lo usan.</em>
            </h2>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 32, marginTop: 56 }}>
              {TESTIMONIALS.map((t) => (
                <div key={t.name} style={{ borderTop: `2px solid var(--ink)`, paddingTop: 28 }}>
                  <div style={{ fontFamily: "'Fraunces', serif", fontVariationSettings: '"opsz" 48, "SOFT" 60', fontStyle: "italic", fontWeight: 400, fontSize: 17, lineHeight: 1.6, color: "var(--ink-soft)", marginBottom: 24 }}>"{t.quote}"</div>
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

        {/* CTA FINAL */}
        <section id="cta" style={{ background: "var(--ink)", padding: "96px 5vw", textAlign: "center" }}>
          <h2 style={{ fontFamily: "'Fraunces', serif", fontVariationSettings: '"opsz" 100, "SOFT" 50', fontWeight: 500, fontSize: "clamp(36px, 5vw, 64px)", lineHeight: 1.05, letterSpacing: "-0.03em", color: "var(--paper)", maxWidth: 820, margin: "0 auto 24px" }}>
            Tu competencia ya está<br />automatizando.{" "}
            <em style={{ color: "var(--neon)", fontStyle: "italic" }}>Cada semana<br />que esperás tiene un costo real.</em>
          </h2>
          <p style={{ fontSize: 19, fontWeight: 400, color: "rgba(245,240,232,0.5)", maxWidth: 560, margin: "0 auto 48px", lineHeight: 1.6 }}>
            Hablá con uno de nuestros expertos. Sin compromiso, sin jerga técnica.
          </p>
          <div style={{ display: "flex", gap: 16, justifyContent: "center", flexWrap: "wrap" }}>
            <Link href="/register" style={{ background: "var(--neon)", color: "var(--ink)", padding: "16px 36px", fontFamily: "'Inter', sans-serif", fontSize: 15, fontWeight: 700, textDecoration: "none", display: "inline-flex", alignItems: "center", gap: 8, borderRadius: 6 }}>
              Implementar agentes IA →
            </Link>
            <Link href="/login" style={{ color: "rgba(245,240,232,0.5)", fontFamily: "'Inter', sans-serif", fontSize: 14, fontWeight: 500, textDecoration: "none", borderBottom: "1px solid rgba(245,240,232,0.2)", paddingBottom: 2, display: "inline-flex", alignItems: "center" }}>
              Ya tengo cuenta → Iniciar sesión
            </Link>
          </div>
          <div style={{ marginTop: 40, fontFamily: "'Inter', sans-serif", fontSize: 12, color: "rgba(245,240,232,0.2)", letterSpacing: "0.04em" }}>
            By Simplex Latam · Garantía 60 días
          </div>
        </section>

        {/* FOOTER */}
        <footer style={{ background: "var(--paper-warm)", borderTop: `3px double var(--ink)`, padding: "60px 5vw 40px" }}>
          <div style={{ maxWidth: 1280, margin: "0 auto", display: "grid", gridTemplateColumns: "1.2fr repeat(4,1fr)", gap: 56, alignItems: "start", marginBottom: 40, paddingBottom: 40, borderBottom: `1px solid var(--rule)` }}>
            <div>
              <div style={{ marginBottom: 16 }}><img src="/logo.svg" alt="Flux Agent" style={{ height: 32 }} /></div>
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
          <div style={{ maxWidth: 1280, margin: "0 auto", display: "flex", justifyContent: "space-between", fontFamily: "'Inter', sans-serif", fontSize: 13, fontWeight: 400, color: "var(--muted)" }}>
            <span>© 2026 Flux Agent · By Simplex Latam · Todos los derechos reservados.</span>
            <span>LATAM · Español · Q2 2026</span>
          </div>
        </footer>

      </div>
    </>
  );
}

import React from "react";
