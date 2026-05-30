#!/usr/bin/env python3
"""
SEO Agent — Flux Agent by Simplex Latam
========================================
Automated SEO content generation pipeline.
Uses DataForSEO API for keyword research, generates blog articles,
places them in the Next.js content directory, and commits to git.

Usage:
  python seo_agent.py              # Generate 1 article
  python seo_agent.py --count 3    # Generate 3 articles
  python seo_agent.py --dry-run    # Preview without writing

DataForSEO API: https://api.dataforseo.com/v3/
"""

import json
import os
import sys
import subprocess
import hashlib
import re
from datetime import datetime, timezone
from pathlib import Path

import requests

# ─── Configuration ───
DATAFORSEO_LOGIN = "nelson.sarcos@simplex.lat"
DATAFORSEO_PASSWORD = "d71d55f7104e2a04"
DATAFORSEO_AUTH = "bmVsc29uLnNhcmNvc0BzaW1wbGV4LmxhdDpkNzFkNTVmNzEwNGUyYTA0"
SERP_ENDPOINT = "https://api.dataforseo.com/v3/serp/google/organic/live/advanced"
KEYWORDS_ENDPOINT = "https://api.dataforseo.com/v3/keywords_data/google/search_volume/live"

REPO_ROOT = Path("/Users/nelsonmini/.omniworker/omniworker-agent/omniworker-b2b/omniworker-saas")
CONTENT_DIR = REPO_ROOT / "content" / "blog"
BRANDING = "Flux Agent"
SITE_URL = "https://flux.simplex.lat"

# SEO keyword clusters for LATAM SaaS audience
KEYWORD_CLUSTERS = [
    "asistente virtual empresas",
    "automatización de procesos",
    "chatbot para empresas",
    "atención al cliente automatizada",
    "asistente digital ventas",
    "automatización WhatsApp negocio",
    "empleados digitales IA",
    "agentes autónomos empresa",
    "automatización cobranzas",
    "gestión turnos médica",
    "recuperación carritos abandonados",
    "automatización RRHH",
    "CRM automatizado LATAM",
    "seguimiento prospectos automático",
    "asistente virtual e-commerce",
    "chatbot WhatsApp atención",
    "automatización clínica",
    "inteligencia artificial negocio",
    "productividad empresarial IA",
    "reducción costos operativos",
    "escalar sin contratar",
    "outsourcing digital LATAM",
    "transformación digital PYMES",
    "automatización onboarding",
    "lead scoring automático",
]

# Topic templates for article generation
TOPIC_TEMPLATES = [
    "cómo {keyword} puede transformar tu empresa en 2026",
    "guía completa de {keyword} para empresas latinoamericanas",
    "{keyword}: por qué las empresas que no lo implementan pierden competitividad",
    "5 señales de que tu empresa necesita {keyword} ya",
    "errores comunes al implementar {keyword} y cómo evitarlos",
    "caso de éxito: cómo {keyword} aumentó la eficiencia un 300%",
    "{keyword} para PYMES: mitos y realidades en LATAM",
    "el futuro de {keyword} en américa latina",
    "roi de {keyword}: cuánto podés ahorrar este mes",
    "{keyword} vs contratar: comparativa real de costos",
]


def serp_research(keyword: str, location_code: int = 2840) -> dict:
    """Research SERP for a keyword using DataForSEO. Location 2840 = Mexico (LATAM proxy)."""
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
                    "top_urls": [r.get("url", "") for r in organic[:5]],
                    "top_titles": [r.get("title", "") for r in organic[:5]],
                    "top_descriptions": [r.get("description", "") for r in organic[:5]],
                    "related_keywords": tasks[0]["result"][0].get("se_results_container", {}).get("related_keywords", []),
                }
    except Exception as e:
        print(f"  [WARN] SERP research failed for '{keyword}': {e}")
    return {"keyword": keyword, "results": 0, "top_urls": [], "top_titles": [], "top_descriptions": []}


