# Guía de Despliegue y Actualizaciones — OmniWorker

Esta guía explica paso a paso cómo:
1. Crear y distribuir una nueva versión de la **app de escritorio** (auto-update para usuarios existentes + descarga para usuarios nuevos).
2. Actualizar el **SaaS / Backend** en el servidor VPS.

> **Servidor VPS:** `217.76.62.37` · **Puerto SSH:** `2424` · **Usuario:** `root`

---

## PARTE 0 — Cambios en esta versión

### Desktop (Electron)
- **HistoryCache local:** agrega `src/main/history-cache.ts` con SQLite local (`better-sqlite3`) para cachear resúmenes de conversación por sesión.
- **Truncation de historial:** en `src/main/omniworker.ts`, si la conversación supera los 30 mensajes, se compacta localmente manteniendo los últimos 20 e inyectando el resumen cacheado como mensaje `system`.
- **Tokens screen:** nueva pantalla en el Desktop (`src/renderer/src/screens/Tokens/Tokens.tsx`) para ver métricas de ahorro de tokens del system prompt, con IPC `getTokenMetrics` expuesto por el main process.

### SaaS (Next.js)
- **Conversation compaction:** nuevo `src/lib/conversation-compaction.ts`. Antes de reenviar mensajes al provider, si hay más de 30 mensajes se genera un resumen del bloque intermedio y se inyecta como mensaje `system`. Esto reduce el prompt enviado al proveedor y estabiliza el uso de tokens en sesiones largas.
- **Integración en ruta:** `src/app/api/v1/chat/completions/route.ts` ahora aplica `compactMessages()` tanto en el flujo de modelos virtuales como en el flujo estándar, antes de iterar por providers.

### Agent (Python)
- **FTS5 history enrichment:** en `agent/context_compressor.py`, la generación del resumen ahora puede enriquecerse con contexto relevante del historial previo usando la tabla FTS5 `messages_fts` cuando hay `session_db` disponible.
- **System prompt budget logging:** en `run_agent.py` se agregó logging de `system_prompt_budget` por sesión con métricas por tier (`stable`, `context`, `volatile`, `tools`). El Desktop lee estos logs para mostrar métricas.

---

## PARTE 1 — Actualización de la App de Escritorio (Desktop)

La app de escritorio usa `electron-updater` con GitHub Releases como servidor de actualizaciones. Cuando publicás una nueva release en el repositorio `Simplex-lat/omniworker-releases`, los usuarios que ya tienen la app instalada reciben la actualización automáticamente en segundo plano.

### Paso 1.1 — Incrementar la versión

Abrí el archivo `omniworker-desktop/package.json` y cambiá la propiedad `version`:

```json
// Antes:
"version": "0.4.5"

// Después:
"version": "0.4.6"
```

Hacé commit de este cambio:
```bash
git add omniworker-desktop/package.json
git commit -m "chore: bump version to 0.4.6"
```

---

### Paso 1.2 — Compilar los instaladores

Desde la raíz del proyecto:

```bash
cd omniworker-desktop

# macOS — genera .dmg y archivos .zip + .blockmap (necesarios para auto-update)
npm run build:mac

# Windows — genera el instalador .exe
npm run build:win

# Linux — genera el .AppImage
npm run build:linux
```

Los archivos compilados quedan en `omniworker-desktop/dist/`.

> ⚠️ En macOS sin certificado de firma de Apple, el build igual funciona pero mostrará advertencias de seguridad al usuario final al instalar por primera vez.

---

### Paso 1.3 — Publicar el GitHub Release (el auto-update depende de esto)

Para que los usuarios actuales reciban la actualización automática, **debés publicar una GitHub Release** en el repositorio `Simplex-lat/omniworker-releases`.

El auto-update funciona así internamente:
1. La app revisa periódicamente los archivos `latest-mac.yml`, `latest.yml` y `latest-linux.yml` dentro de los Assets del Release publicado.
2. Si detecta una versión más nueva que la instalada, descarga el instalador en segundo plano.
3. Una vez descargado, notifica al usuario que hay una actualización lista y le pide reiniciar la app.

**Archivos que DEBEN estar en el Release para que el auto-update funcione:**

| Sistema | Archivos obligatorios |
|---------|----------------------|
| macOS (Intel) | `omniworker-desktop-0.4.6-x64.dmg`, `omniworker-desktop-0.4.6-x64-mac.zip`, `omniworker-desktop-0.4.6-x64.dmg.blockmap`, `omniworker-desktop-0.4.6-x64-mac.zip.blockmap`, **`latest-mac.yml`** |
| Windows | `OmniWorker Setup 0.4.6.exe`, `OmniWorker Setup 0.4.6.exe.blockmap`, **`latest.yml`** |
| Linux | `OmniWorker-0.4.6.AppImage`, **`latest-linux.yml`** |

> Los archivos `.blockmap` y `.yml` son generados automáticamente por `electron-builder` en la carpeta `dist/`. **No los borres.**

**Publicar con GitHub CLI (`gh`):**

