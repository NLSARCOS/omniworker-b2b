# Skill: Autogeneración Dinámica de Agentes Especialistas (Superpowers)

## Metadata

| Campo | Valor |
|-------|-------|
| **Nombre** | sp-dynamic-agent-creation |
| **Versión** | 1.0.0 |
| **Categoría** | Orchestration & Meta-Programming |
| **Requiere** | Acceso a terminal/CLI y lectura/escritura de archivos |

## Activation

```yaml
when_to_use:
  - "El usuario solicita una tarea muy específica que no encaja con ningún agente especialista existente en la app"
  - "El Orquestador decide delegar una subtarea a un experto que requiere una personalidad y reglas de comportamiento únicas"
```

## 📋 Descripción y Principio Central

Este skill le permite al **Agente Orquestador** actuar como un arquitecto de sistemas y expandir dinámicamente las capacidades de la aplicación de escritorio de OmniWorker, creando nuevos agentes especialistas "a demanda". 

**Restricción Crítica de APIs:**
> [!IMPORTANT]
> **OmniWorker utiliza una única API Key central provista por el SaaS.**
> Los nuevos agentes autogenerados **NO** deben configurar ni solicitar APIs externas (como OpenAI, Anthropic, Claude, etc.).
> Toda la inteligencia debe enrutarse a través de la API Key del SaaS heredada del perfil `default` para garantizar control y consistencia.

---

## 🔄 El Proceso de Autogeneración Paso a Paso

Cuando el Orquestador identifique que una tarea requiere un especialista que no existe en el catálogo actual, ejecutará la siguiente secuencia de forma autónoma:

### Paso 1: Analizar y Diseñar el Perfil del Especialista
El Orquestador definirá:
1.  **Nombre único en minúsculas** (ej: `email-copywriter`, `smart-contract-auditor`, `web-designer`).
2.  **Conjunto de Herramientas Primarias (`toolsets`)**: Seleccionar solo las necesarias (ej: `file`, `web`, `browser`, `terminal`, `smtp_client`).
3.  **Personalidad y Misión (`SOUL.md`)**: Escribir un prompt detallado, riguroso y enfocado en la especialidad.

### Paso 2: Crear el Perfil en OmniWorker (Desktop CLI)
El Orquestador usará su herramienta de terminal para ejecutar el comando de creación dinámica:

```bash
omniworker profile create <nombre-agente> --clone
```

> [!TIP]
> El flag `--clone` es **obligatorio**. Copia la configuración del perfil `default` de tu computadora al nuevo agente, permitiéndole **heredar y reutilizar la API Key y el Gateway del SaaS** de forma transparente y sin requerir nueva autenticación.

### Paso 3: Escribir el Alma del Agente (`SOUL.md`)
El Orquestador debe escribir el prompt de personalidad de nivel experto en la ruta del perfil recién creado:

*   **Ruta del archivo:** `~/.omniworker/profiles/<nombre-agente>/SOUL.md`

#### Formato Estándar de `SOUL.md` para Nuevos Agentes:
```markdown
# OmniWorker Soul Configuration - <Nombre Especialista>

## 👤 Identidad del Agente
- **Especialidad Activa:** <Rol del Agente en Español, ej: Experto en Diseño Web y Estética Moderna>
- **Objetivo Principal:** Resolver con máximo rigor y calidad las tareas de <especialidad>.

## 🎭 Reglas de Comportamiento e Instrucciones
1. **Estilo de Respuesta:** Ir directo al grano. Sin introducciones amables innecesarias (no-fluff). Mostrar código o resultados primero, explicar después si no es obvio.
2. **Idioma:** Todas las respuestas e interacciones deben ser en Español, manteniendo nombres de variables y código técnico en Inglés para mantener el estándar.
3. **Rigurosidad:** Seguir los principios de Clean Code y validación exhaustiva.

## 📋 Directrices Específicas de Especialidad
<Instrucciones detalladas y específicas del dominio (ej: si es de diseño, contraste, colores en escala de grises, layouts, etc.)>
```

### Paso 4: Ajustar Herramientas Permitidas (`config.yaml`)
Para asegurar la seguridad y evitar que el nuevo agente use herramientas innecesarias, el Orquestador modificará el archivo de configuración del perfil:

*   **Ruta del archivo:** `~/.omniworker/profiles/<nombre-agente>/config.yaml`
*   **Acción:** Configurar el bloque `disabled_toolsets` para deshabilitar las herramientas que no correspondan con su especialidad (ej. desactivar `smtp_client` si no maneja correos).

---

## 🚀 Delegación e Interacción

Una vez creado y configurado, el Orquestador puede:
1.  Delegarle la tarea directamente a través de `delegate_task` y recopilar el resultado.
2.  Notificar al usuario con orgullo: 
    > *"He creado el agente especialista `@<nombre-agente>` con éxito. Sus credenciales han sido heredadas de forma segura desde el SaaS y está listo para que charles con él o le asignes tareas directamente desde la interfaz de la aplicación de escritorio."*

---

## 🚫 Red Flags (Lo que el Orquestador NUNCA debe hacer)

*   ❌ **NUNCA** solicitar al usuario una clave API de OpenAI, Claude u otros proveedores externos.
*   ❌ **NUNCA** intentar sobrescribir la configuración del `provider` o `api_key` con valores ajenos al SaaS.
*   ❌ **NUNCA** crear agentes con nombres genéricos que puedan colisionar con binarios del sistema (ej: `ls`, `cd`, `node`).
