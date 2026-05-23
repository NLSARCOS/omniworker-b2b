"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { motion, AnimatePresence, useInView } from "framer-motion";
import {
  FileText,
  Database,
  MessageSquare,
  Workflow,
  Check,
  Plus,
  ArrowRight,
  Zap,
  Shield,
  BarChart3,
  Users,
  Clock,
  Lock,
  ChevronRight,
} from "lucide-react";

/* ────────────────────────────────
   DESIGN TOKENS
──────────────────────────────── */
const ACCENT = "#D4A853";
const BG = "#050505";
const BG_ELEVATED = "#0a0a0a";
const TEXT = "#ffffff";
const TEXT_MUTED = "#888888";
const BORDER = "rgba(255,255,255,0.06)";
const BORDER_HOVER = "rgba(255,255,255,0.10)";

/* ────────────────────────────────
   ANIMATION VARIANTS
──────────────────────────────── */
const easeOut: [number, number, number, number] = [0.16, 1, 0.3, 1];

const fadeUp = {
  hidden: { opacity: 0, y: 30 },
  visible: (delay = 0) => ({
    opacity: 1,
    y: 0,
    transition: { duration: 0.7, delay, ease: easeOut },
  }),
};

const scaleIn = {
  hidden: { opacity: 0, scale: 0.95 },
  visible: (delay = 0) => ({
    opacity: 1,
    scale: 1,
    transition: { duration: 0.8, delay, ease: easeOut },
  }),
};

/* ────────────────────────────────
   SECTION WRAPPER
──────────────────────────────── */
function Section({
  children,
  className = "",
  id,
}: {
  children: React.ReactNode;
  className?: string;
  id?: string;
}) {
  return (
    <section id={id} className={`relative ${className}`}>
      {children}
    </section>
  );
}

/* ────────────────────────────────
   SPOTLIGHT BACKGROUND
──────────────────────────────── */
function Spotlight({
  className = "",
  color = ACCENT,
}: {
  className?: string;
  color?: string;
}) {
  return (
    <div
      className={`absolute pointer-events-none ${className}`}
      style={{
        background: `radial-gradient(600px circle at 50% 0%, ${color}15, transparent 60%)`,
      }}
    />
  );
}

/* ────────────────────────────────
   GRID DOTS BACKGROUND
──────────────────────────────── */
function GridDots() {
  return (
    <div
      className="absolute inset-0 pointer-events-none opacity-[0.15]"
      style={{
        backgroundImage:
          "radial-gradient(circle, rgba(255,255,255,0.4) 1px, transparent 1px)",
        backgroundSize: "40px 40px",
      }}
    />
  );
}

/* ────────────────────────────────
   NAVIGATION
──────────────────────────────── */
function Nav() {
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 40);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <motion.header
      initial={{ y: -20, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
      className={`fixed top-0 inset-x-0 z-50 transition-all duration-500 ${
        scrolled
          ? "bg-[#050505]/80 backdrop-blur-xl border-b border-white/[0.06]"
          : "bg-transparent"
      }`}
    >
      <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
        <Link href="/" className="flex items-center gap-2.5 group">
          <div className="w-2 h-2 rounded-full" style={{ background: ACCENT }} />
          <span className="font-bold text-white tracking-tight text-lg">
            OmniWorker
          </span>
        </Link>

        <nav className="hidden md:flex items-center gap-8">
          {["Producto", "Cómo funciona", "Precios", "FAQ"].map((item) => (
            <a
              key={item}
              href={`#${item.toLowerCase().replace(/\s+/g, "-")}`}
              className="text-sm text-neutral-400 hover:text-white transition-colors duration-300"
            >
              {item}
            </a>
          ))}
        </nav>

        <div className="flex items-center gap-4">
          <Link
            href="/login"
            className="hidden sm:block text-sm text-neutral-400 hover:text-white transition-colors"
          >
            Iniciar sesión
          </Link>
          <Link
            href="/register"
            className="text-sm font-medium px-5 py-2.5 rounded-lg bg-white text-black hover:bg-neutral-200 transition-colors duration-300"
          >
            Empezar gratis
          </Link>
        </div>
      </div>
    </motion.header>
  );
}

