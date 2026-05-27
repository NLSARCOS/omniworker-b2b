# Audit Remediation v1 — Proposal

**Change:** `audit-remediation-v1`
**Date:** 2026-05-26
**Source:** [audit-findings.json](file:///Users/nelsonsarcos/Documents/Simplet%20Pyects/aass2/audit-findings.json) + [audit-report.html](file:///Users/nelsonsarcos/Documents/Simplet%20Pyects/aass2/audit-report.html)

---

## Problem

La auditoría técnica del Senior Developer identificó **35 hallazgos** en los 3 componentes del sistema OmniWorker:

| Severidad | Count | Riesgo |
|-----------|-------|--------|
| **P0 CRITICAL** | 6 | Exploits activos, pérdida de datos/dinero |
| **P1 HIGH** | 11 | Seguridad comprometida, UX degradada |
| **P2 MEDIUM** | 12 | Memory leaks, performance, deuda técnica |
| **P3 LOW** | 6 | Optimizaciones, inconsistencias menores |

### Hallazgos P0 (Exploits Activos)

1. **C1** — Token balance race condition: dos requests concurrentes pueden llevar balance a negativo
2. **C4-CORS** — CORS refleja cualquier origin con credentials: CSRF total
3. **C5-AUTH** — Refresh token family rotation rota: theft no detectado, `revokeTokenFamily()` nunca se llama
4. **C2-STREAM** — Streaming cobra estimate fijo (500 tokens) sin reconciliación post-stream
5. **B3** — Auxiliary model context no validado: data loss silencioso si auxiliary < main
6. **B4** — Summary failure causa data loss irrecuperable: 30+ min de contexto perdido

### Componentes Afectados

| Componente | Findings | Horas estimadas |
|------------|----------|-----------------|
| Agent (Python) | 15 | 52-54h |
| Desktop (Electron) | 7 | 30-45h |
| SaaS (Next.js) | 13 | 30-43h |
| **Total** | **35** | **112-142h** |

---

## Proposed Solution

Implementar todas las remediaciones en **4 sprints secuenciales**, priorizados por riesgo:

### Sprint 0 — Hotfixes (16-20h)
Fixes para exploits activos y pérdida de datos. **9 findings P0+P1** que requieren atención inmediata:
- CORS allowlist, rate limit corrections, atomic token deduction
- Refresh token family fix, input validation, summary failure default

### Sprint 1 — Critical Path (26-33h)
Fixes de alta severidad en seguridad y UX. **7 findings** que afectan estabilidad:
- Auxiliary context validation, streaming billing reconciliation
- webSecurity:false removal, SSE watchdog, orphan process cleanup
- Tool output size cap, token estimation improvement

### Sprint 2 — Hardening (30-39h)
Robustecimiento de memoria, performance, y seguridad. **7 findings**:
- safeStorage migration, memory provider timeouts
- Token estimation (tiktoken), ThreadPool fix, message cap
- Chat virtualization (react-window), Engram cleanup

### Sprint 3 — Polish & Debt (25h)
Deuda técnica y optimizaciones. **10 findings**:
- Lazy-load tool schemas, nonce-based CSP, prefetch cap
- Stream error handling, DB indices, Float→Int for billing
- FTS5 optimize, image constants, deepcopy fix, cascade deletes

---

## Scope

### In Scope
- Todas las 35 remediaciones identificadas en la auditoría
- Fix templates y snippets de código del audit-report.html
- Verificación post-fix para cada finding
- Actualización de tests existentes donde aplique

### Out of Scope
- Hermes core upstream bugs (reportados a Nous Research)
- Provider API changes (OpenAI, Anthropic)
- Electron framework internals
- Landing page animations
- i18n translation accuracy
- Nuevas features (solo fixes)

---

## Success Criteria

1. **Los 6 P0 resueltos** y verificados con test cases del AUDIT_PLAN.md
2. **Los 11 P1 resueltos** sin regresiones en funcionalidad existente
3. **Token balance race condition (C1)** pasa test de 5 requests concurrentes
4. **CORS (C4-CORS)** rechaza origins no whitelisted
5. **Refresh token (C5-AUTH)** detecta replay y revoca familia completa
6. **No orphan processes** después de crash/force-quit del desktop
7. **SSE timeout** activo con recovery en <90s
8. **Todos los tests existentes** siguen pasando post-fixes
