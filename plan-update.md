# Plan Update — Actualizaciones automáticas Desktop + Agent

## Objetivo

Cuando se publique una nueva versión de **OmniWorker Desktop** o del **OmniWorker Agent**, cada app instalada debe detectar la actualización y mostrar un botón claro para actualizar a esa versión.

Flujo esperado:

1. El equipo sube una nueva versión.
2. Las apps instaladas consultan si existe una versión más reciente.
3. Si existe, aparece un botón tipo **“Actualizar a vX.Y.Z”**.
4. El usuario pulsa el botón.
5. La app descarga/instala la actualización.
6. La app reinicia o pide reiniciar cuando corresponda.

---

## Validación del estado actual

### 1. Desktop ya tiene base de auto-update

El proyecto `omniworker-desktop` ya usa `electron-updater`:

- `omniworker-desktop/package.json`
  - dependencia: `electron-updater`
- `omniworker-desktop/electron-builder.yml`
  - `publish.provider: github`
  - `owner: Simplex-lat`
  - `repo: omniworker-releases`
- `omniworker-desktop/src/main/index.ts`
  - `autoUpdater.autoDownload = false`
  - escucha `update-available`
  - escucha `download-progress`
  - escucha `update-downloaded`
  - expone IPC:
    - `check-for-updates`
    - `download-update`
    - `install-update`
- `omniworker-desktop/src/preload/index.ts`
  - expone esas APIs al renderer.
- `omniworker-desktop/src/renderer/src/screens/Layout/Layout.tsx`
  - ya tiene estado UI para mostrar botón de update en la sidebar.

Conclusión: **para actualizar el Desktop, la base ya existe**. Falta asegurar que el flujo de publicación y el repositorio de releases sean correctos.

### 2. Desktop ya tiene workflow de release

Existe:

- `.github/workflows/release-desktop.yml`

Publica builds al hacer push de tags `v*`.

El workflow usa:

```yaml
GH_TOKEN: ${{ secrets.RELEASE_TOKEN }}
```

Y ejecuta:

```bash
npm run build:win -- -p always
npm run build:mac -- -p always
npm run build:linux -- -p always
```

Conclusión: **al subir un tag `vX.Y.Z`, GitHub Actions debería construir y publicar artefactos para Windows/macOS/Linux**.

### 3. Hay posible inconsistencia de repositorio de updates

En `electron-builder.yml` se publica en:

```yaml
owner: Simplex-lat
repo: omniworker-releases
```

Pero `dev-app-update.yml` apunta a:

```yaml
owner: fathah
repo: omniworker-desktop
```

Esto no rompe producción si `dev-app-update.yml` solo se usa en dev, pero conviene unificar criterios para evitar confusión.

Decisión recomendada:

- Producción: `Simplex-lat/omniworker-releases`
- Dev/testing: documentarlo explícitamente o cambiar `dev-app-update.yml` para probar el mismo repo de releases.

### 4. Agent update existe, pero no es automático por versión SaaS

El Desktop ya puede ejecutar actualización del Agent:

- `omniworker-desktop/src/main/index.ts`
  - IPC: `run-omniworker-update`
- En local llama a `runOmniWorkerUpdate(...)`.
- En SSH llama a `sshRunUpdate(...)`.

El Agent también tiene comando interno `/update`, que ejecuta update del agente.

Conclusión: **hay mecanismo para actualizar el Agent**, pero falta una capa centralizada que diga: “la versión disponible del Agent es X, tu versión instalada es Y, muestra botón”.

---

## Arquitectura recomendada

Separar actualizaciones en dos canales:

| Canal | Qué actualiza | Mecanismo recomendado |
|---|---|---|
| Desktop App | Electron wrapper completo | `electron-updater` + GitHub Releases |
| Agent Engine | Python/CLI instalado dentro del Desktop o sistema | endpoint SaaS de versión + `run-omniworker-update` |

No conviene mezclar ambos. El Desktop se actualiza como aplicación nativa. El Agent se actualiza como runtime interno.

---

## Plan para Desktop Update

### Paso 1 — Confirmar repositorio oficial de releases

Definir un único repo oficial:

```txt
Simplex-lat/omniworker-releases
```

Validar que ahí se publiquen estos archivos por versión:

- `.exe` / `.nsis` para Windows
- `.dmg` o `.zip` para macOS
- `.AppImage`, `.deb`, `.rpm` para Linux
- metadata de electron-updater:
  - `latest.yml`
  - `latest-mac.yml`
  - `latest-linux.yml` o equivalentes según target

### Paso 2 — Publicar usando tag semver

Cada release debe salir con tag:

```bash
git tag v0.4.4
git push origin v0.4.4
```

El número debe coincidir con `omniworker-desktop/package.json`:

```json
"version": "0.4.4"
```

### Paso 3 — Mantener `autoDownload = false`

Esto ya está bien:

```ts
autoUpdater.autoDownload = false;
```

Así el usuario ve botón primero, en vez de descargar silenciosamente.

### Paso 4 — Mostrar botón global

Ya existe botón en `Layout.tsx`. Estados esperados:

- `available`: “Actualizar a vX.Y.Z”
- `downloading`: “Descargando 42%”
- `ready`: “Reiniciar para actualizar”
- `error`: “Falló la actualización”

Recomendación: mantenerlo en sidebar y además mostrar toast/banner al iniciar.

### Paso 5 — Check periódico

