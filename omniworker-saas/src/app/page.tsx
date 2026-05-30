import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Flux Agent — El asistente digital que trabaja por tu empresa",
  description:
    "Flux Agent asigna a tu empresa un asistente digital que atiende clientes, gestiona tareas y automatiza procesos — sin contratar a nadie más. By Simplex Latam.",
};

/* ─── Design tokens (inline CSS vars) ─── */
/* ─── Shared styles (object) ─── */
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

/* ─── SectionLabel helper ─── */
function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div style={S.sectionLabel}>
      <span style={{ color: "var(--muted)" }}>§</span>
      {children}
    </div>
  );
}

export default function HomePage() {
  return (
    <>

      <div style={{ background: "var(--paper)", color: "var(--ink)", fontFamily: "'Inter', sans-serif", fontSize: 16, lineHeight: 1.65, WebkitFontSmoothing: "antialiased", backgroundImage: "repeating-linear-gradient(0deg, transparent 0, transparent 23px, rgba(0,0,0,0.022) 23px, rgba(0,0,0,0.022) 24px)" }}>

        {/* ── NAV ── */}
        <nav style={{ position: "sticky", top: 0, zIndex: 100, background: "var(--paper)", borderBottom: `3px double var(--ink)`, padding: "0 5vw" }}>
          <div style={{ maxWidth: 1280, margin: "0 auto", display: "flex", alignItems: "center", justifyContent: "space-between", height: 68 }}>
            <a href="/" style={{ textDecoration: "none", display: "flex", alignItems: "center" }}>
              <img src="/logo.svg" alt="Flux Agent" style={{ height: 28 }} />
            </a>
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <a href="#problema" style={{ fontSize: 13.5, fontWeight: 500, color: "var(--muted)", textDecoration: "none", padding: "6px 12px", borderRadius: 6, transition: "all .15s" }}>El problema</a>
              <a href="#personaliza" style={{ fontSize: 13.5, fontWeight: 500, color: "var(--muted)", textDecoration: "none", padding: "6px 12px", borderRadius: 6 }}>Tu asistente</a>
              <a href="#casos" style={{ fontSize: 13.5, fontWeight: 500, color: "var(--muted)", textDecoration: "none", padding: "6px 12px", borderRadius: 6 }}>Casos de uso</a>
              <a href="#como" style={{ fontSize: 13.5, fontWeight: 500, color: "var(--muted)", textDecoration: "none", padding: "6px 12px", borderRadius: 6 }}>Cómo funciona</a>
              <div style={{ width: 1, height: 28, background: "var(--rule)", margin: "0 8px" }} />
              <Link href="/login" style={{ fontSize: 13.5, fontWeight: 600, color: "var(--ink)", textDecoration: "none", padding: "9px 18px", border: `1.5px solid var(--rule)`, borderRadius: 6, transition: "all .2s" }}>
                Iniciar sesión
              </Link>
              <Link href="/register" style={{ fontSize: 13.5, fontWeight: 600, color: "var(--ink)", textDecoration: "none", padding: "9px 20px", background: "var(--neon)", borderRadius: 6, transition: "all .2s", display: "inline-flex", alignItems: "center", gap: 6 }}>
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
        <div style={{ maxWidth: 1280, margin: "0 auto", padding: "72px 5vw 88px", display: "grid", gridTemplateColumns: "1fr 360px", gap: 80, alignItems: "start" }}>
          <div>
            <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 11, fontWeight: 500, letterSpacing: "0.2em", textTransform: "uppercase", color: "var(--neon-dim)", background: "var(--neon-pale)", padding: "8px 14px", display: "inline-block", marginBottom: 28, borderLeft: `3px solid var(--neon)` }}>
              Asistentes digitales · By Simplex Latam
            </div>
            <h1 style={{ fontFamily: "'Fraunces', serif", fontVariationSettings: '"opsz" 144, "SOFT" 30, "WONK" 0', fontWeight: 500, fontSize: "clamp(52px, 6vw, 88px)", lineHeight: 0.93, letterSpacing: "-0.04em", color: "var(--ink)", marginBottom: 32 }}>
              El asistente<br />que{" "}
              <em style={{ fontStyle: "italic", color: "var(--neon-dim)", fontVariationSettings: '"opsz" 144, "SOFT" 80' }}>nunca</em>
              <br />para.
            </h1>
            <p style={{ fontSize: 20, fontWeight: 400, lineHeight: 1.6, color: "var(--ink-soft)", maxWidth: 600, marginBottom: 48, borderLeft: `3px solid var(--rule)`, paddingLeft: 20 }}>
              FLUX AGENT asigna a tu empresa un asistente digital que atiende clientes, sigue prospectos y gestiona tareas repetitivas — de manera automática, las 24 horas, sin contratar a nadie más.
            </p>
            <div style={{ display: "flex", gap: 14, alignItems: "center", flexWrap: "wrap" }}>
              <Link href="/register" style={{ background: "var(--neon)", color: "var(--ink)", padding: "15px 32px", fontFamily: "'Inter', sans-serif", fontSize: 14, fontWeight: 700, textDecoration: "none", display: "inline-flex", alignItems: "center", gap: 8, borderRadius: 6, transition: "all .2s" }}>
                Configurar mi asistente →
              </Link>
              <a href="#como" style={{ fontFamily: "'Inter', sans-serif", fontSize: 14, fontWeight: 600, color: "var(--ink)", textDecoration: "none", padding: "15px 0", borderBottom: `2px solid var(--ink)` }}>
                Ver cómo funciona
              </a>
            </div>
            <div style={{ marginTop: 32, fontFamily: "'Inter', sans-serif", fontSize: 13, fontWeight: 500, color: "var(--muted)", display: "flex", gap: 24, flexWrap: "wrap" }}>
              {["Garantía 60 días", "Listo en 14 días", "Sin contratos largos"].map((t) => (
                <span key={t} style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <span style={{ color: "var(--neon-dim)", fontWeight: 700 }}>✓</span> {t}
                </span>
              ))}
            </div>
          </div>
          {/* Stats aside */}
          <div style={{ borderLeft: `2px solid var(--ink)`, paddingLeft: 32, marginTop: 8 }}>
            {[
              { num: "800%", label: "Retorno sobre la inversión en 90 días" },
              { num: "73%", label: "Del día de tu equipo va en tareas repetitivas" },
              { num: "14", label: "Días para tener tu asistente funcionando" },
              { num: "24/7", label: "Trabaja sin pausas, fines de semana ni vacaciones" },
            ].map((s, i) => (
              <div key={i} style={{ padding: "24px 0", borderBottom: i < 3 ? `1px solid var(--rule)` : "none" }}>
                <div style={{ fontFamily: "'Fraunces', serif", fontVariationSettings: '"opsz" 100, "WONK" 1', fontWeight: 500, fontSize: 52, lineHeight: 1, letterSpacing: "-0.03em", color: "var(--ink)" }}>{s.num}</div>
                <div style={{ fontFamily: "'Inter', sans-serif", fontSize: 13, fontWeight: 500, color: "var(--muted)", marginTop: 6 }}>{s.label}</div>
              </div>
            ))}
          </div>
        </div>

        {/* ── MARQUEE ── */}
        <div style={{ borderTop: `1px solid var(--rule)`, borderBottom: `1px solid var(--rule)`, background: "var(--paper-warm)", overflow: "hidden", padding: "14px 0" }}>
          <style>{`@keyframes marquee{from{transform:translateX(0)}to{transform:translateX(-50%)}} @keyframes blink{0%,100%{opacity:1}50%{opacity:.3}}`}</style>
          <div style={{ display: "flex", animation: "marquee 32s linear infinite", whiteSpace: "nowrap" }}>
            {[...Array(2)].map((_, d) => (
              <div key={d} style={{ display: "flex", flexShrink: 0 }}>
                {["Seguimiento de clientes", "Atención por WhatsApp 24/7", "Recordatorios de cobro", "Selección de candidatos", "Recuperación de ventas", "Confirmación de citas", "Reportes automáticos", "Calificación de oportunidades"].map((item) => (
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
              En América Latina, agregar una persona al equipo cuesta tiempo, dinero y energía. Y cuando por fin está lista, el negocio ya creció y necesitás otra. Hay una forma mejor de escalar.
            </p>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 1, background: "rgba(255,255,255,0.08)" }}>
              {[
                { num: "USD\n2,500", desc: "Costo mensual de un colaborador de ventas en LATAM. El asistente digital hace el mismo trabajo por una fracción de ese costo." },
                { num: "4\nmeses", desc: "Tiempo promedio hasta que una persona nueva es realmente productiva. El asistente digital está funcionando en 14 días." },
                { num: "25%", desc: "De los equipos operativos rota cada año en LATAM. El asistente digital no renuncia, no se enferma y no se va con la competencia." },
              ].map((s, i) => (
                <div key={i} style={{ background: "var(--ink)", padding: "52px 44px", border: `1px solid rgba(255,255,255,0.06)` }}>
                  <div style={{ fontFamily: "'Fraunces', serif", fontVariationSettings: '"opsz" 100, "WONK" 1', fontWeight: 500, fontSize: 68, lineHeight: 1, color: "var(--paper)", letterSpacing: "-0.03em", marginBottom: 16, whiteSpace: "pre-line" }}>{s.num}</div>
                  <div style={{ fontSize: 15, fontWeight: 400, color: "rgba(245,240,232,0.55)", lineHeight: 1.6 }}>{s.desc}</div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ── PERSONALIZA ── */}
        <section id="personaliza" style={{ background: "var(--paper-warm)", padding: "96px 5vw" }}>
          <div style={{ maxWidth: 1280, margin: "0 auto" }}>
            <SectionLabel>Tu asistente, tu forma</SectionLabel>
            <h2 style={S.sectionTitle}>
              Lo configurás para<br />
              <em style={{ color: "var(--neon-dim)", fontStyle: "italic" }}>lo que necesites.</em>
            </h2>
            <p style={S.sectionLead}>
              No es un producto cerrado. Vos describís qué tarea querés automatizar y nosotros configuramos el asistente para que se adapte exactamente a tu proceso, tu industria y tus herramientas.
            </p>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 80, alignItems: "center" }}>
              {/* Examples */}
              <div>
                {[
                  { tag: "🏥 Clínicas y consultorios", name: "Gestión de turnos y recordatorios", desc: "El asistente confirma citas por WhatsApp, maneja la lista de espera y avisa cuando hay lugar. Menos llamadas, menos ausentismo, agenda siempre llena.", result: "Ausentismo reducido del 30% al 10%", active: true },
                  { tag: "🛒 E-commerce y retail", name: "Recuperación de clientes que no compraron", desc: "El asistente contacta a quienes dejaron productos en el carrito, responde dudas de último momento y ofrece una razón para completar la compra.", result: "Recupera entre 12% y 22% de ventas perdidas", active: false },
                  { tag: "💰 Empresas con cartera de cobros", name: "Recordatorios de pago antes del vencimiento", desc: "El asistente avisa con días de anticipación, gestiona acuerdos de pago y solo escala al equipo los casos que realmente lo necesitan.", result: "Reduce pagos atrasados un 25–40%", active: false },
                ].map((card) => (
                  <div key={card.name} style={{ background: card.active ? "var(--neon-pale)" : "var(--paper)", border: `1.5px solid ${card.active ? "var(--neon)" : "var(--rule)"}`, borderRadius: 12, padding: "28px 32px", marginBottom: 16, position: "relative" }}>
                    {card.active && (
                      <span style={{ position: "absolute", top: 14, right: 14, fontFamily: "'DM Mono', monospace", fontSize: 10, fontWeight: 500, letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--neon-dim)", background: "white", border: `1px solid var(--neon)`, padding: "3px 10px", borderRadius: 100 }}>✓ En uso</span>
                    )}
                    <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 10.5, fontWeight: 500, letterSpacing: "0.14em", textTransform: "uppercase", color: "var(--neon-dim)", marginBottom: 8 }}>{card.tag}</div>
                    <div style={{ fontFamily: "'Fraunces', serif", fontVariationSettings: '"opsz" 60, "SOFT" 20', fontWeight: 500, fontSize: 20, letterSpacing: "-0.02em", color: "var(--ink)", marginBottom: 8 }}>{card.name}</div>
                    <div style={{ fontSize: 14.5, fontWeight: 400, color: "var(--muted)", lineHeight: 1.6, marginBottom: 12 }}>{card.desc}</div>
                    <div style={{ fontSize: 13, fontWeight: 600, color: "var(--neon-dim)", display: "flex", alignItems: "center", gap: 6 }}><span>↗</span>{card.result}</div>
                  </div>
                ))}
              </div>
              {/* Config UI mockup */}
              <div style={{ background: "var(--paper)", border: `2px solid var(--ink)`, borderRadius: 12, overflow: "hidden", boxShadow: `6px 6px 0 var(--ink)` }}>
                <div style={{ background: "var(--ink)", padding: "14px 24px", display: "flex", alignItems: "center", gap: 10 }}>
                  {["#ff5f57", "#febc2e", "#28c840"].map((c) => <div key={c} style={{ width: 10, height: 10, borderRadius: "50%", background: c }} />)}
                  <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 11, fontWeight: 500, letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--neon)", flex: 1, textAlign: "center" }}>Configurar mi asistente</div>
                </div>
                <div style={{ padding: 32 }}>
                  <div style={{ fontSize: 12, fontWeight: 600, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 10 }}>¿Qué querés automatizar?</div>
                  <div style={{ background: "var(--neon-pale)", border: `1.5px solid var(--neon)`, borderRadius: 8, padding: "14px 18px", fontSize: 15, fontWeight: 500, color: "var(--ink)", marginBottom: 20, display: "flex", alignItems: "center", gap: 10 }}>
                    <span>💬</span>"Necesito que alguien confirme mis citas y avise cuando hay cancela..."
                  </div>
                  <div style={{ fontSize: 12, fontWeight: 600, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 10 }}>¿En qué área trabaja tu negocio?</div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 20 }}>
                    {["Salud", "Ventas", "Atención al cliente", "Cobranzas", "Recursos humanos", "Otro"].map((chip, i) => (
                      <span key={chip} style={{ fontSize: 12.5, fontWeight: 600, padding: "6px 14px", border: `1.5px solid ${i === 0 ? "var(--ink)" : "var(--rule)"}`, borderRadius: 100, color: i === 0 ? "white" : "var(--ink-soft)", background: i === 0 ? "var(--ink)" : "white" }}>{chip}</span>
                    ))}
                  </div>
                  <div style={{ background: "var(--paper-warm)", borderRadius: 8, padding: "16px 18px", marginBottom: 24 }}>
                    <div style={{ fontSize: 12, fontWeight: 600, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 10 }}>Se conecta con lo que ya usás</div>
                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                      {["📱 WhatsApp", "📅 Google Calendar", "📊 Planillas", "+ 190 más"].map((int) => (
                        <span key={int} style={{ fontSize: 12, fontWeight: 600, padding: "5px 12px", background: "white", border: `1px solid var(--rule)`, borderRadius: 6, color: "var(--ink-soft)" }}>{int}</span>
                      ))}
                    </div>
                  </div>
                  <Link href="/register" style={{ display: "block", width: "100%", background: "var(--neon)", color: "var(--ink)", fontFamily: "'Inter', sans-serif", fontSize: 14, fontWeight: 700, padding: 14, textAlign: "center", borderRadius: 8, textDecoration: "none" }}>
                    Hablar con un experto →
                  </Link>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ── CASOS DE USO ── */}
        <section id="casos" style={{ padding: "96px 5vw" }}>
          <div style={{ maxWidth: 1280, margin: "0 auto" }}>
            <SectionLabel>Casos de uso</SectionLabel>
            <h2 style={S.sectionTitle}>
              ¿Qué puede hacer<br />
              <em style={{ color: "var(--neon-dim)", fontStyle: "italic" }}>tu asistente digital?</em>
            </h2>
            <p style={S.sectionLead}>Desde atender un cliente a las 3am hasta enviar un informe cada lunes a las 8am. Algunos ejemplos de lo que los equipos ya automatizan.</p>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 16 }}>
              {[
                { icon: "🎯", name: "Seguimiento de prospectos de ventas", dept: "Ventas" },
                { icon: "💬", name: "Atención al cliente por WhatsApp las 24 hs", dept: "Servicio al cliente" },
                { icon: "💰", name: "Recordatorios de pago antes del vencimiento", dept: "Finanzas" },
                { icon: "🛒", name: "Recuperación de compras no terminadas", dept: "E-commerce" },
                { icon: "👥", name: "Primera revisión de candidatos a un puesto", dept: "Recursos humanos" },
                { icon: "📅", name: "Confirmación y gestión de citas y turnos", dept: "Salud / Servicios" },
                { icon: "📊", name: "Reportes semanales enviados de forma automática", dept: "Operaciones" },
                { icon: "🏘️", name: "Seguimiento de interesados en propiedades", dept: "Inmobiliario" },
                { icon: "📚", name: "Inscripciones y consultas para cursos", dept: "Educación" },
                { icon: "🔔", name: "Alertas automáticas ante eventos clave del negocio", dept: "Dirección general" },
                { icon: "📦", name: "Seguimiento del estado de pedidos o envíos", dept: "Logística" },
                { icon: "✏️", name: "¿Tenés un proceso distinto? Lo armamos para vos.", dept: "Personalizado", dark: true },
              ].map((uc) => (
                <div key={uc.name} style={{ background: uc.dark ? "var(--ink)" : "var(--paper)", border: `1.5px solid ${uc.dark ? "var(--ink)" : "var(--rule)"}`, borderRadius: 10, padding: "24px 22px", transition: "all .2s" }}>
                  <div style={{ fontSize: 26, marginBottom: 10 }}>{uc.icon}</div>
                  <div style={{ fontFamily: "'Fraunces', serif", fontVariationSettings: '"opsz" 48', fontWeight: 500, fontSize: 15.5, color: uc.dark ? "var(--paper)" : "var(--ink)", marginBottom: 6, letterSpacing: "-0.01em", lineHeight: 1.25 }}>{uc.name}</div>
                  <div style={{ fontFamily: "'Inter', sans-serif", fontSize: 12, fontWeight: 600, color: uc.dark ? "var(--neon)" : "var(--muted)", textTransform: "uppercase", letterSpacing: "0.06em" }}>{uc.dept}</div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ── HOW IT WORKS ── */}
        <section id="como" style={{ background: "var(--paper-warm)", padding: "96px 5vw" }}>
          <div style={{ maxWidth: 1280, margin: "0 auto" }}>
            <SectionLabel>Cómo funciona</SectionLabel>
            <h2 style={S.sectionTitle}>
              Tu asistente listo<br />
              <em style={{ color: "var(--neon-dim)", fontStyle: "italic" }}>en tres pasos.</em>
            </h2>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 48, marginTop: 56 }}>
              {[
                { n: "01", title: "Contás qué necesitás", desc: "Explicás en tus palabras qué tarea querés delegar. No hace falta ser técnico — nuestro equipo te ayuda a definir cómo debe funcionar el asistente." },
                { n: "02", title: "Lo conectamos a tus herramientas", desc: "Integramos el asistente con WhatsApp, tu sistema de clientes, el calendario, planillas o cualquier herramienta que ya estés usando. Sin cambiar nada de tu forma de trabajar." },
                { n: "03", title: "El asistente trabaja, vos revisás los resultados", desc: "En 14 días está funcionando. Trabaja las 24 horas, reporta lo que hizo y aprende con el tiempo. Nuestro equipo lo supervisa — vos solo pedís los resultados." },
              ].map((step, i) => (
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
            <SectionLabel>Resultados reales</SectionLabel>
            <h2 style={S.sectionTitle}>
              Lo que logran<br />
              <em style={{ color: "var(--neon-dim)", fontStyle: "italic" }}>quienes ya lo usan.</em>
            </h2>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 32, marginTop: 56 }}>
              {[
                { quote: "Teníamos dos personas que solo procesaban facturas todo el día. Ahora el asistente hace el 94% de ese trabajo solo. Esas dos personas están en tareas que sí requieren criterio.", name: "Mariana Cortés", role: "Directora de Operaciones · Finova Logística", result: "↓ USD 12,400 de ahorro mensual" },
                { quote: "Lo pusimos a funcionar en una semana. Ahora resuelve el 78% de las consultas de nuestros clientes en menos de dos minutos, a cualquier hora.", name: "Diego Ramírez", role: "Director de Tecnología · Nexora Cloud", result: "↓ Tiempo de respuesta reducido un 89%" },
                { quote: "Incorporar una persona nueva nos tomaba 3 días de proceso. Ahora el asistente cruza datos de 7 sistemas y lo hace en 4 horas.", name: "Carolina Vargas", role: "VP de Personas · GrowthLab", result: "↑ 340 horas recuperadas por mes" },
              ].map((t) => (
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

        {/* ── CTA FINAL ── */}
        <section id="cta" style={{ background: "var(--ink)", padding: "96px 5vw", textAlign: "center" }}>
          <h2 style={{ fontFamily: "'Fraunces', serif", fontVariationSettings: '"opsz" 100, "SOFT" 50', fontWeight: 500, fontSize: "clamp(36px, 5vw, 64px)", lineHeight: 1.05, letterSpacing: "-0.03em", color: "var(--paper)", maxWidth: 820, margin: "0 auto 24px" }}>
            Tu competencia ya está<br />automatizando.{" "}
            <em style={{ color: "var(--neon)", fontStyle: "italic" }}>Cada semana<br />que esperás tiene un costo real.</em>
          </h2>
          <p style={{ fontSize: 19, fontWeight: 400, color: "rgba(245,240,232,0.5)", maxWidth: 560, margin: "0 auto 48px", lineHeight: 1.6 }}>
            Hablá con uno de nuestros expertos. Sin compromiso, sin jerga técnica. Solo una conversación sobre qué podría delegar tu equipo esta semana.
          </p>
          <div style={{ display: "flex", gap: 16, justifyContent: "center", flexWrap: "wrap" }}>
            <Link href="/register" style={{ background: "var(--neon)", color: "var(--ink)", padding: "16px 36px", fontFamily: "'Inter', sans-serif", fontSize: 15, fontWeight: 700, textDecoration: "none", display: "inline-flex", alignItems: "center", gap: 8, borderRadius: 6 }}>
              Configurar mi asistente →
            </Link>
            <Link href="/login" style={{ color: "rgba(245,240,232,0.5)", fontFamily: "'Inter', sans-serif", fontSize: 14, fontWeight: 500, textDecoration: "none", borderBottom: "1px solid rgba(245,240,232,0.2)", paddingBottom: 2, display: "inline-flex", alignItems: "center" }}>
              Ya tengo cuenta → Iniciar sesión
            </Link>
          </div>
          <div style={{ marginTop: 40, fontFamily: "'Inter', sans-serif", fontSize: 12, color: "rgba(245,240,232,0.2)", letterSpacing: "0.04em" }}>
            By Simplex Latam · Garantía 60 días
          </div>
        </section>

        {/* ── FOOTER ── */}
        <footer style={{ background: "var(--paper-warm)", borderTop: `3px double var(--ink)`, padding: "60px 5vw 40px" }}>
          <div style={{ maxWidth: 1280, margin: "0 auto", display: "grid", gridTemplateColumns: "1.2fr repeat(4,1fr)", gap: 56, alignItems: "start", marginBottom: 40, paddingBottom: 40, borderBottom: `1px solid var(--rule)` }}>
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
          <div style={{ maxWidth: 1280, margin: "0 auto", display: "flex", justifyContent: "space-between", fontFamily: "'Inter', sans-serif", fontSize: 13, fontWeight: 400, color: "var(--muted)" }}>
            <span>© 2026 Flux Agent · By Simplex Latam · Todos los derechos reservados.</span>
            <span>LATAM · Español · Q2 2026</span>
          </div>
        </footer>

      </div>
    </>
  );
}

// Force React import for JSX in older setups
import React from "react";