/* ────────────────────────────────
   HERO
──────────────────────────────── */
function Hero() {
  return (
    <Section className="min-h-screen flex items-center overflow-hidden pt-16" id="producto">
      <Spotlight className="inset-0" />
      <GridDots />

      <div className="relative z-10 max-w-6xl mx-auto px-6 w-full py-20">
        <div className="grid lg:grid-cols-2 gap-16 items-center">
          {/* Left copy */}
          <div>
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.1 }}
              className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-white/[0.08] bg-white/[0.02] mb-8"
            >
              <span
                className="w-1.5 h-1.5 rounded-full animate-pulse"
                style={{ background: ACCENT }}
              />
              <span className="text-xs font-medium text-neutral-400">
                Plataforma de agentes autónomos de IA
              </span>
            </motion.div>

            <motion.h1
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.8, delay: 0.2 }}
              className="text-[clamp(2.5rem,5vw,4.5rem)] font-bold text-white tracking-tight leading-[1.05]"
            >
              Elimina{" "}
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-white via-white to-neutral-500">
                40 horas
              </span>{" "}
              semanales de trabajo operativo
            </motion.h1>

            <motion.p
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.7, delay: 0.4 }}
              className="mt-6 text-lg text-neutral-400 leading-relaxed max-w-lg"
            >
              OmniWorker despliega agentes de IA que procesan documentos,
              sincronizan datos y ejecutan flujos de trabajo 24/7. Todo en tu
              infraestructura.
            </motion.p>

            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.7, delay: 0.6 }}
              className="mt-10 flex flex-wrap items-center gap-4"
            >
              <Link
                href="/register"
                className="inline-flex items-center gap-2 px-7 py-3.5 rounded-xl bg-white text-black font-semibold text-sm hover:bg-neutral-200 transition-all duration-300 hover:shadow-[0_0_40px_-10px_rgba(255,255,255,0.15)]"
              >
                Comenzar gratis — 60 segundos
                <ArrowRight className="w-4 h-4" />
              </Link>
              <a
                href="#como-funciona"
                className="inline-flex items-center gap-2 px-7 py-3.5 rounded-xl border border-white/[0.08] text-white font-medium text-sm hover:bg-white/[0.03] hover:border-white/[0.12] transition-all duration-300"
              >
                Ver cómo funciona
              </a>
            </motion.div>

            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.7, delay: 0.8 }}
              className="mt-12 flex items-center gap-10"
            >
              {[
                { v: "10,000+", l: "agentes activos" },
                { v: "2.4M", l: "tareas este mes" },
                { v: "99.97%", l: "uptime" },
              ].map((s) => (
                <div key={s.l}>
                  <div className="text-lg font-bold text-white">{s.v}</div>
                  <div className="text-xs text-neutral-500 mt-0.5">{s.l}</div>
                </div>
              ))}
            </motion.div>
          </div>

          {/* Right mockup */}
          <motion.div
            initial={{ opacity: 0, x: 40, scale: 0.95 }}
            animate={{ opacity: 1, x: 0, scale: 1 }}
            transition={{ duration: 1, delay: 0.4, ease: [0.16, 1, 0.3, 1] }}
            className="hidden lg:block"
          >
            <div
              className="relative rounded-2xl overflow-hidden"
              style={{
                background: BG_ELEVATED,
                border: "1px solid rgba(255,255,255,0.08)",
                boxShadow: `0 0 80px -20px ${ACCENT}15, 0 25px 80px -20px rgba(0,0,0,0.8)`,
                transform: "perspective(1000px) rotateY(-5deg) rotateX(3deg)",
              }}
            >
              {/* Top bar */}
              <div className="flex items-center gap-2 px-4 py-3 border-b border-white/[0.06] bg-black/40">
                <div className="flex gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-full bg-red-500/70" />
                  <span className="w-2.5 h-2.5 rounded-full bg-yellow-500/70" />
                  <span className="w-2.5 h-2.5 rounded-full bg-green-500/70" />
                </div>
                <span className="ml-3 text-[10px] text-neutral-600 font-mono">
                  omniworker — dashboard
                </span>
              </div>

              <div className="flex">
                {/* Sidebar */}
                <div className="w-44 border-r border-white/[0.06] p-3 hidden sm:block">
                  <div className="text-[9px] text-neutral-600 font-mono uppercase tracking-widest mb-3">
                    Workspace
                  </div>
                  {["Agentes", "Ejecuciones", "Integraciones", "Logs"].map(
                    (item, i) => (
                      <div
                        key={item}
                        className={`px-3 py-2 rounded-lg text-xs font-medium mb-0.5 ${
                          i === 0
                            ? "bg-white/[0.04] text-white"
                            : "text-neutral-500"
                        }`}
                      >
                        {item}
                      </div>
                    )
                  )}
                  <div className="mt-4 pt-3 border-t border-white/[0.06] space-y-1.5">
                    <div className="flex justify-between text-[10px] text-neutral-600">
                      <span>CPU</span>
                      <span className="font-mono text-neutral-400">12%</span>
                    </div>
                    <div className="flex justify-between text-[10px] text-neutral-600">
                      <span>RAM</span>
                      <span className="font-mono text-neutral-400">340 MB</span>
                    </div>
                  </div>
                </div>

                {/* Main */}
                <div className="flex-1 p-4">
                  <div className="flex items-center justify-between mb-4">
                    <span className="text-sm font-semibold text-white">
                      Agentes activos
                    </span>
                    <span className="text-[10px] text-neutral-600 font-mono">
                      actualizado hace 4s
                    </span>
                  </div>

                  {[
                    { n: "Facturación", id: "ow-billing-01", ops: "847", t: "12 min" },
                    { n: "Soporte Comercial", id: "ow-support-02", ops: "1,204", t: "3 min" },
                    { n: "Sincronización ERP", id: "ow-sync-03", ops: "2,891", t: "1 min" },
                  ].map((agent) => (
                    <div
                      key={agent.id}
                      className="flex items-center justify-between p-3 rounded-xl mb-2"
                      style={{
                        background: "rgba(255,255,255,0.02)",
                        border: "1px solid rgba(255,255,255,0.04)",
                      }}
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-lg bg-white/[0.04] border border-white/[0.06] flex items-center justify-center">
                          <div
                            className="w-1.5 h-1.5 rounded-full"
                            style={{ background: ACCENT }}
                          />
                        </div>
                        <div>
                          <div className="text-sm text-white font-medium">
                            {agent.n}
                          </div>
                          <div className="text-[10px] text-neutral-600 font-mono">
                            {agent.id} · hace {agent.t}
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="text-xs text-neutral-500 font-mono hidden sm:block">
                          {agent.ops} ops
                        </span>
                        <span
                          className="text-[10px] font-medium px-2 py-0.5 rounded-full"
                          style={{
                            color: "#22c55e",
                            background: "rgba(34,197,94,0.1)",
                            border: "1px solid rgba(34,197,94,0.2)",
                          }}
                        >
                          Activo
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </motion.div>
        </div>
      </div>
    </Section>
  );
}

/* ────────────────────────────────
   LOGOS
──────────────────────────────── */
function Logos() {
  const brands = [
    "Notion",
    "Slack",
    "Stripe",
    "Airtable",
    "Asana",
    "HubSpot",
    "Salesforce",
    "Google Workspace",
  ];

  return (
    <Section className="border-y border-white/[0.06] bg-[#050505]">
      <div className="max-w-6xl mx-auto px-6 py-10">
        <motion.p
          variants={fadeUp}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true }}
          className="text-center text-[11px] font-semibold uppercase tracking-[0.2em] text-neutral-600 mb-8"
        >
          Equipos de todo tamaño ya automatizan con OmniWorker
        </motion.p>
        <motion.div
          variants={fadeUp}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true }}
          className="flex flex-wrap justify-center items-center gap-x-12 gap-y-6"
        >
          {brands.map((b) => (
            <span
              key={b}
              className="text-sm font-semibold text-neutral-700 hover:text-neutral-400 transition-colors duration-300 cursor-default"
            >
              {b}
            </span>
          ))}
        </motion.div>
      </div>
    </Section>
  );
}

