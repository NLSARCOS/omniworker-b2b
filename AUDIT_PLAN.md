# OmniWorker — Plan de Auditoría Técnica

**Versión:** 1.0 | **Fecha:** 2026-05-26 | **Autor:** Senior Dev Audit  
**Scope:** omniworker-agent + omniworker-desktop + omniworker-saas  
**Stack:** Hermes Agent Framework (Nous Research) + Electron 39 + Next.js 16 + Prisma/SQLite

---

## Arquitectura del Sistema

```
┌─────────────────────────────────────────────────────────────────────┐
│                        OMNIWORKER PLATFORM                         │
│                                                                     │
│  ┌──────────────┐    ┌──────────────────┐    ┌──────────────────┐  │
│  │  SaaS (Next)  │◄──│  Desktop (Elec)  │───►│  Agent (Python)  │  │
│  │  Port :3000   │    │  Main + Renderer │    │  Port :8642      │  │
│  │               │    │                  │    │                  │  │
│  │ ┌───────────┐ │    │ ┌──────────────┐ │    │ ┌──────────────┐ │  │
│  │ │ Auth/JWT  │ │    │ │ IPC Bridge   │ │    │ │ AIAgent Core │ │  │
│  │ │ LLM Gate  │ │    │ │ ~400 methods │ │    │ │ 16K lines    │ │  │
│  │ │ Edge Mgmt │ │    │ │              │ │    │ │              │ │  │
│  │ │ Licensing │ │    │ ├──────────────┤ │    │ ├──────────────┤ │  │
│  │ │ Billing   │ │    │ │ Process Mgr  │ │    │ │ Conv Loop    │ │  │
│  │ └───────────┘ │    │ │ SSH Tunnel   │ │    │ │ Compressor   │ │  │
│  │               │    │ │ Power Mgr    │ │    │ │ Memory Mgr   │ │  │
│  │ ┌───────────┐ │    │ │ Engram       │ │    │ │ Tool Registry│ │  │
│  │ │ Prisma DB │ │    │ │ WhatsApp Bot │ │    │ │ 70+ tools    │ │  │
│  │ │ SQLite    │ │    │ └──────────────┘ │    │ │ 28 toolsets  │ │  │
│  │ │ 12 models │ │    │                  │    │ └──────────────┘ │  │
│  │ └───────────┘ │    │ ┌──────────────┐ │    │                  │  │
│  └──────────────┘    │ │ SQLite x3    │ │    │ ┌──────────────┐ │  │
│                       │ │ state.db     │ │    │ │ Gateway      │ │  │
│                       │ │ kanban.db    │ │    │ │ 20 platforms │ │  │
│                       │ │ convos.db    │ │    │ │ Session Mgmt │ │  │
│                       │ └──────────────┘ │    │ └──────────────┘ │  │
│                       └──────────────────┘    └──────────────────┘  │
└─────────────────────────────────────────────────────────────────────┘

Flujo de datos:
  User ──► Desktop (Electron) ──► Agent (HTTP SSE :8642) ──► LLM Provider
                │                        │
                │                        ├──► SQLite (state.db + FTS5)
                │                        ├──► MEMORY.md / USER.md
                │                        └──► External Memory (Honcho/etc)
                │
                └──► SaaS (JWT auth, license validation, token balance)
```

---

## Assumptions: Qué NO auditar

| Componente | Razón para excluir |
|---|---|
| Hermes core upstream (nousresearch/hermes-agent) | Mantenido por Nous Research; bugs upstream se reportan, no se auditan |
| Providers externos (OpenAI, Anthropic APIs) | Fuera de control; solo auditar retry/fallback logic |
| Electron framework internals | Chromium/V8 GC es maduro; auditar solo lo que OmniWorker hace con él |
| Landing page animations (Framer/GSAP) | No afectan estabilidad del producto core |
| i18n translations | Correctness issue, no performance/stability |

---

## SECCIÓN 1 — SCOPE EXPANSION

### 1.1 Memory Allocation Patterns (Agent — Python)

