# Skill: Systematic Debugging (Superpowers)

## Metadata

| Campo | Valor |
|-------|-------|
| **Nombre** | sp-systematic-debugging |
| **Versión** | 1.0.0 |
| **Categoría** | Debugging |
| **Requiere** | Ninguno |
| **Autor** | Adaptado de obra/superpowers |

## Activation

```yaml
when_to_use:
  - "Cualquier bug, test failure, o comportamiento inesperado"
  - "Antes de proponer fixes"
  - "Bajo presión de tiempo (emergencias)"
  - "Después de múltiples fixes fallidos"
```

## Descripción

Fixes aleatorios desperdician tiempo y crean nuevos bugs. Parches rápidos enmascaran issues subyacentes.

**Principio central:** SIEMPRE encuentra la causa raíz ANTES de intentar fixes. Fixes de síntomas son fallas.

## La Ley de Hierro

```
NO FIXES SIN INVESTIGACIÓN DE CAUSA RAÍZ PRIMERO
```

Si no has completado la Fase 1, no puedes proponer fixes.

## Cuándo Usar

Usa para CUALQUIER issue técnico:
- Test failures
- Bugs en producción
- Comportamiento inesperado
- Problemas de performance
- Build failures
- Issues de integración

**Usa esto ESPECIALMENTE cuando:**
- Bajo presión de tiempo (emergencias hacen tentador adivinar)
- "Solo un fix rápido" parece obvio
- Ya intentaste múltiples fixes
- Fix anterior no funcionó
- No entiendes completamente el issue

## Las Cuatro Fases

DEBES completar cada fase antes de proceder a la siguiente.

### Fase 1: Investigación de Causa Raíz

**ANTES de intentar CUALQUIER fix:**

1. **Leer Mensajes de Error Cuidadosamente**
   - No saltes errores o warnings
   - A menudo contienen la solución exacta
   - Lee stack traces completamente
   - Nota números de línea, paths de archivo, códigos de error

2. **Reproducir Consistentemente**
   - ¿Puedes activarlo confiablemente?
   - ¿Cuáles son los pasos exactos?
   - ¿Pasa cada vez?
   - Si no es reproducible → recolectar más datos, no adivinar

3. **Check Cambios Recientes**
   - ¿Qué cambió que podría causar esto?
   - Git diff, commits recientes
   - Nuevas dependencias, cambios de config
   - Diferencias ambientales

4. **Recolectar Evidencia en Sistemas Multi-Componente**

   **CUANDO el sistema tiene múltiples componentes (CI → build → signing, API → service → database):**

   **ANTES de proponer fixes, agregar instrumentación de diagnóstico:**
   ```
   Para CADA boundary de componente:
     - Log qué datos entran al componente
     - Log qué datos salen del componente
     - Verificar propagación de environment/config
     - Check estado en cada capa

   Ejecutar una vez para recolectar evidencia mostrando DÓNDE se rompe
   ENTONCES analizar evidencia para identificar componente fallando
   ENTONCES investigar ese componente específico
   ```

5. **Trace Data Flow**

   **CUANDO el error está profundo en el call stack:**

   - ¿De dónde se origina el valor malo?
   - ¿Qué llamó esto con valor malo?
   - Sigue trazando hacia arriba hasta encontrar la fuente
   - Fix en la fuente, no en el síntoma

### Fase 2: Análisis de Patrones

**Encuentra el patrón antes de fixear:**

1. **Encontrar Ejemplos Funcionales**
   - Localiza código similar funcionando en el mismo codebase
   - ¿Qué funciona que es similar a lo roto?

2. **Comparar Contra Referencias**
   - Si implementas un patrón, lee la implementación de referencia COMPLETAMENTE
   - No hagas skim — lee cada línea
   - Entiende el patrón completamente antes de aplicar

3. **Identificar Diferencias**
   - ¿Qué es diferente entre funcionando y roto?
   - Lista cada diferencia, por pequeña que sea
   - No asumas "eso no puede importar"

4. **Entender Dependencias**
   - ¿Qué otros componentes necesita esto?
   - ¿Qué settings, config, environment?
   - ¿Qué asunciones hace?

### Fase 3: Hipótesis y Testing

**Método científico:**

1. **Formar Una Hipótesis**
   - Enunciar claramente: "Creo que X es la causa raíz porque Y"
   - Escríbelo
   - Ser específico, no vago

