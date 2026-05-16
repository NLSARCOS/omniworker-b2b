# Skill: Test-Driven Development (Superpowers)

## Metadata

| Campo | Valor |
|-------|-------|
| **Nombre** | sp-tdd |
| **Versión** | 1.0.0 |
| **Categoría** | Development |
| **Requiere** | Ninguno |
| **Autor** | Adaptado de obra/superpowers |

## Activation

```yaml
when_to_use:
  - "Siempre: nuevas features, bug fixes, refactoring"
  - "Antes de escribir código de implementación"
  - "Cambios de comportamiento"
```

## Descripción

Escribe el test primero. Míralo fallar. Escribe el código mínimo para pasar.

**Principio central:** Si no viste el test fallar, no sabes si testea lo correcto.

## La Ley de Hierro

```
NO CÓDIGO DE PRODUCCIÓN SIN UN TEST FALLANDO PRIMERO
```

¿Escribiste código antes del test? Bórralo. Empieza de nuevo.

**Sin excepciones:**
- No lo guardes como "referencia"
- No lo "adaptes" mientras escribes tests
- No lo mires
- Borrar significa borrar

Implementa fresco desde los tests. Punto.

## Ciclo RED-GREEN-REFACTOR

### RED - Escribir Test Fallando

Escribe un test mínimo mostrando qué debería pasar.

**Bueno:**
```typescript
test('retries failed operations 3 times', async () => {
  let attempts = 0;
  const operation = () => {
    attempts++;
    if (attempts < 3) throw new Error('fail');
    return 'success';
  };

  const result = await retryOperation(operation);

  expect(result).toBe('success');
  expect(attempts).toBe(3);
});
```
Nombre claro, testea comportamiento real, una cosa.

**Malo:**
```typescript
test('retry works', async () => {
  const mock = jest.fn()
    .mockRejectedValueOnce(new Error())
    .mockRejectedValueOnce(new Error())
    .mockResolvedValueOnce('success');
  await retryOperation(mock);
  expect(mock).toHaveBeenCalledTimes(3);
});
```
Nombre vago, testea el mock no el código.

**Requisitos:**
- Un comportamiento
- Nombre claro
- Código real (no mocks a menos que sea unavoidable)

### Verify RED - Míralo Fallar

**OBLIGATORIO. Nunca saltes.**

```bash
npm test path/to/test.test.ts
```

Confirma:
- Test falla (no errores)
- Mensaje de falla es el esperado
- Falla porque falta feature (no typos)

**¿El test pasa?** Estás testeando comportamiento existente. Arregla el test.

**¿El test da error?** Arregla el error, re-ejecuta hasta que falle correctamente.

### GREEN - Código Mínimo

Escribe el código más simple para pasar el test.

**Bueno:**
```typescript
async function retryOperation<T>(fn: () => Promise<T>): Promise<T> {
  for (let i = 0; i < 3; i++) {
    try {
      return await fn();
    } catch (e) {
      if (i === 2) throw e;
    }
  }
  throw new Error('unreachable');
}
```
Justo lo necesario para pasar.

**Malo:**
```typescript
async function retryOperation<T>(
  fn: () => Promise<T>,
  options?: {
    maxRetries?: number;
    backoff?: 'linear' | 'exponential';
    onRetry?: (attempt: number) => void;
  }
): Promise<T> {
  // YAGNI
}
```
Sobre-ingeniería.

No agregues features, refactorices otro código, o "mejores" más allá del test.

### Verify GREEN - Míralo Pasar

**OBLIGATORIO.**

```bash
npm test path/to/test.test.ts
```

Confirma:
- Test pasa
- Otros tests siguen pasando
- Output limpio (sin errores, warnings)

**¿El test falla?** Arregla el código, no el test.

**¿Otros tests fallan?** Arregla ahora.

### REFACTOR - Limpieza

Después de green:
- Remover duplicación
- Mejorar nombres
- Extraer helpers

Mantén tests green. No agregues comportamiento.

### Repetir

Siguiente test fallando para la siguiente feature.

## Buenos Tests

