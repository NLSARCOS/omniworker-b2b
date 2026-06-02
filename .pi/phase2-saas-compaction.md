# Phase 2: SaaS Conversation Compaction

## Resumen

Se implementó el sistema de compaction de conversación para el SaaS de OmniWorker. El sistema reduce el contexto enviado a los providers cuando el historial de mensajes supera los 30 mensajes, generando un resumen del medio de la conversación usando el mismo provider/modelo del request.

## Archivos modificados

### 1. `src/lib/conversation-compaction.ts` (nuevo)

- Función `compactMessages(messages, userQuery, config)`:
  - Si `messages.length <= 30`, retorna sin cambios.
  - Separa: primeros 5 mensajes + últimos 20 mensajes.
  - El segmento del medio se resume vía LLM usando el mismo provider del request.
  - Cache en memoria (`Map`) con clave hash (djb2) y TTL de 5 minutos.
  - Fallback a concatenación truncada si el provider falla al generar el resumen.
  - Retorna: `[...first, {role:'system', content:'## Resumen de conversación anterior:\n' + summary}, ...tail]`.

- Soporte de formatos:
  - OpenAI-compatible (default).
  - Anthropic (`/messages` endpoint).
  - OpenCode Go (ambos endpoints).

- Zero dependencias nuevas. Reusa `fetchWithBackoff` del proyecto.

### 2. `src/app/api/v1/chat/completions/route.ts` (modificado)

- Import agregado: `compactMessages`.

- Virtual model path:
  - Compaction ejecutado **antes** del provider fallback loop.
  - Usa `topProvider` (provider de mayor prioridad) para generar el resumen.
  - Modelo de resumen resuelto con la misma lógica de routing del loop (`intelligentModelSelect` para OpenCode Go, `DEFAULT_PROVIDER_MODELS` para otros).

- Standard (non-virtual) model path:
  - Compaction ejecutado **antes** del provider fallback loop.
  - Usa `candidateProviders[0]` (provider primario) para generar el resumen.
  - Endpoint resuelto desde `OPENCODE_GO_CATALOG` si aplica.

- Logging brutalista:
  ```
  [Compaction] { before: 45, after: 26, saved: '42%' }
  ```

- Se eliminó código inválido preexistente dentro del virtual model loop que intentaba llamar `compactMessages` de forma síncrona con una API inexistente.

## Verificación

```bash
cd /Users/nelsonsarcos/Documents/Simplet Pyects/aass2/omniworker-saas
npx tsc --noEmit 2>&1 | tail -20
```

**Resultado:** Cero errores TypeScript en los archivos modificados. Los errores restantes son preexistentes en páginas de marketing (`asistente-para-inmobiliarias`, `automatizacion-de-pedidos`, etc.) y no están relacionados con esta tarea.

## Riesgos / Dependencias identificadas

1. **Consumo de tokens para el summary:** Cada compaction genera una llamada extra al provider. El ahorro neto depende de que el resumen sea más corto que los mensajes originales del medio. En conversaciones muy densas (código largo), el beneficio puede ser marginal.
2. **Cache en memoria:** Al usar `Map` en memoria, los resúmenes se pierden al reiniciar el servidor y no se comparten entre instancias (relevante si el SaaS escala horizontalmente). Para producción a escala, considerar Redis o memcached.
3. **Provider failure en summary:** Si el provider falla al generar el resumen, el fallback concatena los mensajes truncados (300 chars c/u). Esto preserva algo de contexto pero puede perder información crítica.
4. **Race condition potencial:** Si dos requests concurrentes para la misma sesión llegan con el mismo middle segment, ambas harán la llamada al LLM (la primera en setear el cache "gana"). No hay deduplicación activa.
5. **Modelo de resumen en virtual path:** Se usa `topProvider` para el resumen, pero el provider final puede ser diferente (fallback). Esto es una aproximación razonable dado que no se conoce el provider final hasta que el loop termine.