| Área | Por qué es crítica | Cómo falla | Síntomas |
|---|---|---|---|
| **`run_agent.py` (16,235 líneas)** | Clase monolítica AIAgent; cada instancia carga tool registry, memory manager, provider state, conversation history completa | Objetos no liberados entre turns; subagents spawneados en ThreadPoolExecutor sin cleanup explícito | RAM creciente por sesión; OOM después de N sesiones largas |
| **Conversation history list** | Lista de dicts en memoria que crece con cada turn; incluye tool outputs (hasta 50KB/output) | Compressor trigger en 50% del context window, pero la lista Python sigue en RAM incluso después de comprimir | Footprint Python ≠ tokens enviados; la lista crece indefinidamente si compress solo reemplaza mensajes pero no libera |
| **Tool output storage** | `tool_results_cache` en SQLite para dedup, pero resultados raw viven en conversation list | Tool calls que retornan archivos grandes (read_file 200K chars) permanecen en la lista | 50MB+ por sesión con uso intensivo de herramientas |
| **Subagent lifecycle** | `delegate_tool.py` spawns AIAgent en ThreadPoolExecutor; presupuesto compartido via IterationBudget | Si el child timeout (600s) no mata al thread limpiamente, el AIAgent hijo + su conversation history quedan en memoria | Memory leak proporcional al número de delegaciones; difícil de reproducir con pocos subagents |
| **Memory providers** | Plugins (Honcho, Hindsight, etc.) pueden mantener HTTP connections, buffers, caches | Providers que hacen prefetch async pueden acumular futures/responses no consumidos | Conexiones HTTP idle acumuladas; async buffers growing |

### 1.2 Context Window Management (Agent)

| Área | Por qué es crítica | Cómo falla | Síntomas |
|---|---|---|---|
| **Compression threshold (50%)** | El compressor se triggerea cuando estimated tokens > 50% del context window | `estimate_tokens_rough()` usa `len(text)/4` — impreciso en ±20% para texto mixto (code, markdown, JSON) | Compresión tardía → API 400 (context exceeded) o compresión prematura → pérdida de contexto innecesaria |
| **Summary model context ≥ main model** | Documentación Hermes advierte: si el auxiliary model tiene menor context, turns del medio se **dropean sin resumen** | OmniWorker puede usar `gemini-flash` como auxiliary contra `claude-opus` como main; si flash tiene 1M y opus 200K está OK, pero si se invierte → data loss silencioso | Agente "olvida" contexto medio sin warnings; usuario percibe incoherencia |
| **Image token estimation** | `_count_image_tokens()` usa 1600 tokens fijo por imagen | Imágenes de alta resolución en Claude cuestan 1-5K tokens; sub-estimación causa overflow | API rechaza request; usuario ve error genérico |
| **System prompt growth** | Prompt builder concatena: SOUL.md + MEMORY.md + USER.md + skills + context files + tool schemas | Con 70+ tools y skills activos, system prompt puede ocupar 15-25K tokens, reduciendo espacio para conversación | Sesiones largas comprimen agresivamente; usuario pierde contexto rápido |
| **Prefix cache invalidation** | System prompt cacheado en SessionDB para hit de cache; se invalida si memory/skills cambian | Cada `memory append` mid-session invalida el cache pero el prompt no se rebuild hasta siguiente turn | Cache miss inesperado; costos 4x en input tokens |

### 1.3 Vector / FTS Operations (Agent)

| Área | Por qué es crítica | Cómo falla | Síntomas |
|---|---|---|---|
| **FTS5 index growth** | `state.db` con FTS5 indexa TODOS los mensajes de TODAS las sesiones | Sin pruning automático (disabled by default), index crece ~10-15MB/100 sesiones | Queries progresivamente más lentas; disk space en dispositivos limitados |
| **FTS5 query quality** | Boolean full-text (BM25) no es semantic search; depende de keyword matching | Queries con sinónimos, idiomas mixtos (español/inglés), o conceptos abstractos retornan 0 resultados | session_search parece "no funcionar" para usuarios que preguntan en lenguaje natural |
| **External memory semantic gap** | Honcho/Hindsight hacen embedding server-side; calidad depende del modelo de embedding del provider | Si provider cambia modelo de embeddings, resultados históricos degradan | Recall quality decrece silenciosamente; difícil de detectar |

### 1.4 Electron Process Management (Desktop)

