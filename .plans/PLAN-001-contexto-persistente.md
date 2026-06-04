# Plan de Ejecución: Contexto Persistente y Memoria Nativa
## OmniWorker — Base de Conocimiento Funcional

> **Fecha:** 2026-06-04
> **Autor:** Análisis automatizado del codebase
> **Scope:** omniworker-agent (core) + omniworker-desktop
> **Referencia:** Análisis de grafo (23,433 nodos, 74,747 edges) + exploración de código

---

## 1. Diagnóstico del Problema Real

### 1.1 Hallazgo sorpresa: `switch_model()` NO pierde historial

El método `AIAgent.switch_model()` en `run_agent.py:2689` mantiene `self._session_messages` intacto. La conversación en formato OpenAI persiste y se re-traduce por el nuevo transport en cada turno.

**Lo que SÍ se pierde al cambiar de modelo:**
- `self._cached_system_prompt` → se invalida, se reconstruye
- `_config_context_length` override → se limpia
- `_fallback_activated` / `_fallback_index` → se resetean
- Provider-specific `provider_data` (Codex `call_id`, Gemini thought signatures, Anthropic thinking blocks)

### 1.2 Dónde se pierde el contexto REALMENTE

#### Capa 1 — SaaS Gateway Context Bridge (el problema principal)

**Archivo:** `omniworker-saas/src/lib/context-bridge.ts`

Cuando el gateway hace failover entre providers (GLM-5.1 → DeepSeek Flash → Kimi K2.5), cada modelo nuevo recibe:
- Un **Context Header** de ~800-1200 tokens generado por LLM
- TTL de **15 minutos**
- Solo contiene: `sessionSummary`, `recentDecisions` (3-5), `currentTask`, `keyEntities` (8 max), `previousModel`

**Lo que NO contiene:**
- Código completo que se estaba editando
- Estado de archivos modificados (qué líneas, qué cambios)
- Errores previos y sus stack traces
- Razonamiento detallado de decisiones
- Tool calls históricos y sus resultados
- Estado de tareas activas (kanban, goals)

**Además:**
- Conversation compaction (>30 msgs) reemplaza mensajes con un summary agresivo
- Greeting trim reemplaza el system prompt del agente (~20K tokens con skills/tools) con: `"You are a helpful assistant. Reply in 1-2 short sentences."`
- Esto **mata completamente** la personalidad, capacidades y contexto del agente

#### Capa 2 — Desktop History Truncation

**Archivo:** `omniworker-desktop/src/main/omniworker.ts:352-675`

- El desktop solo envía los **últimos 50 mensajes** al agente
- Si hay >30 mensajes: `HistoryCache` summary + **últimos 20**
- Solo pasa `role` y `content` — **pierde:**
  - `tool_calls` / `tool_call_id`
  - `reasoning` / `reasoning_content`
  - `provider_data`
  - `finish_reason`
  - Multimodal content (images)
- Esto **rompe la integridad** de tool-call pairs al resumir

#### Capa 3 — Agent Core Context Compression

**Archivo:** `omniworker-agent/agent/context_compressor.py`

- Cuando la ventana de contexto se llena (>50% por defecto), reemplaza mensajes del medio con un summary
- El summary es **narrativo** (hasta 12K tokens): Active Task, Goal, Constraints, Completed Actions, Active State, Blocked, Key Decisions...
- Es **lossy**: pierde detalles de tool results, código leído, decisiones intermedias
- Los `provider_data` bags NO se preservan en el summary
- Cuando hay compresión, se crea una **nueva sesión** (`parent_session_id` chain) — el agente pierde continuidad de estado en memoria

### 1.3 Estado actual de la memoria

**10 memory providers externos (todos opcionales):**
| Provider | Tipo | Requiere config |
|----------|------|-----------------|
| honcho | Cloud API | API key |
| hindsight | Cloud/Local | API key o daemon |
| mem0 | Cloud API | API key |
| retaindb | Cloud API | API key |
| supermemory | Cloud API | API key |
| openviking | Local/Remote | Servidor |
| byterover | Local CLI | CLI tool |
| holographic | Local SQLite | Nada (pero es plugin opcional) |
| local_embed | Local SQLite + llama.cpp | Servidor localhost:11435 |
| offline_fts | Local SQLite (FTS5) | Nada (pero es plugin opcional) |

