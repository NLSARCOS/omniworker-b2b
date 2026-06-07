// src/lib/programmatic-data.ts — Programmatic SEO Keywords and Metadata Generator

export interface ProgrammaticPageData {
  slug: string;
  keyword: string;
  category: "integration" | "usecase" | "alternative" | "geo";
  badge: string;
  title: string;
  description: string;
  heroText: string;
  targetName: string;
  benefitPrimary: string;
  stats: { num: string; label: string }[];
  features: [string, string, string][]; // icon, title, description
  steps: { n: string; title: string; desc: string }[];
  testimonials: { quote: string; name: string; role: string; result: string }[];
  faq: { q: string; a: string }[];
}

const staticKeywords: { slug: string; keyword: string; category: "integration" | "usecase" | "alternative" | "geo" }[] = [];

// Helper to capitalize words
const capitalizeWord = (s: string) => s.split("-").map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");

// 1. Generate Integrations
export const TOOLS_MAP: Record<string, string> = {
  notion: "Notion",
  airtable: "Airtable",
  linear: "Linear",
  "google-sheets": "Google Sheets",
  "firefly-iii": "Firefly III",
  comfyui: "ComfyUI",
  github: "GitHub",
  spotify: "Spotify",
  youtube: "YouTube",
  lldb: "LLDB Debugger",
  sqlite: "SQLite",
  playwright: "Playwright",
  scrapling: "Scrapling",
  salesforce: "Salesforce",
  hubspot: "HubSpot",
  zoho: "Zoho CRM",
  pipedrive: "Pipedrive",
  clickup: "ClickUp",
  monday: "Monday.com",
  jira: "Jira",
  asana: "Asana",
  trello: "Trello",
  stripe: "Stripe",
  shopify: "Shopify",
  "google-calendar": "Google Calendar",
  gmail: "Gmail",
  quickbooks: "QuickBooks",
  xero: "Xero",
  sap: "SAP ERP",
  odoo: "Odoo CRM",
  slack: "Slack Workspace",
  mailchimp: "Mailchimp",
  sendgrid: "SendGrid",
  activecampaign: "ActiveCampaign",
  klaviyo: "Klaviyo",
  webflow: "Webflow",
  wordpress: "WordPress",
  framer: "Framer Site",
  supabase: "Supabase",
  firebase: "Firebase",
  postgresql: "PostgreSQL",
  mysql: "MySQL",
  mongodb: "MongoDB",
  redis: "Redis Cache",
  elasticsearch: "Elasticsearch",
  zendesk: "Zendesk",
  intercom: "Intercom",
  freshdesk: "Freshdesk",
  drift: "Drift Chat",
  typeform: "Typeform",
  tally: "Tally Forms",
  "google-drive": "Google Drive",
  dropbox: "Dropbox",
  onedrive: "OneDrive",
  box: "Box Storage",
  figma: "Figma Design",
  canva: "Canva Design",
  "jira-service-management": "Jira Service Management",
  pagerduty: "PagerDuty",
  sentry: "Sentry",
  datadog: "Datadog"
};

export const CHANNELS_MAP: Record<string, string> = {
  whatsapp: "WhatsApp",
  telegram: "Telegram",
  slack: "Slack",
  teams: "Microsoft Teams",
  discord: "Discord",
  messenger: "Facebook Messenger",
  instagram: "Instagram DM",
  gmail: "Gmail Inbox",
  outlook: "Outlook Mail",
  sms: "SMS",
  voice: "Llamada de Voz"
};

const TOOLS_LIST = Object.keys(TOOLS_MAP);
const CHANNELS_LIST = Object.keys(CHANNELS_MAP);

for (const tool of TOOLS_LIST) {
  for (const channel of CHANNELS_LIST) {
    const slug = `agente-ia-${tool}-${channel}`;
    const toolLabel = TOOLS_MAP[tool] || capitalizeWord(tool);
    const channelLabel = CHANNELS_MAP[channel] || capitalizeWord(channel);
    staticKeywords.push({
      slug,
      keyword: `Agente de IA para ${toolLabel} en ${channelLabel}`,
      category: "integration"
    });
  }
}

