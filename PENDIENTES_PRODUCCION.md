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