| Área | Por qué es crítica | Cómo falla | Síntomas |
|---|---|---|---|
| **IPC bridge (~400 methods)** | Preload expone `window.omniworkerAPI` con 400+ métodos IPC | Cada IPC call serializa/deserializa; calls frecuentes con payloads grandes (session history) saturan el bridge | UI lag perceptible; renderer "colgado" esperando IPC response |
| **Child process spawning** | Main process spawns: Python CLI, SSH tunnel, Gateway, Smart Router, Engram daemon, WhatsApp bot | Procesos zombies si kill signal no se propaga; orphan PIDs después de crash | `ps aux | grep omniworker` muestra procesos huérfanos; port conflicts al reiniciar |
| **`webSecurity: false`** | Deshabilitado para CORS en Windows/Mac | Abre la puerta a mixed content, MITM en requests del renderer, XSS elevation | Vulnerabilidad de seguridad; no impacta performance pero sí estabilidad ante ataques |
| **SQLite concurrent access** | Desktop lee `state.db` en readonly para UI (sessions, memory stats), mientras Agent escribe | `better-sqlite3` es sync; reads durante writes pueden bloquear main process | UI freezes de 100-500ms durante intensive agent activity |
| **Memory subscription cleanup** | `memoryChangeSubscriptions: Map<number, () => void>` per webContents | Si webContents se destruye sin triggering 'destroyed' event, subscription leaks | Minor memory leak; más relevante en escenarios de multi-window |

### 1.5 SaaS Backend (Next.js)

| Área | Por qué es crítica | Cómo falla | Síntomas |
|---|---|---|---|
| **Token balance race condition** | Chat deducts tokens: read balance → process → write new balance | Dos requests concurrentes del mismo tenant leen el mismo balance, ambos deducen, uno se pierde | Over-spending de tokens; tenant consume más de lo que pagó |
| **Refresh token rotation** | Family-based rotation; old token revoked on refresh | Si refresh request fails mid-flight (network), user queda sin tokens válidos | Logout inesperado; usuario debe re-login |
| **LLM Gateway routing** | `/api/v1/chat/completions` proxies a 9+ providers con intelligent routing | Token estimation via `JSON.stringify(messages).length / 4` es menos precisa que la del agent | Deducción incorrecta de token balance; subestimación = pérdida de revenue |
| **Rate limiting (in-memory fallback)** | `memoryCache` Map cuando Upstash Redis no está configurado | In-memory cache no sobrevive restart; en multi-instance deployment, cada instancia tiene su propia cache | Rate limits inefectivos en producción multi-pod |
| **Prisma singleton (dev mode)** | `global.prisma` persiste en hot reload de Next.js dev | En producción está bien; en dev, connections pool puede crecer si hot reload no limpia | Dev-only: "too many connections" en SQLite (less critical) |

### 1.6 Integration Points

| Área | Por qué es crítica | Cómo falla | Síntomas |
|---|---|---|---|
| **Desktop → Agent HTTP SSE** | Streaming via SSE en port 8642; abort via AbortController | Si agent crashea mid-stream, desktop puede quedar esperando chunks indefinidamente | UI muestra "thinking..." forever; requiere force-quit |
| **Desktop → SaaS JWT** | Auth tokens refreshed cada 12 min; plan validation on login | Si SaaS está down, desktop no puede validar licencia → puede bloquear uso offline | Agente funcional pero UI muestra "plan expired" por error de red |
| **Agent → External Memory** | Honcho/Hindsight calls en prefetch (pre-turn) y sync (post-turn) | Si provider tiene latencia alta, cada turn se retrasa; no hay timeout configurado en memory_manager | Turns de 30s+ con Honcho en red lenta; usuario percibe agente lento |
| **SaaS → Agent (Edge heartbeat)** | Edge agents envían heartbeat periódico; SaaS marca offline si no recibe | Sin grace period documentado; network blip = agent marcado offline | Dashboard muestra agentes "offline" intermitentemente |

---

## SECCIÓN 2 — CATEGORIZACIÓN DE BUGS

### Categoría A: Memory Management