Actualmente se hace check a los 5 segundos del arranque:

```ts
setTimeout(() => {
  autoUpdater.checkForUpdates().catch(() => {});
}, 5000);
```

Recomendación: agregar check periódico cada 6–12 horas mientras la app esté abierta.

---

## Plan para Agent Update

### Paso 1 — Crear endpoint SaaS de versión

Agregar endpoint público o autenticado:

```txt
GET /api/v1/updates/agent
```

Respuesta sugerida:

```json
{
  "latestVersion": "0.8.1",
  "minSupportedVersion": "0.8.0",
  "releaseNotes": "Mejoras de gateway y update",
  "mandatory": false,
  "publishedAt": "2026-05-19T00:00:00Z"
}
```

### Paso 2 — Desktop compara versión local vs latest

El Desktop ya puede leer versión local:

- `get-omniworker-version`
- `refresh-omniworker-version`

Flujo:

1. Desktop llama `getOmniWorkerVersion()`.
2. Desktop llama al SaaS `/api/v1/updates/agent`.
3. Compara semver.
4. Si local `< latestVersion`, muestra botón:

```txt
Actualizar Agent a v0.8.1
```

### Paso 3 — Botón ejecuta update existente

Al pulsar:

```ts
window.omniworkerAPI.runOmniWorkerUpdate()
```

Después:

1. refrescar versión con `refreshOmniWorkerVersion()`
2. reiniciar gateway si estaba activo
3. mostrar estado final

### Paso 4 — Update obligatorio si versión mínima no se cumple

Si:

```txt
installedVersion < minSupportedVersion
```

Entonces bloquear uso cloud/gateway hasta actualizar, con mensaje:

```txt
Tu Agent está desactualizado. Actualiza para continuar.
```

Esto evita que clientes viejos llamen al SaaS con protocolos incompatibles.

---

## Plan para SaaS/admin

### Opción simple inicial

Guardar versión latest en variables de entorno:

```env
LATEST_AGENT_VERSION=0.8.1
MIN_SUPPORTED_AGENT_VERSION=0.8.0
LATEST_DESKTOP_VERSION=0.4.4
```

### Opción robusta

Crear tabla Prisma:

```prisma
model AppRelease {
  id                  String   @id @default(cuid())
  channel             String   // desktop | agent
  version             String
  minSupportedVersion String?
  releaseNotes        String?
  mandatory           Boolean  @default(false)
  isActive            Boolean  @default(true)
  publishedAt         DateTime @default(now())
  createdAt           DateTime @default(now())
}
```

Endpoints:

```txt
GET /api/v1/updates/desktop
GET /api/v1/updates/agent
POST /api/admin/releases
PATCH /api/admin/releases/:id
```

---

## Criterios de aceptación

### Desktop

- Al publicar `vX.Y.Z`, una app instalada en versión anterior detecta update.
- Se muestra botón “Actualizar a vX.Y.Z”.
- Al pulsarlo, descarga update.
- Al finalizar, muestra “Reiniciar para actualizar”.
- Al reiniciar, `getAppVersion()` devuelve la nueva versión.

### Agent

- Desktop detecta versión local del Agent.
- Desktop consulta latest version en SaaS.
- Si hay update, muestra botón “Actualizar Agent a vX.Y.Z”.
- Al pulsarlo, corre `run-omniworker-update`.
- Reinicia gateway/túnel si aplica.
- Refresca versión instalada.

---

## Riesgos y cuidados

1. **Firmado macOS/Windows**
   - Auto-update puede fallar si los builds no están firmados correctamente.

2. **Repo incorrecto**
   - Si el app busca updates en otro repo, nunca verá releases.

3. **Versiones no semver**
   - Usar siempre `vX.Y.Z` en tags y `X.Y.Z` en package/version.

4. **Linux AppImage vs deb/rpm**
   - Electron auto-update funciona mejor con AppImage. `.deb`/`.rpm` pueden requerir estrategia aparte.

5. **Actualizar Agent mientras gateway está corriendo**
   - Debe detener/reiniciar gateway con cuidado para no romper sesiones.

6. **Usuarios en versiones muy viejas**
   - Mantener `minSupportedVersion` para forzar update cuando el protocolo cambie.

---

## Implementación recomendada por fases

### Fase 1 — Confirmar Desktop auto-update

- Unificar repo de releases.
- Publicar release de prueba `v0.4.4`.
- Validar que aparece botón en app instalada anterior.

### Fase 2 — Agent update visible

- Crear endpoint `/api/v1/updates/agent`.
- Agregar check en Desktop.
- Agregar botón separado “Actualizar Agent”.

### Fase 3 — Admin releases

- Crear CRUD simple en admin SaaS para definir latest/minSupported/releaseNotes.

### Fase 4 — Políticas avanzadas

- Canales `stable`, `beta`, `internal`.
- Updates obligatorios.
- Rollback.
- Telemetría de versiones instaladas por tenant/edge agent.

---

## Conclusión

El Desktop ya tiene casi todo lo necesario para mostrar botón de actualización cuando se publica una nueva versión. Lo principal es asegurar que GitHub Releases y `electron-builder.yml` apunten al mismo repositorio/canal.

Para el Agent, ya existe acción de update, pero falta el sistema de detección por versión. Lo correcto es que el SaaS publique la versión vigente y que el Desktop compare contra la versión local para mostrar el botón.
