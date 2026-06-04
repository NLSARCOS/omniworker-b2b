#!/usr/bin/env python3
"""
SEO Agent — Flux Agent by Simplex Latam
========================================
Generates 3 landing pages + 2 blog articles per run.
Uses DataForSEO API for research, auto-commits to git.

Usage:
 python seo_agent.py --landing 3 --blog 2
 python seo_agent.py --dry-run
"""

import json
import os
import random
import re
import subprocess
import sys
from datetime import datetime
from pathlib import Path

import requests

# ─── Configuration ───
DATAFORSEO_AUTH = "bmVsc29uLnNhcmNvc0BzaW1wbGV4LmxhdDpkNzFkNTVmNzEwNGUyYTA0"
SERP_ENDPOINT = "https://api.dataforseo.com/v3/serp/google/organic/live/advanced"
KEYWORDS_ENDPOINT = "https://api.dataforseo.com/v3/keywords_data/google/search_volume/live"

REPO_ROOT = Path("/Users/nelsonmini/.flux-agent/flux-agent-agent/flux-agent-b2b/flux-agent-saas")
CONTENT_DIR = REPO_ROOT / "content" / "blog"
APP_DIR = REPO_ROOT / "src" / "app"
SITE_URL = "https://flux.simplex.lat"

# ─── Keyword Pools ───
LANDING_KEYWORDS = [
    # ── Core: fuerza laboral autónoma ──
    "empleado digital autónomo",
    "fuerza laboral autónoma IA",
    "trabajador digital 24/7",
    "empleados digitales para empresas",
    "fuerza laboral artificial LATAM",
    "agente autónomo de ventas",
    "agente autónomo de cobranzas",
    "agente autónomo de marketing",
    "agente autónomo de soporte",
    "digital employee platform",
    # ── Casos de uso con framing autónomo ──
    "agente de ventas automatizado",
    "automatización de cobranzas",
    "automatización de campañas marketing",
    "lead scoring automático",
    "CRM con inteligencia artificial",
    "automatización de onboarding",
    "gestión de turnos automatizada",
    "seguimiento de clientes automático",
    "automatización de facturación",
    "automatización de inventario",
]

BLOG_KEYWORDS = [
    # ── Core: fuerza laboral autónoma ──
    "empleado digital autónomo",
    "fuerza laboral autónoma IA",
    "trabajador digital 24/7",
    "empleados digitales para empresas",
    "fuerza laboral artificial",
    "agentes autónomos empresa",
    "empleados digitales IA",
    "digital employee vs chatbot",
    "reemplazar empleados repetitivos IA",
    "trabajo autónomo con IA",
    # ── Casos de uso ──
    "automatización de procesos",
    "atención al cliente automatizada",
    "automatización cobranzas",
    "automatización RRHH",
    "CRM automatizado LATAM",
    "seguimiento prospectos automático",
    "automatización WhatsApp negocio",
    "recuperación carritos abandonados",
    "gestión turnos médica",
]

BLOG_TEMPLATES = [
    "cómo {kw} reemplaza puestos repetitivos sin despedir a nadie",
    "guía completa de {kw} para empresas latinoamericanas en 2026",
    "{kw}: por qué las empresas que no lo adoptan pierden competitividad",
    "5 señales de que tu empresa necesita {kw} como fuerza laboral",
    "errores comunes al implementar {kw} y cómo evitarlos",
    "{kw} para PYMES: mitos y realidades en LATAM",
    "el futuro de {kw}: empleados digitales que trabajan 24/7",
    "roi de {kw}: cuánto ahorrás reemplazando tareas manuales",
    "{kw} vs contratar personal: comparativa real de costos",
    "caso de éxito: cómo {kw} aumentó la eficiencia un 300%",
]

LOCATIONS = [
    (2840, "Mexico"), (2040, "Colombia"), (2060, "Chile"),
    (2096, "Peru"), (2158, "Venezuela"), (2184, "Uruguay"),
    (2100, "Guatemala"), (2826, "Spain"),
]


# ─── Helpers ───

def slugify(text: str, max_len: int = 60) -> str:
    s = text.lower()
    for a, b in [('áàä','a'),('éèë','e'),('íìï','i'),('óòö','o'),('úùü','u'),('ñ','n')]:
        s = re.sub(f'[{a}]', b, s)
    s = re.sub(r'[^a-z0-9]+', '-', s).strip('-')
    return s[:max_len]


def escape_tsx(text: str) -> str:
    """Escape text for safe insertion into TSX string content."""
    return text.replace('\\', '\\\\').replace('`', '\\`').replace('${', '\\${')