// 2. Generate Use Cases
export const USECASES_MAP: Record<string, { label: string; desc: string }> = {
  "gestion-cobros": { label: "Gestión de Cobros", desc: "automatizar el seguimiento de facturas vencidas, conciliaciones de cuentas y acuerdos de pago de manera autónoma." },
  "conciliacion-facturas": { label: "Conciliación de Facturas", desc: "procesar facturas, cruzar recibos con cuentas bancarias y notificar saldos pendientes de forma autónoma." },
  "soporte-primer-nivel": { label: "Soporte de Primer Nivel", desc: "resolver consultas de estado de pedidos, devoluciones y stock las 24 horas liberando al equipo operativo." },
  "transcripcion-llamadas": { label: "Transcripción de Llamadas", desc: "transcribir y analizar llamadas comerciales, extrayendo información relevante para alimentar tu CRM." },
  "carga-leads-crm": { label: "Carga de Leads en CRM", desc: "extraer prospectos de correos y planillas para calificarlos e insertarlos al instante en tu CRM." },
  "reportes-semanales": { label: "Reportes Semanales", desc: "consolidar métricas operativas y generar reportes analíticos completos al cierre de cada semana." },
  "monitoreo-servidores": { label: "Monitoreo de Servidores", desc: "analizar logs de sistemas, resolver caídas de infraestructura básicas y alertar sobre incidentes críticos." },
  "generacion-imagenes": { label: "Generación de Imágenes", desc: "automatizar el diseño de piezas gráficas y renders mediante pipelines de IA locales." },
  "analisis-competencia": { label: "Análisis de Competencia", desc: "escanear precios, stock y lanzamientos de competidores en tiempo real de forma automática." },
  "control-gastos": { label: "Control de Gastos", desc: "clasificar facturas, auditar reembolsos corporativos y controlar presupuestos de forma autónoma." },
  "atencion-cliente": { label: "Atención al Cliente", desc: "atender consultas complejas, calificar necesidades e iniciar flujos de post-venta las 24 horas." },
  "agenda-reuniones": { label: "Agenda de Reuniones", desc: "coordinar agendas cruzando calendarios, confirmar disponibilidad y programar reuniones de forma inteligente." },
  "scraping-precios": { label: "Scraping de Precios", desc: "monitorear catálogos web, recopilar variaciones de precios y exportar reportes analíticos." },
  "testing-software": { label: "Testing de Software", desc: "ejecutar casos de prueba funcionales, registrar fallos y verificar compilaciones de forma autónoma." },
  "redaction-contenido": { label: "Redacción de Contenido", desc: "crear borradores de blog, optimizar copias de anuncios y estructurar artículos SEO a escala." },
  "auditoria-contratos": { label: "Auditoría de Contratos", desc: "analizar cláusulas contractuales, detectar riesgos y validar términos legales automáticamente." },
  "filtro-candidatos": { label: "Filtro de Candidatos", desc: "analizar hojas de vida, evaluar perfiles técnicos y pre-seleccionar candidatos calificados." },
  "reservas-turnos": { label: "Reserva de Turnos", desc: "gestionar reservas, confirmar citas y coordinar cancelaciones con clientes automáticamente." },
  "onboarding-clientes": { label: "Onboarding de Clientes", desc: "guiar el proceso de onboarding para nuevos clientes y configurar accesos de manera autónoma." },
  "onboarding-empleados": { label: "Onboarding de Empleados", desc: "automatizar el proceso de inducción de nuevo personal y recopilación de documentos requeridos." },
  "calificacion-leads": { label: "Calificación de Leads", desc: "analizar el perfil y comportamiento de leads de ventas para calificarlos antes de pasarlos a ejecutivos." },
  "recuperacion-carritos": { label: "Recuperación de Carritos", desc: "detectar carritos abandonados en tu tienda y activar flujos automatizados de incentivo de compra." },
  "sincronizacion-inventario": { label: "Sincronización de Inventario", desc: "sincronizar el inventario de múltiples canales de venta en tiempo real para evitar quiebres de stock." },
  "generacion-facturas": { label: "Generación de Facturas", desc: "emitir facturas comerciales automáticamente y enviarlas a los clientes al concretar una transacción." },
  "envio-alertas": { label: "Envío de Alertas", desc: "enviar notificaciones y alertas críticas a clientes o equipos técnicos según reglas preestablecidas." },
  "analisis-sentimiento": { label: "Análisis de Sentimiento", desc: "monitorear comentarios y menciones de tu marca en redes para clasificar el nivel de satisfacción del cliente." },
  "enriquecimiento-datos": { label: "Enriquecimiento de Datos", desc: "completar perfiles de clientes de forma autónoma buscando información pública en redes y bases de datos." },
  "extraccion-documentos": { label: "Extracción de Documentos", desc: "escanear archivos PDF y extraer datos estructurados para subirlos a tus sistemas internos." },
  "conciliacion-bancaria": { label: "Conciliación Bancaria", desc: "cruzar extractos bancarios diarios con tus registros de cobros para detectar diferencias automáticamente." },
  "generacion-contratos": { label: "Generación de Contratos", desc: "redactar contratos estándar basados en plantillas y variables de clientes automáticamente." },
  "gestion-tickets": { label: "Gestión de Tickets", desc: "clasificar y asignar tickets de soporte entrantes al técnico especializado de forma automática." },
  "seguimiento-envios": { label: "Seguimiento de Envíos", desc: "actualizar a los compradores con el estatus y tracking en vivo de sus paquetes y despachos." },
  "carga-productos": { label: "Carga de Productos", desc: "automatizar la carga y actualización de fichas técnicas de productos en catálogos de e-commerce." },
  "actualizacion-precios": { label: "Actualización de Precios", desc: "modificar tarifas y listas de precios en todos tus canales comerciales según variaciones de coste." },
  "generacion-reportes-financieros": { label: "Generación de Reportes Financieros", desc: "consolidar estados de cuentas, flujos de caja y balances mensuales automáticamente." },
  "auditoria-seguridad": { label: "Auditoría de Seguridad", desc: "escanear logs de accesos y alertar sobre comportamientos sospechosos o intentos de intrusión." }
};

export const INDUSTRIES_MAP: Record<string, string> = {
  fintech: "Fintech",
  inmobiliarias: "Inmobiliarias",
  ecommerce: "E-commerce",
  "real-estate": "Real Estate",
  logistica: "Logística",
  devops: "DevOps",
  marketing: "Marketing",
  retail: "Retail",
  finanzas: "Finanzas",
  seguros: "Seguros",
  consultorias: "Consultorías",
  qa: "QA",
  agencias: "Agencias",
  salud: "Salud",
  educacion: "Educación",
  legal: "Legal",
  "recursos-humanos": "Recursos Humanos",
  turismo: "Turismo",
  hoteleria: "Hotelería",
  restaurantes: "Restaurantes",
  construccion: "Construcción",
  manufactura: "Manufactura",
  agricultura: "Agricultura",
  transporte: "Transporte",
  entretenimiento: "Entretenimiento",
  saas: "SaaS",
  "salud-dental": "Clínicas Dentales",
  veterinarias: "Veterinarias",
  gimnasios: "Gimnasios",
  estetica: "Centros de Estética",
  automotriz: "Automotriz",
  energia: "Energía",
  telecomunicaciones: "Telecomunicaciones",
  "servicios-publicos": "Servicios Públicos",
  banca: "Banca",
  "seguros-medicos": "Seguros Médicos"
};

const USECASES_LIST = Object.keys(USECASES_MAP);
const INDUSTRIES_LIST = Object.keys(INDUSTRIES_MAP);

for (const uc of USECASES_LIST) {
  for (const ind of INDUSTRIES_LIST) {
    const slug = `automatizacion-ia-${uc}-${ind}`;
    const ucLabel = USECASES_MAP[uc].label;
    const indLabel = INDUSTRIES_MAP[ind];
    staticKeywords.push({
      slug,
      keyword: `Automatización con agentes de IA para ${ucLabel} en ${indLabel}`,
      category: "usecase"
    });
  }
}

// 3. Generate Alternatives
export const COMPETITORS_MAP: Record<string, string> = {
  crewai: "CrewAI",
  dify: "Dify",
  flowise: "Flowise",
  langflow: "Langflow",
  zapier: "Zapier",
  make: "Make.com",
  n8n: "n8n",
  autogpt: "AutoGPT",
  coze: "Coze",
  voiceflow: "Voiceflow",
  landbot: "Landbot",
  chatbase: "Chatbase",
  activepieces: "Activepieces",
  botpress: "Botpress",
  manychat: "ManyChat",
  typeform: "Typeform",
  tally: "Tally Forms",
  retable: "Retable",
  retool: "Retool",
  superblocks: "Superblocks",
  bubble: "Bubble",
  flutterflow: "FlutterFlow"
};

const COMPETITORS_LIST = Object.keys(COMPETITORS_MAP);

for (const comp of COMPETITORS_LIST) {
  const slug = `alternativa-local-${comp}`;
  const compLabel = COMPETITORS_MAP[comp];
  staticKeywords.push({
    slug,
    keyword: `Alternativa local y segura a ${compLabel}`,
    category: "alternative"
  });
}