| ID | Bug Type | Severidad | Componente | Archivo clave |
|---|---|---|---|---|
| A1 | Conversation list unbounded growth | ALTA | Agent | `run_agent.py` — conversation history list |
| A2 | Subagent memory not freed after timeout | ALTA | Agent | `tools/delegate_tool.py` — ThreadPoolExecutor |
| A3 | Tool output accumulation (50KB/call) | MEDIA | Agent | `agent/conversation_loop.py` |
| A4 | Electron child process zombies | ALTA | Desktop | `src/main/index.ts` — process spawning |
| A5 | IPC serialization overhead | MEDIA | Desktop | `src/preload/index.ts` — 400+ methods |
| A6 | SQLite FTS5 index unbounded growth | MEDIA | Agent | `omniworker_state.py` |
| A7 | Engram daemon memory accumulation | BAJA | Desktop | `src/main/memory.ts` |

### Categoría B: Context Handling

| ID | Bug Type | Severidad | Componente | Archivo clave |
|---|---|---|---|---|
| B1 | Token estimation ±20% accuracy | ALTA | Agent | `agent/model_metadata.py` — `estimate_tokens_rough()` |
| B2 | Silent context drop (auxiliary < main context) | CRÍTICA | Agent | `agent/context_compressor.py` |
| B3 | System prompt bloat (15-25K tokens) | MEDIA | Agent | `agent/prompt_builder.py` |
| B4 | Prefix cache invalidation on memory write | MEDIA | Agent | `agent/prompt_caching.py` |
| B5 | Image token underestimation | MEDIA | Agent | `agent/model_metadata.py` — `_count_image_tokens()` |
| B6 | Compression destroys tool call context | MEDIA | Agent | `agent/context_compressor.py` — middle turn summary |

### Categoría C: Data Integrity & State

| ID | Bug Type | Severidad | Componente | Archivo clave |
|---|---|---|---|---|
| C1 | Token balance race condition | CRÍTICA | SaaS | `api/v1/chat/completions/route.ts` |
| C2 | Refresh token mid-flight failure | ALTA | SaaS | `lib/auth.ts` — rotation logic |
| C3 | Session DB concurrent write conflicts | MEDIA | Desktop+Agent | `state.db` — SQLite WAL mode? |
| C4 | Memory.md character limit silent truncation | MEDIA | Agent | `tools/memory_tool.py` |
| C5 | Gateway session leak (no TTL cleanup) | MEDIA | Agent | `gateway/session.py` |

### Categoría D: Security

| ID | Bug Type | Severidad | Componente | Archivo clave |
|---|---|---|---|---|
| D1 | `webSecurity: false` in Electron | ALTA | Desktop | `src/main/index.ts:302` |
| D2 | In-memory rate limiting (bypassable) | ALTA | SaaS | `lib/rate-limit.ts` |
| D3 | Token estimation mismatch = revenue leak | MEDIA | SaaS | `api/v1/chat/completions/route.ts` |
| D4 | Memory injection via MEMORY.md | MEDIA | Agent | Agent security scanning |

### Categoría E: Performance & UX

| ID | Bug Type | Severidad | Componente | Archivo clave |
|---|---|---|---|---|
| E1 | SSE stream hang on agent crash | ALTA | Desktop | `src/main/omniworker.ts` — `sendMessageViaApi` |
| E2 | FTS5 search quality (keyword-only) | MEDIA | Agent | `tools/session_search_tool.py` |
| E3 | IPC blocking on large payloads | MEDIA | Desktop | `src/main/index.ts` — session history IPC |
| E4 | External memory provider latency (no timeout) | MEDIA | Agent | `agent/memory_manager.py` |
| E5 | Gateway 400-message hard limit | BAJA | Agent | Documented but harsh for power users |

---

## SECCIÓN 3 — METODOLOGÍA DE AUDITORÍA

### 3.1 Herramientas

| Herramienta | Propósito | Componente |
|---|---|---|
| **Python `tracemalloc`** | Snapshot memory allocation; diff entre turns para detectar leaks | Agent |
| **Python `objgraph`** | Visualizar object reference graphs; encontrar retain cycles | Agent |
| **`py-spy`** | Sampling profiler sin overhead; flamegraphs de CPU | Agent |
| **Node.js `--inspect` + Chrome DevTools** | Heap snapshots del main process Electron | Desktop |
| **Electron `process.memoryUsage()`** | RSS/heap tracking periódico del main + renderer | Desktop |
| **`better-sqlite3` `.pragma('journal_mode')` check** | Verificar WAL mode habilitado para concurrent reads | Desktop+Agent |
| **Custom middleware timing** | Medir latencia real de cada API route en SaaS | SaaS |
| **`httpx` request timing** | Medir latencia de external memory providers | Agent |
| **SQLite `.dbstat` virtual table** | Tamaño real de FTS5 index vs data | Agent |
| **`psutil` process tree** | Detectar procesos zombie/orphan post-crash | Desktop |

