# Memory Upgrade — Guía de Implementación

> Mapa de qué se hizo, cómo, y **dónde está cada línea** para editar o mover.
> Estado: **10 features implementadas · 1 parcial (F8) · 1 deferred (F5)**.
> Verificación: **112 tests de memoria verdes · desktop `tsc` exit 0**.
> Última actualización: 2026-06-07.

---

## 0. Principio rector

**Dual-track + siempre sumar, nunca pisar.** Toda feature que toque el schema de
memoria, los tipos de chunk, o la forma de leer/escribir datos se implementó
coordinada en **ambos** lados:

- **Agent (Python):** `omniworker-agent/agent/native_memory.py`
- **Desktop (TypeScript):** `omniworker-desktop/src/main/memory.ts` (+ IPC + preload + renderer)

El Desktop lee la DB del agent en **modo read-only**. Nunca escribe cruzado.
Regla documentada como banner en `flux-agent-memory-brief.html`.

> ⚠️ **Antes de tocar el schema**: la conexión SQLite corre en
> `isolation_level=None` (autocommit) — ver `omniworker_state.py:382`. El código
> de memoria **nunca** llama `commit()`.

---

## 1. AGENT — `omniworker-agent/agent/native_memory.py`

Todo el track del agent vive en **un solo archivo**. Líneas según estado actual.

### F3 — Topic-key Upsert + Soft-delete (schema)
La base de todo lo demás. Añade columnas `topic_key`, `revision_count`,
`deleted_at`, `scope`.

| Qué | Dónde | Notas |
|-----|-------|-------|
| Schema nuevo (CREATE TABLE) | `BM25Layer._ensure_tables()` — **L231** | Instalaciones nuevas traen las 4 columnas desde el inicio |
| Migración DBs viejas (ALTER idempotente) | `BM25Layer._run_migration()` — **L263** | `try/except pass` por columna + índice único `idx_memory_topic` |
| Upsert por topic_key | `BM25Layer.index()` — **L288** | Si `topic_key` existe y no está borrado → UPDATE + `revision_count+1`; si no → INSERT |
| Filtro soft-delete en búsqueda | `BM25Layer.search()` — **L325** | `WHERE ... AND c.deleted_at IS NULL` |
| Recall por topic | `BM25Layer.recall_by_topic()` — **L402** | Devuelve content del chunk vivo o `None` |
| Soft-delete | `BM25Layer.soft_delete()` — **L410** | Setea `deleted_at = time.time()` |

> Llamada a `_run_migration()` se dispara en `BM25Layer.__init__` (junto a `_ensure_tables()`).

### F2 — Explicit Memory Tools (`memory_save` / `memory_search` / `memory_recall`)
Expone tools al LLM. **Formato real del codebase: `{name, description, parameters}`**
(no `input_schema`).

| Qué | Dónde | Notas |
|-----|-------|-------|
| Lógica de guardado | `NativeMemory.save_explicit()` — **L1050** | Upserta vía `bm25.index(topic_key=...)` |
| Lógica de búsqueda | `NativeMemory.search_explicit()` — **L1074** | Acepta `scope` (F7) |
| Lógica de recall | `NativeMemory.recall_topic()` — **L1080** | |
| Schemas de las 3 tools | `NativeMemoryProvider.get_tool_schemas()` — **L1174** | Antes retornaba `[]` |
| Ruteo de llamadas | `NativeMemoryProvider.handle_tool_call()` — **L1240** | Usa `tool_result`/`tool_error` de `tools/registry.py` |

> **Wiring al LLM (no tocar, ya existía):** los schemas se recolectan en
> `agent/agent_init.py:1049` y las llamadas se rutean en
> `agent/agent_runtime_helpers.py:1559-1560`.

### F1 — Proactive Memory Protocol
Texto que le dice al LLM cuándo usar `memory_save`.

| Qué | Dónde | Notas |
|-----|-------|-------|
| Constante del protocolo | `NativeMemoryProvider._MEMORY_PROTOCOL` — **L1121** | Triggers, topic_key, scope, self-check |
| Inyección en system prompt | `NativeMemoryProvider.system_prompt_block()` — **L1139** | Antes retornaba `""` sin workspace; ahora siempre incluye el protocolo |