export const GENERIC_SLUGS_MAP: Record<string, { keyword: string; category: "usecase" | "integration" | "alternative" | "geo" }> = {
  "asistente-para-inmobiliarias": { keyword: "Asistente de IA para Inmobiliarias", category: "usecase" },
  "asistente-para-restaurantes": { keyword: "Asistente de IA para Restaurantes", category: "usecase" },
  "asistente-virtual-para-clinicas": { keyword: "Asistente Virtual de IA para Clínicas y Consultorios", category: "usecase" },
  "automatizacion-de-campanas-marketing": { keyword: "Automatización de Campañas de Marketing con IA", category: "usecase" },
  "automatizacion-de-cobranzas": { keyword: "Automatización de Cobranzas y Cobros con IA", category: "usecase" },
  "automatizacion-de-pedidos": { keyword: "Automatización de Pedidos y E-commerce con IA", category: "usecase" },
  "automatizacion-de-inventario": { keyword: "Automatización de Inventario y Stock con IA", category: "usecase" },
  "chatbot-para-whatsapp-business": { keyword: "Chatbot de IA para WhatsApp Business", category: "usecase" },
  "crm-con-inteligencia-artificial": { keyword: "CRM con Inteligencia Artificial autónoma", category: "usecase" },
  "crm-para-pequenas-empresas": { keyword: "CRM con IA para Pequeñas Empresas", category: "usecase" },
  "digital-employee-platform": { keyword: "Digital Employee Platform con agentes de IA", category: "usecase" },
  "empleado-digital-autonomo": { keyword: "Empleado Digital Autónomo 24/7", category: "usecase" },
  "empleados-digitales-para-empresas": { keyword: "Empleados Digitales de IA para Empresas", category: "usecase" },
  "fuerza-laboral-artificial-latam": { keyword: "Fuerza Laboral Artificial con IA para LATAM", category: "usecase" },
  "fuerza-laboral-autonoma-ia": { keyword: "Fuerza Laboral Autónoma de IA", category: "usecase" },
  "seguimiento-de-clientes-automatico": { keyword: "Seguimiento Automático de Clientes con IA", category: "usecase" },
  "trabajador-digital-24-7": { keyword: "Trabajador Digital de IA activo 24/7", category: "usecase" },
  "chatbot-empresarial": { keyword: "Chatbot de IA Empresarial Seguro", category: "usecase" },
  "automatizacion-procesos": { keyword: "Automatización de Procesos con agentes de IA", category: "usecase" },
  "agente-autonomo-de-cobranzas": { keyword: "Agente Autónomo de IA para Cobranzas", category: "usecase" },
  "agente-autonomo-de-soporte": { keyword: "Agente Autónomo de IA para Soporte", category: "usecase" },
  "automatizacion-ventas": { keyword: "Automatización de Ventas con agentes de IA", category: "usecase" },
  "agente-autonomo-de-ventas": { keyword: "Agente Autónomo de IA para Ventas", category: "usecase" },
  "automatizacion-recursos-humanos": { keyword: "Automatización de Recursos Humanos con IA", category: "usecase" },
  "asistente-para-e-commerce": { keyword: "Asistente de IA para E-commerce", category: "usecase" },
  "agentes-ia-negocios": { keyword: "Agentes de IA para Negocios y Empresas", category: "usecase" },
  "agente-autonomo-de-marketing": { keyword: "Agente Autónomo de IA para Marketing", category: "usecase" },
  "asistente-digital-cobranzas": { keyword: "Asistente Digital de IA para Cobranzas", category: "usecase" },
  "asistente-virtual-ecommerce": { keyword: "Asistente Virtual de IA para E-commerce", category: "usecase" },
  "atencion-clientes-whatsapp": { keyword: "Atención al Cliente por WhatsApp con IA", category: "usecase" },
  "agente-de-ventas-automatizado": { keyword: "Agente de Ventas de IA Automatizado", category: "usecase" },
  "asistente-virtual-empresas": { keyword: "Asistente Virtual de IA para Empresas", category: "usecase" },
  "automatizacion-clinicas-salud": { keyword: "Automatización de Clínicas y Salud con IA", category: "usecase" },
};

for (const slug of Object.keys(GENERIC_SLUGS_MAP)) {
  staticKeywords.push({
    slug,
    keyword: GENERIC_SLUGS_MAP[slug].keyword,
    category: GENERIC_SLUGS_MAP[slug].category
  });
}

// 4. Generate Geo-Targeted Pages (Cities × Keyword Patterns)
export const CITIES_MAP: Record<string, { label: string; country: string; countryCode: string }> = {
  // México
  "ciudad-de-mexico": { label: "Ciudad de México", country: "México", countryCode: "MX" },
  monterrey: { label: "Monterrey", country: "México", countryCode: "MX" },
  guadalajara: { label: "Guadalajara", country: "México", countryCode: "MX" },
  puebla: { label: "Puebla", country: "México", countryCode: "MX" },
  queretaro: { label: "Querétaro", country: "México", countryCode: "MX" },
  merida: { label: "Mérida", country: "México", countryCode: "MX" },
  cancun: { label: "Cancún", country: "México", countryCode: "MX" },
  tijuana: { label: "Tijuana", country: "México", countryCode: "MX" },
  leon: { label: "León", country: "México", countryCode: "MX" },
  // Colombia
  bogota: { label: "Bogotá", country: "Colombia", countryCode: "CO" },
  medellin: { label: "Medellín", country: "Colombia", countryCode: "CO" },
  cali: { label: "Cali", country: "Colombia", countryCode: "CO" },
  barranquilla: { label: "Barranquilla", country: "Colombia", countryCode: "CO" },
  cartagena: { label: "Cartagena", country: "Colombia", countryCode: "CO" },
  bucaramanga: { label: "Bucaramanga", country: "Colombia", countryCode: "CO" },
  // Argentina
  "buenos-aires": { label: "Buenos Aires", country: "Argentina", countryCode: "AR" },
  cordoba: { label: "Córdoba", country: "Argentina", countryCode: "AR" },
  rosario: { label: "Rosario", country: "Argentina", countryCode: "AR" },
  mendoza: { label: "Mendoza", country: "Argentina", countryCode: "AR" },
  // Chile
  santiago: { label: "Santiago", country: "Chile", countryCode: "CL" },
  valparaiso: { label: "Valparaíso", country: "Chile", countryCode: "CL" },
  concepcion: { label: "Concepción", country: "Chile", countryCode: "CL" },
  // Perú
  lima: { label: "Lima", country: "Perú", countryCode: "PE" },
  arequipa: { label: "Arequipa", country: "Perú", countryCode: "PE" },
  trujillo: { label: "Trujillo", country: "Perú", countryCode: "PE" },
  // Ecuador
  quito: { label: "Quito", country: "Ecuador", countryCode: "EC" },
  guayaquil: { label: "Guayaquil", country: "Ecuador", countryCode: "EC" },
  cuenca: { label: "Cuenca", country: "Ecuador", countryCode: "EC" },
  // Venezuela
  caracas: { label: "Caracas", country: "Venezuela", countryCode: "VE" },
  valencia: { label: "Valencia", country: "Venezuela", countryCode: "VE" },
  maracaibo: { label: "Maracaibo", country: "Venezuela", countryCode: "VE" },
  // Panamá
  panama: { label: "Panamá City", country: "Panamá", countryCode: "PA" },
  // Costa Rica
  "san-jose-cr": { label: "San José", country: "Costa Rica", countryCode: "CR" },
  // República Dominicana
  "santo-domingo": { label: "Santo Domingo", country: "República Dominicana", countryCode: "DO" },
  "santiago-rd": { label: "Santiago de los Caballeros", country: "República Dominicana", countryCode: "DO" },
  // Uruguay
  montevideo: { label: "Montevideo", country: "Uruguay", countryCode: "UY" },
  // Paraguay
  asuncion: { label: "Asunción", country: "Paraguay", countryCode: "PY" },
  // Bolivia
  "la-paz": { label: "La Paz", country: "Bolivia", countryCode: "BO" },
  "santa-cruz": { label: "Santa Cruz", country: "Bolivia", countryCode: "BO" },
  // Guatemala
  guatemala: { label: "Ciudad de Guatemala", country: "Guatemala", countryCode: "GT" },
  // Honduras
  tegucigalpa: { label: "Tegucigalpa", country: "Honduras", countryCode: "HN" },
  "san-pedro-sula": { label: "San Pedro Sula", country: "Honduras", countryCode: "HN" },
  // El Salvador
  "san-salvador": { label: "San Salvador", country: "El Salvador", countryCode: "SV" },
  // Nicaragua
  managua: { label: "Managua", country: "Nicaragua", countryCode: "NI" },
  // Puerto Rico
  "san-juan": { label: "San Juan", country: "Puerto Rico", countryCode: "PR" },
  // España
  madrid: { label: "Madrid", country: "España", countryCode: "ES" },
  barcelona: { label: "Barcelona", country: "España", countryCode: "ES" },
  sevilla: { label: "Sevilla", country: "España", countryCode: "ES" },
  malaga: { label: "Málaga", country: "España", countryCode: "ES" },
  bilbao: { label: "Bilbao", country: "España", countryCode: "ES" },
  "valencia-es": { label: "Valencia", country: "España", countryCode: "ES" },
  zaragoza: { label: "Zaragoza", country: "España", countryCode: "ES" },
  // USA (Hispanic markets)
  miami: { label: "Miami", country: "Estados Unidos", countryCode: "US" },
  houston: { label: "Houston", country: "Estados Unidos", countryCode: "US" },
  "los-angeles": { label: "Los Ángeles", country: "Estados Unidos", countryCode: "US" },
  "nueva-york": { label: "Nueva York", country: "Estados Unidos", countryCode: "US" },
  chicago: { label: "Chicago", country: "Estados Unidos", countryCode: "US" },
  dallas: { label: "Dallas", country: "Estados Unidos", countryCode: "US" },
};

