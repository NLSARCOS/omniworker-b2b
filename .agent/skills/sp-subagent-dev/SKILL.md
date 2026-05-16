# Skill: Subagent-Driven Development (Superpowers)

## Metadata

| Campo | Valor |
|-------|-------|
| **Nombre** | sp-subagent-dev |
| **Versión** | 1.0.0 |
| **Categoría** | Development |
| **Requiere** | sp-writing-plans completado |
| **Autor** | Adaptado de obra/superpowers |

## Activation

```yaml
when_to_use:
  - "Ejecutar planes de implementación con tareas independientes"
  - "En la sesión actual"
  - "Cuando hay subagentes disponibles"
```

## Descripción

Ejecuta planes despachando un subagent fresco por tarea, con two-stage review después de cada una: revisión de compliance con spec primero, luego revisión de calidad de código.

**Por qué subagents:** Delegas tareas a agentes especializados con contexto aislado. Al construir precisamente sus instrucciones y contexto, aseguras que se mantengan enfocados y tengan éxito en su tarea.

**Principio central:** Subagent fresco por tarea + two-stage review (spec luego calidad) = alta calidad, iteración rápida

## Cuándo Usar

**vs. Executing Plans (sesión paralela):**
- Misma sesión (no cambio de contexto)
- Subagent fresco por tarea (no polución de contexto)
- Two-stage review después de cada tarea: spec compliance primero, luego calidad de código
- Iteración más rápida (sin human-in-loop entre tareas)

## El Proceso

### Preparación

1. **Leer plan, extraer todas las tareas** con texto completo, notar contexto
2. **Crear TodoWrite** con todas las tareas

### Por Tarea

1. **Despachar subagent implementador**
   - Proporcionar texto completo de tarea + contexto
   - El implementador puede hacer preguntas
   - Responder preguntas, proveer contexto adicional si es necesario

2. **Implementador implementa, testea, commitea, auto-revisa**

3. **Despachar subagent reviewer de spec compliance**
   - Confirma que el código cumple con el spec
   - Si hay issues, implementador los arregla

4. **Despachar subagent reviewer de calidad de código**
   - Revisa calidad del código
   - Si hay issues, implementador los arregla

5. **Marcar tarea como completa** en TodoWrite

### Después de Todas las Tareas

1. **Despachar reviewer de código final** para toda la implementación
2. **Usar skill sp-finish-branch** para completar el desarrollo

## Manejo de Estados del Implementador

Los subagents implementadores reportan uno de cuatro estados:

**DONE:** Proceder a revisión de spec compliance.

**DONE_WITH_CONCERNS:** El implementador completó el trabajo pero marcó dudas. Leer las preocupaciones antes de proceder. Si son sobre correctitud o alcance, address antes de revisión. Si son observaciones (ej. "este archivo se está haciendo grande"), notarlas y proceder a revisión.

**NEEDS_CONTEXT:** El implementador necesita información que no fue proporcionada. Proveer el contexto faltante y re-despachar.

**BLOCKED:** El implementador no puede completar la tarea. Evaluar el blocker:
1. Si es un problema de contexto, proveer más contexto y re-despachar con el mismo modelo
2. Si la tarea requiere más razonamiento, re-despachar con un modelo más capaz
3. Si la tarea es muy grande, dividirla en piezas más pequeñas
4. Si el plan mismo está mal, escalar al humano

**Nunca** ignores una escalación o fuerces al mismo modelo a reintentar sin cambios.

## Ejemplo de Flujo de Trabajo

