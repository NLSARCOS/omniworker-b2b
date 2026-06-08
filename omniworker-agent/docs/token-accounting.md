# Token Accounting — Mapeo a Pricing del Proveedor

Este documento explica cómo se mapea cada campo del desglose de tokens al pricing real del proveedor, para que el costo reportado sea auditable contra la factura.

---

## Campos del desglose

| Campo | Fuente (agente) | Qué representa | Peso en factura |
|---|---|---|---|
| `input_tokens_new` | `session_input_tokens` | Tokens de input **no** servidos desde caché | **1×** |
| `cache_read_tokens` | `session_cache_read_tokens` | Tokens leídos de prompt cache | **~0.1×** |
| `cache_write_tokens` | `session_cache_write_tokens` | Tokens escritos a prompt cache | **~1.25×** |
| `output_tokens` / `completion_tokens` | `session_completion_tokens` | Tokens generados por el modelo | **Varía por modelo** |
| `reasoning_tokens` | `session_reasoning_tokens` | Tokens de thinking/reasoning (Anthropic extended thinking) | Incluido en `output_tokens` |
| `api_calls` | `session_api_calls` | Número de llamadas al LLM en el mensaje | N/A |
| `cost` | `session_estimated_cost_usd` | Costo estimado en USD | Suma de todos los buckets |

> **Nota:** `prompt_tokens` (campo legacy de compat OpenAI) = `input_tokens_new + cache_read_tokens + cache_write_tokens`. No es el costo real — es la suma de todos los tokens procesados como input.

---

## Pricing por proveedor

### Anthropic

| Bucket | Precio relativo |
|---|---|
| Input nuevo (`input_tokens_new`) | 1× (precio base de input) |
| Cache read (`cache_read_tokens`) | 0.1× del precio de input |
| Cache write (`cache_write_tokens`) | 1.25× del precio de input |
| Output (`completion_tokens`) | Ver pricing por modelo |

Fuente oficial: [anthropic.com/pricing](https://www.anthropic.com/pricing)

### OpenAI / compatible

| Bucket | Precio relativo |
|---|---|
| Input nuevo | 1× |
| Cache read (`cached_tokens` en `prompt_tokens_details`) | 0.5× (varía por modelo) |
| Output | Ver pricing por modelo |

### Modelos locales / subscription

Cuando `cost_status = "included"`, el costo es 0 (incluido en suscripción). Los tokens siguen siendo reales pero no facturables.

---

## Cómo verificar contra la factura

1. **Por llamada:** el logger en `conversation_loop.py` emite `in=`, `out=`, `total=` y un ratio de caché si aplica. Con la mejora propuesta en R1 del [reporte de auditoría](./token-audit-report.md), emitirá `in_new / cache_read / cache_write / out / reasoning`.

2. **Por mensaje:** los campos del finish chunk SSE (`cache_read_tokens`, `input_tokens_new`, `cost`) reflejan el acumulado de todas las llamadas del mensaje.

3. **Costo estimado:** `cost_usd` en el finish chunk es la suma de `estimate_usage_cost()` (`agent/usage_pricing.py:745`) para cada llamada. La función consulta la tabla de precios de `agent/usage_pricing.py` y aplica los factores de caché.

---

## Flujo de datos

```
Provider API response
    └── response.usage
        └── normalize_usage()           # usage_pricing.py:672
            ├── input_tokens            → session_input_tokens
            ├── cache_read_tokens       → session_cache_read_tokens
            ├── cache_write_tokens      → session_cache_write_tokens
            ├── output_tokens           → session_completion_tokens
            └── reasoning_tokens        → session_reasoning_tokens
                └── _usage_envelope()   # api_server.py
                    └── SSE finish chunk
                        └── sse-parser.ts / omniworker.ts
                            └── useChatIPC (acumula por chat)
                                └── UsageBadge (muestra)
```

---

## Interpretación del badge del desktop

```
1.2k tokens  ·  ♻ 18k  ·  $0.0142
│               │           │
│               │           └── cost_usd estimado
│               └── cache_read_tokens (0.1× rate)
└── input_tokens_new + completion_tokens (1× rate)
```

El tooltip (hover) desglosa: `Sesión — Input nuevo: X · Output: Y · Caché leída: Z (0.1×) · Caché escrita: W (1.25×) · N llamadas`.