export const GEO_PATTERNS: { prefix: string; suffix: string; template: (city: string, country: string) => string }[] = [
  { prefix: "fuerza-laboral-digital", suffix: "", template: (c, p) => `Fuerza Laboral Digital 24/7 en ${c}, ${p}` },
  { prefix: "agentes-ia", suffix: "", template: (c, p) => `Agentes de IA Autónomos en ${c}, ${p}` },
  { prefix: "automatizacion-empresarial", suffix: "", template: (c, p) => `Automatización Empresarial con IA en ${c}, ${p}` },
  { prefix: "empleado-digital", suffix: "", template: (c, p) => `Empleado Digital de IA 24/7 en ${c}, ${p}` },
  { prefix: "agente-ia-ventas", suffix: "", template: (c, p) => `Agente de IA para Ventas en ${c}, ${p}` },
  { prefix: "agente-ia-cobranzas", suffix: "", template: (c, p) => `Agente de IA para Cobranzas en ${c}, ${p}` },
  { prefix: "atencion-cliente-ia", suffix: "", template: (c, p) => `Atención al Cliente con IA en ${c}, ${p}` },
  { prefix: "chatbot-empresarial", suffix: "", template: (c, p) => `Chatbot Empresarial de IA en ${c}, ${p}` },
  { prefix: "automatizacion-whatsapp", suffix: "", template: (c, p) => `Automatización de WhatsApp con IA en ${c}, ${p}` },
  { prefix: "asistente-virtual-empresas", suffix: "", template: (c, p) => `Asistente Virtual de IA para Empresas en ${c}, ${p}` },
  { prefix: "agente-autonomo", suffix: "", template: (c, p) => `Agente Autónomo de IA en ${c}, ${p}` },
  { prefix: "automatizacion-pymes", suffix: "", template: (c, p) => `Automatización para PyMEs con IA en ${c}, ${p}` },
];

const CITIES_LIST = Object.keys(CITIES_MAP);

for (const pattern of GEO_PATTERNS) {
  for (const cityKey of CITIES_LIST) {
    const city = CITIES_MAP[cityKey];
    const slug = `${pattern.prefix}-${cityKey}`;
    staticKeywords.push({
      slug,
      keyword: pattern.template(city.label, city.country),
      category: "geo" as const,
    });
  }
}

export const PROGRAMMATIC_KEYWORDS = staticKeywords;

