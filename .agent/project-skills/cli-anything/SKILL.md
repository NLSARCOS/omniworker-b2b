---
name: cli-anything
description: Instrucciones para hacer que aplicaciones de escritorio y herramientas gráficas se vuelvan controlables por terminal usando CLI-Anything.
---

# 💻 CLI-Anything (Agent-Native Software)

CLI-Anything es un framework revolucionario que permite a los Agentes de IA interactuar y controlar cualquier software tradicional (incluyendo aplicaciones de escritorio con interfaces gráficas y aplicaciones web) generando "envoltorios" (wrappers) de línea de comandos.

## 🧠 ¿Qué resuelve?
Tradicionalmente, los agentes de IA no pueden controlar apps como "Photoshop", "GIMP" o "LibreOffice" porque requieren interacción humana con el mouse (GUI). CLI-Anything analiza el código o las APIs de esos programas y genera un CLI automático para que el Agente pueda enviar comandos precisos por texto.

## 📥 Instalación (CLI-Hub)
Para utilizar la librería o descargar CLIs ya creados por la comunidad, debes instalarlo en el entorno de Python actual:
```bash
uv pip install cli-anything-hub
```

Para la versión de aplicaciones web (CLI-Anything-WEB), que captura tráfico HTTP para generar el CLI, asegúrate de clonar el repositorio correspondiente o instalar la extensión apropiada.

## 💻 Patrones de Uso para el Agente

### 1. Utilizar un CLI existente
Si el usuario quiere que uses una aplicación de escritorio (ej. Blender o VLC), primero busca si ya existe un CLI en el hub:
```python
# Script de ejemplo para listar o instalar un CLI
import subprocess

# Comando ficticio para instalar el CLI de una app desde el hub
subprocess.run(["cli-hub", "install", "gimp-cli"], check=True)

# Una vez instalado, el agente puede usar comandos de bash:
# subprocess.run(["gimp-cli", "--apply-filter", "blur", "--input", "foto.jpg"])
```

### 2. Generar un nuevo CLI para el usuario
Si el usuario tiene un software local o una web app y pide automatizarla:
1. Explícale al usuario que utilizarás **CLI-Anything** para analizar la aplicación (mediante código estático o captura de tráfico HTTP si es web).
2. Pregúntale la ruta del ejecutable, repositorio o URL de la aplicación objetivo.
3. Genera el script de automatización invocando las funciones del framework CLI-Anything.

## ⚠️ Reglas de Uso
1. **Identifica el Target:** Diferencia entre `CLI-Anything` (para software open-source de escritorio mediante análisis de código) y `CLI-Anything-WEB` (para web apps mediante captura de HTTP).
2. Cuando el usuario diga "crea un CLI de esta app", tu objetivo como agente no es programarlo desde cero, sino utilizar el framework CLI-Anything para autogenerarlo.
3. Escribe un script envoltorio en Python que el usuario pueda ejecutar.
