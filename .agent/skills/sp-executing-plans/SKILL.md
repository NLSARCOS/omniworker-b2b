# Skill: Executing Plans (Superpowers)

## Metadata

| Campo | Valor |
|-------|-------|
| **Nombre** | sp-executing-plans |
| **Versión** | 1.0.0 |
| **Categoría** | Development |
| **Requiere** | sp-writing-plans completado |
| **Autor** | Adaptado de obra/superpowers |

## Activation

```yaml
when_to_use:
  - "Tienes un plan de implementación escrito"
  - "Ejecutar en sesión separada"
  - "Con checkpoints de revisión"
  - "Cuando no hay subagentes disponibles"
```

## Descripción

Carga plan, revisa críticamente, ejecuta todas las tareas, reporta cuando complete.

**Anuncio inicial:** "Estoy usando el skill sp-executing-plans para implementar este plan."

## El Proceso

### Step 1: Cargar y Revisar Plan

1. Leer archivo de plan
2. Revisar críticamente — identificar cualquier pregunta o preocupación sobre el plan
3. Si hay preocupaciones: Plantearlas con tu socio humano antes de comenzar
4. Si no hay preocupaciones: Crear TodoWrite y proceder

### Step 2: Ejecutar Tareas

Por cada tarea:
1. Marcar como in_progress
2. Seguir cada paso exactamente (el plan tiene pasos bite-sized)
3. Ejecutar verificaciones como se especifica
4. Marcar como completed

### Step 3: Completar Desarrollo

Después de que todas las tareas completen y se verifiquen:
- Anunciar: "Estoy usando el skill sp-finish-branch para completar este trabajo."
- **SKILL REQUERIDO:** Usar sp-finish-branch
- Seguir ese skill para verificar tests, presentar opciones, ejecutar elección

## Cuándo Detenerse y Pedir Ayuda

**DETENTE de ejecutar inmediatamente cuando:**
- Golpeas un blocker (dependencia faltante, test falla, instrucción no clara)
- El plan tiene gaps críticos previniendo comenzar
- No entiendes una instrucción
- Verificación falla repetidamente

**Pide clarificación en lugar de adivinar.**

## Cuándo Revisitar Pasos Anteriores

**Volver a Revisión (Step 1) cuando:**
- El socio actualiza el plan basado en tu feedback
- El enfoque fundamental necesita reconsiderarse

**No forces a través de blockers** — detente y pregunta.

## Recordar

- Revisar plan críticamente primero
- Seguir pasos del plan exactamente
- No saltar verificaciones
- Referenciar skills cuando el plan dice que lo hagas
- Detenerte cuando bloqueado, no adivinar
- Nunca comenzar implementación en main/master branch sin consentimiento explícito del usuario

## Integración

**Skills de workflow requeridos:**
- **sp-git-worktrees** - REQUERIDO: Set up workspace aislado antes de comenzar
- **sp-writing-plans** - Crea el plan que este skill ejecuta
- **sp-finish-branch** - Completar desarrollo después de todas las tareas
