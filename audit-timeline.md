# OmniWorker — Audit Fix Timeline

**Fecha:** 2026-05-26 | **Total findings:** 35 | **Total horas estimadas:** 112-142h

---

## Sprint 0 — Hotfixes (Semana 1, 3-4 días, ~20h)

Fixes que son exploits activos o causan pérdida de datos/dinero.

| # | ID | Componente | Fix | Horas | Dependencia |
|---|---|---|---|---|---|
| 1 | C4-CORS | SaaS | CORS allowlist (reemplazar origin reflection) | 1-2h | Ninguna |
| 2 | D3-RATE | SaaS | Cambiar getLimitForTier('auth') de 500 a 5 | 0.5h | Ninguna |
| 3 | D7-RATE | SaaS | Agregar checkRateLimit al refresh endpoint | 0.5h | Ninguna |
| 4 | C1 | SaaS | Token balance atomic update con WHERE >= cost | 3-4h | Ninguna |
| 5 | C5-AUTH | SaaS | Fix refresh token family chain + replay detection | 3-4h | Ninguna |
| 6 | D6-REFRESH | SaaS | Wrap refresh rotation en prisma.$transaction() | 2h | Después de C5-AUTH |
| 7 | D4-VAL | SaaS | Remover .passthrough() de validation schemas | 2h | Ninguna |
| 8 | D5-INPUT | SaaS | Validar deviceFingerprint en loginSchema | 1h | Ninguna |
| 9 | B4 | Agent | Cambiar default abort_on_summary_failure=True | 3h | Ninguna |

**Subtotal Sprint 0:** ~16-20h

---

## Sprint 1 — Critical Path (Semana 2, 5 días, ~35h)

Fixes de alta severidad que afectan UX y seguridad.

| # | ID | Componente | Fix | Horas | Dependencia |
|---|---|---|---|---|---|
| 1 | B3 | Agent | Validar auxiliary context >= compressed content | 3h | Ninguna |
| 2 | C2-STREAM | SaaS | TransformStream para billing reconciliation | 6-8h | Después de C1 |
| 3 | D1-SEC | Desktop | Remover webSecurity:false, proxy CORS por main process | 4-6h | Ninguna |
| 4 | E1-SSE | Desktop | Watchdog timeout 90s en SSE stream | 2-3h | Ninguna |
| 5 | A4-PROC | Desktop | Remover detached:true, startup orphan cleanup, async before-quit | 6-8h | Ninguna |
| 6 | A6 | Agent | Truncar tool results en insertion (200KB cap) | 3h | Ninguna |
| 7 | C3-TOKEN | SaaS | Mejorar token estimation (tiktoken / non-ASCII correction) | 2h | Ninguna |

**Subtotal Sprint 1:** ~26-33h

---

## Sprint 2 — Hardening (Semana 3, 5 días, ~35h)

Robustecimiento de memoria, performance, y seguridad secundaria.

| # | ID | Componente | Fix | Horas | Dependencia |
|---|---|---|---|---|---|
| 1 | D2-SEC | Desktop | Migrar tokens de localStorage/.env a safeStorage | 8-12h | Después de D1-SEC |
| 2 | E4-MEM | Agent | Timeout configurable en memory providers (10s default) | 3h | Ninguna |
| 3 | B2 | Agent | Mejorar token estimation (tiktoken, CJK correction, image dims) | 4h | Ninguna |
| 4 | E2-THREAD | Agent | Fix ThreadPoolExecutor reference retention en delegate | 3h | Ninguna |
| 5 | A1 | Agent | Cap mensajes en memoria (500) + compression proactiva | 4h | Ninguna |
| 6 | E1-CHAT | Desktop | Message cap + react-window virtualization | 6-10h | Ninguna |
| 7 | E3-ENGRAM | Desktop | Async cleanup en will-quit para Engram daemon | 2-3h | Después de A4-PROC |

**Subtotal Sprint 2:** ~30-39h

---

## Sprint 3 — Polish & Debt (Semana 4, 3-4 días, ~25h)

Deuda técnica, optimizaciones, mejoras de calidad.

| # | ID | Componente | Fix | Horas | Dependencia |
|---|---|---|---|---|---|
| 1 | E5-PROMPT | Agent | Lazy-load tool schemas (solo tools usados + índice) | 6h | Ninguna |
| 2 | D8-CSP | SaaS | Nonce-based CSP, remover unsafe-eval | 4h | Ninguna |
| 3 | C5-PREFETCH | Agent | Cap prefetch cache a 32K chars | 1h | Después de E4-MEM |
| 4 | D9-STREAM | SaaS | TransformStream error handling en streaming | 4h | Después de C2-STREAM |
| 5 | D10-SCHEMA | SaaS | Agregar indices a Prisma schema | 1h | Ninguna |
| 6 | D11-FLOAT | SaaS | Float → Int (cents) para precios | 2h | Ninguna |
| 7 | E4-FTS | Agent | FTS5 optimize después de pruning | 1h | Ninguna |
| 8 | B6 | Agent | Unificar constante de image tokens | 2h | Después de B2 |
| 9 | PC1 | Agent | Shallow copy en prompt_caching | 2h | Ninguna |
| 10 | D12-CASCADE | SaaS | Agregar onDelete policies | 2h | Ninguna |

**Subtotal Sprint 3:** ~25h

---

## Backlog (no scheduled)

| ID | Componente | Fix | Horas | Notas |
|---|---|---|---|---|
| B1 | Agent | Reset anti-thrashing counter | 1h | Edge case raro |
| A3 | Agent | Periodic sweeper para _active_subagents | 2h | Solo en gateway long-running |

---

## Resumen por componente

| Componente | Findings | Horas totales |
|---|---|---|
| Agent (Python) | 15 | 52-54h |
| Desktop (Electron) | 7 | 30-45h |
| SaaS (Next.js) | 13 | 30-43h |
| **TOTAL** | **35** | **112-142h** |

## Resumen por prioridad

| Prioridad | Count | Horas | Sprint |
|---|---|---|---|
| P0 (Critical) | 6 | 19-24h | Sprint 0 |
| P1 (High) | 11 | 26-33h | Sprint 0-1 |
| P2 (Medium) | 12 | 40-49h | Sprint 2-3 |
| P3 (Low) | 6 | 10-12h | Sprint 3 + Backlog |

---

*Con 1 dev senior dedicado: ~4 semanas. Con 2 devs en paralelo (1 backend/agent + 1 frontend/SaaS): ~2.5 semanas.*
