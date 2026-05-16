# Skill: Writing Plans (Superpowers)

## Metadata

| Campo | Valor |
|-------|-------|
| **Nombre** | sp-writing-plans |
| **Versión** | 1.0.0 |
| **Categoría** | Planning |
| **Requiere** | sp-brainstorming completado |
| **Autor** | Adaptado de obra/superpowers |

## Activation

```yaml
when_to_use:
  - "Tienes un spec o requisitos para una tarea multi-paso"
  - "Antes de tocar código"
  - "Después de completar sp-brainstorming"
```

## Descripción

Escribe planes de implementación comprehensivos asumiendo que el ingeniero tiene cero contexto del codebase y gusto cuestionable. Documenta todo lo que necesitan saber: qué archivos tocar, código, testing, docs, cómo probarlo.

## Anuncio Inicial

> "Estoy usando el skill sp-writing-plans para crear el plan de implementación."

## Ubicación del Plan

**Guardar planes en:** `docs/superpowers/plans/YYYY-MM-DD-<feature-name>.md`

## Check de Alcance

Si el spec cubre múltiples subsistemas independientes, debería haberse dividido en specs de sub-proyectos durante el brainstorming. Si no fue así, sugerir dividir esto en planes separados — uno por subsistema. Cada plan debería producir software funcional y testeable por sí mismo.

## Estructura de Archivos

Antes de definir tareas, mapear qué archivos serán creados o modificados y qué responsabilidad tiene cada uno:

- Diseñar unidades con límites claros e interfaces bien definidas
- Cada archivo debería tener una responsabilidad clara
- Archivos que cambian juntos deberían vivir juntos
- Dividir por responsabilidad, no por capa técnica
- En codebases existentes, seguir patrones establecidos

## Granularidad de Tareas

**Cada paso es una acción (2-5 minutos):**
- "Escribir el test fallido" - paso
- "Ejecutarlo para verificar que falla" - paso
- "Implementar el código mínimo para hacer pasar el test" - paso
- "Ejecutar los tests y verificar que pasan" - paso
- "Commit" - paso

## Header del Documento de Plan

**CADA plan DEBE comenzar con este header:**

```markdown
# [Nombre del Feature] - Plan de Implementación

> **Para agentes:** SKILL REQUERIDO: Usar sp-subagent-dev (recomendado) o sp-executing-plans para implementar este plan tarea por tarea.

**Goal:** [Una oración describiendo qué se construye]

**Arquitectura:** [2-3 oraciones sobre el enfoque]

**Tech Stack:** [Tecnologías/librerías clave]

---
```

## Estructura de Tareas

```markdown
### Task N: [Nombre del Componente]

**Files:**
- Create: `exact/path/to/file.py`
- Modify: `exact/path/to/existing.py:123-145`
- Test: `tests/exact/path/to/test.py`

- [ ] **Step 1: Escribir el test fallido**

```python
def test_specific_behavior():
    result = function(input)
    assert result == expected
```

- [ ] **Step 2: Ejecutar test para verificar que falla**

Run: `pytest tests/path/test.py::test_name -v`
Expected: FAIL with "function not defined"

- [ ] **Step 3: Escribir implementación mínima**

```python
def function(input):
    return expected
```

- [ ] **Step 4: Ejecutar test para verificar que pasa**

Run: `pytest tests/path/test.py::test_name -v`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add tests/path/test.py src/path/file.py
git commit -m "feat: add specific feature"
```
```

## Prohibido: Placeholders

Cada paso debe contener el contenido actual que un ingeniero necesita. Estos son **fallas del plan** — nunca los escribas:
- "TBD", "TODO", "implementar después", "llenar detalles"
- "Agregar manejo de errores apropiado" / "agregar validación" / "manejar edge cases"
- "Escribir tests para lo anterior" (sin código de test actual)
- "Similar a Task N" (repetir el código — el ingeniero puede leer tareas fuera de orden)
- Pasos que describen qué hacer sin mostrar cómo (bloques de código requeridos para pasos de código)
- Referencias a tipos, funciones, o métodos no definidos en ninguna tarea

## Recordar

- Siempre paths exactos de archivos
- Código completo en cada paso — si un paso cambia código, mostrar el código
- Comandos exactos con output esperado
- DRY, YAGNI, TDD, commits frecuentes

## Auto-Revisión

Después de escribir el plan completo, revisar el spec con ojos frescos:

**1. Cobertura del spec:** Revisar cada sección/requisito del spec. ¿Puedes señalar una tarea que lo implemente? Listar cualquier gap.

**2. Scan de placeholders:** Buscar red flags — cualquiera de los patrones de la sección "Prohibido: Placeholders" arriba. Arreglarlos.

**3. Consistencia de tipos:** ¿Los tipos, firmas de métodos, y nombres de propiedades usados en tareas posteriores coinciden con lo definido en tareas anteriores?

Si encuentras issues, arreglarlos inline. No necesitas re-revisar — solo arreglar y continuar. Si encuentras un requisito del spec sin tarea, agregar la tarea.

## Entrega de Ejecución

Después de guardar el plan, ofrecer opción de ejecución:

> "Plan completo y guardado en `docs/superpowers/plans/<filename>.md`. Dos opciones de ejecución:
>
> **1. Subagent-Driven (recomendado)** - Despacho un subagent fresco por tarea, reviso entre tareas, iteración rápida
>
> **2. Inline Execution** - Ejecuto tareas en esta sesión usando sp-executing-plans, ejecución en batches con checkpoints
>
> ¿Cuál enfoque prefieres?"

**Si elige Subagent-Driven:**
- **SKILL REQUERIDO:** Usar sp-subagent-dev
- Subagent fresco por tarea + two-stage review

**Si elige Inline Execution:**
- **SKILL REQUERIDO:** Usar sp-executing-plans
- Ejecución en batches con checkpoints para revisión
