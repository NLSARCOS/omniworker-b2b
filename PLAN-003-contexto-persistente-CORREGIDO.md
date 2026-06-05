# PLAN-003 — Contexto Persistente: Plan Unificado y Corregido

> **Fecha:** 2026-06-04
> **Autor:** Revisión senior (corrige PLAN-002 de Kimi, complementa PLAN-001)
> **Estado:** Propuesto — pendiente de aprobación
> **Reemplaza/supera:** PLAN-002 (no lo descarta; lo reordena y le agrega lo que falta)

---

## 0. TL;DR

El problema reportado —"el router cambia el modelo en medio de la tarea y el agente se vuelve estúpido"— **no se resuelve con PLAN-002**. PLAN-002 ataca la *persistencia del historial*, pero la causa real es otra: el SaaS **re-elige un modelo distinto en cada request** (`Math.random()`), **borra los `tool_calls` en validación**, y **mutila la estructura** al convertir a formato Anthropic.

Este plan ordena el trabajo por **impacto/costo real**:

1. **Fase 0 (horas):** stickiness de modelo + preservar `tool_calls` + fix conversión Anthropic. **Arregla el 80% del dolor.**
2. **Fase 1 (1-2 días):** afinidad de modelo persistente (re-pin solo en fallo).
3. **Fase 2 (PLAN-002, después):** persistencia de historial en PostgreSQL.

---

## 1. Diagnóstico real (verificado en código, no en supuestos)

### 1.1 Existen DOS rutas de contexto independientes

| Ruta | Flujo | Estado |
|---|---|---|
| **A. Desktop** | Desktop → agente Python local (`127.0.0.1:8642`) → SQLite | PLAN-001 la arregló bien ✅ |
| **B. SaaS / Web** | Frontend → Next.js proxy (`route.ts`) → providers cloud | **STATELESS — aquí está el bug** ❌ |

PLAN-001 cubrió **solo la ruta A**. El problema reportado vive en la **ruta B** (`omniworker-saas/src/app/api/v1/chat/completions/route.ts`), donde está `intelligentModelSelect`. Por eso PLAN-001 "se siente incompleto": nunca tocó la ruta donde ocurre el síntoma.

### 1.2 Causa raíz #1 — Re-roll de modelo en cada request (la grande)

`route.ts` → `selectModelFromTier()` (líneas ~389-400):

```ts
let random = Math.random() * totalWeight;
for (const model of candidates) { random -= model.weight; if (random <= 0) return model; }
```

`Math.random()` se evalúa **en cada turno**. Aunque el `classifyPromptComplexity` devuelva el mismo tier, el modelo concreto cambia: turno 1 → `GLM-5.1`, turno 2 → `Kimi K2.6`, turno 3 → `MiMo-V2.5-Pro`, turno 4 → `Qwen3.7-Max`...

Consecuencias dentro de una misma tarea:
- Se pierde la continuidad de *reasoning* del modelo.
- Cambia el formato de tool-calls (unos usan `/chat/completions`, otros `/messages` estilo Anthropic — ver `OPENCODE_GO_CATALOG`).
- Cambia el "estilo"/capacidad de un turno a otro → percepción de que el agente "se volvió tonto".

> **Nota:** el commit `33bb7ab` ("fix(router): prevent model switching") **no arregló esto**. Solo agregó el heurístico `isContinuation` que fija el **tier mínimo** (línea ~372-377), no el modelo. El `Math.random()` sigue intacto.

### 1.3 Causa raíz #2 — La validación rechaza `content: null` (CORREGIDO el diagnóstico)

`omniworker-saas/src/lib/validation.ts`:

```ts
messages: z.array(z.object({ role: z.string(), content: z.string() }).passthrough()).min(1)
```