export function getProgrammaticData(slug: string): ProgrammaticPageData | null {
  let item = PROGRAMMATIC_KEYWORDS.find((k) => k.slug === slug);

  if (!item) {
    if (GENERIC_SLUGS_MAP[slug]) {
      item = {
        slug,
        keyword: GENERIC_SLUGS_MAP[slug].keyword,
        category: GENERIC_SLUGS_MAP[slug].category
      };
    }
  }

  if (!item) {
    // 1. Try matching integration: agente-ia-[tool]-[channel]
    const integrationRegex = /^agente-ia-([a-z0-9-]+)-(whatsapp|telegram|slack|teams|discord|messenger|instagram|gmail|outlook|sms|voice)$/;
    const integrationMatch = slug.match(integrationRegex);
    if (integrationMatch) {
      const toolSlug = integrationMatch[1];
      const channelSlug = integrationMatch[2];
      const capitalize = (s: string) => s.split("-").map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
      const toolLabel = TOOLS_MAP[toolSlug] || capitalize(toolSlug);
      const channelLabel = CHANNELS_MAP[channelSlug] || capitalize(channelSlug);
      
      item = {
        slug,
        keyword: `Agente de IA para ${toolLabel} en ${channelLabel}`,
        category: "integration" as const
      };
    }
    
    // 2. Try matching usecase: automatizacion-ia-[usecase]-[industry]
    const usecaseRegex = /^automatizacion-ia-([a-z0-9-]+)-([a-z0-9-]+)$/;
    const usecaseMatch = slug.match(usecaseRegex);
    if (!item && usecaseMatch) {
      const usecaseSlug = usecaseMatch[1];
      const industrySlug = usecaseMatch[2];
      const capitalize = (s: string) => s.split("-").map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
      const usecaseLabel = USECASES_MAP[usecaseSlug]?.label || capitalize(usecaseSlug);
      const industryLabel = INDUSTRIES_MAP[industrySlug] || capitalize(industrySlug);
      
      item = {
        slug,
        keyword: `Automatización con agentes de IA para ${usecaseLabel} en ${industryLabel}`,
        category: "usecase" as const
      };
    }
    
    // 3. Try matching alternative: alternativa-local-[competitor]
    const alternativeRegex = /^alternativa-local-([a-z0-9-]+)$/;
    const alternativeMatch = slug.match(alternativeRegex);
    if (!item && alternativeMatch) {
      const competitorSlug = alternativeMatch[1];
      const capitalize = (s: string) => s.split("-").map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
      const competitorLabel = COMPETITORS_MAP[competitorSlug] || capitalize(competitorSlug);
      
      item = {
        slug,
        keyword: `Alternativa local y segura a ${competitorLabel}`,
        category: "alternative" as const
      };
    }
  }

  if (!item) return null;

  const titleWord = item.keyword;

  if (item.category === "integration") {
    // Extract Tool and Channel names from the slug (e.g. agente-ia-[tool]-[channel])
    const parts = slug.replace("agente-ia-", "").split("-");
    const rawChannel = parts[parts.length - 1] || "chat";
    const rawTool = parts.slice(0, parts.length - 1).join("-") || "app";

    const capitalize = (s: string) => s.split(" ").map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
    
    const tool = TOOLS_MAP[rawTool] || capitalize(rawTool.replace("-", " "));
    const channel = CHANNELS_MAP[rawChannel] || capitalize(rawChannel.replace("-", " "));

    return {
      slug,
      keyword: item.keyword,
      category: item.category,
      badge: `Fuerza Laboral Inteligente · ${tool} + ${channel}`,
      title: `Agente de IA para ${tool} en ${channel}`,
      description: `Automatiza tus flujos de ${tool} directamente desde ${channel} con un agente autónomo 24/7. Ejecución local segura sin dependencias en la nube. By Simplex Latam.`,
      heroText: `No es un simple chatbot conversacional. Flux Agent despliega un agente autónomo que opera 24/7 de forma hermética, conectando tu espacio de ${tool} con ${channel} para ejecutar acciones reales directamente por chat.`,
      targetName: tool,
      benefitPrimary: `actualizar y consultar tu espacio de ${tool} desde ${channel} usando lenguaje natural.`,
      stats: [
        { num: "0ms", label: `Latencia agregada en consultas a ${tool}` },
        { num: "24/7", label: `Agente activo escuchando en ${channel}` },
        { num: "1/10", label: "Costo comparado con personal operativo" },
        { num: "100%", label: "Privacidad de datos con SQLite local" },
      ],
      features: [
        ["🧠", "Acciones Autónomas Reales", `El agente no solo conversa; ejecuta comandos de API en ${tool}, actualiza registros y resuelve flujos de trabajo dictados desde ${channel}.`],
        ["🔒", "Hermético y Local por Diseño", `Tus credenciales de ${tool} y logs de ${channel} se almacenan localmente en el volumen cifrado de tu agente, sin intermediarios en la nube.`],
        ["⚡", "Respuestas en Microsegundos", `Gracias a la caché inteligente de contexto en background, el agente responde inmediatamente en ${channel} sin demoras de cold-start.`],
        ["🎯", "ROI Garantizado del 800%", `Reemplaza integraciones manuales costosas y flujos propensos a errores con un empleado digital que trabaja por una fracción de costo.`],
      ],
      steps: [
        { n: "01", title: "Configuras en tu idioma", desc: `Describe en español qué deseas que haga tu agente con ${tool} (ej. "Crea una tarea si te escribo un bug por ${channel}").` },
        { n: "02", title: "Conexión hermética local", desc: `Montamos el contenedor de Flux Agent en tu VPS de $5 y le asignamos las credenciales locales de ${tool} y tu bot de ${channel}.` },
        { n: "03", title: "Ejecución autónoma 24/7", desc: `El asistente procesa mensajes en tiempo real, confirmando acciones en ${channel} y guardando históricos en SQLite.` },
      ],
      testimonials: [
        {
          quote: `Conectar nuestro ${tool} con ${channel} mediante Flux Agent nos ahorró 15 horas semanales de carga manual de tareas. El agente entiende perfectamente lenguaje natural.`,
          name: "Alejandro Ruiz",
          role: "Director de Producto · DevLatam",
          result: "↓ 15hs ahorradas/sem",
        },
        {
          quote: "La seguridad local fue la clave para elegir esta plataforma. Nuestras claves API nunca salen de nuestra infraestructura.",
          name: "Gabriela Sosa",
          role: "CTO · SecureFinance MX",
          result: "🔒 100% Hermético",
        },
      ],
      faq: [
        {
          q: `¿Es seguro conectar las credenciales de ${tool}?`,
          a: `Absolutamente. A diferencia de las plataformas tradicionales SaaS, Flux Agent es un agente autohospedable. Guarda y gestiona los tokens localmente en tu base de datos SQLite cifrada, sin pasar por servidores de terceros.`,
        },
        {
          q: `¿Cómo interactúo con el agente en ${channel}?`,
          a: `Puedes escribirle textos o enviarle notas de voz. El agente procesa la intención usando el router inteligente de modelos, ejecuta la acción en ${tool} y te responde con el resultado del proceso de inmediato.`,
        },
      ],
    };
  }

  if (item.category === "usecase") {
    // E.g. "automatizacion-ia-gestion-cobros-fintech"
    const displayNames: Record<string, { title: string; target: string; desc: string }> = {
      "automatizacion-ia-gestion-cobros-fintech": {
        title: "Agente de IA para Gestión de Cobros en Fintech",
        target: "Gestión de Cobros",
        desc: "automatizar el seguimiento de facturas vencidas, conciliaciones de cuentas y acuerdos de pago multicanal de manera 100% autónoma.",
      },
      "automatizacion-ia-conciliacion-facturas-inmobiliarias": {
        title: "Agente de IA para Conciliación de Facturas en Inmobiliarias",
        target: "Conciliación de Facturas",
        desc: "procesar facturas de alquileres, cruzar datos de recibos con cuentas bancarias y notificar saldos pendientes de forma autónoma.",
      },
      "automatizacion-ia-soporte-primer-nivel-ecommerce": {
        title: "Agente de IA para Soporte en E-commerce",
        target: "Soporte Primer Nivel",
        desc: "resolver consultas de estado de pedidos, devoluciones y stock 24/7 en WhatsApp, liberando el 80% de tickets repetitivos.",
      },
      "automatizacion-ia-transcripcion-llamadas-real-estate": {
        title: "Agente de IA para Transcripción de Llamadas en Real Estate",
        target: "Transcripción de Llamadas",
        desc: "transcribir y analizar llamadas comerciales, extrayendo leads, presupuestos y citas directo a tu CRM con ElevenLabs y Whisper.",
      },
      "automatizacion-ia-carga-leads-crm": {
        title: "Agente de IA para Carga de Leads en CRM",
        target: "Carga de Leads",
        desc: "extraer prospectos desde correos, planillas y chats, calificarlos e insertarlos al instante en tu base de datos de ventas.",
      },
      "automatizacion-ia-reportes-semanales-logistica": {
        title: "Agente de IA para Reportes Semanales en Logística",
        target: "Generación de Reportes",
        desc: "consolidar datos de envíos, costos y tiempos de entrega desde múltiples sistemas de logística para enviarlos al equipo cada lunes.",
      },
      "automatizacion-ia-monitoreo-servidores-devops": {
        title: "Agente de IA para Monitoreo de Servidores en DevOps",
        target: "Monitoreo de Servidores",
        desc: "analizar el estado de tus contenedores, resolver caídas de servicio básicas y alertar al equipo técnico solo ante incidentes críticos.",
      },
      "automatizacion-ia-generacion-imagenes-marketing": {
        title: "Agente de IA para Generación de Imágenes en Marketing",
        target: "Generación de Imágenes",
        desc: "automatizar el diseño de piezas gráficas y renders para redes sociales conectando prompts textuales con pipelines de ComfyUI.",
      },
      "automatizacion-ia-analisis-competencia-retail": {
        title: "Agente de IA para Análisis de Competencia en Retail",
        target: "Análisis de Competencia",
        desc: "escanear precios, ofertas y disponibilidad en los portales de tus competidores para ajustar tu catálogo dinámicamente cada día.",
      },
      "automatizacion-ia-control-gastos-finanzas": {
        title: "Agente de IA para Control de Gastos en Finanzas",
        target: "Control de Gastos",
        desc: "clasificar tickets, validar justificaciones de gastos corporativos y auditar presupuestos de forma totalmente digitalizada.",
      },
      "automatizacion-ia-atencion-cliente-seguros": {
        title: "Agente de IA para Atención al Cliente en Seguros",
        target: "Atención al Cliente Seguros",
        desc: "calificar siniestros iniciales, proveer estatus de pólizas y agendar peritajes médicos o vehiculares mediante WhatsApp 24/7.",
      },
      "automatizacion-ia-agenda-reuniones-consultorias": {
        title: "Agente de IA para Agenda de Reuniones en Consultorías",
        target: "Agenda de Reuniones",
        desc: "coordinar agendas complejas cruzando calendarios de consultores y clientes para fijar turnos y enviar alertas de preparación.",
      },
      "automatizacion-ia-scraping-precios-ecommerce": {
        title: "Agente de IA para Scraping de Precios en E-commerce",
        target: "Scraping de Precios",
        desc: "extraer listados de precios y stock de proveedores de forma automática mediante bots de navegación con Playwright.",
      },
      "automatizacion-ia-testing-software-qa": {
        title: "Agente de IA para Testing de Software en QA",
        target: "Testing de Software",
        desc: "ejecutar suites de prueba automáticas, analizar fallos de código y registrar bugs en Linear sin intervención manual.",
      },
      "automatizacion-ia-redaction-contenido-agencias": {
        title: "Agente de IA para Redacción de Contenido en Agencias",
        target: "Redacción de Contenido",
        desc: "generar estructuras de artículos SEO, optimizar copies y redactar borradores con tus pautas de marca y tono de voz.",
      },
    };

    const config = displayNames[slug] || {
      title: titleWord,
      target: "Operaciones",
      desc: "automatizar procesos de tu negocio usando agentes inteligentes.",
    };

    return {
      slug,
      keyword: item.keyword,
      category: item.category,
      badge: `Automatización Corporativa B2B · ${config.target}`,
      title: config.title,
      description: `Implementa un agente de IA autónomo para ${config.target}. Optimiza tiempos, reduce errores humanos y escala tu operación 24/7. By Simplex Latam.`,
      heroText: `Corta el cuello de botella en tu empresa. Flux Agent te permite desplegar un empleado digital especializado en ${config.target} que ejecuta flujos de trabajo repetitivos las 24 horas del día, integrándose con tus sistemas actuales.`,
      targetName: config.target,
      benefitPrimary: config.desc,
      stats: [
        { num: "94%", label: "De precisión en procesos de carga y cruce" },
        { num: "4x", label: "Mayor velocidad operativa en tareas" },
        { num: "14 días", label: "Para tener el flujo en producción" },
        { num: "0%", label: "De ausentismo y rotación de personal" },
      ],
      features: [
        ["🔄", "Flujos Autónomos de Extremo a Extremo", `El agente no es un simple recomendador: recibe archivos, consulta APIs, concilia datos y escribe resultados directo en tus sistemas de negocio.`],
        ["📈", "Escalabilidad Total sin Contratar", `Cuando el volumen de tu negocio se duplica, no necesitas contratar más personas: tu agente aumenta sus hilos de procesamiento de forma instantánea.`],
        ["🧠", "Criterio Técnico Ajustable", `Puedes definir reglas de negocio en Markdown para que tu asistente sepa qué hacer ante excepciones o cuándo escalar la tarea a un humano.`],
        ["🛡️", "Cumplimiento y Auditoría Interna", `Cada decisión tomada por el agente se registra con total transparencia en la base de datos SQLite con FTS5, permitiendo auditorías rápidas.`],
      ],
      steps: [
        { n: "01", title: "Mapeo del Proceso", desc: `Analizamos tu flujo manual de ${config.target} y definimos las reglas que debe seguir el agente.` },
        { n: "02", title: "Montaje y Conexiones", desc: `Conectamos el agente a tus bases de datos, CRMs o canales de chat de forma hermética.` },
        { n: "03", title: "Producción y Monitoreo", desc: `El asistente asume las tareas operativas 24/7, reportando métricas de ahorro directamente en tu panel de control SaaS.` },
      ],
      testimonials: [
        {
          quote: `Teníamos operarios dedicados exclusivamente a ${config.target}. Con el agente de Flux Agent, automatizamos el 90% de este proceso en 2 semanas, reubicando al personal en áreas estratégicas.`,
          name: "Daniela Méndez",
          role: "VP de Operaciones · Fintech Latam",
          result: "↓ 90% de trabajo manual",
        },
        {
          quote: "El retorno de inversión fue instantáneo. La latencia se redujo a cero y los errores de carga humana desaparecieron por completo.",
          name: "Santiago Paz",
          role: "Director Financiero · LogiCorp",
          result: "↑ 300% de eficiencia",
        },
      ],
      faq: [
        {
          q: `¿Qué tan difícil es integrar esto con mis sistemas?`,
          a: `Muy simple. Flux Agent se integra de manera nativa con bases de datos, APIs REST y herramientas populares por chat. No requieres modificar tus sistemas actuales.`,
        },
        {
          q: `¿Cómo maneja el agente los errores o excepciones?`,
          a: `Si el agente encuentra un caso imprevisto o un dato inconsistente, detiene el proceso de esa fila y te notifica por chat (Slack/WhatsApp) con el caso específico para que un humano lo resuelva.`,
        },
      ],
    };
  }

  if (item.category === "alternative") {
    // E.g. "alternativa-local-crewai"
    const compMap: Record<string, { name: string; advantage: string; drawback: string }> = {
      "alternativa-local-crewai": {
        name: "CrewAI",
        advantage: "Compactación inteligente de historial en SQLite y soporte robusto para SLMs locales para correr sin tokens externos.",
        drawback: "alta facturación y consumo ineficiente de tokens en ejecuciones de hilos largos.",
      },
      "alternativa-local-dify": {
        name: "Dify",
        advantage: "Código local autohospedable, con menor consumo de RAM y soporte nativo para gateways locales offline.",
        drawback: "arquitectura en la nube restrictiva y costes por volumen de interacción.",
      },
      "alternativa-local-flowise": {
        name: "Flowise",
        advantage: "Configuración declarativa basada en Markdown en lugar de interfaces visuales propensas a romperse.",
        drawback: "curva de aprendizaje compleja para automatizaciones reales y falta de soporte multicanal nativo.",
      },
      "alternativa-local-langflow": {
        name: "Langflow",
        advantage: "Orquestación ligera y despliegue simple con Docker en VPS de $5, optimizado para tareas de negocio.",
        drawback: "arquitectura de ejecución compleja enfocada puramente en experimentación y no en producción.",
      },
      "alternativa-local-zapier": {
        name: "Zapier",
        advantage: "Ejecución ilimitada de flujos en tu propio VPS con coste fijo de $5/mes, eliminando tarifas mensuales abusivas por tarea.",
        drawback: "costes exponenciales que penalizan el crecimiento de tus automatizaciones.",
      },
      "alternativa-local-make": {
        name: "Make.com",
        advantage: "Orquestaciones ilimitadas basadas en agentes inteligentes locales sin límites de operaciones ni transferencias de datos.",
        drawback: "bloqueo de cuentas por límites de transferencias de bytes y recargos por operaciones extras.",
      },
      "alternativa-local-n8n": {
        name: "n8n",
        advantage: "Licencia completamente permisiva, ejecución offline 100% privada y auto-compresión de logs en base de datos local.",
        drawback: "limitaciones de licencias comerciales y consumo de memoria excesivo en Docker.",
      },
      "alternativa-local-autogpt": {
        name: "AutoGPT",
        advantage: "Límites de bucles controlados, prevención de alucinaciones y ejecución hermética orientada a tareas específicas.",
        drawback: "bucles infinitos que consumen miles de dólares de API keys sin completar el objetivo.",
      },
      "alternativa-local-coze": {
        name: "Coze",
        advantage: "Propiedad total sobre tus agentes, privacidad absoluta de datos y almacenamiento local SQLite.",
        drawback: "pérdida de la propiedad intelectual de tus bots y almacenamiento de datos sensibles en servidores ajenos.",
      },
      "alternativa-local-voiceflow": {
        name: "Voiceflow",
        advantage: "Control total del flujo conversacional y motor de ejecución local para correr dentro de tu propia red corporativa.",
        drawback: "costes altos por asiento de editor y dependencia absoluta de sus servidores cloud.",
      },
      "alternativa-local-landbot": {
        name: "Landbot",
        advantage: "Agentes autónomos reales en lugar de árboles de decisión estáticos rígidos, con integración a modelos locales.",
        drawback: "chats limitados por planes de suscripción y flujos estáticos difíciles de mantener.",
      },
      "alternativa-local-chatbase": {
        name: "Chatbase",
        advantage: "Carga de documentos ilimitada local y procesamiento offline hermético sin entrenar modelos externos con tus datos.",
        drawback: "datos de clientes expuestos en nubes compartidas y poca flexibilidad para ejecutar acciones de API.",
      },
    };

    const comp = compMap[slug] || {
      name: slug.replace("alternativa-local-", "").toUpperCase(),
      advantage: "ejecución 100% autohospedada, privacidad absoluta y optimización radical de consumo de tokens.",
      drawback: "altos costos recurrentes de suscripción y falta de control sobre tus datos.",
    };

    return {
      slug,
      keyword: item.keyword,
      category: item.category,
      badge: `Alternativa Hermética y Local a ${comp.name}`,
      title: `Alternativa Local y Segura a ${comp.name}`,
      description: `Evita los costes abusivos de ${comp.name}. Ejecuta agentes de IA autónomos y automatizaciones ilimitadas en tu propio servidor por un coste fijo. By Simplex Latam.`,
      heroText: `Toma el control absoluto de tus procesos de automatización. Flux Agent te brinda una alternativa segura, local y económica a ${comp.name}, permitiéndote ejecutar flujos ilimitados sobre tu propia infraestructura.`,
      targetName: comp.name,
      benefitPrimary: `reemplazar los flujos de ${comp.name} por agentes locales que ejecutan tareas ilimitadas con coste de servidor plano de $5.`,
      stats: [
        { num: "90%", label: "De ahorro en consumo de tokens comparado con cloud" },
        { num: "0ms", label: "Latencia agregada con caché en background" },
        { num: "100%", label: "Propiedad de los datos y logs de auditoría" },
        { num: "$5/mes", label: "Costo plano de hosting en tu propia infraestructura" },
      ],
      features: [
        ["💸", "Costo Fijo Ilimitado", `Olvídate de pagar por cada interacción o tarea. Flux Agent corre en tu VPS, permitiendo ejecutar millones de automatizaciones sin coste adicional.`],
        ["🔒", "Privacidad Total (GDPR/HIPAA ready)", `Los logs de ejecución y los datos sensibles de tus clientes se almacenan localmente en SQLite, garantizando que ninguna API de terceros entrene con tus datos.`],
        ["🛠️", "Habilidades en Markdown", `Configura el comportamiento de tus agentes con simples instrucciones en Markdown. Sin interfaces visuales confusas que se rompen al actualizar APIs.`],
        ["🚀", "Optimizado para SLM (Modelos Locales)", `Ejecuta tu fuerza laboral digital con modelos locales ligeros (Llama 3, Phi 3) directamente en tu servidor, logrando un coste de API de $0.`],
      ],
      steps: [
        { n: "01", title: "Migración de flujos", desc: `Traducimos tus flujos visuales de ${comp.name} a instrucciones declarativas claras en Markdown (Skills).` },
        { n: "02", title: "Despliegue local express", desc: `Montamos el agente Flux Agent en tu servidor mediante Docker en menos de 10 minutos.` },
        { n: "03", title: "Automatización ilimitada", desc: `Tus agentes ejecutan tareas, gestionan bases de datos y atienden clientes sin penalizaciones por volumen.` },
      ],
      testimonials: [
        {
          quote: `Pagábamos más de $400 al mes en ${comp.name} debido al volumen de tareas de sincronización. Migramos a Flux Agent y ahora corremos los mismos procesos en un VPS de $5 de forma más rápida.`,
          name: "Mateo Iglesias",
          role: "Fundador · SaaSGrow Latam",
          result: "↓ 98% de reducción de costes",
        },
        {
          quote: `La seguridad de datos nos impedía usar ${comp.name} para facturación. Flux Agent procesa todo en nuestra red local sin fugas de información.`,
          name: "Valeria Naranjo",
          role: "Directora de Operaciones · InmoFinanzas",
          result: "✓ Datos 100% Protegidos",
        },
      ],
      faq: [
        {
          q: `¿Por qué es más económico que ${comp.name}?`,
          a: `Porque no cobramos por tarea ni por volumen de datos. Pagas una licencia fija de software (o usas la versión comunitaria local) y ejecutas todo sobre tu propio servidor VPS o computadora.`,
        },
        {
          q: `¿Qué modelos de IA puedo conectar?`,
          a: `Puedes conectar cualquier proveedor cloud (OpenAI, Anthropic, Gemini, DeepSeek) con tus propias claves, o utilizar modelos de código abierto locales corriendo en tu propio hardware sin costo de tokens.`,
        },
      ],
    };
  }
  // 4. Try matching geo: {pattern-prefix}-{cityKey}
  for (const pattern of GEO_PATTERNS) {
    for (const cityKey of CITIES_LIST) {
      if (slug === `${pattern.prefix}-${cityKey}`) {
        const city = CITIES_MAP[cityKey];
        const kw = pattern.template(city.label, city.country);
        return {
          slug, keyword: kw, category: "geo",
          badge: `📍 ${city.label}, ${city.country}`,
          title: kw,
          description: `Implementa ${kw.toLowerCase()} con Flux Agent. Agentes que operan 24/7 en tu infraestructura local, sin depender de APIs externas costosas.`,
          heroText: `Las empresas de ${city.label} ya están operando con fuerza laboral digital autónoma. Flux Agent despliega agentes de IA que ejecutan tareas reales sobre tu propia infraestructura, con datos 100% protegidos en ${city.country}.`,
          targetName: city.label,
          benefitPrimary: `operar de forma autónoma en ${city.label}`,
          stats: [
            { num: "24/7", label: `Agentes activos en ${city.label}` },
            { num: "14", label: "Días de implementación" },
            { num: "90%", label: "Ahorro vs contratar personal" },
            { num: "0", label: "APIs externas requeridas" },
          ],
          features: [
            ["🏢", `Operación local en ${city.label}`, `Tu agente corre sobre tu infraestructura en ${city.country}. Datos protegidos bajo legislación local.`],
            ["⚡", "Ejecución 24/7 sin descanso", "El agente trabaja mientras tu equipo descansa. Atención continua a clientes y operaciones."],
            ["🔒", "Datos 100% en tu servidor", `Sin enviar información sensible a terceros. Cumple con regulaciones de ${city.country}.`],
            ["🤖", "IA adaptada a tu negocio", `Entrenada con el contexto de tu empresa en ${city.label}. Aprende y mejora con cada interacción.`],
          ],
          steps: [
            { n: "01", title: "Consulta técnica gratuita", desc: `Analizamos las necesidades de automatización de tu negocio en ${city.label} y diseñamos un plan de implementación.` },
            { n: "02", title: "Despliegue en tu servidor", desc: `Instalamos Flux Agent en tu VPS o servidor local en ${city.country}. Sin dependencias de nube ni costos de tokens.` },
            { n: "03", title: "Agente productivo en 14 días", desc: `Tu agente comienza a operar con integraciones configuradas y listo para escalar en ${city.label}.` },
          ],
          testimonials: [
            { quote: `Desde que implementamos Flux Agent en nuestra operación de ${city.label}, redujimos costos operativos en un 60%. El agente gestiona cobros y atención 24/7.`, name: "Director de Operaciones", role: `Empresa de tecnología · ${city.label}`, result: "✓ -60% costos operativos" },
            { quote: `La privacidad era clave para nosotros. Flux Agent corre en nuestro propio servidor y cumple con toda la regulación de ${city.country}.`, name: "CTO", role: `Fintech · ${city.label}`, result: "✓ 100% datos protegidos" },
          ],
          faq: [
            { q: `¿Flux Agent opera desde ${city.label}?`, a: `Flux Agent se instala en tu propio servidor (VPS o local) en ${city.label} o donde prefieras. No dependemos de infraestructura centralizada — tu agente corre donde tú decides.` },
            { q: `¿Cumple con las regulaciones de ${city.country}?`, a: `Sí. Al operar 100% sobre tu infraestructura local, los datos nunca salen de tu control. Esto facilita el cumplimiento de regulaciones de protección de datos vigentes en ${city.country}.` },
            { q: "¿Cuánto tarda la implementación?", a: "El despliegue estándar toma 14 días. Incluye instalación, configuración de integraciones, entrenamiento del agente y puesta en producción con garantía de 60 días." },
          ],
        };
      }
    }
  }

  return null;
}

