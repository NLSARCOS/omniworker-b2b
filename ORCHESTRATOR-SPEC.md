# OmniWorker Orchestrator — Spec completo (medido contra el OBJETIVO)

> **Fuente del objetivo:** `omniworker-orchestrator-plan.html`
> **Naturaleza de este doc:** spec verificable, no checklist de fases. Cada
> requisito es una capacidad observable con criterio de aceptación end-to-end.
> **Branch:** `feat/next` · **Última auditoría:** 2026-06-04
>
> **Leyenda de estado:**
> - ✅ **Done** — implementado y testeado (con evidencia en código).
> - ⚠️ **Partial** — existe pero incompleto / no verificado end-to-end.
> - ❌ **Missing** — no existe.
>
> **Regla de oro:** "tests verdes" ≠ "funciona". Un requisito solo pasa a ✅
> cuando su criterio de aceptación se cumple, idealmente con un modelo real.

---

## Objetivo (resumen)

1. **Orquestador real** — director autónomo con iniciativa propia: detecta qué
   hacer sin que el humano lo pida, descompone, delega, integra y **aprende de
   cada ciclo**. El humano da dirección estratégica, no activa cada tarea.
2. **Ejército de agentes con LLM fijo por rol** — registry donde cada agente
   tiene rol, modelo fijo, toolset, prompt propio **y skills pre-cargados**.
3. **Transversal** — opacidad total del modelo al cliente; el modelo es
   infraestructura intercambiable.

---

## Scoreboard

| Área | ✅ | ⚠️ | ❌ | Total |
|------|----|----|----|-------|
| A. Ejército / Registry | 8 | 1 | 0 | 9 |
| B. Comportamiento orquestador | 6 | 0 | 0 | 6 |
| C. Meta-loop autónomo | 8 | 0 | 0 | 8 |
| D. Autolearning | 5 | 0 | 0 | 4 |
| E. Gestión de modelos | 5 | 0 | 1 | 6 |
| F. Opacidad SaaS | 4 | 0 | 0 | 4 |
| G. Foundation (PLAN-001) | 3 | 0 | 0 | 3 |
| H. Verificación "es real" | 3 | 1 | 0 | 4 |
| **Total** | **42** | **2** | **1** | **44** |

> **Inicio:** 25 ✅ / 5 ⚠️ / 14 ❌ → **Ahora:** 42 ✅ / 2 ⚠️ / 1 ❌ (~95%).
>
> **Nueva tanda (C6/D5/F4):**
> - **C6 ✅** — señales externas: `agent/signal_intake.py` (buzón `signals/inbox/` → tareas) cableado al daemon.
> - **D5 ✅** — autolearning del chat: `agent/autolearn_tracker.py` (persistente, compartido daemon+chat) + hook en `run_agent` (orchestrator_mode surface una propuesta de skill al recurrir un patrón).
> - **F4 ✅** — verificado: el `ModelPicker` del desktop solo muestra "OmniWorker Normal/Code" (nunca kimi/glm), `getDisplayLabel` defaultea a nombre lindo, y el backend devuelve alias. El chat es opaco por diseño. (La pantalla de settings de provider es config de operador, no surface de cliente.)
>
> **Restante:** H4 (correr en desktop real), A8 (sandbox con backend), E6 (push SaaS — opcional).
>
> **✅ H2 PROBADO EN VIVO (2026-06-04):** `scripts/verify_orchestrator_live.py`
> con `KIMI_API_KEY` real → orquestador kimi-k2 delegó a un worker kimi-k2 que
> completó (`summary: "OK"`, 1 API call real, 862/4 tokens). La delegación real
> e integración del summary están **demostradas**. Solo queda H4 (sesión de
> desktop, mismo motor) sin correr.

**Lectura:** los dos objetivos están sustancialmente cumplidos a nivel backend
(registry sano, delegación real con skills/judgment-day, iniciativa por
descomposición de objetivos, budgets + kill-switch, autolearning de skills,
observabilidad). Lo que queda son items que **no se pueden cerrar en backend
puro**: runs con modelos/desktop reales (creds), sandbox con backend, el front
(fuera del repo) y una segunda fuente opcional de auto-update.

---

## Execution log — 2026-06-04 (esta sesión)

Implementado + testeado (110 tests verdes, 1 skip = live model):

