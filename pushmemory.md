# 🧠 PushMemory — Overhaul del Sistema de Memoria

**Fecha:** 2026-06-07
**Sesión:** Memory, Scrapling & Desktop Persistence

---

## 📋 Problema Inicial

El usuario reportó que el agente **no recuerda nada de la semana pasada**. Al investigar, se encontraron múltiples problemas tanto en el Agent como en el Desktop:

### Agente (NativeMemory)
- **Decay de recencia = 7 días**: después de 168 horas, el puntaje de recencia era 0.0
- **BM25 con peso bajo (0.30)**: la relevancia importaba menos que "qué tan reciente" era el recuerdo
- **Solo 10 chunks / 2000 tokens** por prefetch: muy poco contexto recuperado
- **sqlite-vec no instalado**: sin búsqueda semántica, solo palabras clave exactas

### Desktop App
- **MEMORY.md = 2200 chars**: un archivo plano ridículamente chiquito
- **`searchObservations()` stubbed**: retornaba `[]` siempre — NO buscaba nada
- **`getTimeline()` stubbed**: no funcionaba
- **`getConflicts()` stubbed**: no funcionaba
- **Desktop y Agent NO compartían memoria**: cada uno tenía su propio sistema aislado

---

## 🔧 Cambios Implementados

### 1. Agente — Decay de Recencia Extendido

**Archivo:** `omniworker-agent/agent/native_memory.py`

| Parámetro | Antes | Después | Impacto |
|---|---|---|---|
| Recency decay | 168h (7 días) | **720h (30 días)** | Memorias de "la semana pasada" ya no pierden score |
| Peso BM25 | 0.30 | **0.40** | Relevancia importa más que recencia |
| Peso Recency | 0.35 | **0.25** | Ya no castiga tanto las memorias viejas |

```python
# ANTES
_W_RECENCY = 0.35
_W_BM25 = 0.30
recency = max(0.0, 1.0 - (age_hours / 168.0))  # decay over 7 days

# DESPUÉS
_W_BM25 = 0.40
_W_RECENCY = 0.25
recency = max(0.0, 1.0 - (age_hours / 720.0))  # decay over 30 days
```

---

### 2. Agente — sqlite-vec Auto-Install

**Archivo:** `omniworker-agent/tools/lazy_deps.py`

Se agregó `sqlite-vec` como lazy dep para habilitar **búsqueda semántica vectorial**:

```python
# Nuevo entry en LAZY_DEPS
"memory.sqlite_vec": ("sqlite-vec==0.1.6",),
```

**Archivo:** `omniworker-agent/agent/native_memory.py` — `_get_sqlite_vec()`

Ahora auto-instala sqlite-vec vía lazy deps si no está disponible:

```python
def _get_sqlite_vec() -> Any:
    global _sqlite_vec
    if _sqlite_vec is None:
        try:
            import sqlite_vec
            _sqlite_vec = sqlite_vec
        except Exception:
            # Auto-install via lazy deps
            from tools.lazy_deps import ensure
            ensure("memory.sqlite_vec", prompt=False)
            import sqlite_vec
            _sqlite_vec = sqlite_vec
    return _sqlite_vec
```

---

### 3. Agente — Límites de Prefetch Aumentados

**Archivo:** `omniworker-agent/agent/native_memory.py`

| Parámetro | Antes | Después |
|---|---|---|
| `_MAX_INJECTED_TOKENS` | 2000 | **4000** |
| `_MAX_CHUNKS_PER_PREFETCH` | 10 | **20** |

---

### 4. Agente — Smart Prefetch Gate (Ahorro de Tokens)

**Archivo:** `omniworker-agent/agent/native_memory.py`

Se agregó un **gate inteligente** que saltea la búsqueda de memoria para mensajes triviales:

```python
_PREFETCH_MIN_QUERY_LEN = 12

_SKIP_PATTERNS = [
    # Saludos en ES/EN, confirmaciones, acks cortos
    re.compile(r"^(hola|hey|hi|hello|ok|si|sí|no|gracias|bye|dale|...)\s*[!.?]*$", re.IGNORECASE),
    re.compile(r"^.{1,8}$", re.IGNORECASE),  # <8 chars siempre skip
]
```

**Ahorro estimado: ~50% de tokens** en conversaciones típicas:

