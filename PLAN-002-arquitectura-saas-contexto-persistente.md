# Arquitectura SaaS: Contexto Persistente y Escalable

> **Fecha:** 2026-06-04  
> **Autor:** Agente de ejecución  
> **Estado:** Plan de implementación propuesto

---

## 1. El Problema Real (investigado en código)

### 1.1 Cómo funciona el SaaS HOY

```
┌──────────┐      ┌─────────────────────────────────────────────────────────┐
│ Frontend │─────▶│  SaaS Next.js (/api/v1/chat/completions)              │
│ (React)  │      │                                                         │
└──────────┘      │  1. Recibe TODOS los mensajes del frontend            │
                  │  2. Si hay >30 mensajes → compactMessages()           │
                  │     (resumen narrativo lossy, pierde tool_calls)      │
                  │  3. Inyecta Context Bridge (resumen de 800 tokens)    │
                  │  4. Prueba provider A → si falla, prueba provider B   │
                  │  5. Envía al modelo que responda                      │
                  │                                                         │
                  │  NO guarda mensajes en PostgreSQL.                    │
                  │  La tabla TaskLog solo guarda: tokens, modelo, status │
                  └─────────────────────────────────────────────────────────┘
```

### 1.2 Por qué se pierde el contexto

| Escenario | Qué pasa | Por qué |
|-----------|----------|---------|
| **Conversación larga (>30 msgs)** | `compactMessages()` resume los mensajes del medio en un párrafo narrativo | Pierde `tool_calls`, `reasoning`, errores específicos, y decisiones técnicas |
| **Cambio de provider (fallback)** | Provider A falla → Provider B recibe el mismo payload | El payload ya está truncado/compactionado |
| **Context Bridge** | Inyecta un system message de 800 tokens | Es un **resumen** generado por un LLM. No reemplaza al historial completo |
| **Saludo simple** | `trimSystemPrompt()` reemplaza todo el system prompt | Contexto destruido por "You are a helpful assistant" |

### 1.3 Lo que descubrí en el código

**Prisma schema** (`omniworker-saas/prisma/schema.prisma`):
- `TaskLog`: solo guarda `promptTokens`, `completionTks`, `modelUsed`, `status`
- **NO hay tabla `Conversation` ni `Message`**
- `MasterProvider`: guarda `apiKey`, `priority`, `dailyLimit` — el SaaS actúa como **proxy/gateway**

**Routing** (`route.ts`):
- Cuando `model = "omniworker-code"`, el SaaS elige el provider automáticamente por prioridad + health check
- Cuando `model = "gpt-4o"`, elige el provider correspondiente
- **Siempre** aplica `compactMessages()` a >30 mensajes
- **Siempre** inyecta `ContextBridge` a >=6 mensajes

**El frontend mantiene el historial**. El SaaS no tiene memoria de sesión.

---

## 2. La Solución Propuesta (Escalable)

### 2.1 Principios

1. **El SaaS guarda TODO el historial** en PostgreSQL
2. **El frontend solo envía el mensaje nuevo** + `conversationId`
3. **El SaaS recupera el historial completo** y lo envía al provider
4. **Si el historial es muy largo**, se comprime **inteligentemente** usando el agente de OmniWorker (pero solo una vez cada N mensajes, no en cada turno)
5. **Cuando un provider falla**, el fallback usa el mismo historial completo de PostgreSQL

### 2.2 Nueva arquitectura

