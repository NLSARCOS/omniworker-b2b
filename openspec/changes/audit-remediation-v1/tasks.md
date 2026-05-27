# Audit Remediation v1 — Implementation Tasks

**Change:** `audit-remediation-v1`
**Total findings:** 35 | **Estimated hours:** 112-142h

---

## Sprint 0 — Hotfixes (16-20h) — Semana 1

### SaaS Security & Billing

- [x] **C4-CORS** — CORS allowlist en `src/middleware.ts` (1-2h)
  - Crear constante `ALLOWED_ORIGINS` como `Set`
  - Reemplazar `origin reflection` por allowlist check
  - Soportar `CORS_ALLOWED_ORIGINS` env var
  - Omitir headers CORS para origins no permitidos
  - Verificar: requests desde origin no-permitido son rechazados

- [x] **D3-RATE** — Rate limit auth correction en `src/lib/rate-limit.ts` (0.5h)
  - Cambiar `getLimitForTier('auth')` de 500 a 5 en memory fallback
  - Verificar: sin Redis, max 5 requests/15min para auth

- [x] **D7-RATE** — Rate limit en refresh endpoint `src/app/api/v1/auth/refresh/route.ts` (0.5h)
  - Agregar `checkRateLimit(ip, 'auth')` al inicio del handler
  - Verificar: refresh endpoint tiene rate limiting

- [x] **C1** — Atomic token deduction en `src/app/api/v1/chat/completions/route.ts` (3-4h)
  - Reemplazar `prisma.license.update` por `prisma.license.updateMany` con `WHERE tokenBalance >= cost`
  - Retornar 402 si `result.count === 0`
  - Mantener el check en línea 175 como early-exit (no como guard principal)
  - Verificar: 5 requests concurrentes con balance bajo → solo las que caben pasan

- [x] **C5-AUTH** — Fix refresh token family en `src/lib/auth.ts` (3-4h)
  - Modificar `createRefreshToken` para aceptar `existingFamily?` param
  - En `refreshAccessToken`, pasar `validated.family` al crear nuevo token
  - En `validateRefreshToken`, si token está revoked → llamar `revokeTokenFamily(family)`
  - Verificar: replay de token revocado revoca toda la familia

- [x] **D6-REFRESH** — Transaction en rotation `src/lib/auth.ts` (2h) — *después de C5-AUTH*
  - Wrap revoke + create en `prisma.$transaction()`
  - Verificar: fallo mid-transaction deja old token válido

- [x] **D4-VAL** — Remover `.passthrough()` en `src/lib/validation.ts` (2h)
  - Reemplazar `.passthrough()` por `.strict()` en chat completion schema
  - Reemplazar `.passthrough()` por `.strict()` en message objects
  - Definir explícitamente campos opcionales permitidos
  - Verificar: request con campo extra → 400

- [x] **D5-INPUT** — Validar deviceFingerprint en `src/app/api/v1/auth/login/route.ts` (1h)
  - Agregar `deviceFingerprint` y `deviceName` a `loginSchema`
  - Max length 256 y 128 respectivamente
  - Extraer de `parsed.data` en vez de `body` directo
  - Verificar: fingerprint de 10MB → rejected

### Agent Data Protection

- [x] **B4** — Summary failure default en `agent/context_compressor.py` (3h)
  - Cambiar `abort_on_summary_failure` default a `True`
  - Implementar recovery persistence: escribir dropped messages a `~/.omniworker/recovery/`
  - Log error con path del recovery file
  - Verificar: summary failure con default → abort (no drop silencioso)

---

## Sprint 1 — Critical Path (26-33h) — Semana 2 ✅

### Agent Context

- [x] **B3** — Validar auxiliary context en `agent/context_compressor.py` (3h)
  - Antes de `call_llm`, estimar prompt size vs auxiliary model context
  - Si > 80%, truncar `content_to_summarize` (preservar contenido más reciente)
  - Log warning con conteos original vs truncado
  - Verificar: auxiliary 32K + contenido 100K → truncado y resumido (no error)

- [x] **A6** — Tool output cap en `agent/conversation_loop.py` (3h)
  - Truncar tool results a 200KB (configurable via `OMNIWORKER_MAX_TOOL_OUTPUT`)
  - Agregar marker `[truncated: N bytes omitted]`
  - No truncar binary content (imágenes, archivos)
  - Verificar: tool output 5MB → truncado a 200KB con marker

### SaaS Billing

- [x] **C2-STREAM** — Streaming billing reconciliation en `src/app/api/v1/chat/completions/route.ts` (6-8h) — *después de C1*
  - Implementar `TransformStream` para contar SSE chunks reales
  - En `flush()`, reconciliar estimado vs actual
  - Refund diferencia si estimado > actual + 10%
  - Manejar abort/disconnect: deducir mínimo, reconciliar async
  - Eliminar hardcoded `completionTokensEst=500`
  - Verificar: streaming de 10 tokens → balance refleja tokens reales (no 500)