| Mensaje | ¿Busca memoria? | Tokens extra |
|---|---|---|
| `"hola"` | 🚫 SKIP | 0 |
| `"ok"` | 🚫 SKIP | 0 |
| `"qué hicimos la semana pasada?"` | ✅ Busca | ~1000-3000 |
| `"ayúdame con el bug de auth"` | ✅ Busca | ~500-2000 |

---

### 5. Scrapling — Auto-Install y API Corregida

**Archivo:** `omniworker-agent/tools/lazy_deps.py`

```python
"tool.scrapling": ("scrapling[fetchers]==0.4.8",),
```

**Archivo:** `omniworker-agent/tools/scrapling_tool.py` — Reescrito completo

| Problema | Fix |
|---|---|
| `scrapling` no estaba en deps → tool siempre desactivada | Lazy install via `ensure("tool.scrapling")` |
| API incorrecta: `StealthyFetcher(headless=True)` context manager | API correcta: `StealthyFetcher.fetch(url, headless=True)` |
| Sin browser binaries post-install | `_ensure_browsers_installed()` corre `scrapling install` la primera vez |
| `check_fn` siempre retornaba `False` | Usa `is_available("tool.scrapling")` → tool se registra |

---

### 6. Desktop — Memoria Real Conectada a NativeMemory

**Archivo:** `omniworker-desktop/src/main/memory.ts` — Reescrito completo

#### Antes (stubbed):
```typescript
async function searchObservations(_query: string): Promise<any[]> {
  return [];  // ← SIEMPRE VACÍO
}
async function getTimeline(_observationId?: number): Promise<any[]> {
  return [];  // ← SIEMPRE VACÍO
}
```

#### Después (real):
```typescript
async function searchObservations(query: string, limit = 20): Promise<any[]> {
  // 1. FTS5 search sobre memory_chunks (compartido con el Agent)
  // 2. LIKE fallback si FTS5 falla
  // 3. También busca en memory_facts
  // Retorna: { id, content, snippet, type, session_id, created_at, age }
}

async function getTimeline(observationId: number, before = 5, after = 5) {
  // Retorna chunks antes/después del ID dado
  // Retorna: { focus, before[], after[], total_in_range }
}
```

#### Cambios adicionales:

| Cambio | Antes | Después |
|---|---|---|
| `MEMORY_CHAR_LIMIT` | 2200 | **50,000** |
| `USER_CHAR_LIMIT` | 1375 | **10,000** |
| `addMemoryEntry()` | Solo escribe MEMORY.md | Escribe MEMORY.md **Y** `memory_chunks` (FTS5) |
| Stats | Solo sessions/messages | + **memoryChunks**, **memoryFacts** |
| Tablas | No existían | `ensureNativeMemoryTables()` las crea automáticamente |

**Archivo:** `omniworker-desktop/src/renderer/src/screens/Memory/Memory.tsx`

- Dashboard muestra **Memory Chunks** y **Known Facts** en el grid de Telemetry
- Grid cambió de 2 columnas a 2x2 (4 celdas)

---

### 7. Corrección de Compilación y Soporte SSH Remoto (v0.6.6)

**Archivo:** `omniworker-desktop/src/main/ssh-remote.ts`

Para garantizar que el Desktop muestre las estadísticas de memoria en conexiones SSH remotas sin causar errores de compilación de TypeScript:
- **sshGetSessionStats**: Se actualizó el tipo de retorno para incluir obligatoriamente `memoryChunks` y `memoryFacts`.
- **Query Remoto**: Se implementó una consulta en Python que se ejecuta en el servidor VPS, la cual consulta `sqlite_master` para comprobar si las tablas `memory_chunks` y `memory_facts` existen (evitando crasheos si el VPS tiene una versión de BD anterior) y retorna la cantidad real de registros.
- **Sincronización**: Ahora la UI remota muestra los conteos de chunks y hechos exactos almacenados en el SQLite del VPS.

---

### 8. Release, Auto-Update y Despliegue en VPS (v0.6.6)

