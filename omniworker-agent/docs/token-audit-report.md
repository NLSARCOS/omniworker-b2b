# Auditoría de Costo Real — Contexto Base y Caching

> Auditado el 2026-06-07. Solo lectura — ningún archivo fue modificado.

---

## 1. Log por llamada (existente)

**Archivo:** `omniworker-agent/agent/conversation_loop.py` líneas 1637–1642

### Logger actual (transcripción exacta)

```python
_cache_pct = ""
if canonical_usage.cache_read_tokens and prompt_tokens:
    _cache_pct = f" cache={canonical_usage.cache_read_tokens}/{prompt_tokens} ({100*canonical_usage.cache_read_tokens/prompt_tokens:.0f}%)"
logger.info(
    "API call #%d: model=%s provider=%s in=%d out=%d total=%d latency=%.1fs%s",
    agent.session_api_calls, agent.model, agent.provider or "unknown",
    prompt_tokens, completion_tokens, total_tokens,
    api_duration, _cache_pct,
)
```

### Evaluación

El log emite `in=` y `out=` (que corresponden a `prompt_tokens` y `completion_tokens` calculados a partir de `canonical_usage`) y añade el ratio de cache-read si existe. **Lo que falta:**

| Campo | ¿Presente en el log? | Fuente en `canonical_usage` |
|---|---|---|
| `input_new` (tokens nuevos no cacheados) | **NO** | `canonical_usage.input_tokens` (ya existe) |
| `cache_read` | Parcial — solo si > 0 | `canonical_usage.cache_read_tokens` |
| `cache_write` | **NO** | `canonical_usage.cache_write_tokens` |
| `output` | Sí (`out=`) | `canonical_usage.output_tokens` |
| `reasoning` | **NO** | `canonical_usage.reasoning_tokens` |

`in=` actualmente vale `prompt_tokens`, que es la suma `input_tokens + cache_read_tokens + cache_write_tokens` — es decir, el total de tokens procesados como input, no los tokens facturados como "nuevos". Esto impide separar el costo real de cada llamada sin mirar el ratio `cache=%`.

**El desglose `input_new / cache_read / cache_write / output` no está en el log actual.** Hay que reemplazar o extender el `logger.info` para emitirlo explícitamente.

---

## 2. Estado del prompt caching

**Archivo principal:** `omniworker-agent/run_agent.py` líneas 3706–3808  
**Método:** `AIAgent._anthropic_prompt_cache_policy(provider, base_url, api_mode, model)`

La función retorna `(should_cache: bool, use_native_layout: bool)`.

### Cuándo `_use_prompt_caching = True`

| Condición | `use_native_layout` |
|---|---|
| Native Anthropic (`api_mode='anthropic_messages'` + host `api.anthropic.com` o `provider='anthropic'`) | `True` |
| OpenRouter + modelo Claude | `False` |
| Nous Portal + modelo Claude | `False` |
| Nous Portal + modelo Qwen | `False` |
| Anthropic-wire (`api_mode='anthropic_messages'`) + modelo Claude (gateways terceros como MiniMax, Zhipu, LiteLLM) | `True` |
| MiniMax (proveedor `minimax`/`minimax-cn` o host `api.minimax.io`/`api.minimaxi.com`) en modo Anthropic-wire | `True` |
| Qwen/Alibaba (`opencode`, `opencode-zen`, `opencode-go`, `alibaba`) con modelo Qwen | `False` |

### Cuándo `_use_prompt_caching = False`

Cualquier combinación no listada arriba: modelos OpenAI/GPT, Gemini, modelos locales (Ollama, LM Studio), OpenRouter con modelo no-Claude, proveedores personalizados sin Anthropic-wire.

### Dónde se asigna la variable

- **Inicialización:** `agent_init.py` línea 406 — llama `agent._anthropic_prompt_cache_policy()` sin argumentos (usa los valores actuales del agente).
- **Cambio de modelo:** `agent_runtime_helpers.py` línea 1383 — re-evalúa con el nuevo provider/model.
- **Activación de fallback:** `chat_completion_helpers.py` línea 855 — re-evalúa para el provider de fallback.
- **Snapshot:** `agent_runtime_helpers.py` línea 1443 — persiste en `_primary_runtime["use_prompt_caching"]` para sobrevivir entre turnos.

