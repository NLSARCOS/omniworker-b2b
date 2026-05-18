# PLAN-produccion: Lanzamiento OmniWorker v8.8+ (Versión Extendida)

## Objetivo Principal: Estabilización de Producto Comercial
Este documento es la hoja de ruta exhaustiva orquestada por múltiples agentes (`project-planner`, `product-manager`, `backend-specialist`, `frontend-specialist`, `security-auditor` y `test-engineer`) para asegurar que OmniWorker pase de ser un prototipo avanzado a un **producto comercial robusto, vendible y libre de fallos**. El enfoque principal es la **estabilidad de la API**, la resiliencia del agente y la experiencia de usuario "out of the box".

---

## 1. 🎯 Estrategia de Producto y Experiencia (Product Manager / Owner)

Para que OmniWorker sea un producto comercial, la fricción de instalación y uso debe ser cero.

- [ ] **Distribución del Producto y Modelo Local (SLM):** Decisión crítica. Dado que no usamos S3 ni queremos pelear con los límites de GitHub Releases, **alojaremos el Instalador completo (DMG/EXE) en nuestro propio VPS** (ej. `worker.thelab.lat/downloads/OmniWorker-v8.dmg`). 
  - *Opción A:* Empaquetar el modelo local (468 MB) directamente dentro del DMG y distribuirlo desde nuestro VPS.
  - *Opción B:* Distribuir un instalador ligero desde el VPS y descargar dinámicamente el `slm.gguf` durante la instalación. **Importante:** Si se descarga dinámicamente, DEBE ocurrir exclusivamente dentro de la ventana de instalación del Desktop, con una barra de progreso nativa, asegurando que el usuario final NO interactúe con el proceso bajo ningún concepto.
- [ ] **Onboarding & First Run Experience:** Diseñar un asistente de configuración inicial interactivo que verifique el estado del sistema, valide la cuenta de usuario (SaaS) y configure el modelo local o remoto en el primer inicio.
- [ ] **Modo Offline Degradado:** Si el usuario pierde conexión a internet o nuestra API SaaS falla, el sistema debe transicionar de forma fluida (sin crashear) a usar exclusivamente el motor local (`claw3d`/`slm.gguf`) notificando al usuario en la interfaz.

---

## 2. 🔌 Robustez de la API y el Backend SaaS (Backend Specialist)

El problema de caídas y errores en la API que alimenta al agente es nuestro mayor cuello de botella actual. Se requiere un endurecimiento total de la infraestructura en `omniworker-saas` y `omniworker-agent`.

- [ ] **Resiliencia y Conectividad del LLM Gateway Proxy (`/api/v1/chat/completions`):**
  - **Acceso Rápido y Sin Fisuras:** La API que proveemos debe conectar de manera inmediata, ofreciendo acceso veloz a la IA. La latencia inicial debe ser mínima.
  - **Lógica de Reintentos Automáticos (Retry & Exponential Backoff)** si el proveedor de IA (OpenAI, Anthropic, etc.) da timeout o error 5xx.
  - **Circuit Breaker:** Si el SaaS detecta que una API externa está caída, debe conmutar automáticamente a un proveedor de respaldo o notificar al agente para que pase a modo local.
- [ ] **Enrutamiento Inteligente (Smart Router):** El Router debe funcionar de forma impecable y determinista para **elegir automáticamente entre el modelo local y el modelo API** que nosotros proveemos, según la complejidad de la tarea y la disponibilidad de la red. No puede haber fallos en esta toma de decisión.
- [ ] **Validación Estricta de Datos (Zod):** Todos los endpoints en `omniworker-saas` (`/api/v1/edge/*`, `/api/admin/*`) deben usar esquemas de validación estrictos con Zod para evitar que payloads corruptos desde el agente hagan crashear la base de datos o el proceso.
- [ ] **Gestión de Sesiones (JWT):** Migrar de `localStorage` a **HTTP-Only Cookies** para proteger contra ataques XSS. Implementar un flujo correcto de `refresh_token` para que la app Desktop nunca cierre sesión repentinamente a mitad de un chat.
- [ ] **Rate Limiting & Cuotas:** Implementar límites justos por tenant para evitar abusos o denegación de servicio (DDoS) que puedan tumbar el Gateway y afectar a todos los clientes.