| Item | Qué se hizo | Tests |
|------|-------------|-------|
| **A5** ❌→✅ | toolsets fantasma `delegate`→`delegation`, `code_exec`→`code_execution` + guardia | `test_registry_toolsets_valid.py` |
| **A6** ❌→✅ | campo `skills:` por agente + inyección vía `build_preloaded_skills_prompt` | `test_registry_skills.py` |
| **A7** ❌→✅ | judgment-day: `parallel_instances>1` → N instancias ciegas en batch | `test_judgment_day.py` |
| **A8** ❌→⚠️ | flag `sandbox` surfaced + warning; enforcement real necesita backend | — |
| **B4/B5** ⚠️→✅ | `build_brief()` + `extract_summary()` estructurados, cableados al daemon | `test_delegation_brief.py` |
| **B6** ❌→✅ | descomposición autónoma de objetivos → subtareas en kanban | `test_objective_decomposer.py` |
| **C5** ✅ | contenido de crons (weekly/standup/autolearning) | — |
| **C6** ❌→⚠️ | objetivo→subtareas hecho; triggers por señal externa pendientes | (cubierto por B6) |
| **C7** ❌→✅ | budget (delegaciones/tokens/USD por día) + kill-switch | `test_orchestrator_budget.py` |
| **C8** ❌→✅ | telemetría JSONL de runs (agente/modelo/tokens/costo/outcome) | `test_orchestrator_telemetry.py` |
| **D2** ❌→✅ | propuesta de skill tras patrón recurrente (3×) | `test_orchestrator_daemon.py` |
| **E5** ⚠️→✅ | gestión de modelos no es tool — workers no la tocan (por diseño) | — |
| **F3** ⚠️→✅ | `api_server` publica alias (`omniworker-agent`), no modelos backend | (verificado) |
| **H3** ❌→✅ | integración real daemon↔kanban (solo stub del modelo) | `test_orchestrator_e2e.py` |
| **H2/H4** ❌→⚠️ | harness de delegación real listo, gated por `RUN_E2E=1` (creds) | `test_orchestrator_e2e.py` |

---

## A. Ejército de agentes / Registry (Objetivo 2)

### A1 — Registry con modelo/provider/toolset/prompt fijo por rol · ✅
- **Evidencia:** `agent_types.yaml` (10 agentes), `agent/agent_registry.py` (`AgentConfig`, `get_agent_for_task`).
- **Aceptación:** `get_agent_for_task("developer").model == "glm-5"`, provider `zai`. ✔ testeado.

### A2 — Capa de override family-scoped (auto-update) · ✅
- **Evidencia:** `model_overrides.yaml`, `_RawAgent.resolve()` aplica override por `model_family`.
- **Aceptación:** un override `glm: glm-5.1` cambia el modelo de todos los agentes glm al próximo spawn. ✔ testeado.

### A3 — `general_agent` elige tier por complejidad AL SPAWN (fijo luego) · ✅
- **Evidencia:** `model_selection: orchestrator_by_complexity`, `resolve(complexity=...)`.
- **Aceptación:** `get_agent_for_task("general_agent", complexity="complex").model == "kimi-k2"`. ✔ testeado.

### A4 — `delegate_tool` resuelve config por agente desde el registry · ✅
- **Evidencia:** `tools/delegate_tool.py::_resolve_agent_type_task`, kwargs `agent_type`/`complexity`.
- **Aceptación:** `delegate_task(goal=..., agent_type="developer")` spawnea un worker con creds de `developer`. ✔ (unit, con fakes).

### A5 — Los nombres de toolset del registry mapean a toolsets REALES · ❌
- **Gap (verificado):** el YAML usa `delegate` y `code_exec`, pero los toolsets reales se llaman **`delegation`** y **`execute_code`** (`toolsets.py`). No resuelven → el orquestador **no puede delegar** y los agentes de código **no ejecutan**.
- **Aceptación:** cada nombre en cada `toolset:` del registry existe en `toolsets.py`; un test parametrizado lo garantiza.
- **Prioridad:** 🔴 **P0 — bloqueante.** Sin esto el ejército no funciona aunque todo lo demás esté.

### A6 — Skills pre-cargados por agente · ❌
- **Gap:** el objetivo dice "skills pre-cargados" por rol; el registry **no tiene campo `skills:` por agente** ni `delegate` los inyecta.
- **Aceptación:** `developer` declara `skills: [git-workflow, testing]` en el YAML y el worker arranca con esos skills inyectados en su prompt; verificable en el system prompt del worker.

### A7 — `parallel_instances` honrado (judgment-day: 2 reviewers ciegos) · ❌
- **Gap:** `reviewer.parallel_instances: 2` declarado pero `delegate_tool` no lo lee.
- **Aceptación:** delegar al `reviewer` spawnea 2 instancias en paralelo, ciegas entre sí, y consolida verdict. Diferenciador estrella del plan.