**Problema:** Ninguno es **nativo y por defecto**. El usuario debe:
1. Elegir uno
2. Configurar API keys o servidores
3. Esperar que funcione

**Memoria que SÍ es nativa pero muy limitada:**
- `MEMORY.md` / `USER.md`: archivos planos, ~2200/1375 chars max
- `detected_patterns`: patrones aprendidos cross-session (keyword-based)
- `messages_fts` (FTS5): búsqueda de texto en todas las sesiones pasadas

---

## 2. Viabilidad Técnica

### 2.1 ¿Es viable crear memoria nativa sin configuración?

**Sí.** Ya existen las piezas:
- SQLite con WAL mode ya es el store principal (`state.db`)
- FTS5 ya indexa mensajes (`messages_fts`)
- `offline_fts` ya demuestra BM25 + recency scoring cross-session
- `holographic` ya demuestra entity resolution + trust scoring en SQLite local
- `sqlite-vec` está disponible en pip (v0.1.9) — extensión SQLite para vector search

### 2.2 Opciones de embeddings para semantic search

| Opción | Ventaja | Desventaja | Veredicto |
|--------|---------|------------|-----------|
| **A. sqlite-vec + ONNX local** (all-MiniLM-L6-v2) | 100% offline, 0 costo | +20MB download, CPU overhead | **Ideal** para nativo |
| **B. Provider API embeddings** | Sin dependencias extra | Costo por embedding, latencia de red | **Fallback** cuando A no disponible |
| **C. BM25/FTS5 nativo** (mejorar offline_fts) | Ya funciona, 0 setup | Solo keyword, no semántico | **Base siempre activa** |
| **D. Holographic HRR** | Ya existe, local | Complejo, overkill para búsqueda | **No recomendado** como default |

**Estrategia recomendada (híbrida):**
1. **BM25/FTS5 como base siempre activa** — sin configuración, funciona out-of-the-box
2. **sqlite-vec + ONNX como mejora opcional** — descarga lazy del modelo, se activa automáticamente
3. **Provider API embeddings como fallback** — si el usuario tiene API key configurada, usamos embeddings de alta calidad

### 2.3 ¿Es viable preservar provider_data entre modelos?

**Sí.** El agente ya tiene `provider_data` bags en `NormalizedResponse` y `ToolCall`. Lo que falta es:
- Persistirlos en `state.db` (tabla nueva `provider_state`)
- Recuperarlos al reconstruir el AIAgent (gateway) o al cambiar de modelo (`switch_model`)
- Sanitizarlos según el provider destino (ej: no enviar Codex `call_id` a Anthropic)

### 2.4 ¿Es viable eliminar el truncamiento del desktop?

**Parcialmente.** El desktop trunca para evitar enviar 10K+ tokens por HTTP en cada mensaje. Pero podemos:
- Aumentar el cap de 50 → 200 mensajes (o ilimitado con streaming de chunks)
- Enviar mensajes **completos** (con tool_calls, reasoning) en vez de solo role+content
- Usar el **session_id** para que el agente recupere el historial desde SQLite, no desde el desktop

---

## 3. Plan de Ejecución — 3 Fases

---

### FASE 1: Native Semantic Memory Core (omniworker-agent)
**Objetivo:** El agente recuerda automáticamente todo lo aprendido en sesiones pasadas, sin configuración.

**Archivos a crear/modificar:**