/* ────────────────────────────────
   PROBLEM
──────────────────────────────── */
function Problem() {
  const ref = useRef(null);
  const isInView = useInView(ref, { once: true, margin: "-100px" });

  const stats = [
    { v: "73%", d: "del tiempo operativo se gasta en tareas repetitivas que no generan ingresos" },
    { v: "$4,200", d: "es el costo mensual promedio por especialista operativo en Norteamérica" },
    { v: "0 hrs", d: "de automatización real logran la mayoría con chatbots genéricos" },
  ];

  return (
    <Section className="bg-[#050505] py-32 md:py-40" id="problema">
      <Spotlight className="inset-0" color="#ffffff" />
      <div className="relative z-10 max-w-6xl mx-auto px-6">
        <motion.div
          ref={ref}
          variants={fadeUp}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true }}
          className="max-w-2xl mb-20"
        >
          <span className="text-xs font-semibold uppercase tracking-[0.2em] text-[#D4A853] mb-4 block">
            El problema
          </span>
          <h2 className="text-[clamp(2rem,4vw,3.5rem)] font-bold text-white tracking-tight leading-[1.1]">
            Tu equipo pierde 23 horas semanales en tareas que un agente de IA ejecutaría en segundos
          </h2>
        </motion.div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-10">
          {stats.map((s, i) => (
            <motion.div
              key={s.v}
              variants={fadeUp}
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true }}
              custom={i * 0.15}
            >
              <div className="text-5xl md:text-6xl font-bold text-white tracking-tight mb-4">
                {s.v}
              </div>
              <div
                className="w-full h-px mb-5"
                style={{
                  background:
                    "linear-gradient(90deg, rgba(255,255,255,0.2), transparent)",
                }}
              />
              <p className="text-sm text-neutral-500 leading-relaxed">
                {s.d}
              </p>
            </motion.div>
          ))}
        </div>
      </div>
    </Section>
  );
}