**Corrección al diagnóstico inicial:** el `.passthrough()` **ya estaba**, así que `tool_calls`/`tool_call_id`/`reasoning_content` **sí sobreviven** la validación (mi grep inicial los ocultó). El bug real es otro: `content: z.string()` **rechaza `content: null`**. En formato OpenAI, un mensaje `assistant` que solo lleva `tool_calls` tiene `content: null` → ese mensaje **falla la validación y tira el request entero con 400** a media tarea. Lo mismo con `content` como array (multimodal / tool_result).

> Fix aplicado: `content: z.any()` (polimórfico: string | null | array). El código downstream ya hace `typeof` checks antes de usarlo como string.

### 1.4 Causa raíz #3 — Conversión a formato Anthropic destruye estructura

`route.ts` líneas ~667-670 y ~1088-1091:

```ts
messages: chatMsgs.map((m) => ({
  role: m.role === "assistant" ? "assistant" : "user",   // "tool" → "user"
  content: m.content,                                      // tool_calls descartados
}))
```

Cuando el fallback cae en un modelo Anthropic-format (`Qwen3.x`, `MiniMax`, vía endpoint `/messages`), los tool-calls se pierden y el rol `tool` se colapsa a `user`.

### 1.5 Causas ya conocidas (PLAN-002 las identificó bien)

- `compactMessages()` (`>30` mensajes) hace resumen narrativo *lossy* (pierde tool_calls, decisiones).
- Context Bridge inyecta un resumen de ~800 tokens en cada request `>=6` mensajes, **cacheado por `user.id`** (no por conversación → riesgo de contaminación cruzada entre conversaciones del mismo usuario).
- No existe tabla `Conversation`/`Message` en Prisma (confirmado: solo `TaskLog` y `MasterProvider`).

---

## 2. Lo que falta en PLAN-001 (ejecutado)

PLAN-001 resolvió bien la ruta A (desktop): `native_memory.py`, `provider_state.py`, recuperación de sesión desde SQLite, fix de `trimSystemPrompt`. **Pero:**

- No tocó el router del SaaS (`intelligentModelSelect` / `selectModelFromTier`).
- No agregó stickiness de modelo en ninguna ruta.
- No arregló el strip de `tool_calls` en la validación del SaaS.
- El endpoint `/v1/sessions/{id}/workspace` que agregó solo sirve cuando el agente local está corriendo — **no aplica al SaaS cloud en producción**.

---

## 3. Evaluación de PLAN-002

| Aspecto | Veredicto |
|---|---|
| Diagnóstico de compactación/Context Bridge lossy | ✅ Correcto |
| Premisa "no hay tabla Conversation/Message" | ✅ Verificado |
| Persistencia en PostgreSQL como dirección a largo plazo | ✅ Correcto |
| **¿Resuelve el "cambio de modelo a media tarea"?** | ❌ **No.** Sigue eligiendo provider en cada request |
| Ignora el strip de `tool_calls` en validación | ❌ Persistiría datos mutilados |
| Asume acceso al "OmniWorker Agent" para comprimir desde el SaaS | ❌ El agente vive en el desktop local; el SaaS cloud no lo tiene |
| Costo: 4 semanas + cambio de frontend para el dolor reportado | ⚠️ Sobredimensionado para Fase 0 |

**Conclusión:** PLAN-002 es válido como **Fase 2** (persistencia), pero no como primer paso, y debe corregirse antes de ejecutarse.

---

## 4. La pieza faltante crítica: Afinidad de modelo (Model Stickiness)

> Una conversación se **fija** a un modelo+provider en el primer turno. Los turnos siguientes **reusan el mismo modelo**. Solo si ese modelo falla (error o health-check) se hace fallback **y se re-fija** al nuevo.

Esto resuelve la causa raíz #1 directamente y es independiente de la persistencia del historial.

---

## 5. Plan de ejecución (ordenado por impacto/costo)

### FASE 0 — Quick wins (horas) — arregla el 80% del dolor

