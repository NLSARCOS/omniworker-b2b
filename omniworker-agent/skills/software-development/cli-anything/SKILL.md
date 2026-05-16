---
name: cli-anything
description: Genera interfaces de línea de comandos (CLI) para aplicaciones gráficas de escritorio.
---

# CLI-Anything

CLI-Anything permite interactuar y controlar cualquier software tradicional (aplicaciones de escritorio) generando wrappers de línea de comandos automáticamente.

## Uso

Si el usuario solicita automatizar una aplicación gráfica (ej. LibreOffice, GIMP, etc.), debes utilizar la librería `cli_hub` (parte del framework CLI-Anything) para instalar o ejecutar un envoltorio CLI.

```python
import subprocess

# Ejemplo para listar o buscar CLIs en el hub:
result = subprocess.run(["cli-hub", "search", "gimp"], capture_output=True, text=True)
print(result.stdout)

# Ejemplo para instalar un CLI:
# subprocess.run(["cli-hub", "install", "gimp-cli"], check=True)
```

## Consideraciones
1. Si el usuario te pide controlar una aplicación de escritorio, usa esta habilidad.
2. La dependencia de `cli-anything-hub` ya está instalada globalmente en tu entorno.