/** Returns 6 related pages for internal linking, mixing same-category and cross-category pages */
export function getRelatedPages(currentSlug: string, count = 6): { slug: string; keyword: string; category: string }[] {
  const current = PROGRAMMATIC_KEYWORDS.find(k => k.slug === currentSlug);
  if (!current) return [];

  const parts = currentSlug.split("-");
  
  // Score each page by relevance
  const scored = PROGRAMMATIC_KEYWORDS
    .filter(k => k.slug !== currentSlug)
    .map(k => {
      let score = 0;
      // Same category = base relevance
      if (k.category === current.category) score += 2;
      // Shared slug segments = strong signal
      const otherParts = k.slug.split("-");
      for (const part of parts) {
        if (part.length > 3 && otherParts.includes(part)) score += 3;
      }
      return { ...k, score };
    })
    .filter(k => k.score > 0)
    .sort((a, b) => b.score - a.score);

  // Take top matches but ensure diversity: max 2 from same category
  const result: { slug: string; keyword: string; category: string }[] = [];
  const catCounts: Record<string, number> = {};

  for (const item of scored) {
    if (result.length >= count) break;
    const cc = catCounts[item.category] || 0;
    if (cc >= 3) continue; // max 3 per category for diversity
    result.push({ slug: item.slug, keyword: item.keyword, category: item.category });
    catCounts[item.category] = cc + 1;
  }

  // If we still need more, fill from other categories
  if (result.length < count) {
    const remaining = PROGRAMMATIC_KEYWORDS
      .filter(k => k.slug !== currentSlug && !result.find(r => r.slug === k.slug))
      .slice(0, count - result.length);
    result.push(...remaining.map(r => ({ slug: r.slug, keyword: r.keyword, category: r.category })));
  }

  return result.slice(0, count);
}