/* ────────────────────────────────
   SOLUTION / FEATURES
──────────────────────────────── */
function Features() {
  const features = [
    {
      icon: FileText,
      title: "Procesamiento de documentos",
      desc: "Extrae datos de facturas, contratos y formularios con precisión humana. Soporta PDFs escaneados e imágenes.",
      benefit: "Reduce 6 horas a 4 minutos por lote",
    },
    {
      icon: Database,
      title: "Sincronización entre sistemas",
      desc: "Conecta CRM, ERP, hojas de cálculo y bases de datos. Datos siempre actualizados en todos los canales.",
      benefit: "Elimina errores de doble entrada",
    },
    {
      icon: MessageSquare,
      title: "Respuesta automática multicanal",
      desc: "Atiende correos, Slack, tickets y consultas con contexto completo de tu negocio y políticas internas.",
      benefit: "Responde en 30s, no en 4 horas",
    },
    {
      icon: Workflow,
      title: "Flujos de trabajo autónomos",
      desc: "Diseña flujos con condiciones, aprobaciones y acciones encadenadas. Los agentes ejecutan cada paso.",
      benefit: "Opera procesos completos sin supervisión",
    },
  ];

  return (
    <Section className="bg-[#0a0a0a] py-32 md:py-40" id="solucion">
      <GridDots />
      <div className="relative z-10 max-w-6xl mx-auto px-6">
        <motion.div
          variants={fadeUp}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true }}
          className="max-w-2xl mb-20"
        >
          <span className="text-xs font-semibold uppercase tracking-[0.2em] text-[#D4A853] mb-4 block">
            La solución
          </span>
          <h2 className="text-[clamp(2rem,4vw,3.5rem)] font-bold text-white tracking-tight leading-[1.1]">
            Agentes que ejecutan flujos completos, no solo responden preguntas
          </h2>
          <p className="mt-5 text-lg text-neutral-500 leading-relaxed">
            OmniWorker combina modelos de lenguaje con herramientas empresariales reales. Sin enviar un byte a servidores externos.
          </p>
        </motion.div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {features.map((f, i) => (
            <motion.div
              key={f.title}
              variants={scaleIn}
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true }}
              custom={i * 0.1}
              className="group relative rounded-2xl p-8 transition-all duration-500 hover:bg-white/[0.03]"
              style={{
                background: "rgba(255,255,255,0.015)",
                border: "1px solid rgba(255,255,255,0.06)",
              }}
            >
              <div className="absolute inset-0 rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none"
                style={{
                  boxShadow: `inset 0 1px 0 0 rgba(255,255,255,0.06)`,
                }}
              />
              <div
                className="w-12 h-12 rounded-xl flex items-center justify-center mb-6"
                style={{ background: `${ACCENT}12` }}
              >
                <f.icon className="w-5 h-5" style={{ color: ACCENT }} />
              </div>
              <h3 className="text-xl font-semibold text-white mb-2">
                {f.title}
              </h3>
              <p className="text-sm text-neutral-500 leading-relaxed mb-4">
                {f.desc}
              </p>
              <p className="text-sm font-medium" style={{ color: ACCENT }}>
                {f.benefit}
              </p>
            </motion.div>
          ))}
        </div>
      </div>
    </Section>
  );
}