2. **Testear Mínimamente**
   - Haz el cambio MÁS PEQUEÑO posible para testear la hipótesis
   - Una variable a la vez
   - No fixes múltiples cosas a la vez

3. **Verificar Antes de Continuar**
   - ¿Funcionó? Sí → Fase 4
   - ¿No funcionó? Formar NUEVA hipótesis
   - NO agregar más fixes encima

4. **Cuando No Sabes**
   - Di "No entiendo X"
   - No finjas saber
   - Pide ayuda
   - Investiga más

### Fase 4: Implementación

**Fix la causa raíz, no el síntoma:**

1. **Crear Caso de Test Fallando**
   - Reproducción más simple posible
   - Test automatizado si es posible
   - Script de test one-off si no hay framework
   - DEBE tener antes de fixear
   - Usar skill `sp-tdd` para escribir tests fallando apropiados

2. **Implementar Un Solo Fix**
   - Address la causa raíz identificada
   - UN cambio a la vez
   - No "mientras estoy aquí" mejoras
   - No refactoring bundled

3. **Verificar Fix**
   - ¿El test pasa ahora?
   - ¿No otros tests rotos?
   - ¿El issue realmente resuelto?

4. **Si el Fix No Funciona**
   - DETENTE
   - Cuenta: ¿Cuántos fixes has intentado?
   - Si < 3: Volver a Fase 1, re-analizar con nueva información
   - **Si ≥ 3: DETENTE y cuestiona la arquitectura**
   - NO intentar Fix #4 sin discusión arquitectónica

5. **Si 3+ Fixes Fallaron: Cuestiona Arquitectura**

   **Patrón indicando problema arquitectónico:**
   - Cada fix revela nuevo estado compartido/acoplamiento/problema en lugar diferente
   - Fixes requieren "refactoring masivo" para implementar
   - Cada fix crea nuevos síntomas en otros lugares

   **DETENTE y cuestiona fundamentos:**
   - ¿Este patrón es fundamentalmente sólido?
   - ¿Lo mantenemos por pura inercia?
   - ¿Deberíamos refactorizar arquitectura vs. continuar fixeando síntomas?

   **Discutir con tu socio humano antes de intentar más fixes**

## Red Flags - DETENTE y Sigue el Proceso

Si te atrapas pensando:
- "Fix rápido por ahora, investigar después"
- "Solo intenta cambiar X y ver si funciona"
- "Agregar múltiples cambios, ejecutar tests"
- "Saltar el test, lo verificaré manualmente"
- "Probablemente es X, déjame fixear eso"
- "No entiendo completamente pero esto podría funcionar"
- "El patrón dice X pero adaptaré el patrón diferente"
- "Aquí están los problemas principales: [lista fixes sin investigación]"
- Proponiendo soluciones antes de trazar data flow
- **"Un intento más de fix" (cuando ya intentaste 2+)**
- **Cada fix revela nuevo problema en lugar diferente**

**TODO esto significa: DETENTE. Volver a Fase 1.**

**Si 3+ fixes fallaron:** Cuestiona la arquitectura.

## Referencia Rápida

| Fase | Actividades Clave | Criterio de Éxito |
|------|-------------------|-------------------|
| **1. Causa Raíz** | Leer errores, reproducir, check cambios, recolectar evidencia | Entender QUÉ y POR QUÉ |
| **2. Patrón** | Encontrar ejemplos funcionales, comparar | Identificar diferencias |
| **3. Hipótesis** | Formar teoría, testear mínimamente | Confirmada o nueva hipótesis |
| **4. Implementación** | Crear test, fix, verificar | Bug resuelto, tests pasan |

## Cuando el Proceso Revela "Sin Causa Raíz"

Si la investigación sistemática revela que el issue es verdaderamente ambiental, dependiente de timing, o externo:

1. Has completado el proceso
2. Documenta lo que investigaste
3. Implementa manejo apropiado (retry, timeout, mensaje de error)
4. Agrega monitoreo/logging para investigación futura

**Pero:** 95% de casos "sin causa raíz" son investigación incompleta.

## Impacto Real

De sesiones de debugging:
- Enfoque sistemático: 15-30 minutos para fixear
- Enfoque de fixes aleatorios: 2-3 horas de thrashing
- Tasa de fix primera vez: 95% vs 40%
- Nuevos bugs introducidos: Casi cero vs común