# ─── DataForSEO ───

def serp_research(keyword: str, location_code: int = 2840) -> dict:
    payload = [{
        "keyword": keyword,
        "location_code": location_code,
        "language_code": "es",
        "depth": 10,
        "limit": 10,
    }]
    headers = {
        "Authorization": f"Basic {DATAFORSEO_AUTH}",
        "Content-Type": "application/json",
    }
    try:
        resp = requests.post(SERP_ENDPOINT, json=payload, headers=headers, timeout=30)
        data = resp.json()
        if data.get("status_code") == 20000:
            tasks = data.get("tasks", [])
            if tasks and tasks[0].get("result"):
                items = tasks[0]["result"][0].get("items", [])
                organic = [i for i in items if i.get("type") == "organic"]
                return {
                    "keyword": keyword,
                    "results": len(organic),
                    "top_titles": [r.get("title", "") for r in organic[:5]],
                }
    except Exception as e:
        print(f" [WARN] SERP failed for '{keyword}': {e}")
    return {"keyword": keyword, "results": 0, "top_titles": []}


def get_keyword_volume(keywords: list[str]) -> dict:
    payload = [{"keywords": keywords, "location_code": 2840, "language_code": "es"}]
    headers = {
        "Authorization": f"Basic {DATAFORSEO_AUTH}",
        "Content-Type": "application/json",
    }
    try:
        resp = requests.post(KEYWORDS_ENDPOINT, json=payload, headers=headers, timeout=30)
        data = resp.json()
        if data.get("status_code") == 20000:
            tasks = data.get("tasks", [])
            if tasks and tasks[0].get("result"):
                return {r["keyword"]: r.get("search_volume", 0) for r in tasks[0]["result"]}
    except Exception as e:
        print(f" [WARN] Volume failed: {e}")
    return {}


# ─── Landing Page Builder ───

def make_landing_page(keyword: str, serp_data: dict) -> dict:
    title = keyword.title()
    slug = slugify(keyword)
    description = f"Descubrí cómo {keyword} puede transformar tu empresa. Solución inteligente para automatizar procesos y escalar sin contratar. By Simplex Latam."
    content = build_landing_tsx(keyword, title, description, slug)
    return {"type": "landing", "keyword": keyword, "title": title, "slug": slug, "description": description, "content": content}


