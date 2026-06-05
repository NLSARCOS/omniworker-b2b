# Rebrand roto en `master` (commit 33bb7ab)

> **Estado:** ⚠️ Bloqueante para `master` — NO bloquea `feat/next`.
> **Descubierto:** durante la ejecución del plan del orquestador.
> **Branch sano:** `feat/next` (0d1f6fa) — naming `OmniWorker` intacto.

## Qué pasó

El commit `33bb7ab` ("fix(router): prevent model switching and tool stripping
during task iterations") trae cambios buenos (PLAN-001: memoria nativa, provider
state, fix de routing) **pero vino acompañado de un script de branding
automático** que reemplazó `OmniWorker → Flux Agent` / `omniworker → flux-agent`
**dentro de código Python**, no solo en strings de UI.

El reemplazo rompió identificadores, imports y nombres de variables de entorno.

## Ejemplos concretos de lo roto

En `omniworker-agent/agent/conversation_loop.py` (archivo **core**):

```python
# línea 67-68 — SyntaxError: un guion no es válido en un nombre de módulo
from flux-agent_constants import display_flux-agent_home as _dhh_fn
from flux-agent_logging import set_session_context

# línea 3891 — env var con un espacio (nunca matchea la variable real)
_kanban_task = os.environ.get("FLUX AGENT_KANBAN_TASK")
```

Otros patrones rotos vistos en el commit:
- `from flux-agent_cli import ...` (módulo con guion → SyntaxError)
- `def set_flux-agent_home_override(...)` (función con guion → SyntaxError)
- `_FLUX AGENT_HOME_OVERRIDE` (identificador con espacio → SyntaxError)
- `os.environ.get("FLUX AGENT_HOME")` (env var con espacio)

`conversation_loop.py` es importado por el runtime del agente, así que **el
agente no parsea ni arranca en `master`**.

## Alcance

- **865 archivos `.py`** contienen el patrón `flux-agent_` / `FLUX AGENT_`.
  No todos son fatales: muchos están en comentarios/docstrings (inofensivos).
  Los fatales son los que aparecen en `import`, en nombres de función/variable,
  y en env vars.
- Verificado que **no es un artefacto de filtro de git** (`git cat-file -p`
  muestra el blob commiteado real; el repo solo tiene filtros LFS).

## Lo que NO está roto (buena noticia)

Los archivos **nuevos** de PLAN-001 están limpios (0 identificadores rotos):

- `omniworker-agent/agent/native_memory.py` ✅
- `omniworker-agent/agent/provider_state.py` ✅

Y el fix de routing real ("prevent model switching/tool stripping during task
iterations") vive **solo** en `omniworker-agent/smart_router.py`. Su lógica
sustantiva (independiente del rebrand):

```python
# El check "hay tools → cloud" se movió ANTES del fast-path de greeting,
# y is_greeting_message() ahora revisa TODO el historial. Así una tarea con
# tools en curso nunca se reclasifica como "simple" perdiendo sus tools/modelo.
if has_tool_calls or has_tool_results or data.get("tools"):
    return "cloud"
```

> Nota: el diff de `conversation_loop.py` en ese commit es **100% ruido de
> rebrand** — no tiene cambios de lógica.

## Impacto en nuestro trabajo (el plan del orquestador)

**Ninguno bloqueante.** Trabajamos sobre `feat/next` (limpio). Nuestras 4 fases:

- Crean archivos **nuevos** (`agent_types.yaml`, `agent/agent_registry.py`,
  `orchestrator_daemon.py`, etc.) — no dependen del código rebrandeado.
- El único punto de contacto modificado es `tools/delegate_tool.py`, que en
  `feat/next` está limpio. Nuestro cambio es aditivo y sus 132 tests pasan.

La única intersección con `master` es la *foundation* PLAN-001 (memoria nativa,
provider state). Esos dos archivos están limpios y se pueden cherry-pickear
cuando se quiera, **sin** traer el rebrand roto.

## Recomendación de remediación (para el partner)

1. **No mergear `master` a `feat/next`** tal como está.
2. Revertir el branding automático en `master`, o re-correrlo con un script que
   **solo toque strings de UI** y respete:
   - identificadores Python (nada de guiones/espacios en nombres),
   - statements `import`,
   - nombres de variables de entorno (`OMNIWORKER_*`, no `FLUX AGENT_*`).
3. Si se quiere el rebrand a "Flux Agent", hacerlo con un mapeo correcto:
   - `omniworker` (módulo) → `flux_agent` (guion BAJO, no guion medio)
   - `OMNIWORKER_HOME` (env) → `FLUX_AGENT_HOME` (guion bajo, sin espacio)
   - los strings de marca visibles → "Flux Agent" (con espacio, eso sí es texto)
4. Cherry-pick limpio de la foundation a `feat/next` cuando se la necesite:
   ```bash
   git checkout feat/next
   git checkout 33bb7ab -- omniworker-agent/agent/native_memory.py \
                            omniworker-agent/agent/provider_state.py
   # luego re-aplicar a mano el wiring en run_agent.py (la versión de master
   # está rebrandeada; portar solo la lógica, no el rebrand)
   ```

## Verificación rápida del alcance

```bash
# contar archivos .py con el patrón roto en master
git grep -l "flux-agent_\|FLUX AGENT_" 33bb7ab -- '*.py' | wc -l   # → 865

# ver que feat/next está limpio
git grep -c "flux-agent_\|FLUX AGENT_" feat/next -- omniworker-agent/agent/conversation_loop.py  # → 0
```
