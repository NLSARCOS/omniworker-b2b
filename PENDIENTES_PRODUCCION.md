# Pendientes para Salida a Producción - OmniWorker Desktop B2B

Este documento detalla los pasos pendientes para completar el flujo de instalación y configuración de producción de OmniWorker en el entorno B2B. Mañana, cualquier agente que tome esta tarea podrá ejecutar este checklist.

## 🔑 Credenciales del Servidor de Producción

- **Servidor (IP):** `217.76.62.37`
- **Usuario:** `root`
- **Contraseña:** `Santiago1206`
- **Autenticación:** Llave SSH (ya configurada en la máquina de desarrollo de Nelson `nelsonsarcos`).
- **Dominio de Producción:** `flux.simplex.lat`
- **Comando de prueba SSH:** `ssh root@217.76.62.37`

---

### Estado Actual (v8.8 - Despliegue Desktop)

*   **Agente Local (CLI):** ✅ Empaquetado y subido a `/opt/omniworker/downloads/omniworker-agent.tar.gz`.
*   **Instalador macOS:** ✅ Compilado (v8.8) y subido a `/opt/omniworker/downloads/OmniWorker-v8.8.dmg`.
*   **Ruteo (Smart Router):** ✅ Corregido fallo de `Invalid API key`. El token SaaS ahora se inyecta correctamente en el subproceso `smart_router.py`.
*   **Optimizacion SLM:** ✅ Contexto reducido a 2048 para mitigar tiempo de "Cold Start". El modelo Qwen2.5-0.5B-Instruct es el más pequeño disponible (~397MB).

## 🚀 Próximos Pasos (Pendientes)

### 1. Corrección del Script de Descarga de Modelos (Desktop App)
El script `scripts/download_slm.sh` de la App Desktop fallaba durante el empaquetado (`npm run build:mac`) porque las nuevas versiones de `llama-server` (ej. `b9190`) en GitHub ahora se distribuyen como `.tar.gz` para Unix/Mac en lugar de `.zip`.
- [x] Modificar `scripts/download_slm.sh` para extraer correctamente los archivos `.tar.gz` en Mac y Linux usando `tar -xzf` en lugar de `unzip`. (Dejando `unzip` únicamente para Windows).
- [x] Asegurarse de que el modelo local de inferencia rápida se descargue correctamente (Optimizado: Desactivado por defecto para Cloud-Only, reduciendo instalador a ~60MB).

### 2. Gestión de Licencias y Control de Asientos (SaaS & Desktop Sync)
- [x] **Registro de Agentes:** Los agentes de escritorio ahora se enlazan correctamente a la licencia correspondiente (`user.licenseId`) en el SaaS.
- [x] **Liberación de Cupos al Revocar:** Al revocar una licencia en el SaaS dashboard, se eliminan físicamente los agentes asociados en lugar de dejarlos con `licenseId: null`, liberando instantáneamente la cuota.
- [x] **Borrado Manual de Asistentes:** Se implementó el endpoint `DELETE /api/v1/edge/status?id=...` en el SaaS.
- [x] **Interfaz del SaaS:** Se añadió un botón "ELIMINAR" en la tabla de asistentes conectados del dashboard de SaaS con confirmación, permitiendo liberar espacios de forma directa.
- [x] **Comportamiento del Cliente de Escritorio:** Modificado el heartbeat de la app de escritorio; si el agente fue borrado del SaaS (404), limpia `registeredAgentId` para permitir re-registro inmediato.

### 3. Compilación Final del Instalador de Escritorio
- [x] Ejecutar `npm run build:mac` de nuevo para generar el instalador final (`.dmg`).
- [x] Subir este `.dmg` a producción (`/opt/omniworker/downloads/OmniWorker-v5.dmg`) para que esté disponible para las descargas de los usuarios finales.

### 4. Prueba Final del Flujo de Instalación
En la otra computadora (la que está probando la instalación desde cero):
- [ ] Descargar e instalar el nuevo `v5` (el compilado generado en el paso 3).
- [ ] Iniciar sesión.
- [ ] **Validación:** Confirmar que la App *no salta* directamente al chat, sino que muestra la pantalla "Installing OmniWorker...".
- [ ] **Validación:** Confirmar que descarga el `omniworker-agent.tar.gz` del servidor e instala el agente de Python local.
- [ ] **Validación:** Confirmar que no descarga el modelo SLM local (ya que está desactivado por defecto, acelerando la instalación al instante).
- [ ] **Validación de Conexión al SaaS:** Una vez en el chat, escribir un mensaje y asegurar que el token se haya inyectado correctamente para usar la API remota de producción (`https://flux.simplex.lat/api/v1`) en lugar del proveedor local.

---

### 📝 Notas para el Agente (Contexto Técnico)
- **Bug Solucionado Hoy:** En `App.tsx`, el chequeo de instalación `if (installed)` causaba un bug de "truthiness" porque el método retornaba un objeto. Esto causaba que la app omitiera la instalación y tratara de encender un agente inexistente (arrojando el error `ENOENT`). Esto ya fue corregido a `if (installStatus.installed)`.
- **URL de Descarga Ajustada:** En `installer.ts`, la variable `SAAS_BASE_URL` fue arreglada a `https://flux.simplex.lat`. La descarga del instalador del agente se fijó para que apunte a `https://flux.simplex.lat/downloads/omniworker-agent.tar.gz`, ya que `https.get` en Node.js no sigue redirecciones HTTP.
- **Bug de Ruteo de SaaS Solucionado:** El agente fallaba con error `APIConnectionError` y `code -2` al intentar conectarse a `localhost:3000/api/v1`. Se actualizó `omniworker.ts` para inyectar correctamente `OMNIWORKER_SAAS_BASE_URL` extraído del `SAAS_BASE_URL` hacia las variables de entorno del agente y del `smart_router.py`.
- **Bug de Instalación Local (ENOENT) Solucionado:** El script de instalación fallaba silenciosamente antes de crear el `venv` porque se le estaba pasando `--local` sin especificar la ruta, lo que causaba que `install.sh` intentara usar `rsync` para copiar toda la carpeta `/Users/...` hacia la carpeta del agente. Se corrigió explícitamente en `installer.ts` el comando a `--local "${OMNIWORKER_REPO}"`.

