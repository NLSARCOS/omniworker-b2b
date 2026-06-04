# Plan de Contexto Persistente — Ejecución Completa

> **Proyecto:** OmniWorker (Flux Agent)  
> **Fecha:** 2026-06-04  
> **Scope:** Agente nativo + Desktop + Gateway + SaaS Context Bridge  
> **Estado:** ✅ Completado

---

## 1. Problema Original

El agente perdía contexto de 3 maneras críticas:

1. **Desktop truncaba a 50 mensajes** (`useChatActions.ts` `.slice(-50)`) y luego a 30/20 en `sendMessageViaApi`, eliminando `tool_calls`, `reasoning`, y `reasoning_content`.
2. **SaaS Context Bridge** generaba un resumen lossy de 800-1200 tokens con cache de 15 minutos, y reemplazaba el system prompt con `"You are a helpful assistant"` en saludos simples.
3. **Gateway creaba agentes frescos** por mensaje (cache miss / eviction) sin recuperar `_session_messages`, `workspace_state`, ni `provider_state` de la DB.

El `switch_model()` del agente **no** perdía `self._session_messages` (es in-place), pero el **desktop**, el **SaaS**, y el **gateway** sí perdían información antes de que llegara al agente.

---

## 2. FASE 1 — Native Semantic Memory (siempre activa)

### Objetivo
Crear una memoria nativa híbrida (BM25 + sqlite-vec + facts + workspace) que funcione sin configuración y sobreviva a reinicios, cambios de modelo, y nuevas instancias del agente.

### Archivos nuevos

| Archivo | Descripción |
|---------|-------------|
| `omniworker-agent/agent/native_memory.py` | **BM25Layer** (FTS5 full-text), **VectorLayer** (sqlite-vec opcional), **FactLayer** (extracción de entidades), **WorkspaceStateLayer** (files, errors, decisions, goals). **NativeMemory** las orquesta. **NativeMemoryProvider** adapta todo a la interfaz `MemoryProvider`. |

### Archivos modificados

| Archivo | Cambio |
|---------|--------|
| `omniworker-agent/agent/memory_manager.py` | `NativeMemoryProvider` se registra **automáticamente** como proveedor default si hay `session_db`. `sync_all()` ahora acepta `tool_results` y los reenvía solo a proveedores cuya firma lo soporta (compatible hacia atrás vía `inspect.signature`). |
| `omniworker-agent/run_agent.py` | En `__init__`: crea `NativeMemoryProvider(session_db)` y lo añade al `MemoryManager`. Al final de cada turno: llama `_sync_external_memory_for_turn()` que extrae mensajes `role=="tool"` y los pasa como `tool_results` a `memory_manager.sync_all()`. |

### API pública de NativeMemory

```python
from agent.native_memory import NativeMemory, NativeMemoryProvider

# Directo
native = NativeMemory(conn)
native.sync_turn(user_msg, assistant_msg, tool_results, session_id, turn_id)
context = native.prefetch(user_query, session_id)
ws = native.get_workspace_state()

# Via MemoryManager
provider = NativeMemoryProvider(session_db)
memory_manager.add_provider(provider)
```

### Tablas SQLite creadas lazy

```sql
memory_chunks          -- chunks de texto indexados
memory_chunks_fts      -- FTS5 virtual table
memory_embeddings      -- vec0 (sqlite-vec) para vector search
memory_facts           -- hechos extraídos con entidades
workspace_state        -- estado estructurado (files, errors, decisions, goals, last_task)
```

---

## 3. FASE 2 — Provider State Persistence (cross-modelo)

### Objetivo
Persistir `provider_data` (call IDs, signatures, reasoning items, etc.) por turno en SQLite, y recuperarlos sanitizados cuando se cambia de modelo.

### Archivos nuevos

| Archivo | Descripción |
|---------|-------------|
| `omniworker-agent/agent/provider_state.py` | `ProviderStateStore` guarda `provider_data` por `(session_id, turn_idx, provider, model)`. `get_recoverable_state()` devuelve el estado del provider destino. `_sanitize_for_provider()` limpia campos incompatibles: quita `call_id` para no-OpenAI, quita `signature` para no-Anthropic, etc. |

### Tabla SQLite