def build_landing_tsx(keyword: str, title: str, description: str, slug: str) -> str:
    """Build landing page TSX content using line-by-line assembly."""
    random.seed(hash(keyword))

    all_features = [
        ("🧠", "IA avanzada", "Procesamiento inteligente"),
        ("⚡", "Resultados en 14 días", "Implementación express"),
        ("🔗", "Integración total", "CRM, WhatsApp, y más"),
        ("📊", "Analytics en tiempo real", "Métricas que importan"),
        ("🎯", "ROI garantizado", "800% en el primer trimestre"),
        ("🔄", "Escalado automático", "Crece sin límites"),
        ("📱", "Multi-canal", "Web, WhatsApp, mobile"),
        ("🔒", "Seguridad empresarial", "Datos protegidos"),
    ]
    random.shuffle(all_features)
    features = all_features[:random.randint(4, 6)]

    stats = [
        {"num": "85%", "label": "Tareas automatizadas"},
        {"num": "24/7", "label": "Disponibilidad total"},
        {"num": "1/10", "label": "Costo vs empleado"},
        {"num": "<30s", "label": "Tiempo respuesta"},
    ]

    steps = [
        {"n": "01", "title": "Diagnóstico gratuito", "desc": f"Analizamos tu proceso de {keyword} y detectamos oportunidades."},
        {"n": "02", "title": "Configuración express", "desc": "Implementamos la solución conectada a tus herramientas en 14 días."},
        {"n": "03", "title": "Resultados medibles", "desc": "Monitoreá el impacto en tiempo real con soporte dedicado."},
    ]

    testimonials = [
        {
            "quote": f"Implementar {keyword} con Flux Agent cambió nuestra operación. Ahorramos 40hs semanales.",
            "name": "María González",
            "role": "CEO · TechStart MX",
            "result": "↓ 40hs/semana",
        },
        {
            "quote": "El ROI fue inmediato. En el primer mes ya habíamos recuperado la inversión.",
            "name": "Carlos Ruiz",
            "role": "Director · InnovateAR",
            "result": "↑ 300% ROI",
        },
    ]

    # Build TSX line by line to avoid f-string issues
    lines = []
    lines.append('import Link from "next/link";')
    lines.append('import type { Metadata } from "next";')
    lines.append("")
    lines.append("export const metadata: Metadata = {")
    lines.append(f'  title: "{escape_tsx(title)} — Flux Agent",')
    lines.append(f'  description: "{escape_tsx(description)}",')
    lines.append(f'  keywords: "{escape_tsx(keyword)}, automatización, IA, LATAM",')
    lines.append("  openGraph: {")
    lines.append(f'    title: "{escape_tsx(title)} — Flux Agent",')
    lines.append(f'    description: "{escape_tsx(description)}",')
    lines.append(f'    url: "{SITE_URL}/{slug}",')
    lines.append('    siteName: "Flux Agent",')
    lines.append('    locale: "es_LA",')
    lines.append('    type: "website",')
    lines.append("  },")
    lines.append("};")
    lines.append("")
    lines.append(f"const FEATURES = {json.dumps(features, ensure_ascii=False)};")
    lines.append(f"const STATS = {json.dumps(stats, ensure_ascii=False)};")
    lines.append(f"const STEPS = {json.dumps(steps, ensure_ascii=False)};")
    lines.append(f"const TESTIMONIALS = {json.dumps(testimonials, ensure_ascii=False)};")
    lines.append("")
    lines.append("export default function Page() {")
    lines.append("  return (")
    lines.append("    <>")

    # JSON-LD
    lines.append('      <script')
    lines.append('        type="application/ld+json"')
    lines.append('        dangerouslySetInnerHTML={{ __html: JSON.stringify({')
    lines.append('          "@context": "https://schema.org",')
    lines.append('          "@type": "SoftwareApplication",')
    lines.append(f'          "name": "{escape_tsx(title)} — Flux Agent",')
    lines.append(f'          "description": "{escape_tsx(description)}",')
    lines.append('          "provider": { "@type": "Organization", "name": "Simplex Latam" },')
    lines.append(f'          "url": "{SITE_URL}/{slug}",')
    lines.append('          "applicationCategory": "BusinessApplication",')
    lines.append('          "operatingSystem": "Web",')
    lines.append('          "offers": { "@type": "Offer", "price": "0", "priceCurrency": "USD" },')
    lines.append("        }) }}")
    lines.append("      />")

    # Main container
    lines.append('      <div style={{ background: "var(--paper)", color: "var(--ink)", fontFamily: "\'Inter\', sans-serif", fontSize: 16, lineHeight: 1.65 }}>')

    # NAV
    lines.append('        {/* NAV */}')
    lines.append('        <nav style={{ position: "sticky", top: 0, zIndex: 100, background: "var(--paper)", borderBottom: `3px double var(--ink)`, padding: "0 5vw" }}>')
    lines.append('          <div style={{ maxWidth: 1280, margin: "0 auto", display: "flex", alignItems: "center", justifyContent: "space-between", height: 68 }}>')
    lines.append('            <a href="/" style={{ textDecoration: "none", display: "flex", alignItems: "center" }}>')
    lines.append('              <img src="/logo.svg" alt="Flux Agent" style={{ height: 28 }} />')
    lines.append('            </a>')
    lines.append('            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>')
    lines.append('              <a href="/#problema" style={{ fontSize: 13.5, fontWeight: 500, color: "var(--muted)", textDecoration: "none", padding: "6px 12px", borderRadius: 6 }}>El problema</a>')
    lines.append('              <a href="/#casos" style={{ fontSize: 13.5, fontWeight: 500, color: "var(--muted)", textDecoration: "none", padding: "6px 12px", borderRadius: 6 }}>Casos de uso</a>')
    lines.append('              <a href="/#como" style={{ fontSize: 13.5, fontWeight: 500, color: "var(--muted)", textDecoration: "none", padding: "6px 12px", borderRadius: 6 }}>Cómo funciona</a>')
    lines.append('              <div style={{ width: 1, height: 28, background: "var(--rule)", margin: "0 8px" }} />')
    lines.append('              <Link href="/login" style={{ fontSize: 13.5, fontWeight: 600, color: "var(--ink)", textDecoration: "none", padding: "9px 18px", border: `1.5px solid var(--rule)`, borderRadius: 6 }}>Iniciar sesión</Link>')
    lines.append('              <Link href="/register" style={{ fontSize: 13.5, fontWeight: 600, color: "var(--ink)", textDecoration: "none", padding: "9px 20px", background: "var(--neon)", borderRadius: 6, display: "inline-flex", alignItems: "center", gap: 6 }}>Registrarse →</Link>')
    lines.append('            </div>')
    lines.append('          </div>')
    lines.append('        </nav>')

    # TOPBAR
    lines.append('        {/* TOPBAR */}')
    lines.append('        <div style={{ maxWidth: 1280, margin: "0 auto", padding: "0 5vw" }}>')
    lines.append('          <div style={{ borderBottom: `1px solid var(--rule)`, padding: "10px 0", display: "flex", justifyContent: "space-between", alignItems: "center" }}>')
    lines.append('            <span style={{ fontFamily: "\'DM Mono\', monospace", fontSize: 11, fontWeight: 400, letterSpacing: "0.14em", textTransform: "uppercase", color: "var(--muted)" }}>By Simplex Latam · 2026</span>')
    lines.append('            <span style={{ fontFamily: "\'DM Mono\', monospace", fontSize: 11, fontWeight: 500, letterSpacing: "0.14em", textTransform: "uppercase", color: "var(--neon-dim)", display: "flex", alignItems: "center", gap: 6 }}>')
    lines.append('              <span style={{ width: 7, height: 7, borderRadius: "50%", background: "var(--neon)", display: "inline-block", animation: "blink 2s ease-in-out infinite" }} />')
    lines.append('              Asistentes activos ahora mismo')
    lines.append('            </span>')
    lines.append('          </div>')
    lines.append('        </div>')

    # HERO
    lines.append('        {/* HERO */}')
    lines.append('        <div style={{ maxWidth: 1280, margin: "0 auto", padding: "72px 5vw 88px", display: "grid", gridTemplateColumns: "1fr 360px", gap: 80, alignItems: "start" }}>')
    lines.append('          <div>')
    lines.append(f'            <div style={{{{ fontFamily: "\'DM Mono\', monospace", fontSize: 11, fontWeight: 500, letterSpacing: "0.2em", textTransform: "uppercase", color: "var(--neon-dim)", background: "var(--neon-pale)", padding: "8px 14px", display: "inline-block", marginBottom: 28, borderLeft: `3px solid var(--neon)` }}}}>')
    lines.append(f'              {escape_tsx(keyword.title())} · By Simplex Latam')
    lines.append('            </div>')
    lines.append(f'            <h1 style={{{{ fontFamily: "\'Fraunces\', serif", fontWeight: 500, fontSize: "clamp(52px, 6vw, 88px)", lineHeight: 0.93, letterSpacing: "-0.04em", color: "var(--ink)", marginBottom: 32 }}}}>{escape_tsx(title)}</h1>')
    lines.append(f'            <p style={{{{ fontSize: 20, fontWeight: 400, lineHeight: 1.6, color: "var(--ink-soft)", maxWidth: 600, marginBottom: 48, borderLeft: `3px solid var(--rule)`, paddingLeft: 20 }}}}>')
    lines.append(f'              {escape_tsx(description)}')
    lines.append('            </p>')
    lines.append('            <Link href="/register" style={{ display: "inline-flex", alignItems: "center", gap: 10, background: "var(--neon)", color: "var(--paper)", padding: "18px 36px", borderRadius: 8, fontWeight: 600, fontSize: 17, textDecoration: "none" }}>')
    lines.append('              Configurá tu asistente →')
    lines.append('              <span style={{ fontSize: 13, opacity: 0.7 }}>14 días gratis</span>')
    lines.append('            </Link>')
    lines.append('          </div>')

    # SIDEBAR
    lines.append('          <aside style={{ border: "2px solid var(--ink)", borderRadius: 2, background: "var(--paper)", padding: 28, position: "sticky", top: 100 }}>')
    lines.append('            <div style={{ fontFamily: "\'DM Mono\', monospace", fontSize: 10, fontWeight: 500, letterSpacing: "0.18em", textTransform: "uppercase", color: "var(--muted)", marginBottom: 18, borderBottom: "1px solid var(--rule)", paddingBottom: 10 }}>')
    lines.append('              métricas reales')
    lines.append('            </div>')
    lines.append('            <div style={{ display: "grid", gap: 18 }}>')
    lines.append('              {STATS.map((s) => (')
    lines.append('                <div key={s.num} style={{ display: "grid", gridTemplateColumns: "70px 1fr", gap: 12, alignItems: "start" }}>')
    lines.append('                  <div style={{ fontFamily: "\'Fraunces\', serif", fontSize: 32, fontWeight: 600, color: "var(--ink)", lineHeight: 1 }}>{s.num}</div>')
    lines.append('                  <div style={{ fontSize: 13, color: "var(--ink-soft)", lineHeight: 1.4, paddingTop: 6 }}>{s.label}</div>')
    lines.append('                </div>')
    lines.append('              ))}')
    lines.append('            </div>')
    lines.append('            <div style={{ border: "1px solid var(--rule)", borderRadius: 4, padding: "16px 18px", marginTop: 22, background: "var(--neon-pale)" }}>')
    lines.append('              <div style={{ fontSize: 12, fontWeight: 600, letterSpacing: "0.04em", color: "var(--ink)", marginBottom: 6 }}>¿Listo para automatizar?</div>')
    lines.append('              <div style={{ fontSize: 13, color: "var(--ink-soft)", marginBottom: 14 }}>Empresas como la tuya ahorran 40-70% en tareas repetitivas.</div>')
    lines.append('              <Link href="/register" style={{ display: "block", textAlign: "center", background: "var(--neon)", color: "var(--paper)", padding: "10px 16px", borderRadius: 6, fontWeight: 600, fontSize: 14, textDecoration: "none" }}>Empezar ahora</Link>')
    lines.append('            </div>')
    lines.append('          </aside>')
    lines.append('        </div>')

    # FEATURES
    lines.append('        {/* FEATURES */}')
    lines.append('        <div style={{ background: "var(--ink)", color: "var(--paper)", padding: "80px 5vw" }}>')
    lines.append('          <div style={{ maxWidth: 1280, margin: "0 auto" }}>')
    lines.append('            <div style={{ fontFamily: "\'DM Mono\', monospace", fontSize: 11, fontWeight: 500, letterSpacing: "0.2em", textTransform: "uppercase", color: "var(--neon)", marginBottom: 20 }}>características</div>')
    lines.append(f'            <h2 style={{{{ fontFamily: "\'Fraunces\', serif", fontSize: "clamp(32px, 4vw, 52px)", fontWeight: 500, lineHeight: 1.1, marginBottom: 60, maxWidth: 900 }}}}>Todo lo que necesitás para automatizar {escape_tsx(keyword)}.</h2>')
    lines.append('            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 2 }}>')
    lines.append('              {FEATURES.map((f) => (')
    lines.append('                <div key={f.name} style={{ background: "var(--paper)", color: "var(--ink)", padding: "32px 28px", borderRadius: 2 }}>')
    lines.append('                  <div style={{ fontSize: 28, marginBottom: 16 }}>{f.icon}</div>')
    lines.append('                  <div style={{ fontFamily: "\'Fraunces\', serif", fontSize: 22, fontWeight: 600, marginBottom: 6 }}>{f.name}</div>')
    lines.append('                  <div style={{ fontFamily: "\'DM Mono\', monospace", fontSize: 11, fontWeight: 400, textTransform: "uppercase", letterSpacing: "0.14em", opacity: 0.6 }}>{f.dept}</div>')
    lines.append('                </div>')
    lines.append('              ))}')
    lines.append('            </div>')
    lines.append('          </div>')
    lines.append('        </div>')

    # STEPS
    lines.append('        {/* STEPS */}')
    lines.append('        <div style={{ background: "var(--paper)", padding: "80px 5vw" }}>')
    lines.append('          <div style={{ maxWidth: 1000, margin: "0 auto" }}>')
    lines.append('            <div style={{ fontFamily: "\'DM Mono\', monospace", fontSize: 11, fontWeight: 500, letterSpacing: "0.2em", textTransform: "uppercase", color: "var(--neon-dim)", marginBottom: 20 }}>cómo funciona</div>')
    lines.append('            <h2 style={{ fontFamily: "\'Fraunces\', serif", fontSize: "clamp(28px, 3.5vw, 44px)", fontWeight: 500, lineHeight: 1.15, marginBottom: 60 }}>En 3 pasos, tu equipo empieza a trabajar 4x más rápido.</h2>')
    lines.append('            <div style={{ display: "grid", gap: 0 }}>')
    lines.append('              {STEPS.map((s) => (')
    lines.append('                <div key={s.n} style={{ display: "grid", gridTemplateColumns: "120px 1fr", gap: 32, padding: "36px 0", borderBottom: "1px solid var(--rule)" }}>')
    lines.append('                  <div style={{ fontFamily: "\'Fraunces\', serif", fontSize: 72, fontWeight: 600, color: "var(--neon-dim)", lineHeight: 1 }}>{s.n}</div>')
    lines.append('                  <div>')
    lines.append('                    <div style={{ fontFamily: "\'Fraunces\', serif", fontSize: 26, fontWeight: 600, marginBottom: 10, color: "var(--ink)" }}>{s.title}</div>')
    lines.append('                    <div style={{ fontSize: 16, color: "var(--ink-soft)", lineHeight: 1.6, maxWidth: 560 }}>{s.desc}</div>')
    lines.append('                  </div>')
    lines.append('                </div>')
    lines.append('              ))}')
    lines.append('            </div>')
    lines.append('          </div>')
    lines.append('        </div>')

    # TESTIMONIALS
    lines.append('        {/* TESTIMONIALS */}')
    lines.append('        <div style={{ background: "var(--rule)", padding: "80px 5vw" }}>')
    lines.append('          <div style={{ maxWidth: 1200, margin: "0 auto" }}>')
    lines.append('            <div style={{ fontFamily: "\'DM Mono\', monospace", fontSize: 11, fontWeight: 500, letterSpacing: "0.2em", textTransform: "uppercase", color: "var(--neon-dim)", marginBottom: 20 }}>testimonios</div>')
    lines.append('            <h2 style={{ fontFamily: "\'Fraunces\', serif", fontSize: "clamp(28px, 3.5vw, 44px)", fontWeight: 500, lineHeight: 1.15, marginBottom: 48 }}>Empresas que ya automatizaron con Flux Agent.</h2>')
    lines.append('            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(340px, 1fr))", gap: 24 }}>')
    lines.append('              {TESTIMONIALS.map((t, i) => (')
    lines.append('                <div key={i} style={{ background: "var(--paper)", border: "2px solid var(--ink)", borderRadius: 2, padding: 32, display: "flex", flexDirection: "column", justifyContent: "space-between" }}>')
    lines.append('                  <div>')
    lines.append('                    <div style={{ fontFamily: "\'Fraunces\', serif", fontSize: 20, fontWeight: 500, lineHeight: 1.5, marginBottom: 24 }}>"{t.quote}"</div>')
    lines.append('                  </div>')
    lines.append('                  <div style={{ borderTop: "1px solid var(--rule)", paddingTop: 18, display: "flex", justifyContent: "space-between", alignItems: "center" }}>')
    lines.append('                    <div>')
    lines.append('                      <div style={{ fontWeight: 600, fontSize: 14 }}>{t.name}</div>')
    lines.append('                      <div style={{ fontSize: 12, color: "var(--muted)" }}>{t.role}</div>')
    lines.append('                    </div>')
    lines.append('                    <div style={{ fontFamily: "\'DM Mono\', monospace", fontSize: 11, fontWeight: 600, color: "var(--neon-dim)", textTransform: "uppercase", letterSpacing: "0.06em" }}>{t.result}</div>')
    lines.append('                  </div>')
    lines.append('                </div>')
    lines.append('              ))}')
    lines.append('            </div>')
    lines.append('          </div>')
    lines.append('        </div>')

    # CTA FINAL
    lines.append('        {/* CTA FINAL */}')
    lines.append('        <div style={{ background: "var(--neon)", padding: "80px 5vw", textAlign: "center" }}>')
    lines.append('          <div style={{ maxWidth: 800, margin: "0 auto" }}>')
    lines.append(f'            <h2 style={{{{ fontFamily: "\'Fraunces\', serif", fontSize: "clamp(36px, 5vw, 64px)", fontWeight: 600, lineHeight: 1.05, marginBottom: 24, color: "var(--paper)" }}}}>¿Listo para automatizar {escape_tsx(keyword)}?</h2>')
    lines.append('            <p style={{ fontSize: 18, color: "var(--paper)", opacity: 0.85, marginBottom: 40 }}>Configurá tu asistente en 14 días. Resultados medibles desde la semana 1.</p>')
    lines.append('            <Link href="/register" style={{ display: "inline-flex", alignItems: "center", gap: 10, background: "var(--paper)", color: "var(--neon)", padding: "18px 36px", borderRadius: 8, fontWeight: 700, fontSize: 17, textDecoration: "none" }}>')
    lines.append('              Empezar ahora →')
    lines.append('            </Link>')
    lines.append('          </div>')
    lines.append('        </div>')

    # FOOTER
    lines.append('        {/* FOOTER */}')
    lines.append('        <footer style={{ background: "var(--ink)", color: "var(--paper)", padding: "40px 5vw" }}>')
    lines.append('          <div style={{ maxWidth: 1280, margin: "0 auto", display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 20 }}>')
    lines.append('            <div style={{ fontFamily: "\'Fraunces\', serif", fontSize: 22, fontWeight: 600 }}>Flux Agent</div>')
    lines.append('            <div style={{ fontFamily: "\'DM Mono\', monospace", fontSize: 11, letterSpacing: "0.1em", opacity: 0.5 }}>By Simplex Latam · 2026</div>')
    lines.append('          </div>')
    lines.append('        </footer>')
    lines.append('      </div>')
    lines.append('    </>')
    lines.append('  );')
    lines.append('}')
    lines.append('')

    return "\n".join(lines)