| Archivo | Acción | Descripción |
|---------|--------|-------------|
| `omniworker-agent/agent/native_memory.py` | **Crear** | Core del sistema de memoria nativa. BM25 + sqlite-vec híbrido. |
| `omniworker-agent/omniworker_state.py` | **Modificar** | Agregar tablas: `memory_chunks`, `memory_embeddings` (sqlite-vec), `memory_facts`, `workspace_state` |
| `omniworker-agent/agent/memory_manager.py` | **Modificar** | Integrar `NativeMemory` como provider por defecto (no opcional). Siempre activo. |
| `omniworker-agent/run_agent.py` | **Modificar** | Llamar `native_memory.sync_turn()` después de cada turno. Inyectar recall en `build_system_prompt_parts()` y `prefetch()`. |
| `omniworker-agent/agent/context_compressor.py` | **Modificar** | Antes de comprimir, extraer facts/entities y guardar en `native_memory`. El compressed summary también se indexa. |
| `omniworker-agent/pyproject.toml` | **Modificar** | Agregar `sqlite-vec==0.1.9` como dependencia opcional (lazy load) |

**Diseño técnico:**

```
NativeMemory (siempre activo, sin config)
├── BM25Layer (FTS5 nativo, siempre disponible)
│   └── Indexa: cada mensaje, cada tool result, cada error
│   └── Search: BM25 × recency × session_affinity
│
├── VectorLayer (sqlite-vec, lazy load)
│   └── Embeddings via ONNX all-MiniLM-L6-v2 (local, 0 costo)
│   └── Fallback: provider API embeddings si ONNX no disponible
│   └── Fallback final: BM25 puro
│
├── FactLayer (structured facts)
│   └── Extrae entities, decisions, files, errors de cada turno
│   └── Entity resolution (deduplica "Auth" vs "Authentication" vs "auth.py")
│   └── Trust scoring: facts confirmadas múltiples veces = más relevantes
│
└── WorkspaceStateLayer (estado de tareas)
    └── Archivos editados recientemente
    └── Errores activos (no resueltos)
    └── Tareas pendientes (kanban, goals)
    └── Decisiones abiertas (esperando confirmación)
```

**API del NativeMemory:**
```python
class NativeMemory:
    def sync_turn(self, user_msg, assistant_msg, tool_results, session_id) -> None:
        """Indexa el turno completo en todas las capas."""

    def prefetch(self, query: str, session_id: str, k: int = 5) -> list[MemoryChunk]:
        """Recupera los k chunks más relevantes de TODAS las sesiones."""

    def get_workspace_state(self) -> WorkspaceState:
        """Retorna el estado actual del workspace para inyección en system prompt."""

    def on_file_edit(self, path: str, diff: str, session_id: str) -> None:
        """Registra una edición de archivo para tracking."""

    def on_error(self, error: str, context: str, session_id: str) -> None:
        """Registra un error para que el agente no lo olvide."""
```

**Inyección de contexto:**
- El `MemoryManager` inyecta automáticamente en cada turno:
  1. `memory-context`: chunks relevantes a la query actual (recuperados vía `prefetch()`)
  2. `workspace-state`: estado activo del workspace (archivos editados, errores, tareas)
  3. `session-lineage`: resumen de sesiones previas relacionadas (misma rama de compresión)