### TTL configurable

El TTL del cache (`5m` o `1h`) se lee de `config.yaml` bajo `prompt_caching.cache_ttl` (línea 418 de `agent_init.py`). El default es `5m`. El TTL `1h` cuesta 2× en escritura pero amortizan sesiones largas con pausas > 5 min.

---

## 3. Tamaño estimado del contexto base

**Archivos:** `agent/system_prompt.py` y `agent/prompt_builder.py`

El system prompt se estructura en tres tiers (ver `build_system_prompt_parts`):

### Tier 1: Stable (cacheado por sesión)

| Bloque | Chars | Tokens est. | Condición de inyección |
|---|---|---|---|
| `DEFAULT_AGENT_IDENTITY` | ~517 | ~129 | Siempre (si no hay SOUL.md) |
| `OMNIWORKER_AGENT_HELP_GUIDANCE` | ~221 | ~55 | Siempre |
| `MEMORY_GUIDANCE` | ~1,510 | ~377 | Si tool `memory` disponible |
| `SESSION_SEARCH_GUIDANCE` | ~186 | ~46 | Si tool `session_search` disponible |
| `SKILLS_GUIDANCE` | ~383 | ~95 | Si tools `skills_list/skill_view/skill_manage` disponibles |
| `TOOL_USE_ENFORCEMENT_GUIDANCE` | ~738 | ~184 | Modelos: gpt, codex, gemini, gemma, grok, glm, qwen, deepseek |
| `GOOGLE_MODEL_OPERATIONAL_GUIDANCE` | ~1,015 | ~253 | Solo modelos Gemini/Gemma |
| `OPENAI_MODEL_EXECUTION_GUIDANCE` | ~3,346 | ~836 | Solo modelos GPT/Codex/Grok |
| `KANBAN_GUIDANCE` | ~2,000 | ~500 | Solo en kanban worker mode |
| `COMPUTER_USE_GUIDANCE` | ~1,400 | ~350 | Solo si tool `computer_use` disponible |
| Skills index (`build_skills_system_prompt`) | variable | 300–2,000+ | Si hay skills instaladas |
| SOUL.md / context files (AGENTS.md, etc.) | variable | 500–10,000+ | Si existen en el cwd |

**Mínimo stable (Claude, sin skills, sin archivos de contexto):** ~2,817–3,555 chars ~ **704–888 tokens**

**Con skills y AGENTS.md típico:** fácilmente 3,000–15,000 tokens solo en el tier stable.

### Tier 2: Context (session-stable)

- `system_message` del caller
- `build_context_files_prompt()` — escanea `AGENTS.md`, `.cursorrules`, `OMNIWORKER.md`, etc. del `TERMINAL_CWD`. Un AGENTS.md complejo puede aportar 2,000–8,000 tokens.

### Tier 3: Volatile (cambia por turno — nunca se cachea bien)

| Bloque | Tokens est. | Fuente |
|---|---|---|
| `NativeMemoryProvider._MEMORY_PROTOCOL` | ~221 | `native_memory.py` clase `NativeMemoryProvider` |
| Workspace state | hasta ~600 | `WorkspaceState.format_for_prompt(max_tokens=600)` |
| Memory snapshot (`format_for_system_prompt("memory")`) | variable | `_memory_store` |
| USER.md profile | variable | `_memory_store` |
| Timestamp/session/model line | ~10 | Siempre |

**Total volatile típico:** 300–1,500 tokens.

### Resumen general

| Escenario | Tokens estimados |
|---|---|
| Mínimo (Claude nativo, sin skills, sin contexto) | ~900–1,200 |
| Sesión típica desktop (con skills + AGENTS.md + memoria) | ~3,000–8,000 |
| Sesión con SOUL.md extenso + AGENTS.md complejo + skills index | ~8,000–20,000+ |

> **Nota:** `estimate_tokens_rough` existe en `agent/model_metadata.py` (línea 1804) y delega a `count_tokens_precise` (~4 chars/token). Los estimados anteriores usan esa regla.

---

## 4. Memoria inyectada por turno

### NativeMemory (`prefetch`) — tope explícito

**Archivo:** `omniworker-agent/agent/native_memory.py` línea 80

```python
_MAX_INJECTED_TOKENS = 4000  # hard cap on memory context injected per turn
```