| Calidad | Bueno | Malo |
|---------|-------|------|
| **Mínimo** | Una cosa. ¿"and" en el nombre? Divídelo. | `test('validates email and domain and whitespace')` |
| **Claro** | Nombre describe comportamiento | `test('test1')` |
| **Muestra intención** | Demuestra API deseada | Oscurece lo que el código debería hacer |

## Por Qué El Orden Importa

**"Escribiré tests después para verificar que funciona"**

Tests escritos después del código pasan inmediatamente. Pasar inmediatamente no prueba nada:
- Podría testear lo incorrecto
- Podría testear implementación, no comportamiento
- Podría omitir edge cases que olvidaste
- Nunca lo viste atrapar el bug

Test-first te fuerza a ver el test fallar, probando que realmente testea algo.

## Racionalizaciones Comunes

| Excusa | Realidad |
|--------|----------|
| "Demasiado simple para testear" | Código simple se rompe. Test toma 30 segundos. |
| "Testearé después" | Tests pasando inmediatamente no prueban nada. |
| "Tests después logran los mismos objetivos" | Tests después = "¿qué hace esto?" Tests-first = "¿qué debería hacer esto?" |
| "Ya lo probé manualmente" | Ad-hoc ≠ sistemático. No hay registro, no se puede re-ejecutar. |
| "Borrar X horas de trabajo es desperdiciar" | Falacia del costo hundido. El tiempo ya se fue. |

## Red Flags - DETENTE y Empieza de Nuevo

- Código antes del test
- Test después de implementación
- Test pasa inmediatamente
- No puedes explicar por qué el test falló
- Tests agregados "después"
- Racionalizando "solo esta vez"
- "Ya lo probé manualmente"
- "Tests después logran el mismo propósito"
- "Se trata del espíritu no del ritual"
- "Guardar como referencia" o "adaptar código existente"
- "Ya gasté X horas, borrar es desperdiciar"

**Todo esto significa: Borra el código. Empieza de nuevo con TDD.**

## Ejemplo: Bug Fix

**Bug:** Email vacío es aceptado

**RED**
```typescript
test('rejects empty email', async () => {
  const result = await submitForm({ email: '' });
  expect(result.error).toBe('Email required');
});
```

**Verify RED**
```bash
$ npm test
FAIL: expected 'Email required', got undefined
```

**GREEN**
```typescript
function submitForm(data: FormData) {
  if (!data.email?.trim()) {
    return { error: 'Email required' };
  }
  // ...
}
```

**Verify GREEN**
```bash
$ npm test
PASS
```

**REFACTOR**
Extraer validación para múltiples campos si es necesario.

## Checklist de Verificación

Antes de marcar el trabajo como completo:

- [ ] Cada función/método nuevo tiene un test
- [ ] Viste cada test fallar antes de implementar
- [ ] Cada test falló por la razón esperada (feature faltante, no typo)
- [ ] Escribiste código mínimo para pasar cada test
- [ ] Todos los tests pasan
- [ ] Output limpio (sin errores, warnings)
- [ ] Tests usan código real (mocks solo si unavoidable)
- [ ] Edge cases y errores cubiertos

¿No puedes marcar todas las casillas? Saltaste TDD. Empieza de nuevo.

## Cuando Estás Atascado

| Problema | Solución |
|----------|----------|
| No sabes cómo testear | Escribe la API deseada. Escribe la aserción primero. Pregunta a tu socio humano. |
| Test demasiado complicado | Diseño demasiado complicado. Simplifica la interfaz. |
| Debes mockear todo | Código demasiado acoplado. Usa inyección de dependencias. |
| Setup de test enorme | Extraer helpers. Aún complejo? Simplifica diseño. |

## Integración de Debugging

¿Bug encontrado? Escribe test fallido reproduciéndolo. Sigue el ciclo TDD. El test prueba el fix y previene regresión.

Nunca fixes bugs sin un test.

## Regla Final

```
Código de producción → test existe y falló primero
De lo contrario → no es TDD
```

Sin excepciones sin el permiso de tu socio humano.
