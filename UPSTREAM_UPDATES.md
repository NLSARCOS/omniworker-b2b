# 🔄 Análisis de Actualizaciones Upstream — Hermes → OmniWorker

> **Generado:** 2026-06-06 | **Fuentes:** [fathah/hermes-desktop](https://github.com/fathah/hermes-desktop) · [NousResearch/hermes-agent](https://github.com/NousResearch/hermes-agent)

---

## 📋 Resumen Ejecutivo

| Repo | Versión Actual | Commits Recientes | Actividad |
|------|---------------|-------------------|-----------|
| `hermes-desktop` | v0.5.7 | 545+ PRs | 🔥 Muy activo (commits hoy) |
| `hermes-agent` | v0.16.0 | 40k+ PRs | 🔥 Muy activo (commits hoy) |

**Prioridad de integración:** Alto impacto inmediato disponible en ambos repos.

---

## 🖥️ HERMES-DESKTOP → omniworker-desktop

### 🆕 FEATURE: Sistema de Oficina 3D con Chat Modal por Agente

**Commit:** `feat(office): add per-agent chat modal with session persistence` | `Merge branch 'inapp-3d-office'`
**PR:** #545 y rama `inapp-3d-office`
**Fecha:** 2026-06-06
**Impacto:** ⭐⭐⭐⭐⭐ ALTO

#### ¿Qué hace?
Introduce una pantalla `Office.tsx` que muestra una vista tipo "oficina" donde múltiples agentes/perfiles son representados como avatares. Cada agente tiene su propio **chat modal** (`OneChatModal.tsx`) con **persistencia de sesión**.

#### Componentes nuevos detectados:
```
src/renderer/src/screens/Office/
├── Office.tsx          # Vista principal 3D de oficina
├── OneChatModal.tsx    # Modal de chat por agente con sesión persistida
└── main.css            # Estilos específicos del office
```

#### ¿Podemos adaptarlo a OmniWorker?
✅ **SÍ — Alta prioridad.** OmniWorker-desktop ya tiene pantallas de sesiones, skills y settings. Esta feature agrega una UI "hub" visual para multi-agente que sería premium para nuestra plataforma SaaS.

**Plan de adaptación:**
1. Revisar `Office.tsx` upstream para entender la arquitectura de avatares
2. Adaptar `OneChatModal.tsx` → puede mapear a nuestros "profiles" en OmniWorker
3. La persistencia de sesión ya existe en nuestro SQLite — conectar

---

### 🆕 FEATURE: Live Chat Stream Rendering Estructurado

**Commits:**
- `render structured live chat stream` (pmos69)
- `Summarize multi-tool activity groups`
- `Fix live tool reconciliation edge cases`
- `Keep dashboard stream transport out of tests`
- **PR #545:** `Render richer live chat stream events`

**Fecha:** 2026-06-04 → 2026-06-06
**Impacto:** ⭐⭐⭐⭐⭐ ALTO

#### ¿Qué hace?
Reemplaza el renderizado de streaming plano del chat por un sistema **estructurado y rico** que:
- Agrupa múltiples llamadas a herramientas en **grupos de actividad resumidos**
- Muestra **eventos de streaming en tiempo real** con tipos diferenciados (texto, razonamiento, tool calls)
- Reconcilia el estado de herramientas "en vivo" vs completadas (edge cases)
- Separa el transport del dashboard stream de los tests (mejor testabilidad)

#### Archivos probablemente modificados upstream:
```typescript
// Renderer — componentes de chat
src/renderer/src/screens/Chat/          // Renderizado de mensajes
src/renderer/src/components/LiveStream/ // Nuevo: streaming estructurado
src/main/dashboard-stream.ts            // Transport aislado de tests
```

#### ¿Podemos adaptarlo a OmniWorker?
✅ **SÍ — CRÍTICO.** OmniWorker ya tiene streaming en el chat. Esta mejora es directamente aplicable. El agrupado de multi-tool activity es exactamente lo que los usuarios necesitan ver en tiempo real.

**Diferencia vs lo que tenemos:** Actualmente nuestro streaming probablemente muestra tool calls como texto plano. La mejora upstream los renderiza como tarjetas/grupos colapsables con estado en vivo.

**Plan de adaptación:**
1. Analizar `src/renderer/src/screens/Chat/` actual en omniworker-desktop
2. Implementar `LiveToolGroup` component que agrupa tool calls relacionadas
3. Añadir tipos de eventos: `thinking`, `tool_start`, `tool_end`, `text`
4. Separar el dashboard stream transport para mejorar testabilidad

---

### 🐛 FIX: Rotación de Logs `desktop.log` para Prevenir Desbordamiento de Disco

**Commits (upstream hermes-agent aplicado al desktop):**
- `fix(desktop): cap desktop.log size to prevent unbounded growth`
- `fix(desktop): bound desktop.log via cascade rotation + reclaim oversized logs`

**Fecha:** 2026-06-06
**Impacto:** ⭐⭐⭐⭐ ALTO (seguridad operacional)

#### El problema
`desktop.log` era un archivo append-only sin rotación. En boot loops (ej: versión skew entre app shell y CLI), el archivo podía crecer hasta **~326 GB** llenando el disco.

#### La solución (2 fases)
**Fase 1:** Cap de 10 MB → rota a `.1` una vez superado
**Fase 2:** Rotación en cascada: `live → .1 → .2 → .3`, eliminando el más antiguo. Archivos >4x el cap se **eliminan directamente** (no se relegan a `.1`).

#### ¿Tenemos esto en OmniWorker-desktop?
⚠️ **PROBABLEMENTE NO.** El mismo patrón append-only existe en omniworker-desktop. Este fix es **crítico para producción**.

**Plan de adaptación:**
```typescript
// src/main/logger.ts (o donde gestionamos desktop.log)
const MAX_LOG_SIZE = 10 * 1024 * 1024; // 10 MB
const MAX_LOG_BACKUPS = 3;
const PATHOLOGICAL_MULTIPLIER = 4;

async function rotateLogIfNeeded(logPath: string): Promise<void> {
  const stat = await fs.promises.stat(logPath).catch(() => null);
  if (!stat) return;
  
  if (stat.size > PATHOLOGICAL_MULTIPLIER * MAX_LOG_SIZE) {
    // Boot-loop artifact — delete outright
    await fs.promises.unlink(logPath).catch(() => {});
    return;
  }
  
  if (stat.size > MAX_LOG_SIZE) {
    // Cascade rotation: .3 → deleted, .2 → .3, .1 → .2, live → .1
    for (let i = MAX_LOG_BACKUPS; i >= 1; i--) {
      const from = `${logPath}.${i - 1 || ''}`.replace(/\.$/, '');
      const to = `${logPath}.${i}`;
      await fs.promises.rename(from === logPath ? logPath : from, to).catch(() => {});
    }
  }
}
```

---

### 🐛 FIX: Back-compat `--tui` Flag (Desktop ↔ CLI Version Skew)

**Commit:** `fix(cli): tolerate stale 'dashboard --tui' from old desktop shells`
**Fecha:** 2026-06-06
**Impacto:** ⭐⭐⭐ MEDIO

#### El problema
Las versiones antiguas de la app desktop (≤ 0.15.x) invocaban el backend como:
```bash
hermes dashboard --no-open --tui --host ... --port ...
```
El flag `--tui` fue eliminado. Las versiones nuevas del CLI con shells antiguas crasheaban con `unrecognized arguments: --tui`.

#### La solución
Añadir `--tui` como flag **oculto, deprecado, y aceptado-pero-ignorado** en el subparser del dashboard:
```python
parser.add_argument('--tui', action='store_true', 
                    help=argparse.SUPPRESS,  # Hidden from --help
                    default=False)
```

#### ¿Aplica a OmniWorker?
✅ **SÍ.** Misma arquitectura desktop ↔ CLI. Si alguna vez removemos flags del CLI, aplicar el mismo patrón de back-compat.

---

### 🧪 FIX: Gateway Restart Test Preload Mock

**Commits:**
- `Fix Gateway test preload mock`
- `Update gateway-restart.test.ts`

**Fecha:** 2026-06-06
**Impacto:** ⭐⭐ BAJO (calidad de tests)

Fix de mocks en tests de reinicio del gateway. Si tenemos tests similares para gateway restart en omniworker-desktop, revisar si tenemos el mismo problema de preload mock.

---

## 🤖 HERMES-AGENT → omniworker-agent

### 🆕 FEATURE: Adaptive Middleware System (NeMo-Relay Integration)

**Commit:** `feat(middleware): add adaptive middleware to hermes-agent, consumed by NeMo-Relay`
**PR:** #29724
**Fecha:** 2026-06-06
**Impacto:** ⭐⭐⭐⭐⭐ ALTO (arquitectura)

#### ¿Qué hace?
Añade un sistema de **middleware adaptativo** a la capa de requests del agente. Permite que plugins externos (como NeMo-Relay de NVIDIA) intercepten y modifiquen requests/responses a proveedores LLM.

#### Detalles técnicos (del commit de fix):
```python
# Características clave del middleware:
# 1. next_call es single-use por frame → previene doble ejecución
# 2. _safe_copy() para deepcopy de request copies → thread-safe
# 3. Chain de middleware: cada middleware recibe (request, next_fn)
```

#### Archivos nuevos/modificados:
```
agent/middleware/           # NUEVO directorio
├── __init__.py
├── base.py                 # Interface del middleware
└── chain.py               # Cadena de middlewares
```

#### ¿Podemos adaptarlo a OmniWorker?
✅ **SÍ — ESTRATÉGICO.** OmniWorker tiene `agent/transports/` para proveedores. Un middleware system permite:
- **Logging** de todas las requests LLM
- **Cost tracking** por sesión
- **Rate limiting** configurable
- **Request transformation** (ej: inyectar system prompts)
- Integración con futuros socios (al igual que NeMo-Relay)

---

### 🔧 REFACTOR: Home Assistant → Plugin del Sistema

**Commit:** `refactor(gateway): migrate Home Assistant adapter to bundled plugin`
**PR:** Rama de migración de plataformas
**Fecha:** 2026-06-06
**Impacto:** ⭐⭐⭐ MEDIO

#### ¿Qué hace?
Mueve `gateway/platforms/homeassistant.py` a `plugins/platforms/homeassistant/` siguiendo el mismo patrón de Discord y Mattermost:

```
ANTES: gateway/platforms/homeassistant.py
DESPUÉS: plugins/platforms/homeassistant/
         ├── __init__.py
         └── adapter.py (con register())
```

**Cambios clave:**
- `register()` expone la plataforma via plugin system (no más `elif` hardcodeado en `gateway/run.py`)
- `_standalone_send()` reemplaza `_send_homeassistant()` en `tools/send_message_tool.py`
- `_is_connected()` usa `hermes_cli.gateway.get_env_value`

#### ¿Aplica a OmniWorker?
⚠️ **REVISAR.** OmniWorker tiene 27+ plataformas en `gateway/platforms/`. Si algunas aún son `elif` hardcodeados en `gateway/run.py`, este patrón de migración es el camino correcto.

---

### 🔧 REFACTOR: Image Generation — Cache Path Helper Compartido

**Commit:** `refactor(image_gen): delegate cache-path mapping to shared helper`
**Fecha:** 2026-06-06
**Impacto:** ⭐⭐ MEDIO

#### ¿Qué hace?
Extrae la lógica duplicada de mapeo de rutas de caché Docker a un helper compartido `credential_files.map_cache_path_to_container()`. Elimina el loop duplicado entre `image_generation_tool.py` y `to_agent_visible_cache_path()`.

**Antes:**
```python
# Duplicado en 2 lugares con path-join divergente (posixpath vs Path)
for mount in backend.cache_mounts:
    if mount.host_path == host_path:
        return mount.container_path
```

**Después:**
```python
# Helper compartido, backend-agnostic
from credential_files import map_cache_path_to_container
container_path = map_cache_path_to_container(host_path, container_base)
```

---

### 🐛 FIX: Windows — Quarantine hermes.exe During Update

**Commit:** `fix(cli): quarantine running hermes.exe during update dep-verification repair on Windows`
**PR:** #40409
**Fecha:** 2026-06-06
**Impacto:** ⭐⭐⭐⭐ ALTO para usuarios Windows

#### El problema
Durante `_verify_core_dependencies_installed`, el repair path ejecutaba `pip install --reinstall -e .` directamente. En Windows, el ejecutable `hermes.exe` que corre ese código **no puede ser sobreescrito** mientras está en ejecución. Resultado: `hermes` desaparecía de PATH post-update.

#### La solución
```python
def _run_quarantined_install(install_fn):
    """Rename executable out-of-the-way, restore on failure."""
    if sys.platform == 'win32':
        exe = Path(sys.executable)
        quarantined = exe.with_suffix('.old.exe')
        exe.rename(quarantined)
        try:
            install_fn()
        except Exception:
            quarantined.rename(exe)  # Restore on failure
            raise
    else:
        install_fn()
```

#### ¿Aplica a OmniWorker?
✅ **SÍ — CRÍTICO para Windows.** omniworker-agent tiene el mismo patrón de auto-update. Verificar si `scripts/update.py` o similar tiene este problema.

---

### 🐛 FIX: Gateway — Drop Plugin-Migrated Platforms from Update Allowlist

**Commit:** `chore(gateway): drop plugin-migrated platforms from /update allowlist`
**Fecha:** 2026-06-06
**Impacto:** ⭐⭐ BAJO-MEDIO

**Cambio:** `_UPDATE_ALLOWED_PLATFORMS` frozenset en `gateway/run.py` ya no necesita incluir Discord y Mattermost (ahora usan `allow_update_command=True` en su `PlatformEntry`).

**Regla establecida:**
- **Built-in platforms** → en el frozenset de `_UPDATE_ALLOWED_PLATFORMS`
- **Plugin-migrated platforms** → usan `allow_update_command=True` en el registry

---

### 🐛 FIX: Image Gen — Backend-Visible Artifact Paths

**Commit:** `fix(image_gen): expose backend-visible artifact paths`
**Fecha:** 2026-06-06
**Impacto:** ⭐⭐⭐ MEDIO

Fix para que las rutas de artefactos generados sean visibles desde el contexto del backend (Docker/container), no solo desde el host. Relevante si OmniWorker tiene image generation con backends containerizados.

---

## 📦 DEPENDENCIAS — Cambios Notables en hermes-agent v0.16.0

### Actualizaciones de versión vs omniworker-agent:

| Paquete | Hermes v0.16.0 | Verificar en OmniWorker |
|---------|----------------|-------------------------|
| `openai` | `2.24.0` | ¿Tenemos la misma? |
| `pydantic` | `2.13.4` | Bumpeado por segfault en threads |
| `rich` | `14.3.3` | — |
| `requests` | `2.33.0` | CVE-2026-25645 |
| `PyJWT` | `2.12.1` | CVE-2026-32597 |
| `psutil` | `7.2.2` | Cross-platform process mgmt |
| `anthropic` | `0.86.0` | — |
| `discord.py` | `2.7.1` | — |
| `python-telegram-bot` | `22.6` | — |
| `Markdown` | `3.10.2` | En core (no lazy) |
| `mcp` (dev) | `1.26.0` | — |

### ⚠️ CVEs importantes:
- **`requests==2.33.0`** — Fix para CVE-2026-25645
- **`PyJWT==2.12.1`** — Fix para CVE-2026-32597
- **`pydantic==2.13.4`** — Fix para segfault en non-main threads con OpenAI Responses API

---

## 🗺️ PLAN DE INTEGRACIÓN PRIORIZADO

### 🔴 CRÍTICA (Hacer primero)

| # | Update | Repo Target | Esfuerzo |
|---|--------|-------------|----------|
| 1 | **Bump CVE dependencies** (`requests`, `PyJWT`, `pydantic`) | omniworker-agent | Bajo — solo cambiar pins en `pyproject.toml` + `uv lock` |
| 2 | **Log rotation para desktop.log** (cascade + pathological discard) | omniworker-desktop | Bajo-Medio — ~50 líneas TS |
| 3 | **Windows exe quarantine during update** | omniworker-agent | Bajo — extraer helper `_run_quarantined_install` |

### 🟡 ALTA (Sprint próximo)

| # | Update | Repo Target | Esfuerzo |
|---|--------|-------------|----------|
| 4 | **Live chat stream estructurado** (LiveToolGroup, event types) | omniworker-desktop | Alto — rediseño del componente de chat |
| 5 | **Adaptive middleware system** (inspirado en NeMo-Relay PR) | omniworker-agent | Alto — nueva capa arquitectónica |
| 6 | **Back-compat flags deprecados** (patrón `--tui`) | omniworker-agent | Bajo — argparse.SUPPRESS |

### 🟢 MEDIA (Backlog)

| # | Update | Repo Target | Esfuerzo |
|---|--------|-------------|----------|
| 7 | **Per-agent chat modal** (Office.tsx pattern) | omniworker-desktop | Alto — nueva pantalla UI |
| 8 | **Home Assistant plugin migration** (si aplica) | omniworker-agent | Medio — si usamos HA |
| 9 | **Image gen cache path helper** | omniworker-agent | Bajo — solo si usamos image gen |
| 10 | **Gateway update allowlist cleanup** | omniworker-agent | Bajo — 2 líneas removidas |

---

## 🔍 ARCHIVOS A INVESTIGAR EN OMNIWORKER

Antes de implementar, verificar el estado actual de estos archivos:

```bash
# Desktop — Log management
find omniworker-desktop/src -name "*.ts" | xargs grep -l "appendFileSync\|appendFile\|desktop.log"

# Desktop — Chat streaming
find omniworker-desktop/src -name "*.tsx" | xargs grep -l "stream\|StreamEvent\|tool_call"

# Agent — Update flow (Windows)
grep -r "_run_install\|quarantine\|reinstall" omniworker-agent/ --include="*.py"

# Agent — Gateway allowlist
grep -r "_UPDATE_ALLOWED_PLATFORMS\|allow_update_command" omniworker-agent/gateway/ --include="*.py"

# Agent — Middleware hooks
grep -r "middleware\|intercept" omniworker-agent/agent/ --include="*.py"
```

---

## 📌 NOTAS IMPORTANTES

> **NOTA 1:** `hermes-desktop` tiene versión `0.5.7` (package.json). El nombre del home dir es `HERMES_HOME` → en omniworker es `OMNIWORKER_HOME`. Adaptar variables de entorno al hacer port.

> **NOTA 2:** La feature de **Office 3D** puede requerir Three.js u otras dependencias 3D. Revisar package.json de hermes-desktop para nuevas deps antes de portar.

> **NOTA 3:** El **adaptive middleware** de hermes-agent (#29724) está diseñado para integraciones externas (NeMo-Relay de NVIDIA). Para OmniWorker, el uso principal sería cost tracking + logging de LLM calls para la capa SaaS.

> **NOTA 4:** Los tests en hermes-agent tienen cobertura nueva para `TestUpdateCommandPlatformGate` — patrón de testing útil para nuestro gateway.

---

*Documento generado automáticamente · Actualizar al hacer merge de cada feature · Próxima revisión recomendada: 2026-06-13*