### F4 — Session Summary
| Qué | Dónde | Notas |
|-----|-------|-------|
| Hook | `NativeMemoryProvider.on_session_end()` — **L1323** | Arma summary (files_edited, decisions, last_task, msg_count) desde workspace state; **skippea sesiones vacías**; guarda como chunk `session_summary` con `topic_key=session/<id>/summary` |

> Dispatch ya existente (no tocar): `memory_manager.py:528`.

### F6 — Delegation Memory
| Qué | Dónde | Notas |
|-----|-------|-------|
| Hook | `NativeMemoryProvider.on_delegation()` — **L1351** | Guarda `agent_type + task + result` como chunk `delegation_result`, `topic_key=delegation/<child_id>` |

> Dispatch ya existente (no tocar): `memory_manager.py:649`.

### F7 — Memory Scope (project / personal)
| Qué | Dónde | Notas |
|-----|-------|-------|
| Param `scope` en búsqueda | `BM25Layer.search()` — **L325** | `scope: Optional[str] = None` (default = todos los scopes, additive) |
| Propagación | `NativeMemory.search_explicit()` — **L1074** | |
| Expuesto en tool | `get_tool_schemas()` (memory_search) — **L1174** + `handle_tool_call()` — **L1240** | param `scope` enum project/personal |

### F8 — Adaptive Context Budget — ⚡ PARTIAL (intencional)
| Qué | Dónde | Notas |
|-----|-------|-------|
| Budget subido | `_MAX_INJECTED_TOKENS = 4000` — **L80** + `_MAX_CHUNKS_PER_PREFETCH = 20` — L81 | Lo hizo el partner. **El platform-aware completo se omitió** para no tocar el pipeline `run_agent.py` (regla: no sumar complejidad innecesaria) |

### F5 — Graphify Corpus Search — ⏸ DEFERRED
**No implementado a propósito.** `graphify` no está en el stack del agent;
`graphify-out/` existe solo en el repo de desarrollo, sería no-op en runtime real.
Reactivar solo si graphify pasa a ser dependencia del agent.

---

## 2. DESKTOP — TypeScript (4 niveles: data → IPC → preload → renderer)

### Capa de datos — `omniworker-desktop/src/main/memory.ts`

| Feature | Qué | Dónde |
|---------|-----|-------|
| F3 | Schema + migración (espejo del agent) | `ensureNativeMemoryTables()` — **L130** |
| D3 | Regex de tipo | `const TYPE_PREFIX` — **L85** |
| D3 | Parse del prefix `[type]` | `parseMemoryEntries()` — **L87** |
| D3 | Serializa preservando prefix | `serializeEntries()` — **L103** |
| D3 | `type?` en interface | `MemoryEntry` — **L16** |
| D2 | Interface | `DesktopSessionSummary` — **L762** |
| D2 | Lectura read-only de summaries | `getSessionSummaries()` — **L775** |
| D4 | Discovery real (lee config.yaml) | `discoverMemoryProviders()` — **L868** |
| D4 | Import reutilizado | `import { getActiveMemoryProvider }` — **L5** | (de `installer.ts`, sin import circular) |
| extra | Límites de char | `MEMORY_CHAR_LIMIT = 50_000` — **L7** |

> Referencias útiles ya existentes: `searchObservations()` L562, `getTimeline()` L675.

### Capa IPC — `omniworker-desktop/src/main/index.ts`

| Qué | Dónde |
|-----|-------|
| Import `getSessionSummaries` | **L169** |
| Handler `get-session-summaries` (D2) | **L1305-1306** |
| Handler `discover-memory-providers` (D4, ya existía) | **L1917** |

### Capa preload (puente al renderer)

| Qué | Dónde |
|-----|-------|
| `getSessionSummaries` impl | `src/preload/index.ts` — **L420** |
| `getSessionSummaries` tipo | `src/preload/index.d.ts` — **L352** |
| `discoverMemoryProviders` (ya existía) | `index.ts` L1075 · `index.d.ts` L764 |

### Capa renderer (UI) — `omniworker-desktop/src/renderer/src/screens/Memory/Memory.tsx`

