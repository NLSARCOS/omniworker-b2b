# Skill: Code Review (Superpowers)

## Metadata

| Campo | Valor |
|-------|-------|
| **Nombre** | sp-code-review |
| **Versión** | 1.0.0 |
| **Categoría** | Quality |
| **Requiere** | Ninguno |
| **Autor** | Adaptado de obra/superpowers |

## Activation

```yaml
when_to_use:
  - "Completando tareas"
  - "Implementando features mayores"
  - "Antes de mergear"
  - "Para verificar que el trabajo cumple requisitos"
```

## Descripción

Solicita code review para atrapar issues antes de que se propaguen. El reviewer obtiene contexto precisamente crafteado para evaluación — nunca el historial de tu sesión.

**Principio central:** Review temprano, review frecuente.

## Cuándo Solicitar Review

**Obligatorio:**
- Después de cada tarea en subagent-driven development
- Después de completar feature mayor
- Antes de merge a main

**Opcional pero valioso:**
- Cuando estás atascado (perspectiva fresca)
- Antes de refactoring (baseline check)
- Después de fixear bug complejo

## Cómo Solicitar

### 1. Obtener git SHAs

```bash
BASE_SHA=$(git rev-parse HEAD~1)  # o origin/main
HEAD_SHA=$(git rev-parse HEAD)
```

### 2. Ejecutar Code Review

**Como subagent (si disponible):**
- Crear prompt con:
  - `{WHAT_WAS_IMPLEMENTED}` - Qué acabas de construir
  - `{PLAN_OR_REQUIREMENTS}` - Qué debería hacer
  - `{BASE_SHA}` - Commit inicial
  - `{HEAD_SHA}` - Commit final
  - `{DESCRIPTION}` - Resumen breve

**Inline (si no hay subagentes):**
- Revisar contra el plan/spec
- Verificar:
  - ¿Cumple con los requisitos?
  - ¿Tests presentes y pasando?
  - ¿Código limpio y mantenible?
  - ¿Sin código muerto o debug statements?

### 3. Actuar sobre el feedback

- Arreglar issues Críticos inmediatamente
- Arreglar issues Importantes antes de proceder
- Notar issues Menores para después
- Resistir si el reviewer está equivocado (con razonamiento)

## Ejemplo

```
[Justo completada Task 2: Agregar función de verificación]

Tú: Déjame solicitar code review antes de continuar.

BASE_SHA=$(git log --oneline | grep "Task 1" | head -1 | awk '{print $1}')
HEAD_SHA=$(git rev-parse HEAD)

[Ejecutar code review]
  WHAT_WAS_IMPLEMENTED: Funciones de verificación y reparación para índice de conversación
  PLAN_OR_REQUIREMENTS: Task 2 de docs/superpowers/plans/deployment-plan.md
  BASE_SHA: a7981ec
  HEAD_SHA: 3df7661
  DESCRIPTION: Agregados verifyIndex() y repairIndex() con 4 tipos de issues

[Resultado]:
  Strengths: Arquitectura limpia, tests reales
  Issues:
    Importante: Faltan indicadores de progreso
    Menor: Magic number (100) para intervalo de reporte
  Assessment: Listo para proceder

Tú: [Arreglar indicadores de progreso]
[Continuar a Task 3]
```

## Plantilla de Review

Cuando hagas code review (como reviewer):

```markdown
## Code Review

### What Was Reviewed
[Descripción breve del cambio]

### Strengths
- [Lista de cosas bien hechas]

### Issues
**Críticos:** (Bloquean merge)
- [Issues que deben arreglarse]

**Importantes:** (Deberían arreglarse antes de proceder)
- [Issues recomendados]

**Menores:** (Nice to have)
- [Observaciones]

### Assessment
- [ ] Aprobado — Listo para merge/proceder
- [ ] Aprobado con cambios menores — Arreglar menores, luego proceder
- [ ] Cambios requeridos — Arreglar críticos/importantes, re-review
```

## Integración con Workflows

**Subagent-Driven Development:**
- Review después de CADA tarea
- Atrapar issues antes de que se compongan
- Arreglar antes de moverse a la siguiente tarea

**Executing Plans:**
- Review después de cada batch (3 tareas)
- Obtener feedback, aplicar, continuar

**Ad-Hoc Development:**
- Review antes de merge
- Review cuando estás atascado

## Red Flags

**Nunca:**
- Saltar review porque "es simple"
- Ignorar issues Críticos
- Proceder con issues Importantes sin arreglar
- Discutir con feedback técnico válido

**Si el reviewer está equivocado:**
- Resistir con razonamiento técnico
- Mostrar código/tests que prueban que funciona
- Solicitar clarificación