La función `NativeMemory.prefetch()` (línea 947) acumula chunks BM25 + rerank vectorial y al final aplica:

```python
if len(text) > _MAX_INJECTED_TOKENS * 4:
    text = text[: _MAX_INJECTED_TOKENS * 4] + "\n...[truncated]"
```

Es decir: **tope duro de 4,000 tokens** (16,000 chars) por turno para el bloque de contexto recalled.

Adicionalmente hay un tope por **workspace state**: `get_workspace_state_text(max_tokens=600)` — cap de 600 tokens (línea 1024).

### Inyección de prefetch en el turn (conversation_loop.py)

El resultado de `prefetch_all()` se inyecta en el **mensaje usuario** actual (no en el system prompt) como bloque `<memory-context>` (líneas 818–827 de `conversation_loop.py`). Esta inyección ocurre en cada turno y **no tiene un cap adicional** en el sitio de inyección — el único cap es el que aplica `NativeMemory.prefetch()` internamente (los 4,000 tokens).

### Provider externo (Engram, etc.)

`MemoryManager.prefetch_all()` (línea 338 de `memory_manager.py`) agrega resultados de todos los providers registrados sin aplicar ningún tope adicional. Si se registra un provider externo que retorna un bloque grande, el resultado se inyecta sin truncado en `conversation_loop.py`.

**Conclusión:** El único tope garantizado es el de `NativeMemoryProvider` (4,000 tokens). Un provider externo puede exceder ese límite si no implementa su propio cap.

---

## 5. Recomendaciones (requieren aprobación antes de aplicar)

Las siguientes son sugerencias concretas. **Ninguna se aplica sin aprobación explícita del usuario.**

---

### R1 — Extender el logger de API call para emitir el desglose real de tokens

**Archivo:** `omniworker-agent/agent/conversation_loop.py` líneas 1637–1642

Reemplazar el `logger.info` actual por uno que emita `input_new`, `cache_read`, `cache_write`, `output` y (si aplica) `reasoning` como campos separados:

```python
logger.info(
    "API call #%d: model=%s provider=%s "
    "in_new=%d cache_read=%d cache_write=%d out=%d reasoning=%d total=%d latency=%.1fs",
    agent.session_api_calls, agent.model, agent.provider or "unknown",
    canonical_usage.input_tokens,
    canonical_usage.cache_read_tokens,
    canonical_usage.cache_write_tokens,
    canonical_usage.output_tokens,
    canonical_usage.reasoning_tokens,
    total_tokens,
    api_duration,
)
```

Impacto: log más informativo, sin ningún cambio de comportamiento.

---

### R2 — Añadir cap de tokens al resultado de `prefetch_all` en `MemoryManager`

**Archivo:** `omniworker-agent/agent/memory_manager.py` línea ~370 (después del `return "\n\n".join(parts)` en `prefetch_all`)

Actualmente `prefetch_all` no limita el tamaño combinado de múltiples providers. Si se registra un provider externo además del native, el total puede superar 4,000 tokens.

Propuesta: aplicar un cap de 8,000 tokens (32,000 chars) al resultado combinado antes de retornarlo, usando `estimate_tokens_rough`.

---

### R3 — Lazy-load del skills index en el system prompt (reducción de tokens estable)

**Archivo:** `omniworker-agent/agent/system_prompt.py` líneas 189–205 y `agent/prompt_builder.py` función `build_skills_system_prompt` (línea 990)

El skills index se inyecta completo en el system prompt estable en cada sesión, incluso cuando la tarea no usa skills. En sesiones con muchas skills instaladas esto puede aportar 2,000+ tokens al tier stable (que es el que más conviene mantener pequeño para que el prefix cache sea efectivo).

Propuesta: inyectar solo la lista de nombres y descripciones de skills (una línea por skill) en el system prompt estable, y cargar el contenido completo de la skill solo cuando el modelo la llama con `skill_view`. Esto reduciría el stable tier en ~50–80% del skills block sin pérdida funcional, porque el modelo ya tiene `skill_view` disponible para recuperar el detalle.

El cambio aplicaría en `system_prompt.py` línea 198 (llamada a `build_skills_system_prompt`) para pasar un flag `compact=True`.

---

*Fin del reporte. Ningún archivo fue modificado durante esta auditoría.*