**Migraiones SQLite:**
```sql
-- memory_chunks: textos indexables
CREATE TABLE memory_chunks (
    id INTEGER PRIMARY KEY,
    session_id TEXT NOT NULL,
    turn_id INTEGER NOT NULL,
    chunk_type TEXT NOT NULL, -- 'user', 'assistant', 'tool_result', 'error', 'decision', 'file_edit'
    content TEXT NOT NULL,
    metadata TEXT, -- JSON: {file, line, tool, error_type, ...}
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (session_id) REFERENCES sessions(id)
);

-- FTS5 sobre memory_chunks
CREATE VIRTUAL TABLE memory_chunks_fts USING fts5(content, tokenize='trigram');

-- memory_embeddings: vectores sqlite-vec
CREATE VIRTUAL TABLE memory_embeddings USING vec0(
    chunk_id INTEGER PRIMARY KEY,
    embedding float[384] -- all-MiniLM-L6-v2 = 384 dims
);

-- memory_facts: hechos estructurados con entidades
CREATE TABLE memory_facts (
    id INTEGER PRIMARY KEY,
    session_id TEXT,
    fact_type TEXT NOT NULL, -- 'entity', 'decision', 'error', 'file', 'task', 'preference'
    subject TEXT NOT NULL,
    predicate TEXT NOT NULL,
    object TEXT,
    confidence REAL DEFAULT 1.0,
    occurrence_count INTEGER DEFAULT 1,
    first_seen TIMESTAMP,
    last_seen TIMESTAMP,
    UNIQUE(subject, predicate, object) ON CONFLICT REPLACE
);

-- workspace_state: estado activo del workspace
CREATE TABLE workspace_state (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

**Estimación:** 5-7 días de trabajo

---

### FASE 2: Persistent Model-Agnostic State (omniworker-agent)
**Objetivo:** Al cambiar de modelo (o al reconstruir el agente en gateway), el estado específico del provider y del workspace se recupera automáticamente.

**Archivos a crear/modificar:**

| Archivo | Acción | Descripción |
|---------|--------|-------------|
| `omniworker-agent/agent/provider_state.py` | **Crear** | Persiste/recupera `provider_data` bags en SQLite. Traduce entre formatos de provider. |
| `omniworker-agent/omniworker_state.py` | **Modificar** | Agregar tabla `provider_state` |
| `omniworker-agent/run_agent.py` | **Modificar** | `switch_model()` recupera provider_state del nuevo provider. `AIAgent.__init__()` recupera workspace_state de SQLite. |
| `omniworker-agent/agent/transports/base.py` | **Modificar** | Agregar `serialize_state()` / `deserialize_state()` al ABC de transport |
| `omniworker-agent/agent/transports/chat_completions.py` | **Modificar** | Implementar serialize/deserialize para Codex call_ids |
| `omniworker-agent/agent/transports/anthropic.py` | **Modificar** | Implementar serialize/deserialize para thinking blocks |

**Diseño técnico:**

```python
class ProviderStateStore:
    """Almacena estado específico de provider en SQLite para recuperación cross-modelo."""

    def save_turn_state(self, session_id: str, turn_idx: int,
                        provider: str, model: str,
                        provider_data: dict) -> None:
        """Guarda provider_data de un turno específico."""

    def get_recoverable_state(self, session_id: str, target_provider: str) -> dict:
        """Recupera y sanitiza provider_data para el provider destino.
        Ej: Codex call_ids se eliminan si target_provider != 'openai'.
        Ej: Gemini thought signatures se eliminan si target_provider != 'google'.
        """
```

**Tabla SQLite:**
```sql
CREATE TABLE provider_state (
    id INTEGER PRIMARY KEY,
    session_id TEXT NOT NULL,
    turn_idx INTEGER NOT NULL,
    provider TEXT NOT NULL,
    model TEXT,
    provider_data TEXT NOT NULL, -- JSON
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(session_id, turn_idx, provider)
);
```

**Mejoras al ContextCompressor:**
- Antes de comprimir, extraer y guardar:
  - Decisiones técnicas (patrón: "decidimos usar X porque Y")
  - Archivos editados (patrón: tool call `write_file` / `edit_file`)
  - Errores encontrados (patrón: tool result con error)
  - Estado de tareas (patrón: goal state, kanban updates)
- El summary generado debe incluir una sección estructurada (JSON) además del texto narrativo:
  ```json
  {
    "compressed_turns": [...],
    "preserved_facts": [
      {"type": "decision", "subject": "Auth", "predicate": "uses", "object": "JWT"},
      {"type": "file_edit", "subject": "src/auth.ts", "predicate": "modified", "object": "added bcrypt"},
      {"type": "error", "subject": "login", "predicate": "fails_with", "object": "CORS 403"}
    ]
  }
  ```

**Estimación:** 3-4 días de trabajo

---

### FASE 3: Desktop + Gateway Hardening
**Objetivo:** Eliminar truncamiento del desktop y mejorar el Context Bridge del gateway para usuarios con sesiones persistentes.

#### 3A — Desktop: Mensajes completos + Workspace State local

**Archivos a modificar:**

| Archivo | Cambio |
|---------|--------|
| `omniworker-desktop/src/main/omniworker.ts` | Eliminar cap de 50 msgs (o hacerlo configurable). Pasar mensajes completos con tool_calls, reasoning. |
| `omniworker-desktop/src/main/omniworker.ts` | Si mensajes >100, usar `session_id` para que el agente recupere desde SQLite en vez de enviar todo por HTTP. |
| `omniworker-desktop/src/renderer/src/screens/Chat/hooks/useChatActions.ts` | Incluir `workspaceState` en el payload de cada mensaje (archivos abiertos, errores visibles). |
| `omniworker-desktop/src/main/memory.ts` | Implementar Engram stubs (ya existen pero retornan `[]`). O usar el nuevo `NativeMemory` del agente vía IPC. |

**Cambios específicos en `sendMessageViaApi()`:**

```typescript
// ANTES (actual):
const rawMessages = history.slice(-50).map(m => ({ role: m.role, content: m.content }));
// SI >30: summary + últimos 20, sin tool_calls