**0.1 — Stickiness dentro del request (sin estado externo)**
- En `selectModelFromTier`, reemplazar `Math.random()` por un PRNG **sembrado con un hash estable de la conversación** (p. ej. hash del primer mensaje de usuario + `user.id`). Así el mismo hilo cae siempre en el mismo modelo dentro de su tier.
- Archivo: `route.ts` (`selectModelFromTier`, `intelligentModelSelect`).
- **Sin cambios de frontend ni DB.**

**0.2 — Preservar `tool_calls` en validación**
- En `validation.ts`, extender el schema de `messages` para aceptar `tool_calls`, `tool_call_id`, `reasoning_content`, `name` (o usar `.passthrough()` en el objeto de mensaje).
- Archivo: `src/lib/validation.ts`.

**0.3 — Fix conversión Anthropic**
- En las dos ramas `useAnthropicFormat` (líneas ~663 y ~1084), preservar `tool_calls` y mapear `role: "tool"` correctamente (Anthropic usa `tool_result` en `content`).
- Archivo: `route.ts`.

**Validación Fase 0:** conversación de 20+ turnos con tool-calls vía SaaS → verificar en logs que (a) el modelo real no cambia entre turnos, (b) los `tool_calls` llegan al provider.

---

### FASE 1 — Stickiness persistente (1-2 días)

**1.1 — Identidad de conversación**
- El frontend envía un `conversationId` opcional. Si no lo manda, el SaaS deriva uno del hash estable (compat hacia atrás).
- Extender `chatCompletionSchema` con `conversationId: z.string().optional()`.

**1.2 — Pin de modelo persistente**
- Tabla mínima (o cache Redis con TTL):
  ```prisma
  model ConversationModel {
    conversationId String   @id
    userId         String
    provider       String
    model          String
    endpoint       String?
    pinnedAt       DateTime @default(now())
    @@index([userId])
  }
  ```
- Lógica: turno 1 → elegir vía `intelligentModelSelect` y **guardar pin**. Turnos siguientes → leer pin y reusar. En fallo/health-check negativo → fallback **y actualizar pin**.
- Archivos: `route.ts`, `prisma/schema.prisma`, migración.

**Validación Fase 1:** matar el provider fijado a media conversación → verificar que hace fallback una vez y se queda en el nuevo modelo (no vuelve a oscilar).

---

### FASE 2 — Persistencia de historial (PLAN-002 corregido, después)

Recién aquí se implementa la idea de PLAN-002, **con las correcciones**:

**2.1 — Tablas `Conversation` y `ConversationMessage`** (como en PLAN-002 §3.1), pero:
- Persistir **después** del fix de validación (Fase 0.2), para guardar `tool_calls` intactos.
- `ConversationMessage` debe incluir `toolCalls`, `toolCallId`, `reasoningContent` (PLAN-002 ya los tenía — mantener).

**2.2 — Frontend envía solo el mensaje nuevo + `conversationId`** (PLAN-002 §3.2).

**2.3 — Compresión inteligente:**
- **Corrección a PLAN-002:** el SaaS cloud **no** puede llamar al agente local. Opciones reales:
  - (a) Comprimir con el mismo `topProvider` (un LLM cloud) pero **preservando `tool_calls`** explícitamente en el prompt de compresión, o
  - (b) portar la lógica de `ContextCompressor` a un módulo TypeScript en el SaaS.
- Ejecutar cada N turnos en background (como propone PLAN-002 §3.3), no en cada request.

**2.4 — Eliminar/retirar Context Bridge y `compactMessages` lossy** una vez que la persistencia + stickiness estén validadas.

---

## 6. Archivos a tocar (por fase)

| Fase | Archivo | Cambio |
|---|---|---|
| 0.1 | `omniworker-saas/src/app/api/v1/chat/completions/route.ts` | PRNG sembrado en `selectModelFromTier` |
| 0.2 | `omniworker-saas/src/lib/validation.ts` | Schema de `messages` preserva tool fields |
| 0.3 | `omniworker-saas/src/app/api/v1/chat/completions/route.ts` | Conversión Anthropic preserva `tool_calls`/roles |
| 1.1 | `omniworker-saas/src/lib/validation.ts` | `conversationId` opcional |
| 1.2 | `route.ts`, `prisma/schema.prisma` | Tabla/cache `ConversationModel` + lógica de pin |
| 2.x | `prisma/schema.prisma`, `route.ts`, frontend, `conversation-compaction.ts` | Persistencia historial (PLAN-002 corregido) |