### 3.2 Métricas a rastrear

| Métrica | Baseline esperado | Alerta si |
|---|---|---|
| Agent RSS por sesión (10 turns) | < 200MB | > 500MB |
| Agent RSS por sesión (100 turns) | < 400MB | > 1GB |
| Agent RSS delta entre turns | < 5MB | > 20MB (leak) |
| Electron main process heap | < 150MB | > 400MB |
| IPC roundtrip latency | < 50ms | > 500ms |
| SSE first-byte latency | < 2s | > 10s |
| FTS5 query time (1000 sessions) | < 100ms | > 2s |
| Token estimation error vs actual | < 10% | > 25% |
| state.db size (100 sessions) | < 20MB | > 100MB |
| Child process count post-session | 0 (all cleaned) | > 0 (zombie) |

### 3.3 Test Cases

```
TC-MEM-01: Long session memory growth
  Setup: Fresh agent, 100-turn conversation with tool calls
  Measure: RSS after turn 10, 50, 100
  Expected: Sub-linear growth; post-compression RSS drops

TC-MEM-02: Subagent cleanup
  Setup: 10 sequential delegate_task calls, each timing out
  Measure: Thread count + RSS after all complete
  Expected: Thread count returns to baseline; RSS within 10% of pre-delegation

TC-CTX-01: Compression accuracy
  Setup: Fill context to 60% with diverse content (code, text, JSON)
  Trigger: Force compression
  Measure: Actual tokens sent to API vs estimate
  Expected: Within 15% accuracy

TC-CTX-02: Silent context drop
  Setup: Main model = 200K context, auxiliary = 32K context
  Trigger: Compress 100K tokens of conversation
  Measure: Summary quality vs dropped content
  Expected: Should WARN, not silently drop

TC-INT-01: Agent crash mid-stream
  Setup: Kill agent process while streaming response
  Measure: Desktop behavior (timeout, error display, recovery)
  Expected: Error shown within 30s; can retry

TC-INT-02: Concurrent token deduction
  Setup: 5 simultaneous chat requests from same tenant
  Measure: Token balance integrity
  Expected: All 5 deducted correctly (no double-spend)

TC-SEC-01: Rate limit bypass
  Setup: Multi-instance SaaS deployment (no Redis)
  Measure: Total requests across instances vs intended limit
  Expected: Should enforce globally; will fail with in-memory

TC-PERF-01: FTS5 at scale
  Setup: 10,000 sessions in state.db
  Measure: Search latency for typical queries
  Expected: < 500ms for simple queries
```

### 3.4 Documentación de hallazgos

Cada hallazgo se documenta como:

```markdown
## [ID] — Título corto

**Severidad:** CRÍTICA | ALTA | MEDIA | BAJA
**Componente:** Agent | Desktop | SaaS
**Archivo:** path/to/file.py:line
**Reproducible:** Always | Intermittent | Edge case
**Impacto:** Descripción del efecto en usuario/sistema

### Evidencia
- Screenshot / log / metric / trace

### Root Cause
- Explicación técnica precisa

### Fix Propuesto
- Código o approach específico

### Esfuerzo Estimado
- Horas | Riesgo de regresión | Dependencias
```

---

## SECCIÓN 4 — PLAN DE EJECUCIÓN

### Fase 1: Static Analysis (3-4 días)