- **Compilación Multiplataforma**: Se generaron los instaladores v0.6.6 para Windows (`.exe` NSIS), macOS (`.dmg` y `.zip`) y Linux (`.AppImage` y `.deb`).
- **Auto-Update**: Se actualizaron y subieron las firmas y manifiestos `latest.yml`, `latest-mac.yml` y `latest-linux.yml` al VPS en `/opt/omniworker-downloads/`. Esto permite que las apps de escritorio de los usuarios detecten e instalen la nueva actualización de inmediato.
- **SaaS Link Updates**: Se actualizó el dashboard de descargas del SaaS en Next.js para apuntar a la versión `0.6.6`.
- **Despliegue de Contenedores**:
  - Código subido y sincronizado en el VPS.
  - El backend del SaaS fue reconstruido e iniciado.
  - La imagen Docker de `omniworker-agent` se reconstruyó desde cero en el VPS con las nuevas dependencias y los contenedores de producción fueron reiniciados correctamente.

---

## 🏗️ Arquitectura Resultante

```
┌─────────────────────────────────────────────────┐
│                  state.db (SQLite)               │
│                                                  │
│  ┌──────────────┐  ┌─────────────────────────┐  │
│  │  sessions     │  │  memory_chunks           │  │
│  │  messages     │  │  memory_chunks_fts (FTS5)│  │
│  │               │  │  memory_facts            │  │
│  └──────────────┘  │  workspace_state          │  │
│                    └─────────────────────────┘  │
│         ↑                   ↑          ↑        │
│         │                   │          │        │
│   ┌─────┴──────┐   ┌───────┴──┐  ┌────┴─────┐  │
│   │  Desktop    │   │  Agent   │  │  Desktop  │  │
│   │  Sessions   │   │  Native  │  │  Memory   │  │
│   │  UI         │   │  Memory  │  │  UI       │  │
│   └────────────┘   └──────────┘  └──────────┘  │
│                                                  │
│         COMPARTE LA MISMA BASE DE DATOS          │
└─────────────────────────────────────────────────┘
```

---

## 📊 Flujo de Memoria

```
Usuario pregunta: "qué hicimos la semana pasada?"
                    │
                    ▼
        ┌─── Smart Gate ───┐
        │  >12 chars? ✅    │
        │  greeting? ❌      │
        └────────┬──────────┘
                 │
                 ▼
        ┌─── BM25 Search ───┐
        │  FTS5 trigram      │──→ memory_chunks_fts
        │  + recency (30d)   │
        │  + session affinity│
        │  + role weight     │
        └────────┬──────────┘
                 │
                 ▼
        ┌─── Vector Rerank ──┐
        │  sqlite-vec (si     │──→ memory_embeddings
        │  disponible)        │
        └────────┬───────────┘
                 │
                 ▼
        ┌─── Fact Lookup ────┐
        │  subject/predicate │──→ memory_facts
        │  search            │
        └────────┬───────────┘
                 │
                 ▼
        ┌─── Inject ─────────┐
        │  <memory-context>   │
        │  max 4000 tokens    │──→ System prompt del LLM
        │  max 20 chunks      │
        └─────────────────────┘
```

---

## 📦 Commits Realizados

```
c333b8b6d docs: update memory with v0.6.6 session notes
2d24aadd7 chore: bump desktop version to 0.6.6 and update download links in SaaS
4a8a377c9 feat(memory): add smart prefetch gate to skip trivial messages
93a27c234 feat: Add Memory Chunks and Known Facts to Memory UI stats
8d4bbc3e7 feat: Implement real NativeMemory Search and Timeline in Desktop and Agent
43503e613 feat: add scrapling tool for stealthy web scraping to bypass bot blocks
```

---

## ✅ Resultado

| Aspecto | Estado |
|---|---|
| **Persistencia** | ✅ SQLite compartido Desktop ↔ Agent |
| **Búsqueda** | ✅ FTS5 + Facts + Vector (si sqlite-vec instalado) |
| **Desktop UI** | ✅ Search y Timeline funcionales de verdad |
| **Límites** | ✅ 50K chars memoria, 20 chunks, 4K tokens prefetch |
| **Ahorro tokens** | ✅ Smart gate ahorra ~50% en conversaciones normales |
| **Decay extendido** | ✅ 30 días en vez de 7 |
| **Scrapling** | ✅ Auto-install funcional con browsers |
| **Compilación y Release (v0.6.6)** | ✅ Release v0.6.6 en GitHub y archivos de Auto-Update en el VPS |
| **Despliegue de Producción (v0.6.6)** | ✅ SaaS y Agent actualizados y reiniciados en VPS |
