# Skill: Brainstorming (Superpowers)

## Metadata

| Campo | Valor |
|-------|-------|
| **Nombre** | sp-brainstorming |
| **Versión** | 1.0.0 |
| **Categoría** | Planning |
| **Requiere** | Ninguno |
| **Autor** | Adaptado de obra/superpowers |

## Activation

```yaml
when_to_use:
  - "Antes de cualquier trabajo creativo"
  - "Crear features o funcionalidades nuevas"
  - "Construir componentes"
  - "Agregar funcionalidad"
  - "Modificar comportamiento"
  - "Diseño de arquitectura"
```

## Descripción

Transforma ideas en diseños completos y especificaciones a través de diálogo colaborativo. Este skill explora la intención del usuario, requisitos y diseño ANTES de cualquier implementación.

## HARD GATE

⛔ **NO invoques ningún skill de implementación, escribas código, o tomes acción de implementación hasta haber presentado un diseño y el usuario lo haya aprobado.** Esto aplica a TODO proyecto sin importar su simplicidad percibida.

## Checklist de Proceso

Debes completar cada paso en orden:

1. **Explorar contexto del proyecto** — revisar archivos, docs, commits recientes
2. **Hacer preguntas de clarificación** — una a la vez, entender propósito/restricciones/criterios de éxito
3. **Proponer 2-3 enfoques** — con trade-offs y tu recomendación
4. **Presentar diseño** — en secciones escaladas a su complejidad, obtener aprobación del usuario después de cada sección
5. **Escribir documento de diseño** — guardar en `docs/superpowers/specs/YYYY-MM-DD-<tema>-design.md`
6. **Auto-revisión del spec** — verificación rápida de placeholders, contradicciones, ambigüedades
7. **Usuario revisa spec escrito** — pedir al usuario que revise el archivo spec antes de continuar
8. **Transición a implementación** — invocar skill sp-writing-plans para crear plan de implementación

## Proceso Detallado

### 1. Explorar Contexto del Proyecto

- Revisar el estado actual del proyecto (archivos, docs, commits recientes)
- Antes de preguntar detalles, evaluar alcance: si la solicitud describe múltiples subsistemas independientes, señalar esto inmediatamente
- Si el proyecto es muy grande para un solo spec, ayudar al usuario a descomponerlo en sub-proyectos

### 2. Preguntas de Clarificación

- Preguntar UNA A LA VEZ para refinar la idea
- Preferir preguntas de opción múltiple cuando sea posible
- Enfocarse en entender: propósito, restricciones, criterios de éxito

### 3. Explorar Enfoques

- Proponer 2-3 enfoques diferentes con trade-offs
- Presentar opciones conversacionalmente con tu recomendación y razonamiento
- Liderar con tu opción recomendada y explicar por qué

### 4. Presentar el Diseño

- Una vez que entiendas lo que se está construyendo, presentar el diseño
- Escalar cada sección a su complejidad: pocas frases si es directo, hasta 200-300 palabras si es complejo
- Preguntar después de cada sección si se ve bien hasta ahora
- Cubrir: arquitectura, componentes, flujo de datos, manejo de errores, testing

### 5. Diseño para Aislamiento y Claridad

- Dividir el sistema en unidades más pequeñas con un propósito claro
- Cada unidad debe comunicarse a través de interfaces bien definidas
- Debes poder responder: ¿qué hace?, ¿cómo se usa?, ¿qué dependencias tiene?

### 6. Trabajar en Codebases Existentes

- Explorar la estructura actual antes de proponer cambios
- Seguir patrones existentes
- Incluir mejoras específicas como parte del diseño cuando sea necesario
- NO proponer refactoring no relacionado

## Después del Diseño

### Documentación

- Escribir el diseño validado en: `docs/superpowers/specs/YYYY-MM-DD-<tema>-design.md`
- Hacer commit del documento de diseño

### Auto-Revisión del Spec

1. **Placeholder scan:** ¿Algún "TBD", "TODO", secciones incompletas, o requisitos vagos? Arreglarlos.
2. **Consistencia interna:** ¿Alguna sección se contradice con otra?
3. **Check de alcance:** ¿Está lo suficientemente enfocado para un solo plan de implementación?
4. **Check de ambigüedad:** ¿Algún requisito podría interpretarse de dos maneras diferentes?

### Puerta de Revisión del Usuario

Después de pasar la auto-revisión, pedir al usuario que revise el spec:

> "Spec escrito y guardado en `<path>`. Por favor revísalo y avísame si quieres hacer cambios antes de que comencemos a escribir el plan de implementación."

Esperar la respuesta del usuario. Si solicita cambios, hacerlos y re-ejecutar la auto-revisión.

### Implementación

- Invocar el skill `sp-writing-plans` para crear el plan detallado
- NO invocar ningún otro skill — sp-writing-plans es el siguiente paso

## Principios Clave

- **Una pregunta a la vez** — No abrumar con múltiples preguntas
- **Opción múltiple preferida** — Más fácil de responder que abierta cuando sea posible
- **YAGNI sin piedad** — Remover features innecesarias de todos los diseños
- **Explorar alternativas** — Siempre proponer 2-3 enfoques antes de decidir
- **Validación incremental** — Presentar diseño, obtener aprobación antes de continuar
- **Ser flexible** — Volver y aclarar cuando algo no tenga sentido

## Output Esperado

- Documento de diseño en `docs/superpowers/specs/`
- Auto-revisión completada
- Aprobación del usuario obtenida
- Transición a `sp-writing-plans`