/* ────────────────────────────────
   HOW IT WORKS
──────────────────────────────── */
function HowItWorks() {
  const steps = [
    {
      n: "01",
      title: "Conecta tus herramientas",
      desc: "Integra tus sistemas existentes en minutos. 200+ aplicaciones sin código. Tus datos nunca salen de tu infraestructura.",
    },
    {
      n: "02",
      title: "Describe el trabajo",
      desc: "Explica en lenguaje natural qué tarea quieres automatizar. El sistema comprende el contexto y genera el flujo automáticamente.",
    },
    {
      n: "03",
      title: "El agente opera 24/7",
      desc: "Una vez activado, ejecuta la tarea de forma autónoma, maneja excepciones y mejora con cada iteración.",
    },
  ];

  return (
    <Section className="bg-[#050505] py-32 md:py-40" id="como-funciona">
      <div className="relative z-10 max-w-6xl mx-auto px-6">
        <motion.div
          variants={fadeUp}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true }}
          className="max-w-2xl mb-20"
        >
          <span className="text-xs font-semibold uppercase tracking-[0.2em] text-[#D4A853] mb-4 block">
            Cómo funciona
          </span>
          <h2 className="text-[clamp(2rem,4vw,3.5rem)] font-bold text-white tracking-tight leading-[1.1]">
            De la idea a la automatización en tres pasos
          </h2>
        </motion.div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-12 relative">
          {/* Connector line */}
          <div
            className="hidden md:block absolute top-12 left-[16%] right-[16%] h-px"
            style={{
              background:
                "linear-gradient(90deg, transparent, rgba(212,168,83,0.2), transparent)",
            }}
          />

          {steps.map((s, i) => (
            <motion.div
              key={s.n}
              variants={fadeUp}
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true }}
              custom={i * 0.15}
            >
              <div className="text-7xl font-bold text-white/[0.04] leading-none mb-4">
                {s.n}
              </div>
              <h3 className="text-lg font-semibold text-white mb-2">
                {s.title}
              </h3>
              <p className="text-sm text-neutral-500 leading-relaxed">
                {s.desc}
              </p>
            </motion.div>
          ))}
        </div>
      </div>
    </Section>
  );
}

/* ────────────────────────────────
   STATS
──────────────────────────────── */
function Stats() {
  const items = [
    { v: "24/7", l: "Operación continua" },
    { v: "+800%", l: "ROI promedio en 90 días" },
    { v: "100%", l: "Datos en tu infraestructura" },
    { v: "<60s", l: "Para desplegar tu primer agente" },
  ];

  return (
    <Section className="bg-[#0a0a0a] py-24 md:py-32 relative overflow-hidden" id="stats">
      <Spotlight className="inset-0" />
      <div className="relative z-10 max-w-6xl mx-auto px-6">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-10">
          {items.map((item, i) => (
            <motion.div
              key={item.v}
              variants={fadeUp}
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true }}
              custom={i * 0.1}
              className="text-center"
            >
              <div className="text-4xl md:text-5xl font-bold text-white tracking-tight">
                {item.v}
              </div>
              <div className="text-sm text-neutral-500 mt-2">{item.l}</div>
            </motion.div>
          ))}
        </div>
      </div>
    </Section>
  );
}

/* ────────────────────────────────
   TESTIMONIALS
──────────────────────────────── */
function Testimonials() {
  const items = [
    {
      q: "Antes teníamos dos personas dedicadas exclusivamente a procesar facturas. Ahora el agente maneja el 94% del volumen sin intervención.",
      a: "Mariana Cortés",
      r: "Directora de Operaciones",
      c: "Finova Logística",
      m: "Redujo costos $12,400/mes",
    },
    {
      q: "Implementamos el agente de soporte en una semana. Ahora resuelve el 78% de los tickets de primer nivel en menos de dos minutos.",
      a: "Diego Ramírez",
      r: "CTO",
      c: "Nexora Cloud",
      m: "Tiempo de respuesta -89%",
    },
    {
      q: "El agente de onboarding integra datos de 7 sistemas automáticamente. Lo que tomaba 3 días, ahora se completa en 4 horas.",
      a: "Carolina Vargas",
      r: "VP People Operations",
      c: "GrowthLab",
      m: "Ahorra 340 horas mensuales",
    },
  ];

  return (
    <Section className="bg-[#050505] py-32 md:py-40" id="testimonios">
      <div className="relative z-10 max-w-6xl mx-auto px-6">
        <motion.div
          variants={fadeUp}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true }}
          className="max-w-2xl mb-20"
        >
          <span className="text-xs font-semibold uppercase tracking-[0.2em] text-[#D4A853] mb-4 block">
            Resultados reales
          </span>
          <h2 className="text-[clamp(2rem,4vw,3.5rem)] font-bold text-white tracking-tight leading-[1.1]">
            Lo que logran los equipos con agentes autónomos
          </h2>
        </motion.div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          {items.map((t, i) => (
            <motion.div
              key={t.a}
              variants={scaleIn}
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true }}
              custom={i * 0.1}
              className="rounded-2xl p-8 flex flex-col"
              style={{
                background: "rgba(255,255,255,0.015)",
                border: "1px solid rgba(255,255,255,0.06)",
              }}
            >
              <p className="text-white/70 leading-relaxed flex-1 mb-6">
                &ldquo;{t.q}&rdquo;
              </p>
              <div
                className="pt-5 border-t"
                style={{ borderColor: "rgba(255,255,255,0.06)" }}
              >
                <div className="font-semibold text-white text-sm">{t.a}</div>
                <div className="text-xs text-neutral-500 mt-0.5">
                  {t.r}, {t.c}
                </div>
                <div
                  className="text-xs font-medium mt-3"
                  style={{ color: ACCENT }}
                >
                  {t.m}
                </div>
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </Section>
  );
}