# ─── Blog Generation ───

def generate_blog_article(keyword: str, serp_data: dict) -> dict:
    template = random.choice(BLOG_TEMPLATES)
    title = template.format(kw=keyword.capitalize())
    slug = slugify(title)
    description = f"Descubrí cómo {keyword} puede ayudar a tu empresa. Guía práctica para LATAM. By Simplex Latam."

    sections = []
    sections.append(f"## ¿Qué es {keyword} y por qué importa en 2026?")
    sections.append(f"{keyword.capitalize()} se ha convertido en una prioridad para empresas latinoamericanas que buscan escalar sin aumentar nómina. No hablamos de un chatbot más: hablamos de un empleado digital autónomo que trabaja 24/7 sin enfermarse ni tomar vacaciones.")
    sections.append(f"## El problema que resuelve {keyword}")
    sections.append(f"Las empresas enfrentan un desafío común: crecer sin que los costos crezcan en la misma proporción. Contratar más gente no escala. {keyword.capitalize()} despliega una fuerza laboral autónoma que cubre los huecos sin onboarding, sin capacitación, sin costo fijo.")
    sections.append("## Cómo funciona en la práctica")
    sections.append(f"Flux Agent no es un asistente: es un empleado digital. Trabaja de forma autónoma, toma decisiones, ejecuta procesos completos de punta a punta. Con {keyword}, configurás un agente que opera sin supervisión constante.")
    sections.append("## Resultados esperados")
    sections.append("- Reducción del 40-70% en tareas repetitivas")
    sections.append("- ROI de 800% en el primer trimestre")
    sections.append("- Implementación en solo 14 días — sin período de capacitación")
    sections.append("- 0 días de vacaciones, 0 ausentismo")
    sections.append("## Pasos para implementar")
    sections.append("1. Diagnosticá tu operación y detectá tareas repetitivas")
    sections.append("2. Conectá tus herramientas (WhatsApp, CRM, facturación, etc.)")
    sections.append("3. Desplegá tu empleado digital autónomo")
    sections.append("4. Monitoreá resultados desde el primer día")
    sections.append("## Conclusión")
    sections.append(f"{keyword.capitalize()} no es el futuro, es el presente. Flux Agent by Simplex Latam despliega fuerza laboral autónoma en 14 días, con garantía de 60 días. Sin chatbots. Sin asistentes. Empleados digitales de verdad.")
    sections.append("---")
    sections.append(f"*Escrito por Flux Agent · By Simplex Latam · {datetime.now().strftime('%B %Y')}*")

    body = "\n\n".join(sections)

    return {
        "type": "blog",
        "keyword": keyword,
        "title": title,
        "slug": slug,
        "description": description,
        "body": body,
    }