| Tarea | Método | Entregable | Riesgo |
|---|---|---|---|
| Code review de `run_agent.py` (16K líneas) | Lectura manual + search por patterns de leak (global state, unclosed resources, unbounded lists) | Lista de code smells con line numbers | Archivo muy grande; fácil perder contexto |
| Auditar `delegate_tool.py` lifecycle | Trace de objeto AIAgent hijo desde spawn hasta GC | Diagrama de lifecycle + puntos de leak | Requiere entender ThreadPoolExecutor internals |
| Review de `context_compressor.py` | Verificar edge cases: auxiliary model < main, empty summaries, tool call splitting | Lista de failure modes documentados vs implementados | Hermes docs ya documentan algunos; verificar que OmniWorker no diverge |
| Auditar IPC bridge (400 methods) | Grep por IPC handlers sin cleanup, sin timeout, con large payload | Top 10 IPC calls por riesgo | Volumen alto; priorizar por frecuencia de uso |
| Review de `auth.ts` + `route.ts` (SaaS) | Buscar race conditions, missing error handling, token validation gaps | Security findings list | Crítico para revenue; no puede fallar |
| Review de `webSecurity: false` impact | Evaluar attack surface real dado el uso de Electron | Risk assessment con recomendación go/no-go | Puede requerir refactor significativo si se decide habilitarlo |

**Mitigación de riesgos Fase 1:** Usar CodeGraph para navegación estructural; no intentar leer los 16K líneas linealmente. Priorizar por impact matrix (Sección 5).

### Fase 2: Memory & Performance Profiling (4-5 días)

| Tarea | Método | Entregable | Riesgo |
|---|---|---|---|
| Agent memory profiling (tracemalloc) | Instrumentar AIAgent con snapshots pre/post turn; 100-turn session | Memory growth chart + top allocators | tracemalloc overhead puede alterar timing |
| Subagent leak detection (objgraph) | Forzar 10 delegaciones + GC + verificar objetos retenidos | Retain cycle graph si existe | ThreadPoolExecutor puede complicar GC tracking |
| Electron heap profiling | `--inspect` + Chrome DevTools heap snapshots en uso normal (10 chats) | Heap comparison report | DevTools puede crashear con heaps > 1GB |
| SQLite performance benchmarking | Poblar state.db con 1K, 5K, 10K sesiones; medir FTS5 query time | Performance curve chart | Requiere generar datos sintéticos realistas |
| IPC latency measurement | Instrumentar preload con timestamps; medir roundtrip de top-20 IPC calls | Latency histogram | Puede requerir modificar preload temporalmente |
| Token estimation accuracy | Comparar `estimate_tokens_rough()` vs actual API response para 100 requests variados | Error distribution chart | Necesita requests reales a providers (costo) |

**Mitigación de riesgos Fase 2:** Usar perfil de test dedicado (`~/.omniworker/profiles/audit/`); nunca perfilar en producción. Budget de API calls: ~$10 para token accuracy testing.

### Fase 3: Functional Testing (3-4 días)

| Tarea | Método | Entregable | Riesgo |
|---|---|---|---|
| Compression edge cases | Ejecutar TC-CTX-01 y TC-CTX-02 | Pass/fail matrix con evidencia | Puede descubrir data loss silencioso |
| Memory.md overflow behavior | Llenar MEMORY.md al límite (2200 chars); intentar append | Documentar comportamiento actual vs esperado | Bajo riesgo |
| Gateway session timeout | Dejar sesión idle 1h, 4h, 24h; verificar cleanup | Session lifecycle diagram real | Requiere paciencia / automation |
| SSH mode failover | Cortar SSH tunnel mid-chat; verificar recovery | Recovery time + data loss assessment | Requiere acceso a server remoto |
| Agent crash recovery | Kill -9 al proceso Python durante tool execution | Desktop behavior documentation | Controlado; no afecta datos |
| Token balance under concurrency | Ejecutar TC-INT-02 con 5 requests simultáneos | Balance integrity report | Requiere test harness para concurrent requests |

**Mitigación de riesgos Fase 3:** Backup de `state.db` y `MEMORY.md` antes de tests destructivos. Usar profiles aislados.

### Fase 4: Integration Testing (3-4 días)

| Tarea | Método | Entregable | Riesgo |
|---|---|---|---|
| Desktop ↔ Agent full flow | Login → chat → tools → compression → resume | E2E flow diagram con bottlenecks | Requiere los 3 componentes running |
| Desktop ↔ SaaS auth flow | Login → token refresh → plan validation → expiry | Auth state machine diagram | Requiere SaaS deployment |
| Agent ↔ External memory | Configurar Honcho; medir latency de prefetch/sync por turn | Latency breakdown per turn | Requiere Honcho account |
| Multi-license scenario | 2 devices, same tenant, concurrent usage | Licensing integrity report | Requiere 2 machines o VMs |
| Edge agent registration + heartbeat | Register → heartbeat → kill → verify offline status | Status transition diagram | Bajo riesgo |

