---
name: scrapling
description: Usa Scrapling (D4Vinci) para extraer datos de páginas web de manera adaptativa.
---

# Scrapling Web Scraping Framework

Scrapling es un framework de Python de alto rendimiento y adaptativo para web scraping. Su principal ventaja es que utiliza algoritmos de similitud para localizar elementos, lo que evita que los scrapers se rompan cuando las páginas cambian su estructura HTML.

## Uso Básico

```python
from scrapling import Fetcher

# Obtener la página (maneja redirecciones y headers básicos automáticamente)
page = Fetcher.get("https://news.ycombinator.com/")

# Búsqueda adaptativa
articles = page.css(".titleline > a")
for article in articles[:5]:
    title = article.text
    link = article.attrib.get('href')
    print(f"Título: {title}\nEnlace: {link}\n")
```

## Bypass de Protecciones (Cloudflare / Turnstile)
Para sitios protegidos, Scrapling incluye un Stealth Fetcher basado en Playwright.

```python
from scrapling.fetchers import StealthyFetcher

with StealthyFetcher(headless=True) as browser:
    page = browser.get("https://sitio-protegido.com")
    data = page.css("h1").text
    print("Dato extraído:", data)
```

## Dependencias
El framework ya está disponible en el entorno del agente mediante el plugin local. Simplemente importa `scrapling`.