---

## 3. 💻 Estabilidad del Desktop y Agente Local (Frontend / Debugger)

El cliente de escritorio (`omniworker-desktop`) debe ser inquebrantable, incluso cuando el entorno de Python o la red fallen.

- [ ] **Acceso Integral a la Computadora:** El Desktop debe otorgarle al agente acceso completo y seguro a todo el sistema (archivos, terminal, control del SO). El cliente es una herramienta de automatización, por lo que las restricciones de Sandbox deben permitirle al agente ejecutar su trabajo completo.
- [ ] **Sincronización IPC (Gateway/Router):** Resolver las desincronizaciones entre el proceso principal de Electron (Node) y los procesos Python. Implementar un "Heartbeat" constante. Si el Router muere, la UI debe reintentar levantarlo.
- [ ] **Manejo del `SSE` (Server-Sent Events):** Mejorar el parser de streaming (`sse-parser.ts`) para evitar crasheos si la conexión a nuestra API principal sufre micro-cortes.
- [ ] **Visibilidad de Logs de Sistema:** Añadir consola en tiempo real en "Gateway" o "Settings".
- [ ] **Resolución de Linters:** Limpiar a 0 los errores de compilación (`eslint` y TS) en todo el código React del Desktop.

---

## 4. 🛡️ Seguridad, Auditoría y Telemetría (Security Auditor)

Para mantener el SLA (Service Level Agreement) del producto en producción, necesitamos saber cuándo falla antes que el cliente.

- [ ] **Integración de Sentry (Telemetría de Errores):** Configurar y activar Sentry tanto en `omniworker-saas` como en `omniworker-desktop`. Cualquier excepción no capturada en la UI o cualquier 500 en la API debe generar una alerta automática en Slack/Teams para el equipo de desarrollo.
- [ ] **Firmas y Notarización de Sistema Operativo:** 
  - macOS: Firmar el instalador `.dmg` con el certificado `Developer ID Application` y pasarlo por Notarización de Apple (para evitar el mensaje de "Software malicioso").
  - Windows: Firmar el ejecutable `.exe` con un certificado Authenticode EV.
- [ ] **Protección de API Keys:** Asegurar que las llaves de OpenAI/Anthropic inyectadas en el Gateway remoto nunca puedan ser inferidas o expuestas en las trazas de red del cliente.

---

## 5. 🧪 Aseguramiento de Calidad y Pruebas (Test Engineer)

- [ ] **Tests de Integración Críticos:** Crear tests unitarios en Python/Node que simulen "La API responde lento (10s)", "La red se corta a mitad de un JSON", y "El usuario no tiene permisos" para asegurar que la app maneja estos flujos amigablemente.
- [ ] **Pruebas E2E (Playwright):** Configurar Playwright para simular el ciclo de vida completo: Login -> Creación de Proyecto -> Invocación del Agente vía API Remota -> Caída intencionada -> Invocación Local.
- [ ] **Auditoría Multi-Plataforma:** Verificar que la creación del entorno virtual Python (`uv venv`) y la instalación de los paquetes sea 100% resiliente tanto en Windows (espacios en rutas, permisos) como en macOS/Linux.

---

## 📅 Próximos Pasos Recomendados (Roadmap Inmediato)

1. **Mañana (Fase API & Resiliencia):** Atacar el bloque #2 (SaaS) resolviendo el Linter de Next.js, implementando Zod y metiendo un wrapper de Reintentos (Exponential Backoff) en la API principal del Gateway.
2. **Medio Día (Fase UX Local):** Implementar la descarga progresiva del modelo `slm.gguf` desde S3 y conectar Sentry en Desktop para cazar bugs silenciosos.
3. **Cierre (Fase Testing):** Ejecutar la batería de tests simulando caídas de internet y validando que el Auto-Repair se activa correctamente.

*Plan extendido ejecutado por el Antigravity Kit (Socratic Gate).*