```
Tú: Estoy usando Subagent-Driven Development para ejecutar este plan.

[Leer archivo de plan: docs/superpowers/plans/feature-plan.md]
[Extraer todas las 5 tareas con texto completo y contexto]
[Crear TodoWrite con todas las tareas]

Task 1: Hook installation script

[Obtener texto de Task 1 y contexto (ya extraído)]
[Despachar subagent implementador con texto completo de tarea + contexto]

Implementador: "Antes de comenzar — ¿el hook debería instalarse a nivel de usuario o sistema?"

Tú: "Nivel de usuario (~/.config/superpowers/hooks/)"

Implementador: "Entendido. Implementando ahora..."
[Después] Implementador:
  - Comand install-hook implementado
  - Tests agregados, 5/5 pasando
  - Auto-revisión: Encontré que me faltó flag --force, lo agregué
  - Committed

[Despachar reviewer de spec compliance]
Reviewer de spec: ✅ Spec compliant - todos los requisitos cumplidos, nada extra

[Obtener git SHAs, despachar reviewer de calidad de código]
Reviewer de código: Strengths: Buena cobertura de tests, limpio. Issues: Ninguno. Aprobado.

[Marcar Task 1 completa]

Task 2: Recovery modes

... (repetir para cada tarea)

[Después de todas las tareas]
[Despachar code-reviewer final]
Reviewer final: Todos los requisitos cumplidos, listo para merge

¡Listo!
```

## Ventajas

**vs. Ejecución manual:**
- Subagents siguen TDD naturalmente
- Contexto fresco por tarea (sin confusión)
- Parallel-safe (subagents no interfieren)
- Subagent puede hacer preguntas (antes Y durante el trabajo)

**vs. Executing Plans:**
- Misma sesión (no handoff)
- Progreso continuo (sin esperar)
- Checkpoints de revisión automáticos

**Ganancias de eficiencia:**
- No overhead de lectura de archivos (controller provee texto completo)
- Controller cura exactamente qué contexto se necesita
- Subagent obtiene información completa upfront
- Preguntas surface antes de que comience el trabajo

**Quality gates:**
- Auto-revisión atrapa issues antes del handoff
- Two-stage review: spec compliance, luego calidad de código
- Review loops aseguran que los fixes realmente funcionan
- Spec compliance previene over/under-building
- Code quality asegura que la implementación está bien construida

## Red Flags

**Nunca:**
- Comenzar implementación en main/master branch sin consentimiento explícito del usuario
- Saltar reviews (spec compliance O calidad de código)
- Proceder con issues sin arreglar
- Despachar múltiples subagents implementadores en paralelo (conflictos)
- Hacer que subagent lea archivo de plan (proveer texto completo en su lugar)
- Saltar scene-setting context (subagent necesita entender dónde encaja la tarea)
- Ignorar preguntas de subagent (responder antes de dejarlos proceder)
- Aceptar "suficientemente cerca" en spec compliance (reviewer encontró issues = no está listo)
- Saltar review loops (reviewer encontró issues = implementador arregla = review again)
- Dejar que auto-revisión del implementador reemplace review actual (ambos son necesarios)
- **Comenzar code quality review antes de que spec compliance esté ✅** (orden equivocado)
- Moverse a la siguiente tarea mientras cualquier review tenga issues abiertos

**Si el subagent hace preguntas:**
- Responder clara y completamente
- Proveer contexto adicional si es necesario
- No apresurarlos a la implementación

**Si el reviewer encuentra issues:**
- El implementador (mismo subagent) los arregla
- El reviewer revisa de nuevo
- Repetir hasta aprobación
- No saltar el re-review

**Si el subagent falla la tarea:**
- Despachar subagent de fix con instrucciones específicas
- No intentar arreglar manualmente (polución de contexto)

## Integración

**Skills de workflow requeridos:**
- **sp-git-worktrees** - REQUERIDO: Set up workspace aislado antes de comenzar
- **sp-writing-plans** - Crea el plan que este skill ejecuta
- **sp-finish-branch** - Completar desarrollo después de todas las tareas

**Subagents deberían usar:**
- **sp-tdd** - Subagents siguen TDD para cada tarea

**Workflow alternativo:**
- **sp-executing-plans** - Usar para sesión paralela en lugar de ejecución en misma sesión