// DESPUÉS (propuesto):
// Opción 1: Enviar todo
const rawMessages = history.map(m => ({
  role: m.role,
  content: m.content,
  tool_calls: m.tool_calls,
  tool_call_id: m.tool_call_id,
  reasoning_content: m.reasoning_content,
}));

// Opción 2: Si son demasiados, confiar en session_id
if (history.length > 100 && _resumeSessionId) {
  // El agente recuperará el historial completo desde state.db
  body = { model, messages: [{ role: "user", content: message }], session_id: _resumeSessionId };
} else {
  body = { model, messages: rawMessages, session_id: _resumeSessionId };
}
```

#### 3B — Gateway: Recuperar sesión completa desde SQLite

**Archivo:** `omniworker-agent/gateway/run.py`

El gateway crea un `AIAgent` fresco por cada mensaje. Actualmente recarga el historial desde `SessionDB`, pero NO recupera:
- workspace_state
- provider_state
- memory prefetches

**Cambio:** En la creación del AIAgent para una sesión existente, recuperar también:
```python
# En gateway/run.py, al crear AIAgent para sesión existente:
agent = AIAgent(...)
agent.memory_manager.native_memory.restore_workspace_state(session_id)
agent.provider_state_store.load_for_session(session_id, agent.provider, agent.model)
```

#### 3C — SaaS Context Bridge (mejora)

**Archivo:** `omniworker-saas/src/lib/context-bridge.ts`

**Problema:** El Context Bridge actual es un resumen narrativo lossy.

**Mejora:** Híbrido narrativo + estructurado
```typescript
interface EnhancedContextHeader {
  // Narrativo (existente)
  sessionSummary: string;
  recentDecisions: string[];
  currentTask: string;
  previousModel: string;
  keyEntities: string[];

  // NUEVO: Estructurado
  workspaceState: {
    recentlyEditedFiles: Array<{path: string, lastEdit: number, summary: string}>;
    activeErrors: Array<{error: string, file?: string, status: 'open'|'resolved'}>;
    pendingDecisions: Array<{question: string, options: string[], deadline?: number}>;
    activeGoals: Array<{goal: string, progress: number}>;
  };