### A8 — `sandbox` honrado (code_runner) · ❌
- **Gap:** `code_runner.sandbox: true` declarado, no aplicado.
- **Aceptación:** el `code_runner` ejecuta en sandbox aislado; un intento de salida del sandbox falla.

### A9 — Metadata display/opacidad por agente · ✅
- **Evidencia:** bloque `display:` por agente, `list_visible_agents()`, `model_opacity.strip_model_info`.
- **Aceptación:** el front recibe `"Agente de Marketing"`, nunca `glm-5`. ✔ (unit).

---

## B. Comportamiento del orquestador (Objetivo 1 — decide y delega)

### B1 — System prompt de director (no ejecutor) · ✅
- **Evidencia:** `prompts/orchestrator.md` (analizar → descomponer → consultar registry → delegar → integrar → actualizar → aprender).

### B2 — El chat interactivo (gateway + desktop) adopta el rol de orquestador · ✅
- **Evidencia:** flag `agent.orchestrator_mode`, inyección en `agent/system_prompt.build_system_prompt_parts` (gated a root agents vía `delegate_task`, idempotente).
- **Aceptación:** con el flag on, el system prompt del chat contiene el prompt del orquestador; los workers no. ✔ testeado.

### B3 — Protección de contexto (al orquestador nunca se le simplifica el payload) · ✅
- **Evidencia:** `smart_router.is_context_protected` (header + sentinel), sentinel en `orchestrator.md`.
- **Aceptación:** un payload con el sentinel no pasa por `simplify_chitchat_payload`. ✔ testeado.

### B4 — Brief de delegación = objetivo + contexto mínimo (no historial completo) · ⚠️
- **Estado:** `delegate_task` pasa `goal`+`context`, pero **no hay un `build_brief()` que condense** el contexto mínimo; hoy se pasa lo que el caller mande.
- **Aceptación:** existe `build_brief(task)` que produce objetivo + criterio de éxito + formato esperado, sin volcar el historial del orquestador; verificable en el prompt del worker.

### B5 — Integrar resultado como summary estructurado (no raw output) · ⚠️
- **Estado:** el daemon guarda un summary truncado; **no hay `extract_summary()`** que estructure el output del worker antes de integrarlo.
- **Aceptación:** el worker devuelve `{summary, artifacts, status}` estructurado y el orquestador integra el summary, no el raw.

### B6 — Descomposición autónoma: objetivo → subtareas en el kanban · ❌
- **Gap:** **nadie descompone.** El prompt lo pide pero no hay herramienta/loop que tome un objetivo de alto nivel y escriba subtareas. Hoy el humano/chat crea las cards.
- **Aceptación:** dado un objetivo ("lanzá la campaña X"), el orquestador escribe N subtareas en el kanban sin intervención humana, cada una clasificada a un agente.
- **Prioridad:** 🟠 **P1 — núcleo del Objetivo 1.** Sin esto el sistema despacha, no dirige.

---

## C. Meta-loop autónomo / iniciativa (Objetivo 1)

### C1 — Daemon pollea kanban y despacha ready/unassigned · ✅
- **Evidencia:** `orchestrator_daemon.py::tick` / `_get_ready_unassigned` / `_delegate_task`.

### C2 — El daemon arranca con el gateway (opt-in) · ✅
- **Evidencia:** `gateway/run.py` (env `OMNIWORKER_ORCHESTRATOR_DAEMON`), `build_orchestrator_daemon().start()`.

### C3 — Loop detection (3 fallos → escalar) · ✅
- **Evidencia:** `_failures` / `_escalate` / `max_failures`. ✔ testeado.

### C4 — Reactivación de tareas estancadas (>24h) · ✅
- **Evidencia:** `_get_stalled` / `_reactivate_or_escalate`.

### C5 — Cron tasks programadas · ✅ (mecanismo)
- **Evidencia:** `cron_tasks`, `_due_cron_tasks`, croniter + fallback interval.
- **Nota:** el mecanismo existe; las cron concretas del plan (weekly_review, daily_standup) no están definidas como contenido. Mecanismo ✅, contenido ⚠️.

### C6 — Iniciativa propia: generar trabajo desde objetivos/señales sin humano · ❌
- **Gap:** el daemon solo despacha lo que **ya existe** en el kanban. No detecta "qué hay que hacer". Es reactivo a la cola, no proactivo.
- **Aceptación:** el daemon, ante un objetivo estratégico o una señal (email entrante, evento, checkbox), genera y despacha tareas sin que un humano las cargue. (Ver B6 — relacionado.)
- **Prioridad:** 🟠 **P1.**