```
┌──────────┐      ┌─────────────────────────────────────────────────────────────┐
│ Frontend │─────▶│  POST /api/v1/chat/completions                              │
│ (React)  │      │  { message: "continúa", conversationId: "conv-123" }        │
└──────────┘      │                                                             │
                  │  1. Autentica usuario                                       │
                  │  2. Recupera historial de PostgreSQL:                       │
                  │     SELECT * FROM ConversationMessage                       │
                  │     WHERE conversationId = 'conv-123' ORDER BY turnIndex    │
                  │                                                             │
                  │  3. Agrega el nuevo mensaje del usuario                     │
                  │                                                             │
                  │  4. ¿Historial > 60 mensajes?                               │
                  │     → Llama a OmniWorker Agent para compresión              │
                  │     → Guarda versión comprimida en PostgreSQL               │
                  │     → Esto pasa 1 vez cada 20 turnos, no en cada request    │
                  │                                                             │
                  │  5. Elige provider (por prioridad / health / costo)         │
                  │                                                             │
                  │  6. Envía historial completo al provider                    │
                  │                                                             │
                  │  7. Recibe respuesta del provider                           │
                  │                                                             │
                  │  8. Guarda respuesta en PostgreSQL                          │
                  │     INSERT INTO ConversationMessage (...)                   │
                  │                                                             │
                  │  9. Devuelve respuesta al frontend                          │
                  └─────────────────────────────────────────────────────────────┘
```

---

## 3. Cambios Necesarios

### 3.1 Base de datos (Prisma)

```prisma
model Conversation {
  id          String    @id @default(uuid())
  userId      String
  user        User      @relation(fields: [userId], references: [id], onDelete: Cascade)
  title       String?   // Título auto-generado o manual
  model       String    // Modelo virtual usado (ej: "omniworker-code")
  provider    String?   // Último provider que respondió
  status      String    @default("active") // active | archived | deleted
  messageCount Int     @default(0)
  tokenCount  Int       @default(0)
  lastMessageAt DateTime @default(now())
  createdAt   DateTime  @default(now())
  updatedAt   DateTime  @updatedAt

  messages    ConversationMessage[]

  @@index([userId])
  @@index([status])
  @@index([lastMessageAt])
}

model ConversationMessage {
  id              String   @id @default(uuid())
  conversationId  String
  conversation    Conversation @relation(fields: [conversationId], references: [id], onDelete: Cascade)
  turnIndex       Int      // Orden dentro de la conversación
  role            String   // user | assistant | system | tool
  content         String   @db.Text
  
  // Campos opcionales para preservar contexto completo
  toolCalls       String?  @db.Text // JSON de tool_calls
  toolCallId      String?  // Para mensajes role="tool"
  reasoningContent String? @db.Text // Reasoning del modelo
  provider        String?  // Qué provider generó esta respuesta
  model           String?  // Qué modelo real generó esta respuesta
  tokensUsed      Int?     // Tokens usados en este turno
  
  createdAt       DateTime @default(now())

  @@index([conversationId])
  @@index([conversationId, turnIndex])
  @@index([createdAt])
}
```

### 3.2 API del SaaS

**Nuevo endpoint:**

```http
POST /api/v1/chat/completions
Content-Type: application/json

{
  "message": "Continúa con la API",
  "conversationId": "conv-123",  // Opcional: si no existe, crea nueva
  "model": "omniworker-code",    // Virtual model
  "stream": true
}
```

**Respuesta:**

```http
{
  "conversationId": "conv-123",
  "message": {
    "role": "assistant",
    "content": "Voy a continuar con el endpoint /api/users..."
  },
  "modelUsed": "glm-5.1",
  "providerUsed": "opencode-go"
}
```

### 3.3 Compresión inteligente (usando OmniWorker Agent)

**Cuándo se ejecuta:**
- Solo cuando `messageCount > 60` (configurable)
- Solo una vez cada 20 turnos (no en cada request)
- Ejecutado en background (no bloquea la respuesta al usuario)

**Cómo funciona:**

```typescript
// En background, cada 20 turnos
if (conversation.messageCount > 60 && conversation.messageCount % 20 === 0) {
  const agent = new OmniWorkerAgentAPI({ sessionId: conversation.id });
  const compressed = await agent.compressConversation({
    messages: conversation.messages,
    preserveToolCalls: true,
    preserveReasoning: true,
    targetMessageCount: 30,
  });
  
  // Guarda la versión comprimida en PostgreSQL
  await prisma.conversationMessage.createMany({
    data: compressed.map((msg, i) => ({
      conversationId: conversation.id,
      turnIndex: i,
      role: msg.role,
      content: msg.content,
      toolCalls: msg.tool_calls ? JSON.stringify(msg.tool_calls) : null,
      reasoningContent: msg.reasoning_content || null,
      isCompressed: true,
    })),
  });
}
```