/* ────────────────────────────────
   PRICING
──────────────────────────────── */
function Pricing() {
  const tiers = [
    {
      name: "Gratis",
      price: "$0",
      desc: "Para individuos y equipos pequeños",
      features: [
        "1 agente activo",
        "100 tareas mensuales",
        "Integraciones esenciales",
        "Soporte por comunidad",
      ],
      cta: "Crear cuenta",
      highlighted: false,
    },
    {
      name: "Pro",
      price: "$49",
      period: "/mes",
      desc: "Para equipos que necesitan automatización real",
      features: [
        "10 agentes activos",
        "Tareas ilimitadas",
        "Todas las integraciones",
        "OCR de documentos",
        "Flujos con condiciones",
        "Soporte prioritario",
      ],
      cta: "Comenzar prueba de 14 días",
      highlighted: true,
    },
    {
      name: "Enterprise",
      price: "Personalizado",
      desc: "Para organizaciones con control total",
      features: [
        "Agentes ilimitados",
        "Despliegue on-premise/VPC",
        "Auditoría completa y SSO",
        "SLA 99.99%",
        "Soporte dedicado 24/7",
      ],
      cta: "Hablar con ventas",
      highlighted: false,
    },
  ];

  return (
    <Section className="bg-[#0a0a0a] py-32 md:py-40" id="precios">
      <Spotlight className="inset-0" color="#ffffff" />
      <div className="relative z-10 max-w-6xl mx-auto px-6">
        <motion.div
          variants={fadeUp}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true }}
          className="max-w-2xl mb-20 text-center mx-auto"
        >
          <span className="text-xs font-semibold uppercase tracking-[0.2em] text-[#D4A853] mb-4 block">
            Precios
          </span>
          <h2 className="text-[clamp(2rem,4vw,3.5rem)] font-bold text-white tracking-tight leading-[1.1]">
            Empieza gratis. Escala cuando crezcas.
          </h2>
        </motion.div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-5 max-w-5xl mx-auto">
          {tiers.map((tier, i) => (
            <motion.div
              key={tier.name}
              variants={scaleIn}
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true }}
              custom={i * 0.1}
              className={`relative rounded-2xl p-8 flex flex-col ${
                tier.highlighted ? "md:-mt-4 md:mb-4" : ""
              }`}
              style={{
                background: tier.highlighted
                  ? `linear-gradient(180deg, ${ACCENT}08, rgba(255,255,255,0.01))`
                  : "rgba(255,255,255,0.015)",
                border: tier.highlighted
                  ? `1px solid ${ACCENT}30`
                  : "1px solid rgba(255,255,255,0.06)",
                boxShadow: tier.highlighted
                  ? `0 0 60px -20px ${ACCENT}20`
                  : "none",
              }}
            >
              {tier.highlighted && (
                <span
                  className="absolute -top-3 left-1/2 -translate-x-1/2 text-[10px] font-bold uppercase tracking-[0.15em] px-3 py-1 rounded-full"
                  style={{ background: ACCENT, color: "#000" }}
                >
                  Más popular
                </span>
              )}

              <div className="mb-6">
                <h3 className="text-lg font-semibold text-white mb-1">
                  {tier.name}
                </h3>
                <div className="flex items-baseline gap-1">
                  <span className="text-3xl font-bold text-white">
                    {tier.price}
                  </span>
                  {tier.period && (
                    <span className="text-sm text-neutral-500">
                      {tier.period}
                    </span>
                  )}
                </div>
                <p className="text-xs text-neutral-500 mt-2">{tier.desc}</p>
              </div>

              <ul className="space-y-3 mb-8 flex-1">
                {tier.features.map((f) => (
                  <li key={f} className="flex items-start gap-3 text-sm">
                    <Check
                      className="w-4 h-4 shrink-0 mt-0.5"
                      style={{ color: tier.highlighted ? ACCENT : "#666" }}
                    />
                    <span className="text-neutral-400">{f}</span>
                  </li>
                ))}
              </ul>

              <Link
                href="/register"
                className={`block text-center text-sm font-semibold py-3 rounded-xl transition-all duration-300 ${
                  tier.highlighted
                    ? "bg-white text-black hover:bg-neutral-200 hover:shadow-[0_0_30px_-5px_rgba(255,255,255,0.2)]"
                    : "border border-white/[0.08] text-white hover:bg-white/[0.03] hover:border-white/[0.12]"
                }`}
              >
                {tier.cta}
              </Link>
            </motion.div>
          ))}
        </div>
      </div>
    </Section>
  );
}