**Mitigación de riesgos Fase 4:** Necesita environment con los 3 componentes desplegados. Usar docker-compose para reproducibilidad.

### Fase 5: Stress Testing (2-3 días)

| Tarea | Método | Entregable | Riesgo |
|---|---|---|---|
| 100-turn session stress | Sesión continua con tool calls intensivos | Memory ceiling + degradation curve | Puede tomar horas por sesión |
| 10 concurrent agents (same desktop) | Abrir 10 chats paralelos en desktop | CPU/RAM ceiling; crash threshold | Puede crashear Electron → restart |
| SaaS under load (50 RPS) | Artillery / k6 contra `/api/v1/chat/completions` | Latency percentiles + error rate | Requiere mock LLM backend para no gastar API budget |
| FTS5 at 50K sessions | Seed database + run search queries | Query time degradation curve | Requiere data generation script |
| Gateway 24h soak test | Gateway running 24h con messages cada 5min | Memory growth + session count + stability | Requiere monitoring infrastructure |

**Mitigación de riesgos Fase 5:** Siempre en environment aislado. Kill switch preparado. Monitoring activo durante tests.

### Timeline total estimado

```
Semana 1: ████████████████████████████████ Fase 1 (Static) + inicio Fase 2 (Profiling)
Semana 2: ████████████████████████████████ Fase 2 (cont.) + Fase 3 (Functional)
Semana 3: ████████████████████████████████ Fase 4 (Integration) + Fase 5 (Stress)
Semana 4: ████████████████                 Buffer + documentación final + fix planning
```

**Total: 15-20 días laborables** (1 dev senior dedicado)

---

## SECCIÓN 5 — MATRIZ CRÍTICA

### Matriz de Priorización

| ID | Área | Impact (1-5) | Frequency (1-5) | Fix Difficulty (1-5, 5=hard) | Score | Prioridad |
|---|---|---|---|---|---|---|
| **C1** | Token balance race condition | 5 | 4 | 2 | **40** | P0 — Fix inmediato |
| **B2** | Silent context drop | 5 | 3 | 3 | **25** | P0 — Fix inmediato |
| **A4** | Electron zombie processes | 4 | 4 | 2 | **32** | P0 — Fix inmediato |
| **E1** | SSE stream hang on crash | 4 | 3 | 2 | **24** | P1 — Sprint 1 |
| **D1** | webSecurity: false | 4 | 1 | 4 | **5** | P1 — Sprint 1 (security) |
| **A1** | Conversation list unbounded | 4 | 4 | 3 | **21** | P1 — Sprint 1 |
| **B1** | Token estimation ±20% | 3 | 5 | 3 | **25** | P1 — Sprint 1 |
| **A2** | Subagent memory leak | 4 | 3 | 3 | **16** | P2 — Sprint 2 |
| **D2** | In-memory rate limiting | 4 | 2 | 2 | **16** | P2 — Sprint 2 |
| **C2** | Refresh token failure | 3 | 2 | 2 | **12** | P2 — Sprint 2 |
| **B3** | System prompt bloat | 3 | 3 | 3 | **12** | P2 — Sprint 2 |
| **E4** | Memory provider latency | 3 | 3 | 2 | **18** | P2 — Sprint 2 |
| **A6** | FTS5 index growth | 2 | 3 | 2 | **12** | P3 — Backlog |
| **B4** | Prefix cache invalidation | 2 | 3 | 3 | **8** | P3 — Backlog |
| **C3** | SQLite concurrent access | 2 | 3 | 3 | **8** | P3 — Backlog |
| **E2** | FTS5 search quality | 2 | 3 | 4 | **6** | P3 — Deuda técnica |
| **A3** | Tool output accumulation | 2 | 3 | 2 | **12** | P3 — Deuda técnica |
| **C4** | Memory.md truncation | 2 | 2 | 1 | **8** | P3 — Deuda técnica |
| **C5** | Gateway session leak | 2 | 2 | 2 | **8** | P3 — Deuda técnica |
| **E5** | Gateway 400-msg limit | 1 | 1 | 2 | **2** | P4 — Won't fix (designed) |

*Score = Impact × Frequency × (6 - Fix Difficulty). Mayor score = mayor prioridad.*

