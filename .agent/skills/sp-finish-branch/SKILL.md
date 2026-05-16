# Skill: Finish Development Branch (Superpowers)

## Metadata

| Campo | Valor |
|-------|-------|
| **Nombre** | sp-finish-branch |
| **Versión** | 1.0.0 |
| **Categoría** | Workflow |
| **Requiere** | Implementación completa, todos los tests pasan |
| **Autor** | Adaptado de obra/superpowers |

## Activation

```yaml
when_to_use:
  - "Implementación completa"
  - "Todos los tests pasan"
  - "Necesitas decidir cómo integrar el trabajo"
  - "Merge, PR, o cleanup"
```

## Descripción

Guía la finalización del trabajo de desarrollo presentando opciones claras y manejando el workflow elegido.

**Principio central:** Verificar tests → Presentar opciones → Ejecutar elección → Limpiar.

**Anuncio inicial:** "Estoy usando el skill sp-finish-branch para completar este trabajo."

## El Proceso

### Step 1: Verificar Tests

**Antes de presentar opciones, verificar que los tests pasan:**

```bash
# Ejecutar test suite del proyecto
npm test / cargo test / pytest / go test ./...
```

**Si tests fallan:**
> "Tests fallando (<N> fallas). Deben arreglarse antes de completar:
>
> [Mostrar fallas]
>
> No se puede proceder con merge/PR hasta que los tests pasen."

Detente. No procedas a Step 2.

**Si tests pasan:** Continuar a Step 2.

### Step 2: Determinar Base Branch

```bash
# Intentar branches base comunes
git merge-base HEAD main 2>/dev/null || git merge-base HEAD master 2>/dev/null
```

O preguntar: "Este branch se separó de main — ¿es eso correcto?"

### Step 3: Presentar Opciones

Presentar exactamente estas 4 opciones:

> "Implementación completa. ¿Qué te gustaría hacer?
>
> 1. Merge back a <base-branch> localmente
> 2. Push y crear un Pull Request
> 3. Mantener el branch as-is (lo manejaré después)
> 4. Descartar este trabajo
>
> ¿Cuál opción?"

**No agregar explicación** — mantener opciones concisas.

### Step 4: Ejecutar Elección

#### Opción 1: Merge Localmente

```bash
# Switch a base branch
git checkout <base-branch>

# Pull latest
git pull

# Merge feature branch
git merge <feature-branch>

# Verificar tests en resultado mergeado
<test command>

# Si tests pasan
git branch -d <feature-branch>
```

Luego: Limpiar worktree (Step 5)

#### Opción 2: Push y Crear PR

```bash
# Push branch
git push -u origin <feature-branch>

# Crear PR (si gh está disponible)
gh pr create --title "<title>" --body "$(cat <<'EOF'
## Summary
<2-3 bullets de qué cambió>

## Test Plan
- [ ] <verification steps>
EOF
)"
```

Luego: Limpiar worktree (Step 5)

#### Opción 3: Mantener As-Is

Reportar: "Manteniendo branch <name>. Worktree preservado en <path>."

**No limpiar worktree.**

#### Opción 4: Descartar

**Confirmar primero:**
> "Esto eliminará permanentemente:
> - Branch <name>
> - Todos los commits: <commit-list>
> - Worktree en <path>
>
> Escribe 'discard' para confirmar."

Esperar confirmación exacta.

Si confirmado:
```bash
git checkout <base-branch>
git branch -D <feature-branch>
```

Luego: Limpiar worktree (Step 5)

### Step 5: Limpiar Worktree

**Para Opciones 1, 2, 4:**

Check si estás en worktree:
```bash
git worktree list | grep $(git branch --show-current)
```

Si sí:
```bash
git worktree remove <worktree-path>
```

**Para Opción 3:** Mantener worktree.

## Referencia Rápida

| Opción | Merge | Push | Mantener Worktree | Limpiar Branch |
|--------|-------|------|-------------------|----------------|
| 1. Merge localmente | ✓ | - | - | ✓ |
| 2. Crear PR | - | ✓ | ✓ | - |
| 3. Mantener as-is | - | - | ✓ | - |
| 4. Descartar | - | - | - | ✓ (force) |

## Errores Comunes

**Saltar verificación de tests**
- **Problema:** Merge código roto, crear PR fallando
- **Fix:** Siempre verificar tests antes de ofrecer opciones

**Preguntas abiertas**
- **Problema:** "¿Qué debería hacer después?" → ambiguo
- **Fix:** Presentar exactamente 4 opciones estructuradas

**Limpieza automática de worktree**
- **Problema:** Remover worktree cuando podría necesitarse (Opción 2, 3)
- **Fix:** Solo limpiar para Opciones 1 y 4

**Sin confirmación para descartar**
- **Problema:** Accidentalmente borrar trabajo
- **Fix:** Requerir "discard" tipado como confirmación

## Red Flags

**Nunca:**
- Proceder con tests fallando
- Merge sin verificar tests en el resultado
- Borrar trabajo sin confirmación
- Force-push sin request explícito

**Siempre:**
- Verificar tests antes de ofrecer opciones
- Presentar exactamente 4 opciones
- Obtener confirmación tipada para Opción 4
- Limpiar worktree para Opciones 1 y 4 solamente

## Integración

**Llamado por:**
- **sp-subagent-dev** - Después de que todas las tareas completan
- **sp-executing-plans** - Después de que todos los batches completan

**Emparejado con:**
- **sp-git-worktrees** - Limpia worktree creado por ese skill