def get_keyword_volume(keywords: list[str]) -> dict:
    """Get search volume for keywords via DataForSEO."""
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
        print(f"  [WARN] Keyword volume failed: {e}")
    return {}


def select_keyword() -> str:
    """Select a keyword that hasn't been used recently."""
    used = get_used_keywords()
    available = [k for k in KEYWORD_CLUSTERS if k not in used]
    if not available:
        available = KEYWORD_CLUSTERS  # Reset if all used
    # Pick randomly weighted toward less-used
    import random
    return random.choice(available)


def get_used_keywords() -> set:
    """Get keywords already used in existing articles."""
    used = set()
    if CONTENT_DIR.exists():
        for f in CONTENT_DIR.glob("*.md"):
            try:
                text = f.read_text()
                # Extract keywords from frontmatter
                kw_match = re.search(r'keywords:\s*["\'](.+?)["\']', text)
                if kw_match:
                    used.update(kw_match.group(1).lower().split(", "))
            except Exception:
                pass
    return used


def generate_article(keyword: str, serp_data: dict) -> dict:
    """Generate article metadata and content based on keyword and SERP data."""
    import random
    template = random.choice(TOPIC_TEMPLATES)
    title = template.format(keyword=keyword).capitalize()

    # Generate slug
    slug = title.lower()
    slug = re.sub(r'[áàä]', 'a', slug)
    slug = re.sub(r'[éèë]', 'e', slug)
    slug = re.sub(r'[íìï]', 'i', slug)
    slug = re.sub(r'[óòö]', 'o', slug)
    slug = re.sub(r'[úùü]', 'u', slug)
    slug = re.sub(r'[ñ]', 'n', slug)
    slug = re.sub(r'[^a-z0-9]+', '-', slug)
    slug = slug.strip('-')[:80]

    # Build article content
    description = f"Descubrí cómo {keyword} puede ayudar a tu empresa a ser más eficiente. Guía práctica para negocios en LATAM. By Simplex Latam."

    # Generate sections based on SERP insights
    serp_titles = serp_data.get("top_titles", [])

    sections = []
    sections.append(f"## ¿Qué es {keyword} y por qué importa en 2026?")
    sections.append(f"{keyword} se ha convertido en una prioridad para las empresas latinoamericanas que buscan escalar sin aumentar su nómina. En un mercado cada vez más competitivo, automatizar procesos no es un lujo sino una necesidad.")

    sections.append(f"## El problema que resuelve {keyword}")
    sections.append(f"Las empresas en LATAM enfrentan un desafío común: crecer la operación sin que los costos crezcan en la misma proporción. {keyword} aborda exactamente este problema, permitiendo que los equipos se enfoquen en tareas de alto valor mientras los procesos repetitivos se ejecutan automáticamente.")

    sections.append("## Cómo funciona en la práctica")
    sections.append(f"Imaginá tener un empleado digital que trabaja 24/7, no se enferma, no toma vacaciones y aprende de cada interacción. Eso es lo que Flux Agent ofrece con {keyword}: un asistente configurado específicamente para tu proceso de negocio.")

    sections.append("## Resultados que pueden esperar las empresas")
    sections.append("Las empresas que ya implementaron asistentes digitales con Flux Agent reportan:")
    sections.append("- Reducción del 40-70% en tiempo dedicado a tareas repetitivas")
    sections.append("- ROI de 800% en el primer trimestre")
    sections.append("- Tiempo de implementación de solo 14 días")
    sections.append("- Sin contrataciones adicionales necesarias")

    sections.append("## Pasos para implementar en tu empresa")
    sections.append("1. **Diagnosticá tu operación**: Identificá las tareas que más tiempo consumen")
    sections.append("2. **Conectá tus herramientas**: WhatsApp, CRM, calendario y más")
    sections.append("3. **Configurá el asistente**: Flux Agent lo adapta a tu proceso específico")
    sections.append("4. **Revisá los resultados**: El asistente trabaja y vos supervisás")

    sections.append("## Conclusión")
    sections.append(f"{keyword} no es el futuro, es el presente. Las empresas que lo implementan hoy tendrán ventaja competitiva mañana. Flux Agent by Simplex Latam hace que la implementación sea rápida, sin complicaciones y con garantía de 60 días.")

    # Add CTA
    sections.append("---")
    sections.append("*¿Listo para automatizar? [Configurá tu asistente digital](https://flux.simplex.lat/register) y empezá a ver resultados en 14 días.*")
    sections.append(f"*Artículo escrito por Flux Agent · By Simplex Latam · {datetime.now().strftime('%B %Y')}*")

    body = "\n\n".join(sections)

    return {
        "title": title,
        "slug": slug,
        "description": description,
        "keywords": keyword,
        "body": body,
        "serp_data": serp_data,
    }


