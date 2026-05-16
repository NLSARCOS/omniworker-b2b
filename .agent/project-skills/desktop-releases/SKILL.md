---
name: desktop-releases
description: Guía paso a paso para compilar, subir y distribuir actualizaciones de OmniWorker Desktop a los clientes.
---

# 🚀 Despliegue de Actualizaciones (OmniWorker Desktop)

Esta habilidad documenta el proceso estandarizado para publicar nuevas versiones de la aplicación de escritorio y asegurar que todos los clientes reciban la actualización de manera automática mediante (OTA - Over The Air).

## 🛠 Pre-requisitos
El repositorio de distribución público debe estar configurado en `omniworker-desktop/electron-builder.yml`:
```yaml
publish:
  provider: github
  owner: Simplex-lat
  repo: omniworker-releases
```

---

## 📦 Flujo de Trabajo para Publicar un Release

### Paso 1: Actualizar la Versión
Antes de compilar, es obligatorio incrementar el número de versión de la aplicación.
1. Abre `omniworker-desktop/package.json`.
2. Sube la versión en el campo `"version": "0.4.X"`. *Nota: El actualizador no funcionará si no cambias la versión*.
3. Guarda el archivo, haz un `git commit` y un `git push` a tu repositorio de código privado.

### Paso 2: Compilar los Ejecutables
Abre la terminal en la carpeta `omniworker-desktop` y compila los instaladores:
- **Para Mac:** Ejecuta `npm run build:mac`. Generará archivos `.dmg` y `latest-mac.yml`.
- **Para Windows:** Ejecuta `npm run build:win`. Generará archivos `.exe` y `latest.yml`.
- **Para Linux (opcional):** Ejecuta `npm run build:linux`.

Los archivos resultantes se generarán dentro del directorio `omniworker-desktop/dist/` (o `out/`).

### Paso 3: Crear el Release Público
1. Entra a tu repositorio público: [https://github.com/Simplex-lat/omniworker-releases](https://github.com/Simplex-lat/omniworker-releases)
2. Haz clic en **Releases** en la barra lateral derecha y luego en **Draft a new release**.
3. Haz clic en **Choose a tag** y escribe la misma versión de tu `package.json` (ejemplo: `v0.4.4`) y presiona "Create new tag".
4. Pon un título al Release (ejemplo: `OmniWorker Agent v0.4.4`).
5. **CRÍTICO:** Arrastra y suelta todos los archivos generados en tu carpeta local `dist/` a la caja de archivos adjuntos del Release. Especialmente:
   - Los instaladores: `.dmg` y/o `.exe`
   - Los mapas de actualización: `latest-mac.yml` y/o `latest.yml`
6. Haz clic en el botón verde **Publish release**.

---

## 🤖 ¿Qué ocurre en las computadoras de los clientes?
1. Al abrir la app, la función `autoUpdater.checkForUpdates()` revisará tu repositorio público `Simplex-lat/omniworker-releases`.
2. Encontrará el archivo `latest.yml` o `latest-mac.yml` y comparará la versión con la versión actual instalada.
3. Si hay una versión nueva, **descargará el `.exe` o `.dmg` en segundo plano**.
4. Al terminar, cuando el cliente cierre la aplicación y vuelva a abrirla, ¡se instalará la nueva versión automáticamente!

## 🔗 URL para Descargas Nuevas (Dashboard)
Los nuevos clientes siempre pueden descargar la versión más reciente a través de este enlace genérico:
`https://github.com/Simplex-lat/omniworker-releases/releases/latest`
Este es el enlace que debe estar configurado en el Dashboard SaaS.