```bash
cd omniworker-desktop/dist

gh release create v0.4.6 \
  "omniworker-desktop-0.4.6-x64.dmg" \
  "omniworker-desktop-0.4.6-x64.dmg.blockmap" \
  "omniworker-desktop-0.4.6-x64-mac.zip" \
  "omniworker-desktop-0.4.6-x64-mac.zip.blockmap" \
  "latest-mac.yml" \
  "OmniWorker Setup 0.4.6.exe" \
  "OmniWorker Setup 0.4.6.exe.blockmap" \
  "latest.yml" \
  "OmniWorker-0.4.6.AppImage" \
  "latest-linux.yml" \
  -R Simplex-lat/omniworker-releases \
  -t "OmniWorker v0.4.6" \
  -n "## Notas de versión v0.4.6

- Descripción de los cambios...
- Fix: xxx
- Feature: yyy"
```

> **Importante:** Ajustá los nombres exactos de los archivos según lo que `electron-builder` haya generado en tu carpeta `dist/`. Podés verlos con `ls dist/`.

Una vez publicado el Release, en pocos minutos:
- Los usuarios con la app abierta recibirán una notificación en pantalla pidiendo reiniciar para actualizar.
- Los usuarios nuevos que entren al dashboard de Flux Agent verán los botones de descarga apuntando a la nueva versión (ver Parte 1.4).

---

### Paso 1.4 — Actualizar los enlaces de descarga en el SaaS Dashboard

Los botones de descarga del dashboard apuntan a URLs internas que redirigen al Release de GitHub. Actualizalos en:

**Archivo:** `omniworker-saas/src/app/dashboard/page.tsx`

Buscá las tres líneas con `href="/api/downloads/omniworker-desktop-X.X.X..."` y cambiá el número de versión a la nueva.

También actualizá el texto descriptivo que muestra la versión actual a los usuarios (línea `App nativa para macOS, Windows, Linux — vX.X.X`).

---

## PARTE 2 — Despliegue en el VPS (SaaS Backend)

El VPS aloja el backend de Flux Agent (Next.js / Docker).

> **Puerto SSH no estándar: `2424`**
>
> El servidor **NO** usa el puerto 22 estándar. Siempre usá `-p 2424` en todos los comandos SSH/SCP/rsync.

---

### Paso 2.1 — Pushear los cambios a GitHub

```bash
git add .
git commit -m "feat: descripción de los cambios"
git push origin master
```

---

### Paso 2.2 — Despliegue automático (script Expect)

Desde la raíz del proyecto, ejecutá:

```bash
expect deploy_saas.exp
```

Este script hace automáticamente:
1. Conecta al VPS por SSH en el puerto `2424`.
2. Hace `git pull` para traer los últimos cambios.
3. Reconstruye y reinicia los contenedores Docker con `docker compose up -d --build`.

---

### Paso 2.3 — Despliegue manual (si el script falla)

**Conectar al VPS:**
```bash
ssh -p 2424 root@217.76.62.37
```

**Una vez dentro del servidor:**
```bash
cd /opt/omniworker

# Traer los últimos cambios del repositorio
git pull origin master

# Si hubo cambios en el schema de base de datos (Prisma):
cd omniworker-saas
npx prisma generate
npx prisma migrate deploy
cd ..

# Reconstruir y levantar los contenedores
docker compose build
docker compose up -d
```

---

### Paso 2.4 — Sincronizar archivos manualmente con rsync (alternativa)

Si preferís subir archivos directamente sin usar git en el servidor:

```bash
# Subir el SaaS (excluyendo node_modules y .next)
rsync -avz -e "ssh -p 2424" \
  --exclude 'node_modules' \
  --exclude '.next' \
  --exclude '.env' \
  omniworker-saas/ \
  root@217.76.62.37:/opt/omniworker/omniworker-saas/

# Subir el Agente Python (excluyendo entorno virtual y caché)
rsync -avz -e "ssh -p 2424" \
  --exclude '.venv' \
  --exclude '__pycache__' \
  --exclude '*.pyc' \
  omniworker-agent/ \
  root@217.76.62.37:/opt/omniworker/omniworker-agent/
```

Luego conectate por SSH y reconstruí los contenedores (ver Paso 2.3).

---

### Paso 2.5 — Verificar que el servidor esté funcionando

```bash
# Conectarse al servidor
ssh -p 2424 root@217.76.62.37

# Ver el estado de los contenedores
docker compose ps

# Ver logs del SaaS en tiempo real
docker compose logs -f saas

# Ver logs del Gateway/Agente en tiempo real
docker compose logs -f gateway
```

Si podés acceder a `https://flux.simplex.lat` sin errores, el despliegue fue exitoso.

---

## Referencia Rápida

| Tarea | Comando |
|-------|---------|
| Compilar todo | `cd omniworker-desktop && npm run build:mac && npm run build:win && npm run build:linux` |
| Publicar release | `cd dist && gh release create vX.X.X [archivos...] -R Simplex-lat/omniworker-releases` |
| Deploy automático VPS | `expect deploy_saas.exp` |
| SSH manual al VPS | `ssh -p 2424 root@217.76.62.37` |
| Reiniciar servicios | `docker compose up -d` (dentro del VPS en `/opt/omniworker`) |
| Ver logs | `docker compose logs -f saas` |

---

*Última actualización: 2026-05-31. Puerto SSH del VPS: 2424.*