**Por qué usar el agente de OmniWorker para compresión:**
- Ya tiene `ContextCompressor` con preservación de `tool_calls`
- Ya tiene `NativeMemory` para extraer facts y workspace state
- Es **mucho más inteligente** que `compactMessages()` (que solo hace un resumen narrativo)
- Se ejecuta **raramente** (1 vez cada 20 turnos), por lo que el costo es mínimo

### 3.4 Fallback entre providers

```
Provider A (OpenCode Go - GLM-5.1) falla
    ↓
SaaS recupera el MISMO historial completo de PostgreSQL
    ↓
Provider B (DeepSeek) recibe el historial completo
    ↓
Provider B responde correctamente
    ↓
SaaS guarda la respuesta en PostgreSQL
```

**El historial NUNCA cambia** entre providers. Solo cambia quién lo procesa.

---

## 4. Comparación: Antes vs Después

| Aspecto | ANTES (hoy) | DESPUÉS (propuesto) |
|---------|-------------|---------------------|
| **Quién guarda mensajes** | Frontend (React state) | PostgreSQL (SaaS) |
| **Qué envía el frontend** | Todos los mensajes | Solo el mensaje nuevo + `conversationId` |
| **Compresión** | `compactMessages()` en cada request >30 msgs | OmniWorker Agent cada 20 turnos |
| **Calidad de compresión** | Resumen narrativo lossy | Preserva `tool_calls`, `reasoning`, workspace state |
| **Context Bridge** | Inyectado en cada request >6 msgs | **Eliminado** (ya no es necesario) |
| **Fallback providers** | Mismo payload truncado | Mismo historial completo de PostgreSQL |
| **Saludo simple** | Destruye system prompt | Solo recorta tokens, no destruye contexto |
| **Escalabilidad** | Frontend envía más datos cuanto más larga la conversación | Frontend envía siempre lo mismo |
| **Costo del agente** | N/A (no se usa) | 1 llamada cada 20 turnos (compresión) |

---

## 5. Por qué es la opción más escalable

### 5.1 Escalabilidad del frontend
- **Antes:** Cada request envía más datos. Conversación de 100 mensajes = payload de ~50KB.
- **Después:** Cada request envía ~100 bytes (mensaje + conversationId).

### 5.2 Escalabilidad del backend
- **PostgreSQL** maneja millones de conversaciones sin problema.
- **Índices:** `(userId, lastMessageAt)` permite listar conversaciones rápido.
- **Índices:** `(conversationId, turnIndex)` permite recuperar historial en orden.

### 5.3 Escalabilidad del agente (costo)
- **El agente de OmniWorker NO procesa cada mensaje.**
- **Solo se usa para compresión** (1 vez cada 20 turnos).
- **Si una conversación tiene 100 turnos:** El agente se llama solo 5 veces.
- **Costo negligible** comparado con el ahorro de no perder contexto.

### 5.4 Escalabilidad del routing
- **Antes:** El Context Bridge consume tokens de LLM en CADA request (>6 msgs).
- **Después:** No hay Context Bridge. El historial completo se envía al provider.
- **Ahorro:** ~800 tokens por request × 100 requests = 80K tokens ahorrados.

---

## 6. Casos de uso reales

### Caso 1: Conversación larga de coding

```
Usuario: "Creame una API REST"
    ↓
Agente: Crea 8 archivos, ejecuta 5 tools
    ↓
Turnos 2-40: Edita, corrige, agrega tests, deploya
    ↓
Turno 41 (Compresión): OmniWorker resume 40 turnos en 30
    ↓
Turno 42: "Agregale autenticación OAuth2"
    ↓
Agente: Sabe que existe la API, los archivos, y el deploy
```

**Antes:** Turno 41 hubiera perdido tool_calls y archivos editados.  
**Después:** Todo preservado en PostgreSQL.

### Caso 2: Provider falla y cambia