## Correcciones adicionales (v8.1)
- Corregida la inicialización de `smart_router.py`: `isSmartRouterRunning()` es asíncrona pero se evaluaba sincrónicamente, haciendo que la app de escritorio pensara que el proxy ya estaba activo cuando no lo estaba. Esto causaba el `[Errno 61] Connection refused` que el agente recibía al intentar hablar con el SaaS a través del proxy muerto.
- Se agregó un botón de **Validación de Sistema** en la pestaña de `Cuenta` del cliente de escritorio para diagnosticar rápidamente el estado del servidor API local y la conexión con el modelo SLM o el SaaS en el cliente final.

---

# 🤖 Orquestador + Ejército de Agentes — pendiente para probar en vivo

> **Auditado:** 2026-06-04 · **Branch:** `feat/next` · Ver `ORCHESTRATOR-SPEC.md` (38/44 ✅, 110 tests verdes).
> **Código:** listo y testeado. **Bloqueo:** credenciales de modelo + decisión de ruteo.

## El problema, simple
El orquestador y los 10 agentes están construidos, pero **nunca se probaron con un
modelo real desde esta máquina de desarrollo** — no tiene llaves de modelo, y el
JWT del gateway en su `config.yaml` **expiró hace 8 días** (se renueva al loguearse
en el desktop).

Evidencia (la prueba en vivo falló así):
```
RuntimeError: Provider 'kimi-coding' is set in config.yaml but no API key
was found. Set the KIMI_API_KEY environment variable.
```

## Dónde están las credenciales (sí existen)
Las llaves reales de los modelos **NO están en el repo ni en la máquina de dev**
(correcto: no se commitean). Están —o deben estar— en el **entorno del servidor de
producción** (`217.76.62.37` / `flux.simplex.lat`, ver credenciales SSH al inicio
de este doc). El cliente local habla con ese gateway vía JWT; el SaaS guarda las
llaves de Kimi/GLM del lado servidor.

## ⚠️ El conflicto a resolver: el ejército apunta a los modelos DIRECTOS, no al gateway
El registry (`omniworker-agent/agent_types.yaml`) configura a los agentes para ir
**directo** a los proveedores, no por `flux.simplex.lat`:

| Agente usa provider | Va a | Llave que pediría |
|---|---|---|
| `kimi-coding` | `api.moonshot.ai` | `KIMI_API_KEY` |
| `zai` | `api.z.ai` | `GLM_API_KEY` / `ZAI_API_KEY` |
| `opencode-go` | `opencode.ai/zen/go` | `OPENCODE_GO_API_KEY` |

→ Aunque renueves el JWT, los agentes **no pasarían por tu gateway** salvo que se
re-apunten al provider `custom` (flux). Esta es la decisión clave.

## ✅ Qué falta hacer (elegir UNA)

### Opción A — Probar rápido con llaves directas
Traer las llaves del servidor de prod (SSH) y pegarlas en `~/.omniworker/.env`:
```
KIMI_API_KEY=...          # kimi-k2 (orquestador, researcher, data_analyst)
GLM_API_KEY=...           # glm-5 / glm-4.5-flash (developer, reviewer, etc.)
OPENCODE_GO_API_KEY=...   # opcional (browser_agent, marketer)
```

### Opción B — Producción correcta: que el ejército pase por `flux.simplex.lat` ✅ recomendado
1. Loguearse en el **desktop** → renueva el JWT del gateway.
2. Confirmar **qué nombres de modelo sirve el gateway** (¿`kimi-k2` / `glm-5`, u otros?).
3. Re-apuntar los agentes del registry al provider `custom` (flux) en vez de los directos.
→ Así el ejército usa tu capa de opacidad/billing y las llaves que ya viven en el server.

## Verificación (cuando haya credenciales)
```bash
cd omniworker-agent
RUN_E2E=1 python3 -m pytest tests/test_orchestrator_e2e.py::test_real_model_delegation -q -o addopts=""
```
Debe pasar **sin** devolver `{"error": ...}`. (El test ya valida delegación real;
se corrigió un falso positivo que aceptaba cualquier string.)

## Pendientes menores del orquestador (no bloquean)
- **A8** sandbox real (necesita `TERMINAL_ENV=docker/modal` + override por-agente).
- **C6** generar tareas desde señales externas (email/evento). *(Ya descompone objetivos manuales.)*
- **F4** opacidad en el front del desktop (código TS, otro repo).
- **D5** autolearning desde el chat (no solo el daemon).
- **E6** endpoints admin para push de modelos del SaaS *(opcional — el poller local ya cubre el auto-update)*.

## Resumen en una línea
**El código del orquestador está listo. Para verlo funcionar falta: (1) las llaves
de los modelos —que viven en el servidor de prod, no acá— y (2) decidir si los
agentes van directo a Kimi/GLM o por tu gateway `flux.simplex.lat` (recomendado).**
