# Skill: Git Worktrees (Superpowers)

## Metadata

| Campo | Valor |
|-------|-------|
| **Nombre** | sp-git-worktrees |
| **Versión** | 1.0.0 |
| **Categoría** | Workflow |
| **Requiere** | Ninguno |
| **Autor** | Adaptado de obra/superpowers |

## Activation

```yaml
when_to_use:
  - "Comenzar feature work que necesita aislamiento"
  - "Antes de ejecutar planes de implementación"
  - "Trabajo en múltiples branches simultáneamente"
```

## Descripción

Git worktrees crean workspaces aislados compartiendo el mismo repositorio, permitiendo trabajar en múltiples branches simultáneamente sin switching.

**Principio central:** Selección sistemática de directorio + verificación de seguridad = aislamiento confiable.

**Anuncio inicial:** "Estoy usando el skill sp-git-worktrees para set up un workspace aislado."

## Proceso de Selección de Directorio

### 1. Check Directorios Existentes

```bash
# Check en orden de prioridad
ls -d .worktrees 2>/dev/null     # Preferido (hidden)
ls -d worktrees 2>/dev/null      # Alternativa
```

**Si encontrado:** Usar ese directorio. Si ambos existen, `.worktrees` gana.

### 2. Check AGENTS.md

```bash
grep -i "worktree.*director" AGENTS.md 2>/dev/null
```

**Si preferencia especificada:** Usarla sin preguntar.

### 3. Preguntar al Usuario

Si no existe directorio y no hay preferencia en AGENTS.md:

> "No se encontró directorio de worktree. ¿Dónde debería crear los worktrees?
>
> 1. .worktrees/ (project-local, hidden)
> 2. ~/.config/superpowers/worktrees/<project-name>/ (ubicación global)
>
> ¿Cuál prefieres?"

## Verificación de Seguridad

### Para Directorios Project-Local (.worktrees o worktrees)

**DEBE verificar que el directorio está ignorado antes de crear worktree:**

```bash
# Check si el directorio está ignorado (respeta local, global, y system gitignore)
git check-ignore -q .worktrees 2>/dev/null || git check-ignore -q worktrees 2>/dev/null
```

**Si NO está ignorado:**

1. Agregar línea apropiada a .gitignore
2. Hacer commit del cambio
3. Proceder con creación de worktree

**Por qué es crítico:** Previene accidentalmente commitear contenidos de worktree al repositorio.

### Para Directorio Global (~/.config/superpowers/worktrees)

No se necesita verificación de .gitignore — fuera del proyecto enteramente.

## Pasos de Creación

### 1. Detectar Nombre del Proyecto

```bash
project=$(basename "$(git rev-parse --show-toplevel)")
```

### 2. Crear Worktree

```bash
# Determinar path completo
case $LOCATION in
  .worktrees|worktrees)
    path="$LOCATION/$BRANCH_NAME"
    ;;
  ~/.config/superpowers/worktrees/*)
    path="~/.config/superpowers/worktrees/$project/$BRANCH_NAME"
    ;;
esac

# Crear worktree con nuevo branch
git worktree add "$path" -b "$BRANCH_NAME"
cd "$path"
```

### 3. Ejecutar Setup del Proyecto

Auto-detectar y ejecutar setup apropiado:

```bash
# Node.js
if [ -f package.json ]; then npm install; fi

# Rust
if [ -f Cargo.toml ]; then cargo build; fi

# Python
if [ -f requirements.txt ]; then pip install -r requirements.txt; fi
if [ -f pyproject.toml ]; then poetry install; fi

# Go
if [ -f go.mod ]; then go mod download; fi
```

### 4. Verificar Baseline Limpio

Ejecutar tests para asegurar que el worktree comienza limpio:

```bash
# Ejemplos — usar comando apropiado para el proyecto
npm test
cargo test
pytest
go test ./...
```

**Si tests fallan:** Reportar fallas, preguntar si proceder o investigar.

**Si tests pasan:** Reportar listo.

### 5. Reportar Ubicación

> "Worktree listo en <full-path>
> Tests pasando (<N> tests, 0 failures)
> Listo para implementar <feature-name>"

## Referencia Rápida

| Situación | Acción |
|-----------|--------|
| `.worktrees/` existe | Usarlo (verificar ignorado) |
| `worktrees/` existe | Usarlo (verificar ignorado) |
| Ambos existen | Usar `.worktrees/` |
| Ninguno existe | Check AGENTS.md → Preguntar usuario |
| Directorio no ignorado | Agregar a .gitignore + commit |
| Tests fallan durante baseline | Reportar fallas + preguntar |
| No package.json/Cargo.toml | Saltar instalación de dependencias |

## Errores Comunes

### Saltar verificación de ignore
- **Problema:** Contenidos de worktree get tracked, pollutan git status
- **Fix:** Siempre usar `git check-ignore` antes de crear worktree project-local

### Asumir ubicación de directorio
- **Problema:** Crea inconsistencia, viola convenciones de proyecto
- **Fix:** Seguir prioridad: existente > AGENTS.md > preguntar

### Proceder con tests fallando
- **Problema:** No puede distinguir nuevos bugs de issues pre-existentes
- **Fix:** Reportar fallas, obtener permiso explícito para proceder

### Hardcodear comandos de setup
- **Problema:** Rompe en proyectos usando diferentes tools
- **Fix:** Auto-detectar de archivos de proyecto (package.json, etc.)

## Ejemplo de Flujo de Trabajo

```
Tú: Estoy usando el skill sp-git-worktrees para set up un workspace aislado.

[Check .worktrees/ - existe]
[Verificar ignorado - git check-ignore confirma .worktrees/ está ignorado]
[Crear worktree: git worktree add .worktrees/auth -b feature/auth]
[Ejecutar npm install]
[Ejecutar npm test - 47 pasando]

Worktree listo en /Users/jesse/myproject/.worktrees/auth
Tests pasando (47 tests, 0 failures)
Listo para implementar auth feature
```

## Red Flags

**Nunca:**
- Crear worktree sin verificar que está ignorado (project-local)
- Saltar verificación de baseline test
- Proceder con tests fallando sin preguntar
- Asumir ubicación de directorio cuando es ambigua
- Saltar check de AGENTS.md

**Siempre:**
- Seguir prioridad de directorio: existente > AGENTS.md > preguntar
- Verificar directorio está ignorado para project-local
- Auto-detectar y ejecutar setup de proyecto
- Verificar baseline de test limpio

## Integración

**Llamado por:**
- **sp-brainstorming** - REQUERIDO cuando diseño es aprobado e implementación sigue
- **sp-subagent-dev** - REQUERIDO antes de ejecutar cualquier tarea
- **sp-executing-plans** - REQUERIDO antes de ejecutar cualquier tarea
- Cualquier skill necesitando workspace aislado

**Emparejado con:**
- **sp-finish-branch** - REQUERIDO para cleanup después de trabajo completo
