# Orquestador — Lo que queda pendiente

> **Estado:** 42 de 44 del `ORCHESTRATOR-SPEC.md` (~95%). · **Branch:** `feat/next` · **2026-06-04**
> Este doc lista **solo lo que falta**. El detalle completo (con criterios de aceptación) está en `ORCHESTRATOR-SPEC.md`.

## Resumen
El orquestador + ejército está **construido, testeado (119 tests) y probado en vivo** con modelo real.
Quedan **3 items**, ninguno bloqueante: 1 operativo, 1 de infra, 1 opcional.

---

## 1. H4 — Probarlo en el desktop real ⚠️ (operativo, no código)

**Qué falta:** abrir la app de escritorio, escribir en el chat y confirmar que delega a los agentes.

**Por qué no está:** el motor ya está probado en vivo (script `verify_orchestrator_live.py` → delegó a Kimi real y volvió "OK"). Falta repetirlo *desde la UI del desktop*, que usa el mismo motor.

**Cómo cerrarlo:**
1. Abrir OmniWorker desktop con sesión logueada (gateway flux con JWT fresco).
2. Activar `orchestrator_mode: true` en `~/.omniworker/config.yaml` (ya está).
3. Escribir una tarea compleja ("armame un análisis de la competencia") y verificar que reparte el trabajo.

**Tipo:** prueba manual tuya. **Esfuerzo:** minutos.

---

## 2. A8 — Sandbox real para ejecutar código ⚠️ (infra)

**Qué falta:** que el "Agente Ejecutor" corra comandos/código dentro de una jaula aislada (hoy solo **avisa** que no hay jaula).

**Por qué no está:** la jaula real necesita un backend (`TERMINAL_ENV=docker` / `modal` / `vercel_sandbox`) configurado, más un override de entorno por-agente en `tools/terminal_tool.py` (los workers corren en threads del mismo proceso → no se puede aislar el env por-thread sin ese cambio).

**Cómo cerrarlo:**
1. Configurar un backend de sandbox (Docker es lo más simple) y `TERMINAL_ENV=docker`.
2. Agregar en `terminal_tool` un override de `env_type` por-agente leyendo `AgentConfig.sandbox`.

**Tipo:** infra + cambio en terminal_tool. **Esfuerzo:** medio.

---

## 3. E6 — Push de cambios de modelo desde el SaaS ❌ (opcional)

**Qué falta:** endpoints admin (`POST /admin/model-catalog-change`, `/approve`, `GET /pending`) para que tu servidor SaaS empuje cambios de modelo activamente.

**Por qué no está — y por qué es opcional:** el sistema **ya detecta los cambios solo** (poller diario en `agent/model_catalog.py`). E6 sería una *segunda vía* (push desde el panel SaaS) que solo tiene sentido si querés controlarlo manualmente desde el dashboard. La cobertura ya existe.

**Cómo cerrarlo (si se prioriza):** agregar 3 endpoints admin en `gateway/platforms/api_server.py` que llamen a `model_manager.apply_catalog_change` / `apply_pending` / `list_pending`.

**Tipo:** feature opcional. **Esfuerzo:** medio.

---

## Lo que NO está acá (ya hecho esta tanda)
- **C6** ✅ señales externas → tareas (`agent/signal_intake.py` + buzón `signals/inbox/`).
- **D5** ✅ el chat aprende (`agent/autolearn_tracker.py` persistente + hook en `run_agent`).
- **F4** ✅ opacidad del front verificada (el `ModelPicker` solo muestra "OmniWorker Normal/Code").

## En una línea
**Funcionalmente está completo y probado. Lo que queda: probarlo en el desktop (vos), configurar el sandbox (infra), y un push SaaS opcional. Nada bloquea usarlo.**