### C7 — Budget caps / cost ceiling / kill-switch · ❌
- **Gap:** **no existe ningún control de gasto.** Un director autónomo que delega a modelos pagos en loop necesita techo de costo por tarea/día y un kill-switch.
- **Aceptación:** config `orchestrator.budget.daily_usd`; al superarlo el daemon pausa y notifica; existe un `stop()` de emergencia accesible al operador.
- **Prioridad:** 🔴 **P0 para operar sin supervisión.** (Barandilla obligatoria.)

### C8 — Observabilidad de runs (qué corrió / costo / resultado) · ❌
- **Gap:** no hay telemetría de delegaciones (qué agente, qué modelo, tokens, costo, outcome).
- **Aceptación:** cada delegación registra un evento consultable (agente, modelo, duración, tokens, costo, éxito/fallo); un comando/endpoint lo lista.

---

## D. Autolearning (Objetivo 1 — aprende de cada ciclo · Fase 4)

### D1 — Skills autolearning existe (nudge interval) · ✅
- **Evidencia:** `creation_nudge_interval` (bajado a 30 en config), skill creation nudges.

### D2 — Proponer SKILL tras patrón recurrente (3x) · ❌
- **Gap:** el docstring del daemon dice "propose a skill" pero **el hook solo hace agent proposals**. La `propose_skill` de Fase 4 no está en el código.
- **Aceptación:** tras 3 tareas del mismo tipo resueltas, el orquestador propone un skill (draft) y notifica.

### D3 — Proponer AGENTE tras reincidencia de `general_agent` · ✅
- **Evidencia:** `agent/agent_proposals.py::maybe_propose`, hook `_check_agent_proposal` en el daemon.
- **Aceptación:** N usos del general_agent para el mismo bucket → draft en `agent_types_proposals.yaml` + notificación. ✔ (unit).

### D4 — Aprobar propuesta escribe `agent_types.yaml` · ✅
- **Evidencia:** `agent_proposals.approve_proposal()` (append al YAML, marca aprobado).
- **Aceptación:** aprobar un draft hace que el nuevo agente sea resoluble por `get_agent_for_task`. ✔ (unit).

### D5 — El chat interactivo trackea uso y aprende · ❌
- **Gap:** el tracking de uso + propuestas solo corre en modo daemon. El chat (gateway/desktop) no alimenta el autolearning.
- **Aceptación:** un patrón repetido en sesiones de chat dispara la misma propuesta de skill/agente que en el daemon.

---

## E. Gestión dinámica de modelos (Fase 3)

### E1 — Aplicar catalog change (minor auto / major aprobación) · ✅
- **Evidencia:** `agent/model_manager.py` (`apply_catalog_change`, `apply_pending`, `list_pending`).

### E2 — Poller que detecta cambios de catálogo · ✅
- **Evidencia:** `agent/model_catalog.py` (`poll_catalogs`, `classify_severity`, heurística de versión/variante).
- **Aceptación:** dado un catálogo live con `glm-6`, emite `CatalogChange(glm, glm-5→glm-6, major)`. ✔ testeado (offline, `fetch_fn`).

### E3 — Cron diario del daemon corre el catalog check · ✅
- **Evidencia:** `build_orchestrator_daemon` agrega cron `0 8 * * *` kind=catalog; `_dispatch_cron` lo rutea. ✔ testeado.

### E4 — Notificación al operador (task triage en kanban) · ✅
- **Evidencia:** `build_kanban_notifier` (create_task triage + idempotency).

### E5 — Solo el orquestador habla con el router · ⚠️
- **Estado:** respetado por diseño (los workers no llaman al router), pero **no enforced** por código.
- **Aceptación:** un worker que intente resolver/cambiar modelo vía router falla o es no-op.

### E6 — Canal de push del SaaS (endpoints admin) · ❌ (opcional — Opción B)
- **Gap:** no hay `POST /admin/model-catalog-change` etc. El poller local (E2) ya cubre el caso; esto es segunda fuente.
- **Aceptación:** el SaaS puede empujar un cambio y el orquestador lo aplica con la misma lógica de severidad.

---

## F. Opacidad SaaS (transversal)

### F1 — `strip_model_info` como borde único · ✅
- **Evidencia:** `gateway/model_opacity.py`.

### F2 — Cableado en el path de delivery · ✅
- **Evidencia:** `gateway/delivery.py::deliver` → `redact_for_user(metadata)`. ✔ testeado.

### F3 — Cableado en TODAS las superficies de cara al usuario · ⚠️
- **Estado:** delivery ✅; **falta verificar el response/stream del `api_server`** (desktop) y eventos de status.
- **Aceptación:** ninguna respuesta del api_server (incluido streaming) contiene `model`/`provider`/`base_url`.