  // NUEVO: Memoria del agente (viene del NativeMemory)
  relevantFacts: Array<{subject: string, predicate: string, object: string, confidence: number}>;
  relevantPastSessions: Array<{sessionId: string, summary: string, relevanceScore: number}>;
}
```

**Además:** El gateway debe respetar `session_id` cuando viene del desktop/agente. Si el cliente envía `session_id`, NO hacer compaction agresivo ni greeting trim. El agente manejará su propio contexto.

**Estimación:** 4-5 días de trabajo

---

## 4. Decisiones Técnicas Clave

### 4.1 ¿Embeddings locales o API?
**Decisión:** Híbrido con fallback automático.
1. Intentar cargar ONNX local (all-MiniLM-L6-v2, ~20MB, descarga lazy)
2. Si no disponible, usar API del provider configurado (costo mínimo: ~$0.0001 por query)
3. Si no disponible, usar BM25 puro (siempre funciona)

### 4.2 ¿Dónde corre el embedding?
**Decisión:** En el mismo proceso del agente (no servidor separado).
- ONNX Runtime es suficientemente rápido para inferencia de 1-2 oraciones
- Latencia aceptable: ~50-200ms por query
- No requiere mantener un daemon adicional

### 4.3 ¿Cuánto contexto se inyecta por turno?
**Decisión:** Hasta 2000 tokens de memoria recuperada.
- Prefetch de 5-10 chunks relevantes
- Cada chunk ~100-200 tokens
- Workspace state ~500 tokens
- Total: ~1500-2000 tokens (manejable para cualquier modelo)

### 4.4 ¿Cómo evitar que la memoria "inunde" el contexto?
**Decisión:** Relevancia dinámica + deduplicación.
- Solo inyectar chunks con score > umbral (ej: 0.7)
- Deduplicar por entidad (si 3 chunks hablan de "Auth", fusionar en 1)
- Marcar chunks inyectados para no repetirlos en turnos consecutivos
- TTL: facts >30 días sin reconfirmación bajan de prioridad

### 4.5 ¿Backward compatibility?
**Decisión:** 100% backward compatible.
- Las tablas nuevas se crean vía migración declarativa (ya existe el patrón en `omniworker_state.py`)
- Si `sqlite-vec` no está instalado, fallback a BM25
- Los memory providers externos siguen funcionando igual
- `NativeMemory` es ADDITIONAL, no reemplaza los externos

---

## 5. Trade-offs y Riesgos

| Riesgo | Impacto | Mitigación |
|--------|---------|------------|
| sqlite-vec extensión nativa falla en alguna plataforma | Alto | Fallback automático a BM25. No es crítico. |
| Embeddings locales consumen RAM/CPU | Medio | Modelo MiniLM es pequeño (~20MB). ONNX optimizado. |
| Inyección de memoria aumenta tokens por turno | Medio | Cap de 2000 tokens. Compresión inteligente. |
| Desktop envía mensajes grandes por HTTP | Bajo | Usar session_id para recuperación lado servidor. |
| SaaS Context Bridge duplica información | Medio | Detectar si el cliente es OmniWorker desktop/agente y omitir header si ya tiene memoria nativa. |
| Migración de DB en gateways en producción | Alto | WAL mode + migraciones declarativas ya probadas. |

---

## 6. Estimación Total

| Fase | Días | Entregable |
|------|------|------------|
| Fase 1: Native Semantic Memory Core | 5-7 | `native_memory.py`, tablas SQLite, integración con `MemoryManager` |
| Fase 2: Persistent Model-Agnostic State | 3-4 | `provider_state.py`, mejoras a `ContextCompressor` |
| Fase 3: Desktop + Gateway Hardening | 4-5 | Desktop sin truncamiento, gateway recovery, Context Bridge mejorado |
| **Testing + Edge cases** | 3-4 | Tests herméticos, validación multi-provider, validación desktop |
| **Total** | **15-20 días** | |

---

## 7. Próximos Pasos (Inmediatos)

1. **Aprobación del plan** — ¿Aprobamos este enfoque? ¿Algún ajuste?
2. **Fase 1 — Diseño detallado de `native_memory.py`** — Definir la API exacta y el schema de tablas
3. **PoC sqlite-vec** — Validar que funciona en el entorno de desarrollo
4. **Implementación incremental** — Una capa a la vez, con tests en cada paso

---

## Apéndice: Archivos relevantes del grafo

Los siguientes nodos del grafo son críticos para este plan:

- `AIAgent` — `omniworker-agent/run_agent.py` (1,688 edges)
- `BasePlatformAdapter` — `omniworker-agent/gateway/platforms/base.py` (1,582 edges)
- `PlatformConfig` — `omniworker-agent/gateway/config.py` (1,576 edges)
- `MessageEvent` — `omniworker-agent/gateway/platforms/base.py` (1,444 edges)
- `MessageType` — `omniworker-agent/gateway/platforms/base.py` (1,382 edges)
- `ContextCompressor` — `omniworker-agent/agent/context_compressor.py`
- `MemoryManager` — `omniworker-agent/agent/memory_manager.py`
- `SessionDB` — `omniworker-agent/omniworker_state.py`
- `GoalManager` — `omniworker-agent/omniworker_cli/goals.py`
- `ContextBridge` — `omniworker-saas/src/lib/context-bridge.ts`