```sql
CREATE TABLE provider_state (
    session_id TEXT NOT NULL,
    turn_idx INTEGER NOT NULL,
    provider TEXT NOT NULL,
    model TEXT NOT NULL,
    provider_data TEXT NOT NULL,
    created_at REAL NOT NULL,
    PRIMARY KEY (session_id, turn_idx)
);
```

### Archivos modificados

| Archivo | Cambio |
|---------|--------|
| `omniworker-agent/run_agent.py` | Después de cada respuesta normalizada: `self._provider_state.save_turn_state(...)`. En `switch_model()`: recupera estado vía `get_recoverable_state()` y lo guarda en `self._recovered_provider_state`. |

---

## 4. FASE 3 — Desktop + Gateway + SaaS

### 4.1 Desktop (eliminar truncamiento)

**Problema:** El desktop truncaba a 50 mensajes en el frontend, luego a 30/20 en el backend, y nunca enviaba `tool_calls` ni `reasoning`.

**Solución:** Cuando hay `sessionId`, el desktop **solo envía el mensaje actual** + header `X-Flux Agent-Session-Id`. El API server recupera el historial **completo** (con `tool_calls`, `reasoning`, etc.) desde SQLite.

| Archivo | Cambio |
|---------|--------|
| `omniworker-desktop/src/renderer/src/screens/Chat/hooks/useChatActions.ts` | `sendToAgent`: si hay `sessionId` Y más de 10 mensajes, envía `history: undefined` (backend recupera todo). Si no hay `sessionId`, envía **todos** los mensajes sin `.slice(-50)`. |
| `omniworker-desktop/src/main/omniworker.ts` | `sendMessageViaApi`: eliminado `MAX_FULL_MESSAGES=30` y `KEEP_RECENT=20`. Eliminado `HistoryCache`. Si hay `_resumeSessionId`, agrega header `X-Flux Agent-Session-Id` y envía solo el mensaje actual. Si no hay, envía historial completo. |
| `omniworker-desktop/src/preload/index.d.ts` | `history?: Array<{role, content}> \| undefined` |
| `omniworker-desktop/src/preload/index.ts` | Misma firma actualizada |
| `omniworker-desktop/src/main/index.ts` | Handler IPC `send-message` acepta `history` opcional/undefined |

### 4.2 Gateway / API Server

**Problema:** El API server requería `API_SERVER_KEY` para aceptar `X-Flux Agent-Session-Id`, lo que bloqueaba al desktop local.

**Solución:** Permite `X-Flux Agent-Session-Id` desde **localhost** (`127.0.0.1`, `::1`) sin API key.

| Archivo | Cambio |
|---------|--------|
| `omniworker-agent/gateway/platforms/api_server.py` | Línea ~1068: agregada excepción `_is_localhost` antes de rechazar session continuation por falta de API key. |

**Nuevo endpoint:**

| Método | Path | Descripción |
|--------|------|-------------|
| `GET` | `/v1/sessions/{session_id}/workspace` | Devuelve workspace state estructurado: `files`, `errors`, `decisions`, `goals`, `last_task`. Requiere auth (API key o localhost). |

Implementado en `api_server.py` como `_handle_get_session_workspace`.

### 4.3 Agent (recuperación al init)

**Problema:** Cuando el gateway creaba un agente fresco (cache miss), `_session_messages` arrancaba vacío.

**Solución:** Al final de `__init__`, si hay `session_db` + `session_id`, el agente recupera automáticamente:

| Dato | Fuente |
|------|--------|
| `_session_messages` | `session_db.get_messages_as_conversation(session_id)` |
| `_recovered_provider_state` | `ProviderStateStore.get_recoverable_state(session_id, provider)` |
| Workspace state | `NativeMemoryProvider._native.get_workspace_state()` |

**Archivo:** `omniworker-agent/run_agent.py` (final de `__init__`)

### 4.4 SaaS Context Bridge

**Problema:** El Context Bridge era un resumen lossy de 800-1200 tokens con cache de 15 minutos, y `trimSystemPrompt()` destruía todo el contexto.

**Soluciones:**

| Archivo | Cambio |
|---------|--------|
| `omniworker-saas/src/lib/context-bridge.ts` | Nuevo tipo `WorkspaceState`. `fetchWorkspaceState()` consulta `GET /v1/sessions/{session_id}/workspace` del agente local. `generateFallbackHeader()` extrae errores, goals, y tool calls de los mensajes. `formatContextHeaderAsMessage()` inyecta `workspaceState` estructurado en el system message. |
| `omniworker-saas/src/app/api/v1/chat/completions/route.ts` | `trimSystemPrompt()` ahora **preserva los primeros 500 chars** del system prompt (identidad + instrucciones core) en lugar de reemplazarlo con `"You are a helpful assistant"`. |