def write_blog(article: dict) -> Path:
    CONTENT_DIR.mkdir(parents=True, exist_ok=True)
    filepath = CONTENT_DIR / f"{article['slug']}.md"
    front = f"""---
title: "{article['title']}"
description: "{article['description']}"
keywords: "{article['keyword']}"
author: "Flux Agent"
date: "{datetime.now().strftime('%Y-%m-%d')}"
slug: "{article['slug']}"
og_image: "/og-blog.jpg"
---

# {article['title']}

{article['body']}
"""
    filepath.write_text(front, encoding="utf-8")
    return filepath


def write_landing(page: dict) -> Path:
    page_dir = APP_DIR / page['slug']
    page_dir.mkdir(parents=True, exist_ok=True)
    filepath = page_dir / "page.tsx"
    filepath.write_text(page['content'], encoding="utf-8")
    return filepath


# ─── Git ───

def git_commit(files: list[Path], msg: str):
    repo = REPO_ROOT
    subprocess.run(["git", "add"] + [str(f) for f in files], cwd=repo, capture_output=True)
    subprocess.run(["git", "commit", "-m", msg], cwd=repo, capture_output=True)
    r = subprocess.run(["git", "push", "origin", "master"], cwd=repo, capture_output=True, text=True)
    if r.returncode != 0:
        print(f" [ERROR] Push failed: {r.stderr[:200]}")
    else:
        print(f" [OK] Pushed to origin/master")