/* ────────────────────────────────
   FAQ
──────────────────────────────── */
function FAQSection() {
  const [openIndex, setOpenIndex] = useState<number | null>(null);

  const items = [
    {
      q: "¿OmniWorker es un chatbot?",
      a: "No. Los chatbots responden preguntas. Los agentes de OmniWorker ejecutan acciones: leen documentos, actualizan bases de datos, envían mensajes y completan flujos de trabajo sin intervención humana.",
    },
    {
      q: "¿Mis datos están seguros?",
      a: "OmniWorker se ejecuta localmente por defecto. Tus datos nunca salen de tu infraestructura. Usamos cifrado end-to-end y cumplimos con SOC 2, GDPR y estándares sectoriales.",
    },
    {
      q: "¿Necesito un equipo técnico?",
      a: "No. El 94% de nuestros usuarios configuran su primer agente sin escribir código. Describes la tarea en lenguaje natural y el sistema genera el flujo automáticamente.",
    },
    {
      q: "¿Con qué herramientas se integra?",
      a: "Más de 200 aplicaciones: Salesforce, HubSpot, Slack, Notion, Airtable, Google Workspace, Stripe, SAP, Shopify y bases de datos SQL/NoSQL. También ofrecemos API para integraciones personalizadas.",
    },
    {
      q: "¿Qué pasa si el agente comete un error?",
      a: "Los agentes operan con reglas de confianza configurables. Para transacciones críticas puedes exigir aprobación humana. Cada acción queda registrada en un trail de auditoría inmutable.",
    },
    {
      q: "¿Puedo cancelar en cualquier momento?",
      a: "Sí. No hay contratos de permanencia ni penalizaciones. Puedes cambiar de plan, escalar agentes o pausar tu suscripción desde el panel.",
    },
    {
      q: "¿Cuánto tiempo toma ver resultados?",
      a: "La mayoría despliega su primer agente en menos de 60 minutos y ve automatización real en las primeras 24 horas. Procesos complejos están automatizados en la primera semana.",
    },
  ];

  return (
    <Section className="bg-[#050505] py-32 md:py-40" id="faq">
      <div className="relative z-10 max-w-3xl mx-auto px-6">
        <motion.div
          variants={fadeUp}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true }}
          className="mb-16"
        >
          <span className="text-xs font-semibold uppercase tracking-[0.2em] text-[#D4A853] mb-4 block">
            Preguntas frecuentes
          </span>
          <h2 className="text-[clamp(2rem,4vw,3.5rem)] font-bold text-white tracking-tight leading-[1.1]">
            Todo lo que necesitas saber
          </h2>
        </motion.div>

        <div>
          {items.map((item, i) => (
            <motion.div
              key={i}
              variants={fadeUp}
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true }}
              custom={i * 0.05}
              className="border-b"
              style={{ borderColor: "rgba(255,255,255,0.06)" }}
            >
              <button
                onClick={() => setOpenIndex(openIndex === i ? null : i)}
                className="w-full py-6 flex items-start justify-between text-left gap-4 group cursor-pointer"
              >
                <span className="text-base font-medium text-white group-hover:text-neutral-300 transition-colors">
                  {item.q}
                </span>
                <span
                  className="text-xl text-neutral-600 shrink-0 mt-0.5 transition-all duration-300"
                  style={{
                    transform:
                      openIndex === i ? "rotate(45deg)" : "rotate(0deg)",
                  }}
                >
                  <Plus className="w-5 h-5" />
                </span>
              </button>
              <AnimatePresence initial={false}>
                {openIndex === i && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: "auto", opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
                    className="overflow-hidden"
                  >
                    <p className="pb-6 text-sm text-neutral-500 leading-relaxed max-w-2xl">
                      {item.a}
                    </p>
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>
          ))}
        </div>
      </div>
    </Section>
  );
}