---

## 5. Flujo de datos ahora (turno N+1)

```
┌─────────────┐     ┌──────────────────┐     ┌─────────────────┐
│   Desktop   │────▶│  API Server      │────▶│   AIAgent       │
│             │     │  (gateway)       │     │   (fresco)      │
└─────────────┘     └──────────────────┘     └─────────────────┘
      │                      │                        │
      │ 1. Mensaje actual    │ 2. X-Flux Agent-      │ 3. __init__:
      │    + session_id      │    Session-Id header   │    recover msgs
      │    (NO history)      │                        │    from SQLite
      │                      │                        │
      │                      │ 4. history =           │ 5. run_conversation:
      │                      │    get_messages_as_    │    messages =
      │                      │    conversation()      │    conversation_history
      │                      │                        │
      │                      │ 6. Pasar history       │ 7. Persistir turno
      │                      │    a run_conversation  │    en SQLite
      │                      │                        │
      │ 8. Respuesta SSE     │ 9. Devolver response   │
      │    + session_id      │    + session_id        │
```

**Ventajas:**
- El desktop **nunca** envía un historial truncado o incompleto.
- El agente siempre recupera **tool_calls**, **reasoning**, y **provider_state**.
- El workspace state se mantiene **estructurado** y **persistente**.
- El SaaS ya no destruye el system prompt en saludos.

---

## 6. Archivos tocados (resumen)

### Nuevos
- `omniworker-agent/agent/native_memory.py`
- `omniworker-agent/agent/provider_state.py`

### Modificados — Agente
- `omniworker-agent/run_agent.py`
- `omniworker-agent/agent/memory_manager.py`

### Modificados — Gateway / API Server
- `omniworker-agent/gateway/platforms/api_server.py`

### Modificados — Desktop
- `omniworker-desktop/src/main/omniworker.ts`
- `omniworker-desktop/src/main/index.ts`
- `omniworker-desktop/src/preload/index.ts`
- `omniworker-desktop/src/preload/index.d.ts`
- `omniworker-desktop/src/renderer/src/screens/Chat/hooks/useChatActions.ts`

### Modificados — SaaS
- `omniworker-saas/src/lib/context-bridge.ts`
- `omniworker-saas/src/app/api/v1/chat/completions/route.ts`

---

## 7. Validación sugerida

1. **Desktop local:**
   ```bash
   cd omniworker-desktop && npm run dev
   ```
   - Iniciar chat, hacer 60+ turnos con tool calls.
   - Verificar que el agente recuerda archivos editados y errores previos.
   - Verificar en Network que `X-Flux Agent-Session-Id` se envía y que `messages` solo contiene el último mensaje.

2. **Agente Python:**
   ```bash
   cd omniworker-agent && python3 -c "
   from agent.native_memory import NativeMemory
   from omniworker_state import SessionDB
   db = SessionDB()
   mem = NativeMemory(db)
   print('native_memory OK')
   "
   ```

3. **API Server workspace endpoint:**
   ```bash
   curl http://127.0.0.1:8642/v1/sessions/<session_id>/workspace \
     -H "Authorization: Bearer $API_SERVER_KEY"
   ```

4. **SaaS Context Bridge:**
   - Enviar saludo simple ("hola") vía SaaS.
   - Verificar que el system prompt **no** se reemplaza por `"You are a helpful assistant"`.

---

## 8. Notas técnicas

- **Python 3.14:** No hay wheels de `onnxruntime`, por lo que las embeddings locales no están disponibles. El fallback es BM25 (siempre funciona) + sqlite-vec (si está instalado) + provider API embeddings (configurable).
- **Rebrand Flux Agent:** Algunos archivos del desktop y SaaS tienen errores de TypeScript preexistentes por el rebrand (`flux-agent` con espacio en nombres de variables/imports). Estos no fueron introducidos por este plan.
- **ContextCompressor:** No se modificó. Sigue existiendo, pero ahora el historial que le llega al agente es **completo** (no truncado por el desktop), por lo que la compresión solo activa cuando realmente se acerca al límite de contexto del modelo.

---

*Documento generado automáticamente por el agente de ejecución.*