# ─── Tracking ───

def used_landing_keys() -> set:
    used = set()
    for f in APP_DIR.glob("*/page.tsx"):
        if f.parent.name in ("admin", "dashboard", "login", "register", "blog", "components"):
            continue
        try:
            txt = f.read_text()
            m = re.search(r'keywords:\s*"([^"]+)"', txt)
            if m:
                used.update(m.group(1).lower().split(", "))
        except Exception:
            pass
    return used


def used_blog_keys() -> set:
    used = set()
    for f in CONTENT_DIR.glob("*.md"):
        try:
            txt = f.read_text()
            m = re.search(r'keywords:\s*"([^"]+)"', txt)
            if m:
                used.update(m.group(1).lower().split(", "))
        except Exception:
            pass
    return used


# ─── Pipeline ───

def run(count_landing: int = 3, count_blog: int = 2, dry_run: bool = False):
    print(f"🤖 Flux Agent SEO Pipeline — {datetime.now().strftime('%Y-%m-%d %H:%M')}")
    print(f" Mode: {'DRY RUN' if dry_run else 'LIVE'} | {count_landing} landing + {count_blog} blog\n")

    committed = []
    lang = random.choice(LOCATIONS)[0]

    # ── Volume research for ALL keywords first ──
    all_keywords = list(set(LANDING_KEYWORDS + BLOG_KEYWORDS))
    print(f"📊 Volume research ({len(all_keywords)} unique keywords)...")
    all_vols = get_keyword_volume(all_keywords) if not dry_run else {}
    # Sort: highest volume first (unknowns at the end)
    def vol_sort(kw):
        v = all_vols.get(kw, 0)
        return -v if isinstance(v, int) else 0

    # LANDINGS — pick highest-volume unused keywords
    avail_land = [k for k in LANDING_KEYWORDS if k not in used_landing_keys()]
    if not avail_land:
        avail_land = LANDING_KEYWORDS[:]
    avail_land.sort(key=vol_sort)
    picked_land = avail_land[:count_landing]

    for i, kw in enumerate(picked_land):
        vol = all_vols.get(kw, "N/A")
        print(f"[LANDING {i+1}/{count_landing}] {kw} | Vol: {vol}")
        serp = serp_research(kw, location_code=lang)
        print(f"   SERP: {serp['results']} results")
        page = make_landing_page(kw, serp)
        print(f"   → /{page['slug']}")
        if dry_run:
            print(f"   [DRY RUN] src/app/{page['slug']}/page.tsx")
            continue
        fp = write_landing(page)
        committed.append(fp)
        print(f"   ✅ {fp.stat().st_size:,} bytes")

    print()

    # BLOGS — pick highest-volume unused keywords
    avail_blog = [k for k in BLOG_KEYWORDS if k not in used_blog_keys()]
    if not avail_blog:
        avail_blog = BLOG_KEYWORDS[:]
    avail_blog.sort(key=vol_sort)
    blog_kws = avail_blog[:count_blog]

    for i, kw in enumerate(blog_kws):
        vol = all_vols.get(kw, "N/A")
        print(f"\n[BLOG {i+1}/{count_blog}] {kw} | Vol: {vol}")
        serp = serp_research(kw, location_code=lang)
        print(f"   SERP: {serp['results']} results")
        art = generate_blog_article(kw, serp)
        print(f"   → {art['title']}")
        if dry_run:
            print(f"   [DRY RUN] content/blog/{art['slug']}.md")
            continue
        fp = write_blog(art)
        committed.append(fp)
        print(f"   ✅ {fp.stat().st_size:,} bytes")

    # COMMIT
    if committed and not dry_run:
        msg = f"seo: {len(committed)} pieces ({count_landing} landing + {count_blog} blog)"
        git_commit(committed, msg)
        print(f"\n✅ Done! {len(committed)} files pushed.")
    elif dry_run:
        print(f"\n✅ DRY RUN — {count_landing + count_blog} pieces would be generated")
    else:
        print(f"\n⚠️ No new content (all keywords used)")


if __name__ == "__main__":
    import argparse
    p = argparse.ArgumentParser()
    p.add_argument("--landing", type=int, default=3)
    p.add_argument("--blog", type=int, default=2)
    p.add_argument("--dry-run", action="store_true")
    a = p.parse_args()
    run(count_landing=a.landing, count_blog=a.blog, dry_run=a.dry_run)