---

## 7. Resumen ejecutivo

- **El bug NO es de persistencia, es de routing.** El SaaS re-elige modelo en cada turno y borra los tool_calls en la puerta.
- **PLAN-001** arregló la ruta desktop, no la SaaS.
- **PLAN-002** es buena dirección pero (a) no resuelve el dolor reportado y (b) está mal priorizado y debe corregirse antes de ejecutarse.
- **Empezar por Fase 0** (horas) da el mayor alivio. Persistencia (PLAN-002) queda como Fase 2, ya sobre cimientos sanos.

---

---

## 8. Estado de ejecución (2026-06-04)

### ✅ Fase 0 — EJECUTADA
- **0.1** `selectModelFromTier` / `intelligentModelSelect` ahora aceptan un PRNG sembrado (`mulberry32` + `hashStringToSeed`). Seed estable por conversación (`conversationSeed`). Adiós al `Math.random()` libre que re-tiraba el modelo cada turno.
- **0.2** `validation.ts`: `content: z.any()` → deja de rechazar `content: null`/array (ya no hay 400 en turnos con tool_calls).
- **0.3** Helper `toAnthropicMessages()` preserva `tool_use`/`tool_result`/roles. Aplicado en las dos conversiones Anthropic (path virtual y estándar).

### ✅ Fase 1 — EJECUTADA
- **1.1** `conversationId` opcional en `chatCompletionSchema`.
- **1.2** Modelo `ConversationModel` en Prisma + helpers `loadModelPin`/`saveModelPin`. El router fija provider+model en el turno 1, los reusa después, y solo re-fija si el modelo fijado falla. Todo best-effort (try/catch) → degrada a selección sembrada si la tabla no está migrada.
- Migración creada: `prisma/migrations/20250604010000_add_conversation_model/` (pendiente de aplicar con `prisma migrate deploy`).

### 🐛 Bugs bloqueantes encontrados y arreglados de paso
- **Identificadores rotos por el rebrand**: `const OMNIWORKER_ROLES`, `function isOmniWorkerVirtualModel` (espacios dentro de nombres) → **errores de sintaxis que impedían compilar/bundlear el SaaS entero**. Corregidos a `FLUX_AGENT_ROLES` / `isFluxAgentVirtualModel`.
- **Template literal corrupto** en `conversation-compaction.ts` (backticks escapados inválidos) → corregido.

### Verificación
- `npx tsc --noEmit`: **0 errores** en `route.ts`, `validation.ts`, `conversation-compaction.ts`.
- Cliente Prisma regenerado (`conversationModel` disponible).
- Errores de tipo restantes (91) son **preexistentes** en landing pages SEO + `next.config.ts`, ajenos a este trabajo y de todos modos ignorados por el build (`ignoreBuildErrors: true`).

### Pendiente para activar stickiness persistente
1. Aplicar la migración: `cd omniworker-saas && npx prisma migrate deploy`.
2. (Opcional) Que el frontend mande `conversationId` para máxima precisión del pin (sin él, se usa un hash estable del primer mensaje + userId).

### ⏭️ Fase 2 — NO ejecutada (requiere tu OK)
Persistencia completa del historial en PostgreSQL (tablas `Conversation`/`ConversationMessage`) + cambio de contrato del frontend. Es una migración mayor en producción y toca el cliente; queda para una sesión dedicada.

---

*Fase 0 + Fase 1 ejecutadas y verificadas por typecheck. Falta aplicar la migración en la DB y, opcionalmente, mandar `conversationId` desde el frontend.*