/* ────────────────────────────────
   FINAL CTA
──────────────────────────────── */
function FinalCTA() {
  return (
    <Section className="bg-[#050505] py-32 md:py-40 relative overflow-hidden" id="cta">
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background: `radial-gradient(800px circle at 50% 50%, ${ACCENT}10, transparent 60%)`,
        }}
      />
      <div className="relative z-10 max-w-3xl mx-auto px-6 text-center">
        <motion.div
          variants={fadeUp}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true }}
        >
          <h2 className="text-[clamp(2rem,4vw,3.5rem)] font-bold text-white tracking-tight leading-[1.1]">
            Tu competencia ya está automatizando. Cada día que esperas cuesta dinero real.
          </h2>
        </motion.div>
        <motion.p
          variants={fadeUp}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true }}
          custom={0.1}
          className="mt-6 text-lg text-neutral-500 leading-relaxed max-w-xl mx-auto"
        >
          Únete a más de 10,000 equipos que operan con agentes autónomos.
          Despliega tu primer agente en menos de 60 segundos.
        </motion.p>
        <motion.div
          variants={fadeUp}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true }}
          custom={0.2}
          className="mt-10"
        >
          <Link
            href="/register"
            className="inline-flex items-center gap-2 px-8 py-4 rounded-xl bg-white text-black font-semibold text-base hover:bg-neutral-200 transition-all duration-300 hover:shadow-[0_0_50px_-10px_rgba(255,255,255,0.2)]"
          >
            Comenzar gratis — desplegar mi primer agente
            <ArrowRight className="w-5 h-5" />
          </Link>
        </motion.div>
        <motion.p
          variants={fadeUp}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true }}
          custom={0.3}
          className="mt-6 text-xs font-medium"
          style={{ color: ACCENT }}
        >
          Los primeros 500 usuarios Pro este mes reciben onboarding personalizado
        </motion.p>
      </div>
    </Section>
  );
}

/* ────────────────────────────────
   FOOTER
──────────────────────────────── */
function Footer() {
  return (
    <footer
      className="border-t py-16"
      style={{ background: BG, borderColor: "rgba(255,255,255,0.06)" }}
    >
      <div className="max-w-6xl mx-auto px-6">
        <div className="grid grid-cols-2 md:grid-cols-6 gap-10 mb-16">
          <div className="col-span-2">
            <Link href="/" className="flex items-center gap-2.5 mb-4">
              <div
                className="w-2 h-2 rounded-full"
                style={{ background: ACCENT }}
              />
              <span className="font-bold text-white tracking-tight text-lg">
                OmniWorker
              </span>
            </Link>
            <p className="text-sm text-neutral-400 leading-relaxed max-w-xs">
              Agentes autónomos de IA que ejecutan trabajo real. Se operan en tu
              infraestructura con privacidad total.
            </p>
          </div>

          {[
            {
              title: "Producto",
              links: ["Agentes", "Documentos", "Integraciones", "Precios"],
            },
            {
              title: "Casos de uso",
              links: ["Finanzas", "Soporte", "RRHH", "Operaciones"],
            },
            {
              title: "Recursos",
              links: ["Docs", "API", "Blog", "Estado"],
            },
            {
              title: "Compañía",
              links: ["Nosotros", "Carreras", "Contacto", "Legal"],
            },
          ].map((col) => (
            <div key={col.title}>
              <h4 className="text-sm font-semibold text-white mb-4">
                {col.title}
              </h4>
              <ul className="space-y-3">
                {col.links.map((l) => (
                  <li key={l}>
                    <a
                      href="#"
                      className="text-sm text-neutral-400 hover:text-white transition-colors duration-300"},{
                    >
                      {l}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="pt-8 border-t flex flex-col sm:flex-row items-center justify-between gap-4" style={{ borderColor: "rgba(255,255,255,0.06)" }}>
          <p className="text-sm text-neutral-700">
            © 2026 OmniWorker. Todos los derechos reservados.
          </p>
          <div className="flex items-center gap-6">
            {["GitHub", "X", "LinkedIn"].map((s) => (
              <a
                key={s}
                href="#"
                className="text-sm text-neutral-600 hover:text-white transition-colors duration-300"
              >
                {s}
              </a>
            ))}
          </div>
        </div>
      </div>
    </footer>
  );
}

/* ────────────────────────────────
   PAGE
──────────────────────────────── */
export default function Home() {
  return (
    <main className="min-h-screen" style={{ background: BG, color: TEXT }}>
      <Nav />
      <Hero />
      <Logos />
      <Problem />
      <Features />
      <HowItWorks />
      <Stats />
      <Testimonials />
      <Pricing />
      <FAQSection />
      <FinalCTA />
      <Footer />
    </main>
  );
}