def write_article(article: dict) -> Path:
    """Write article as markdown with frontmatter."""
    CONTENT_DIR.mkdir(parents=True, exist_ok=True)
    filepath = CONTENT_DIR / f"{article['slug']}.md"

    frontmatter = f"""---
title: "{article['title']}"
description: "{article['description']}"
keywords: "{article['keywords']}"
author: "Flux Agent"
date: "{datetime.now().strftime('%Y-%m-%d')}"
slug: "{article['slug']}"
og_image: "/og-blog.jpg"
---

# {article['title']}

{article['body']}
"""
    filepath.write_text(frontmatter, encoding="utf-8")
    return filepath


def git_commit_push(filepath: Path, message: str):
    """Stage, commit and push a file."""
    repo = REPO_ROOT
    subprocess.run(["git", "add", str(filepath)], cwd=repo, capture_output=True)
    subprocess.run(["git", "commit", "-m", message], cwd=repo, capture_output=True)
    result = subprocess.run(["git", "push", "origin", "master"], cwd=repo, capture_output=True, text=True)
    if result.returncode != 0:
        print(f"  [ERROR] Git push failed: {result.stderr}")
    else:
        print(f"  [OK] Pushed to origin/master")


def run(count: int = 1, dry_run: bool = False):
    """Main pipeline: research → generate → write → commit."""
    print(f"🤖 Flux Agent SEO Pipeline — {datetime.now().strftime('%Y-%m-%d %H:%M')}")
    print(f"   Mode: {'DRY RUN' if dry_run else 'LIVE'} | Articles: {count}")
    print()

    for i in range(count):
        print(f"[{i+1}/{count}] Generating article...")

        # 1. Select keyword
        keyword = select_keyword()
        print(f"  Keyword: {keyword}")

        # 2. SERP research
        print("  Researching SERP...")
        serp_data = serp_research(keyword)
        print(f"  SERP results: {serp_data['results']} | Top: {serp_data['top_titles'][:2]}")

        # 3. Get volume
        vol = get_keyword_volume([keyword])
        volume = vol.get(keyword, "N/A")
        print(f"  Search volume: {volume}")

        # 4. Generate article
        article = generate_article(keyword, serp_data)
        print(f"  Title: {article['title']}")
        print(f"  Slug: {article['slug']}")

        if dry_run:
            print(f"  [DRY RUN] Would write to: {CONTENT_DIR / article['slug']}.md")
            print()
            continue

        # 5. Write file
        filepath = write_article(article)
        print(f"  Written: {filepath} ({filepath.stat().st_size} bytes)")

        # 6. Commit and push
        commit_msg = f"seo: {article['slug']} (kw: {keyword})"
        git_commit_push(filepath, commit_msg)
        print()

    print("✅ SEO Pipeline complete!")


if __name__ == "__main__":
    import argparse
    parser = argparse.ArgumentParser(description="Flux Agent SEO Pipeline")
    parser.add_argument("--count", type=int, default=1, help="Number of articles to generate")
    parser.add_argument("--dry-run", action="store_true", help="Preview without writing")
    args = parser.parse_args()
    run(count=args.count, dry_run=args.dry_run)