| Feature | Qué | Dónde |
|---------|-----|-------|
| D3 | `type?` en interface local (separada de memory.ts) | `interface MemoryEntry` — **L22** |
| D2 | Interface local | `interface SessionSummary` — **L28** |
| D4 | Estado providers | `const [providers, ...]` — **L132** |
| D2 | Estado summaries | `const [sessionSummaries, ...]` — **L134** |
| D4 | Carga en loadData | **L184** (`discoverMemoryProviders`) |
| D2 | Carga en loadData | **L196** (`getSessionSummaries`) |
| D3 | Propaga `type` en resultados de búsqueda | `displayedEntries` — **L430** |
| D4 | Panel "Active Backend" | **~L807** |
| D2 | Panel "Recent Sessions" | **~L831** |
| D3 | Badge dinámico (antes hardcodeado "FACT") | **L1144-1146** |

> Carga D2/D4 es **best-effort** dentro de `loadData`: si fallan, no bloquean
> el render principal (`readMemory`).

---

## 3. Tests

| Qué | Dónde |
|-----|-------|
| Suite nueva F2/F3/F4/F6/F7 (14 tests) | `omniworker-agent/tests/agent/test_native_memory_upgrade.py` |

Fixture `conn` usa `isolation_level=None` para imitar el `state.db` real.

**Correr:**
```bash
cd omniworker-agent
python3 -m pytest tests/agent/test_native_memory_upgrade.py -v -o addopts=""

# Suite completa de memoria:
python3 -m pytest tests/agent/test_memory_provider.py tests/tools/test_memory_tool.py \
  tests/tools/test_memory_tool_schema.py tests/agent/test_native_memory_upgrade.py -q -o addopts=""

# Desktop type-check:
cd omniworker-desktop && npx tsc --noEmit
```

> Nota: `tests/agent/test_markdown_tables.py` tiene un ImportError **preexistente**
> ajeno a memoria — no lo introdujeron estos cambios.

---

## 4. Cómo extender (recetas rápidas)

- **Agregar un nuevo tipo de chunk:** sumar el valor al enum de `type` en
  `get_tool_schemas()` (native_memory.py L1174). El schema SQL no cambia.
- **Agregar una nueva memory tool:** schema en `get_tool_schemas()` (L1174) +
  rama en `handle_tool_call()` (L1240) + método de lógica en `NativeMemory`.
- **Cambiar el protocolo del LLM:** editar `_MEMORY_PROTOCOL` (L1121). Solo texto.
- **Nueva columna en el schema:** agregarla en **ambos** `_ensure_tables()`
  (native_memory.py L231) **y** `ensureNativeMemoryTables()` (memory.ts L130),
  más un ALTER en `_run_migration()` (L263) y en el bloque de migración de memory.ts.
- **Exponer algo nuevo a la UI:** seguir la cadena de 4 capas — memory.ts →
  index.ts (IPC handler) → preload (index.ts + index.d.ts) → Memory.tsx.

---

## 5. Estado por feature (resumen)

| ID | Feature | Estado | Track |
|----|---------|--------|-------|
| F1 | Proactive Protocol | ✅ | Agent |
| F2 | Explicit Memory Tools | ✅ | Agent |
| F3 | Upsert + Soft-delete | ✅ | Agent + Desktop |
| F4 | Session Summary | ✅ | Agent |
| F5 | Graphify Corpus Search | ⏸ DEFERRED | — |
| F6 | Delegation Memory | ✅ | Agent |
| F7 | Memory Scope | ✅ | Agent |
| F8 | Adaptive Context Budget | ⚡ PARTIAL | Agent |
| D2 | Session Summary Panel | ✅ wired end-to-end | Desktop |
| D3 | Memory Entry Type Tags | ✅ wired end-to-end | Desktop |
| D4 | Real Provider Discovery | ✅ wired end-to-end | Desktop |

---

## 6. Sin commitear

Todos los cambios están en el working tree, **no commiteados** (decisión del usuario).
Archivos tocados:
- `omniworker-agent/agent/native_memory.py`
- `omniworker-agent/tests/agent/test_native_memory_upgrade.py` (nuevo)
- `omniworker-desktop/src/main/memory.ts`
- `omniworker-desktop/src/main/index.ts`
- `omniworker-desktop/src/preload/index.ts`
- `omniworker-desktop/src/preload/index.d.ts`
- `omniworker-desktop/src/renderer/src/screens/Memory/Memory.tsx`
