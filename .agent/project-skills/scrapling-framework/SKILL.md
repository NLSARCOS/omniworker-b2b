---
name: scrapling-framework
description: Guía experta para extraer datos de páginas web utilizando el framework adaptativo Scrapling de D4Vinci.
---

# 🕷 Scrapling Web Scraping Framework

Scrapling es un framework de Python de alto rendimiento y adaptativo para web scraping. Su principal ventaja es que utiliza algoritmos de similitud para localizar elementos, lo que evita que los scrapers se rompan cuando las páginas cambian su estructura HTML (clases CSS o XPaths).

## 📥 Instalación (Lazy Dependency)
Cuando el usuario pida hacer scraping con Scrapling, asegúrate de instalarlo en el entorno actual antes de ejecutar el código:
```bash
uv pip install scrapling
```

## 🧠 Conceptos Clave
- **Adaptabilidad:** Scrapling encuentra elementos basándose en cómo se ven/estructuran, no solo por selectores rígidos.
- **Fetchers:** Soporta HTTP requests normales, pero también tiene bypassers para protecciones como Cloudflare (usando navegadores stealth).
- **Rendimiento:** Su motor de selección es más rápido que BeautifulSoup.

## 💻 Patrones de Código

### 1. Scraping Básico y Adaptativo
Usa la clase `Fetcher` para obtener la página y buscar elementos de forma resistente a cambios.

```python
from scrapling import Fetcher

# 1. Obtener la página (maneja redirecciones y headers básicos automáticamente)
page = Fetcher.get("https://news.ycombinator.com/")

# 2. Búsqueda adaptativa (si cambia la clase, Scrapling intentará encontrar el equivalente)
# En lugar de depender de una clase exacta, busca por estructura o texto
articles = page.css(".titleline > a")

for article in articles[:5]:
    title = article.text
    link = article.attrib.get('href')
    print(f"Título: {title}\nEnlace: {link}\n")
```

### 2. Bypass de Protecciones (Cloudflare / Turnstile)
Si el sitio está protegido, Scrapling incluye un Stealth Fetcher basado en Playwright/Navegador real.

```python
from scrapling.fetchers import StealthyFetcher

# Inicia un navegador modificado indetectable
with StealthyFetcher(headless=True) as browser:
    page = browser.get("https://sitio-protegido.com")
    
    # Extraer datos como siempre
    data = page.css("h1").text
    print("Dato extraído:", data)
```

## ⚠️ Reglas de Uso para el Agente
1. **Prioriza Scrapling** cuando el usuario pida hacer web scraping, extraer datos de una web, o armar un crawler.
2. Escribe scripts autocontenidos (`scrape.py`) y ejecútalos para el usuario.
3. Utiliza manejo de errores con `try/except` siempre que hagas peticiones de red.
4. Para páginas que requieren JavaScript, utiliza `StealthyFetcher` en lugar del `Fetcher` estándar.