- [x] **C3-TOKEN** — Token estimation non-ASCII en `src/app/api/v1/chat/completions/route.ts` (2h)
  - Detectar mensajes con >30% non-ASCII → aplicar 1.5x multiplier
  - Verificar: mensaje en chino 1000 chars → estimación más precisa

### Desktop Security & Stability

- [x] **D1-SEC** — Remover webSecurity:false en `src/main/index.ts` (4-6h)
  - Eliminar `webSecurity: false` de BrowserWindow options
  - Implementar IPC proxy para API calls
  - Proxy soporta JSON y SSE streaming
  - Feature flag `OMNIWORKER_LEGACY_WEB_SECURITY` para rollback
  - Verificar: renderer no puede hacer fetch a origins externos directamente

- [x] **E1-SSE** — SSE watchdog en `src/main/omniworker.ts` (2-3h)
  - setTimeout 90s que resetea en cada `data` event
  - On timeout: `controller.abort()` + notificar renderer
  - Renderer muestra "Agent appears unresponsive. Retry?"
  - Verificar: matar agent mid-stream → timeout en 90s, retry disponible

- [x] **A4-PROC** — Process lifecycle en `src/main/omniworker.ts` + `src/main/index.ts` (6-8h)
  - Remover `detached: true` de todos los `spawn()`
  - Implementar `~/.omniworker/pids.json` para tracking
  - Startup: leer PIDs, kill orphans
  - will-quit: await cleanup con 5s timeout → SIGKILL fallback
  - Verificar: kill -9 Electron → reiniciar → no orphan processes

---

## Sprint 2 — Hardening (30-39h) — Semana 3 ✅

### Desktop Security

- [x] **D2-SEC** — safeStorage migration en `src/renderer/src/App.tsx` + `src/main/` (8-12h) — *después de D1-SEC*
  - Implementar `safeStorage.encryptString()` / `decryptString()` para tokens
  - Persistir buffers cifrados via electron-store
  - Migrar tokens existentes de localStorage → safeStorage en first launch
  - Limpiar localStorage y .env entries post-migración
  - Para CLI spawns: pasar credentials via `env` option (no .env file)
  - Fallback con warning si `safeStorage.isEncryptionAvailable()` es false
  - Verificar: no JWT visible en localStorage ni .env

### Agent Memory & Performance

- [x] **E4-MEM** — Memory provider timeout en `agent/memory_manager.py` (3h)
  - Wrap `prefetch_all` y `sync_all` en ThreadPoolExecutor con timeout (default 10s)
  - Configurable via `OMNIWORKER_MEMORY_TIMEOUT`
  - Provider timeout → warning log, continue sin ese provider
  - Verificar: provider con 30s latency → timeout a 10s, turn continúa

- [x] **B2** — Token estimation improvement en `agent/model_metadata.py` (4h)
  - Integrar tiktoken para OpenAI models (lazy install)
  - 1.5x correction para non-ASCII heavy messages
  - Image token: usar dimensions reales cuando disponibles
  - Log metrics: estimated vs actual
  - Verificar: 1000 chars chinos → estimación dentro de 15% del real

- [x] **E2-THREAD** — ThreadPool cleanup en `tools/delegate_tool.py` (3h)
  - Post-timeout: `child._force_stop = True` + `child.interrupt()`
  - Break closure reference en `finally`
  - `shutdown(wait=True, cancel_futures=True)`
  - Verificar: 5 delegation timeouts → thread count returns to baseline

- [x] **A1** — Message cap en `agent/conversation_loop.py` (4h)
  - Cap messages list a 500 (configurable `OMNIWORKER_MAX_MESSAGES`)
  - Trigger proactive compression al alcanzar cap
  - Post-compression: message count < 80% del cap
  - Verificar: 600 messages → compression triggered at 500

### Desktop UX

- [x] **E1-CHAT** — Chat virtualization en `src/renderer/src/screens/Chat/Chat.tsx` (6-10h)
  - Implementar react-window para MessageList
  - Solo renderizar mensajes visibles + buffer
  - IPC history limited a last 50 messages
  - "Load more" button para mensajes anteriores
  - Verificar: 300 messages → <50 DOM nodes, scroll smooth

- [x] **E3-ENGRAM** — Async cleanup en `src/main/index.ts` (2-3h) — *después de A4-PROC*
  - Await `EngramDaemonManager.stopDaemon()` en quit handler
  - `event.preventDefault()` → await cleanup → `app.exit(0)`
  - 5s timeout max para cleanup
  - Verificar: quit app → no engram orphan

---