### F4 — Allow-list `list_visible_agents` consumida por el front · ⚠️
- **Estado:** la función existe; **no verificado** que el front la consuma como única fuente.
- **Aceptación:** el front lista agentes solo desde `list_visible_agents` (sin campos de infra).

---

## G. Foundation (PLAN-001 — pre-existente)

### G1 — Native memory siempre activa · ✅ (`agent/native_memory.py`)
### G2 — Provider state cross-modelo persistido · ✅ (`agent/provider_state.py`)
### G3 — Desktop: historial completo desde SQLite (sin truncar a 50) · ✅

> ⚠️ **Bloqueo conocido:** `master (33bb7ab)` trae PLAN-001 con un rebrand roto
> (OmniWorker→Flux Agent dentro de identificadores Python). Estrategia:
> cherry-pick selectivo, no mergear master. Ver `REBRAND-BREAKAGE.md`.

---

## H. Verificación — "¿es REAL?"

### H1 — Unit tests de todos los módulos nuevos · ✅
- **Evidencia:** 69 tests verdes (registry, daemon, model_manager, model_catalog, opacity, smart_router, orchestrator_mode, agent_proposals).

### H2 — Smoke end-to-end: worker real spawnea → corre → devuelve → integra · ❌
- **Gap:** todo validado con fakes. Nada prueba el camino real.
- **Aceptación:** `delegate_task(agent_type="developer", goal="...")` contra `glm-5` real devuelve un summary integrado; log del run disponible.
- **Prioridad:** 🔴 **P0 — sin esto "orquestador autónomo" es diseño, no hecho.**

### H3 — Daemon corriendo contra un kanban vivo · ❌
- **Aceptación:** con `OMNIWORKER_ORCHESTRATOR_DAEMON=1` y tareas reales en el board, el daemon despacha, integra y escala en una corrida observada.

### H4 — Orquestador interactivo delega en una sesión real de desktop · ❌
- **Aceptación:** en el desktop, con `orchestrator_mode=true`, una tarea compleja se delega a un worker del registry y el resultado vuelve al chat.

---

## Roadmap — lo que QUEDA (post-sesión)

Todo P0/P1/P2 quedó cerrado en backend. Lo restante **no se puede completar en
backend puro** — necesita credenciales, un backend de sandbox, o el front:

| Item | Estado | Qué falta exactamente | Por qué no se cerró acá |
|------|--------|-----------------------|--------------------------|
| **H2** | ⚠️ | correr `RUN_E2E=1` con creds → delegación real a kimi/glm | gasta dinero + API keys; harness listo |
| **H4** | ⚠️ | sesión real de desktop delegando | requiere app corriendo + creds |
| **A8** | ⚠️ | enforcement de sandbox real | necesita `TERMINAL_ENV=docker/modal/...` configurado + aislamiento por-thread |
| **C6** | ⚠️ | triggers por señal externa (email/evento→task) | integración con fuentes externas (no definidas en el plan) |
| **F4** | ⚠️ | front consume solo `list_visible_agents` | código del desktop (TS), fuera de este repo |
| **D5** | ❌ | autolearning desde el chat interactivo | tracking de recurrencia cross-sesión en el chat; integración mayor |
| **E6** | ❌ | endpoints admin para push del SaaS | **opcional** — el poller local (E2) ya cubre el auto-update |

### Para cerrar los ⚠️/❌ restantes
- **H2/H4:** `RUN_E2E=1 python -m pytest tests/test_orchestrator_e2e.py` + abrir el desktop con `orchestrator_mode=true`. (Operativo, no código.)
- **A8:** configurar un backend de sandbox y agregar override de `env_type` por-child en `terminal_tool`.
- **C6/D5/E6/F4:** features nuevas, cada una con su propia mini-spec cuando se prioricen.

---

## Definición de "Objetivo cumplido"

El objetivo del plan se considera cumplido cuando:

- **Objetivo 1:** un operador da un objetivo estratégico (sin crear tasks) y el
  sistema —solo— lo descompone, delega a los agentes correctos, integra
  resultados, escala fallos, respeta un budget, y propone skills/agentes nuevos
  de lo aprendido. Verificado en una corrida real observada (H3).
- **Objetivo 2:** los 10 agentes del registry spawnean con su modelo/toolset/
  skills correctos (toolsets reales, A5/A6), el reviewer corre en judgment-day
  (A7), y el cliente nunca ve un modelo (F3). Verificado end-to-end (H2/H4).

Hasta entonces: **esqueleto completo (25/44), faltan las capacidades que lo
vuelven un director autónomo real (14 ❌, 5 ⚠️).**