### Orden de ejecución de fixes

```
P0 — INMEDIATO (pre-launch blockers)
  ├── C1: Agregar transaction/lock en token deduction (SaaS)
  ├── B2: Validar auxiliary context ≥ main; WARN + fallback si no
  └── A4: Implementar process tree cleanup con psutil en before-quit

P1 — SPRINT 1 (semana siguiente a auditoría)
  ├── E1: SSE timeout de 120s + auto-retry en desktop
  ├── D1: Evaluar re-habilitar webSecurity con proxy CORS en main process
  ├── A1: Implementar sliding window en conversation list (mantener solo N turns en RAM)
  └── B1: Usar tiktoken para token counting preciso (reemplazar len/4)

P2 — SPRINT 2
  ├── A2: Explicit cleanup de AIAgent hijo post-delegation
  ├── D2: Requerer Redis en producción; fail-fast si no configurado
  ├── C2: Retry logic para refresh token con backoff
  ├── B3: Lazy-load tool schemas; solo incluir tools activos en prompt
  └── E4: Timeout configurable para memory providers (default 5s)

P3 — BACKLOG (deuda técnica, no bloquea)
  ├── Pruning automático de FTS5
  ├── Cache-aware memory writes
  ├── WAL mode enforcement para SQLite
  └── Semantic search (embeddings) como upgrade a FTS5
```

---

## Apéndice: Archivos Críticos por Componente

### Agent (omniworker-agent)
| Archivo | Líneas | Criticidad | Auditar por |
|---|---|---|---|
| `run_agent.py` | 16,235 | CRÍTICA | Memory lifecycle, state management |
| `agent/conversation_loop.py` | ~3,900 | CRÍTICA | Context handling, compression triggers |
| `agent/context_compressor.py` | ~1,100 | ALTA | Data loss, summary quality |
| `agent/memory_manager.py` | ~400 | ALTA | Provider orchestration, prefetch timing |
| `agent/model_metadata.py` | — | ALTA | Token estimation accuracy |
| `agent/prompt_builder.py` | — | MEDIA | Prompt size, cache invalidation |
| `agent/prompt_caching.py` | — | MEDIA | Cache hit rate, cost |
| `tools/delegate_tool.py` | ~600 | ALTA | Subagent lifecycle, memory cleanup |
| `tools/session_search_tool.py` | ~400 | MEDIA | FTS5 performance |
| `omniworker_state.py` | ~800 | ALTA | SQLite schema, FTS5, concurrent access |

### Desktop (omniworker-desktop)
| Archivo | Líneas | Criticidad | Auditar por |
|---|---|---|---|
| `src/main/index.ts` | 1,863 | CRÍTICA | IPC handlers, process management, security |
| `src/main/omniworker.ts` | — | ALTA | SSE streaming, abort handling, timeout |
| `src/main/memory.ts` | — | MEDIA | Engram integration, file watching |
| `src/main/ssh-remote.ts` | — | MEDIA | SSH tunnel stability, cleanup |
| `src/main/installer.ts` | — | MEDIA | Process spawning, version management |
| `src/preload/index.ts` | 1,091 | ALTA | IPC surface area, type safety |
| `src/renderer/src/screens/Chat/Chat.tsx` | — | MEDIA | State management, memory usage |

### SaaS (omniworker-saas)
| Archivo | Líneas | Criticidad | Auditar por |
|---|---|---|---|
| `src/app/api/v1/chat/completions/route.ts` | ~500 | CRÍTICA | Token deduction, provider routing, streaming |
| `src/lib/auth.ts` | 597 | CRÍTICA | JWT handling, refresh rotation, race conditions |
| `src/lib/rate-limit.ts` | — | ALTA | In-memory fallback, bypass risk |
| `src/lib/validation.ts` | — | MEDIA | Input sanitization |
| `src/middleware.ts` | — | ALTA | Edge auth, security headers |
| `prisma/schema.prisma` | 229 | MEDIA | Schema design, indices, constraints |

---

*Este documento es el blueprint para ejecutar la auditoría paso a paso. Cada fase produce entregables específicos que alimentan la siguiente. No improvisar: seguir el orden, documentar hallazgos con el template de la Sección 3.4, y priorizar fixes según la matriz de la Sección 5.*
