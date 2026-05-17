# Pendientes para Salida a Producción - OmniWorker Desktop B2B

Este documento detalla los pasos pendientes para completar el flujo de instalación y configuración de producción de OmniWorker en el entorno B2B. Mañana, cualquier agente que tome esta tarea podrá ejecutar este checklist.

## 🔑 Credenciales del Servidor de Producción

- **Servidor (IP):** `217.76.62.37`
- **Usuario:** `root`
- **Contraseña:** `Santiago1206`
- **Autenticación:** Llave SSH (ya configurada en la máquina de desarrollo de Nelson `nelsonsarcos`).
- **Dominio de Producción:** `worker.thelab.lat`
- **Comando de prueba SSH:** `ssh root@217.76.62.37`

---

## 📋 Checklist de Tareas Pendientes (Mañana)

### 1. Empaquetado del Agente (Backend Local)
Actualmente, la App de Desktop buscará descargar un archivo `.tar.gz` desde el servidor en Nginx. Debemos prepararlo:
- [ ] Entrar al directorio local `omniworker-agent`.
- [ ] Crear el empaquetado del agente ignorando carpetas pesadas:
  `tar -czvf omniworker-agent.tar.gz omniworker-agent/ --exclude="omniworker-agent/venv" --exclude="omniworker-agent/.venv" --exclude="omniworker-agent/__pycache__" --exclude="omniworker-agent/.git"`
- [ ] Subir el archivo `omniworker-agent.tar.gz` al servidor de producción en la ruta de Nginx: `/opt/omniworker/downloads/omniworker-agent.tar.gz` (usar `scp`).

### 2. Corrección del Script de Descarga de Modelos (Desktop App)
El script `scripts/download_slm.sh` de la App Desktop falla durante el empaquetado (`npm run build:mac`) porque las nuevas versiones de `llama-server` (ej. `b9190`) en GitHub ahora se distribuyen como `.tar.gz` para Unix/Mac en lugar de `.zip`.
- [ ] Modificar `scripts/download_slm.sh` para extraer correctamente los archivos `.tar.gz` en Mac y Linux usando `tar -xzf` en lugar de `unzip`. (Dejando `unzip` únicamente para Windows).
- [ ] Asegurarse de que el modelo local de inferencia rápida se descargue correctamente.

### 3. Compilación Final del Instalador de Escritorio
- [ ] Ejecutar `npm run build:mac` de nuevo para generar el instalador final (`.dmg`).
- [ ] Subir este `.dmg` a producción (`/opt/omniworker/downloads/OmniWorker-v5.dmg`) para que esté disponible para las descargas de los usuarios finales.

### 4. Prueba Final del Flujo de Instalación
En la otra computadora (la que está probando la instalación desde cero):
- [ ] Descargar e instalar el nuevo `v5` (el compilado generado en el paso 3).
- [ ] Iniciar sesión.
- [ ] **Validación:** Confirmar que la App *no salta* directamente al chat, sino que muestra la pantalla "Installing OmniWorker...".
- [ ] **Validación:** Confirmar que descarga el `omniworker-agent.tar.gz` del servidor e instala el agente de Python local.
- [ ] **Validación:** Confirmar que descarga la base de datos, el RAG local (pgvector/embeddings), y el modelo pequeño.
- [ ] **Validación de Conexión al SaaS:** Una vez en el chat, escribir un mensaje y asegurar que el token se haya inyectado correctamente para usar la API remota de producción (`https://worker.thelab.lat/api/v1`) en lugar del proveedor local para las llamadas pesadas de LLM.

---

### 📝 Notas para el Agente (Contexto Técnico)
- **Bug Solucionado Hoy:** En `App.tsx`, el chequeo de instalación `if (installed)` causaba un bug de "truthiness" porque el método retornaba un objeto. Esto causaba que la app omitiera la instalación y tratara de encender un agente inexistente (arrojando el error `ENOENT`). Esto ya fue corregido a `if (installStatus.installed)`.
- **URL de Descarga Ajustada:** En `installer.ts`, la variable `SAAS_BASE_URL` fue arreglada a `https://worker.thelab.lat`. La descarga del instalador del agente se fijó para que apunte a `https://worker.thelab.lat/downloads/omniworker-agent.tar.gz`, ya que `https.get` en Node.js no sigue redirecciones HTTP.