```
Turno 15: Usuario pregunta algo complejo
    ↓
SaaS intenta OpenCode Go (GLM-5.1) → Timeout
    ↓
SaaS intenta DeepSeek → Responde OK
    ↓
Turno 16: Usuario dice "continúa"
    ↓
SaaS recupera historial completo de PostgreSQL
    ↓
DeepSeek (o el que toque) tiene TODO el contexto
```

**Antes:** DeepSeek recibía un resumen lossy.  
**Después:** DeepSeek recibe el historial completo.

### Caso 3: El usuario cierra y vuelve mañana

```
Usuario cierra la app
    ↓
PostgreSQL guarda: Conversation + 45 mensajes
    ↓
Mañana el usuario abre la app
    ↓
Frontend pide: GET /api/conversations/conv-123
    ↓
SaaS devuelve los 45 mensajes completos
    ↓
Usuario puede continuar exactamente donde estaba
```

**Antes:** El historial se perdía si el usuario limpiaba el localStorage.  
**Después:** Persistencia garantizada en PostgreSQL.

---

## 7. Migración y backward compatibility

### Fase A: Crear tablas y empezar a guardar (1 semana)
1. Crear `Conversation` y `ConversationMessage` en Prisma
2. Correr `npx prisma migrate dev`
3. Modificar `POST /api/v1/chat/completions` para:
   - Aceptar `conversationId` o crear uno nuevo
   - Guardar mensajes en PostgreSQL
   - Devolver `conversationId` en la respuesta

### Fase B: Cambiar el frontend (1 semana)
1. El frontend envía `{ message, conversationId }` en lugar de `{ messages }`
2. El frontend mantiene cache local pero también recupera de PostgreSQL al cargar

### Fase C: Eliminar Context Bridge y compactMessages (1 semana)
1. Eliminar `ContextBridge` (ya no es necesario)
2. Reemplazar `compactMessages()` por compresión con OmniWorker Agent
3. Ajustar tests

### Fase D: Compresión inteligente (opcional, semana 4)
1. Integrar OmniWorker Agent para compresión cada 20 turnos
2. Solo si `messageCount > 60`

---

## 8. Resumen para el usuario

| Pregunta | Respuesta |
|----------|-----------|
| **¿Quién decide el modelo?** | El SaaS, automáticamente por prioridad / health / costo. |
| **¿El usuario pierde contexto?** | NO. Todo se guarda en PostgreSQL. |
| **¿Cuándo cambia de modelo?** | Cuando un provider falla o por routing inteligente. El nuevo modelo recibe el historial completo. |
| **¿Es costoso?** | NO. El agente de OmniWorker solo se usa 1 vez cada 20 turnos para compresión. Cada request normal va directo al provider. |
| **¿Es escalable?** | SÍ. PostgreSQL maneja millones de conversaciones. El frontend envía siempre ~100 bytes por request. |
| **¿Qué pasa si cierro la app?** | Vuelves exactamente donde estabas. Los mensajes están en PostgreSQL. |

---

## 9. Archivos que habría que tocar

| Archivo | Cambio |
|---------|--------|
| `omniworker-saas/prisma/schema.prisma` | Agregar `Conversation` y `ConversationMessage` |
| `omniworker-saas/src/app/api/v1/chat/completions/route.ts` | Recuperar/guardar en PostgreSQL. Aceptar `conversationId`. Eliminar ContextBridge. |
| `omniworker-saas/src/lib/conversation-compaction.ts` | Reemplazar compresión simple por compresión con OmniWorker Agent |
| `omniworker-saas/src/lib/context-bridge.ts` | **Eliminar** (ya no es necesario) |
| `omniworker-desktop/src/renderer/src/screens/Chat/hooks/useChatIPC.ts` | Guardar `conversationId` y enviar solo `message` |
| `omniworker-agent/gateway/platforms/api_server.py` | Endpoint de compresión (reutilizar `_compress_context`) |

---

*¿Aprobás esta arquitectura? Si querés, empiezo con la Fase A (crear tablas en Prisma y modificar el endpoint).*