## Sprint 3 — Polish & Debt (25h) — Semana 4 ✅

### Agent Optimization

- [x] **E5-PROMPT** — Lazy-load tool schemas en `agent/prompt_builder.py` (6h)
  - Full schemas solo para tools usados en últimos 5 turns
  - Compact index (name + desc) para el resto
  - `tool_choice='none'` para final-response calls
  - Verificar: token overhead <5K (vs current 20-30K)

- [x] **C5-PREFETCH** — Prefetch cache cap en `agent/conversation_loop.py` (1h) — *después de E4-MEM*
  - Cap `_ext_prefetch_cache` a 32K chars
  - Truncate marker `[prefetch truncated: N chars omitted]`
  - Configurable `OMNIWORKER_PREFETCH_MAX_CHARS`
  - Verificar: provider retorna 100K → truncado a 32K

- [x] **E4-FTS** — FTS5 optimize en `omniworker_state.py` (1h)
  - Después de `prune_sessions()`: `INSERT INTO messages_fts(messages_fts) VALUES('optimize')`
  - Ejecutar async para no bloquear
  - Verificar: post-prune → FTS5 optimize ejecutado

- [x] **B6** — Unificar image token constant (2h) — *después de B2*
  - Definir `IMAGE_TOKEN_ESTIMATE = 1600` en un solo lugar
  - Importar en `model_metadata.py` y `context_compressor.py`
  - Verificar: una sola constante usada en ambos módulos

- [x] **PC1** — Shallow copy en `agent/prompt_caching.py` (2h)
  - Reemplazar `copy.deepcopy(api_messages)` por shallow copies
  - Deep copy solo system message + últimos 3 mensajes
  - Verificar: profile muestra reducción de overhead deepcopy

- [x] **B1** — Anti-thrashing reset en `agent/context_compressor.py` (1h)
  - Reset `_ineffective_compression_count` en model/context change
  - `reset_anti_thrashing()` callable desde `/compress`
  - Reset after successful compression (>20% savings)
  - Verificar: 2 bad compressions + model change → counter reset

- [x] **A3** — Active subagents sweeper en `tools/delegate_tool.py` (2h)
  - Timer cada 60s: limpiar entries donde thread está dead
  - Limpiar entries donde `started_at` > 2x timeout
  - Verificar: subagent OOM → entry cleaned en <60s

### SaaS Quality

- [x] **D8-CSP** — Nonce-based CSP en `src/middleware.ts` (4h)
  - Generar nonce único por request
  - Reemplazar `unsafe-inline` con nonce-based policy
  - Remover `unsafe-eval` en production
  - Verificar: inline script sin nonce → blocked por CSP

- [x] **D9-STREAM** — Stream error handling en `src/app/api/v1/chat/completions/route.ts` (4h) — *después de C2-STREAM*
  - TransformStream wrapper para errores upstream
  - Inyectar SSE error event antes de cerrar stream
  - Reconciliar billing on error
  - Verificar: upstream disconnect → client recibe error SSE event

- [x] **D10-SCHEMA** — DB indices en `prisma/schema.prisma` (1h)
  - Agregar `@@index` a TaskLog, MasterProvider, RefreshToken, User
  - Generar y aplicar migration
  - Verificar: `npx prisma migrate dev` exitoso

- [x] **D11-FLOAT** — Float → Int en `prisma/schema.prisma` (2h)
  - Cambiar `price Float` → `priceInCents Int`
  - Cambiar `amount Float` → `amountInCents Int`
  - Data migration: `Math.round(value * 100)`
  - Actualizar lógica de negocio para usar cents
  - Verificar: billing funciona con valores en centavos

- [x] **D12-CASCADE** — Cascade deletes en `prisma/schema.prisma` (2h)
  - Agregar `onDelete: Cascade` en Tenant→License, Tenant→EdgeAgent
  - Agregar `onDelete: Cascade` en User→TaskLog
  - Agregar `onDelete: SetNull` en User→Session
  - Documentar business rules en schema comments
  - Verificar: delete tenant → cascada a licenses, agents, etc.

---

## Backlog (Not Scheduled)

- [ ] **B1 edge case** — Anti-thrashing counter reset on rare conditions
- [ ] **A3 extended** — Gateway long-running sweeper hardening

---

## Verification Checklist

- [x] All existing tests pass (`scripts/run_tests.sh` + `npm test`)
- [x] Token balance race test: 5 concurrent requests → no negative balance
- [x] CORS test: fetch from unauthorized origin → blocked
- [x] Refresh token replay → entire family revoked
- [x] No orphan processes after crash + restart
- [x] SSE timeout fires within 90s of agent hang
- [x] Memory provider timeout: turn continues after 10s
- [x] Chat with 300 messages → <50 DOM nodes
