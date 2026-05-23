/**
 * OmniWorker SaaS — Landing Page Content
 * Frameworks: PAS (Problem-Agitation-Solution) + AIDA (Attention-Interest-Desire-Action)
 * Voice: Professional, direct, confident. Zero fluff. Every word earns its place.
 * Language: Neutral Spanish (LATAM-friendly, no regional slang)
 */

// ─────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────

interface NavLink {
  label: string;
  href: string;
}

interface NavCTA {
  primary: string;
  secondary: string;
}

interface HeroStat {
  value: string;
  label: string;
}

interface ProblemStat {
  value: number;
  prefix?: string;
  suffix: string;
  text: string;
}

interface Feature {
  icon: string;
  title: string;
  description: string;
  benefit: string;
}

interface Step {
  number: string;
  title: string;
  description: string;
}

interface StatsItem {
  value: number;
  suffix: string;
  prefix?: string;
  label: string;
}

interface EnterpriseFeature {
  title: string;
  description: string;
}

interface Testimonial {
  quote: string;
  author: string;
  role: string;
  company: string;
  metric: string;
}

interface PricingTier {
  name: string;
  price: string;
  description: string;
  features: string[];
  cta: string;
  highlighted: boolean;
}

interface FAQItem {
  question: string;
  answer: string;
}

interface FooterColumn {
  title: string;
  links: string[];
}

// ─────────────────────────────────────────────────────────────
// Site Config
// ─────────────────────────────────────────────────────────────

export const SITE_CONFIG: {
  title: string;
  description: string;
} = {
  title: "OmniWorker — Agentes de IA que ejecutan, no solo conversan",
  description:
    "OmniWorker es la plataforma de agentes autónomos de IA para operaciones empresariales. Se ejecuta localmente para máxima privacidad, con gateway en la nube opcional. Automatiza documentos, datos, comunicaciones y flujos de trabajo sin equipo técnico.",
};

// ─────────────────────────────────────────────────────────────
// Navigation
// ─────────────────────────────────────────────────────────────

export const NAVIGATION: {
  links: NavLink[];
  cta: NavCTA;
} = {
  links: [
    { label: "Producto", href: "#solution" },
    { label: "Cómo funciona", href: "#how-it-works" },
    { label: "Casos de uso", href: "#enterprise" },
    { label: "Precios", href: "#pricing" },
    { label: "Preguntas frecuentes", href: "#faq" },
  ],
  cta: {
    primary: "Desplegar mi primer agente",
    secondary: "Ver cómo funciona",
  },
};

// ─────────────────────────────────────────────────────────────
// Hero (AIDA Pattern)
// ─────────────────────────────────────────────────────────────

export const HERO: {
  preHeadline: string;
  headline: string;
  subheadline: string;
  cta: NavCTA;
  stats: HeroStat[];
} = {
  preHeadline: "Plataforma de agentes autónomos de IA — ya disponible",
  headline:
    "Elimina 40 horas semanales de trabajo operativo sin contratar a nadie",
  subheadline:
    "OmniWorker despliega agentes de IA que procesan documentos, sincronizan datos, responden mensajes y ejecutan flujos de trabajo 24/7. Se ejecuta en tu infraestructura. Sin llamadas de ventas. Sin tarjeta de crédito.",
  cta: {
    primary: "Comenzar gratis — desplegar en 60 segundos",
    secondary: "Ver demo en vivo",
  },
  stats: [
    { value: "10,000+", label: "agentes activos" },
    { value: "2.4M", label: "tareas ejecutadas este mes" },
    { value: "99.97%", label: "uptime promedio" },
  ],
};

// ─────────────────────────────────────────────────────────────
// Logos / Social Proof
// ─────────────────────────────────────────────────────────────

export const LOGOS: {
  title: string;
  partners: string[];
} = {
  title: "Equipos de operaciones de todo tamaño ya automatizan con OmniWorker",
  partners: [
    "Notion",
    "Slack",
    "Stripe",
    "Airtable",
    "Asana",
    "HubSpot",
    "Salesforce",
    "Google Workspace",
  ],
};

// ─────────────────────────────────────────────────────────────
// Problem (PAS Pattern)
// ─────────────────────────────────────────────────────────────

export const PROBLEM: {
  label: string;
  headline: string;
  stats: ProblemStat[];
} = {
  label: "El problema",
  headline:
    "Tu equipo pierde 23 horas semanales en tareas que un agente de IA ejecutaría en segundos",
  stats: [
    {
      value: 73,
      suffix: "%",
      text: "del tiempo operativo se gasta en tareas repetitivas que no generan ingresos",
    },
    {
      value: 4200,
      prefix: "$",
      suffix: "",
      text: "es el costo mensual promedio de contratar un especialista operativo en Norteamérica",
    },
    {
      value: 0,
      suffix: " hrs",
      text: "de automatización real logran la mayoría de las empresas con chatbots genéricos",
    },
  ],
};

// ─────────────────────────────────────────────────────────────
// Solution
// ─────────────────────────────────────────────────────────────

export const SOLUTION: {
  label: string;
  headline: string;
  subheadline: string;
  features: Feature[];
} = {
  label: "La solución",
  headline:
    "Agentes que ejecutan flujos de trabajo completos, no solo responden preguntas",
  subheadline:
    "OmniWorker combina modelos de lenguaje con herramientas empresariales reales. Tus agentes leen documentos, actualizan bases de datos, envían mensajes y toman decisiones operativas sin intervención humana.",
  features: [
    {
      icon: "document",
      title: "Procesamiento de documentos inteligente",
      description:
        "Extrae datos de facturas, contratos, recibos y formularios con precisión humana. Soporta PDFs escaneados, imágenes y archivos estructurados.",
      benefit:
        "Reduce el tiempo de entrada de datos de 6 horas a 4 minutos por lote",
    },
    {
      icon: "sync",
      title: "Sincronización entre sistemas",
      description:
        "Conecta tus herramientas existentes — CRM, ERP, hojas de cálculo, bases de datos — y mantén los datos actualizados automáticamente en todos los canales.",
      benefit:
        "Elimina errores de doble entrada y asegura que todos los equipos vean la misma información en tiempo real",
    },
    {
      icon: "message",
      title: "Respuesta automática multicanal",
      description:
        "Atiende correos, mensajes de Slack, tickets de soporte y consultas de clientes con contexto completo de tu negocio y políticas internas.",
      benefit:
        "Responde en menos de 30 segundos lo que antes tomaba 4 horas de espera humana",
    },
    {
      icon: "workflow",
      title: "Flujos de trabajo autónomos",
      description:
        "Diseña flujos con condiciones, aprobaciones y acciones encadenadas. Los agentes ejecutan cada paso, solicitan autorización cuando es necesario y aprenden de las correcciones.",
      benefit:
        "Opera procesos completos de onboarding, facturación o cumplimiento sin supervisión constante",
    },
  ],
};

// ─────────────────────────────────────────────────────────────
// How It Works
// ─────────────────────────────────────────────────────────────

export const HOW_IT_WORKS: {
  label: string;
  headline: string;
  steps: Step[];
  cta: string;
} = {
  label: "Cómo funciona",
  headline: "De la idea a la automatización en tres pasos",
  steps: [
    {
      number: "01",
      title: "Conecta tus herramientas",
      description:
        "Integra tus sistemas existentes en minutos. OmniWorker se conecta con 200+ aplicaciones empresariales sin código ni configuraciones complejas. Tus datos permanecen en tu infraestructura.",
    },
    {
      number: "02",
      title: "Describe el trabajo a automatizar",
      description:
        "Explica en lenguaje natural qué tarea quieres que ejecute el agente. No necesitas plantillas ni flujos predefinidos. El sistema comprende el contexto y genera el flujo de trabajo automáticamente.",
    },
    {
      number: "03",
      title: "El agente opera 24/7",
      description:
        "Una vez activado, el agente ejecuta la tarea de forma autónoma, maneja excepciones, solicita ayuda cuando es necesario y mejora con cada iteración. Tú recibes notificaciones solo cuando importa.",
    },
  ],
  cta: "Desplegar mi primer agente ahora",
};

// ─────────────────────────────────────────────────────────────
// Stats
// ─────────────────────────────────────────────────────────────

export const STATS: {
  items: StatsItem[];
} = {
  items: [
    {
      value: 24,
      suffix: "/7",
      label: "Operación continua sin interrupciones",
    },
    {
      value: 800,
      suffix: "%",
      prefix: "+",
      label: "Retorno de inversión promedio en el primer trimestre",
    },
    {
      value: 100,
      suffix: "%",
      label: "De los datos permanecen en tu infraestructura",
    },
    {
      value: 60,
      suffix: "s",
      prefix: "<",
      label: "Para desplegar tu primer agente funcional",
    },
  ],
};

// ─────────────────────────────────────────────────────────────
// Enterprise
// ─────────────────────────────────────────────────────────────

export const ENTERPRISE: {
  label: string;
  headline: string;
  subheadline: string;
  cta: string;
  features: EnterpriseFeature[];
} = {
  label: "Para empresas",
  headline:
    "Seguridad, escalabilidad y cumplimiento que exigen las operaciones a gran escala",
  subheadline:
    "OmniWorker Enterprise incluye despliegue on-premise, auditoría completa de acciones, control de acceso basado en roles y soporte con SLA garantizado. Mantén el control total mientras escalas.",
  cta: "Hablar con el equipo de ventas",
  features: [
    {
      title: "Despliegue on-premise o VPC dedicada",
      description:
        "Tus agentes se ejecutan en tu nube privada o centros de datos propios. Cero datos salen de tu perímetro de seguridad. Cumple con SOC 2, GDPR, HIPAA y regulaciones sectoriales.",
    },
    {
      title: "Auditoría completa y trazabilidad",
      description:
        "Cada decisión, cada acción y cada acceso queda registrado en un trail de auditoría inmutable. Genera reportes de cumplimiento automáticamente para revisiones regulatorias.",
    },
    {
      title: "Gestión centralizada de agentes",
      description:
        "Administra cientos de agentes desde un único panel. Asigna permisos granularmente, monitorea rendimiento en tiempo real y escala recursos automáticamente según la demanda operativa.",
    },
  ],
};

// ─────────────────────────────────────────────────────────────
// Testimonials
// ─────────────────────────────────────────────────────────────

export const TESTIMONIALS: {
  label: string;
  headline: string;
  items: Testimonial[];
} = {
  label: "Resultados reales",
  headline: "Lo que logran los equipos que operan con agentes autónomos",
  items: [
    {
      quote:
        "Antes teníamos a dos personas dedicadas exclusivamente a procesar facturas y conciliar pagos. Ahora el agente de OmniWorker maneja el 94% del volumen sin intervención. Revisamos solo las excepciones.",
      author: "Mariana Cortés",
      role: "Directora de Operaciones",
      company: "Finova Logística",
      metric: "Redujo costos operativos $12,400/mes",
    },
    {
      quote:
        "Implementamos el agente de soporte técnico en una semana. Ahora resuelve el 78% de los tickets de primer nivel en menos de dos minutos. Nuestro equipo humano se enfoca en casos complejos donde realmente aportan valor.",
      author: "Diego Ramírez",
      role: "CTO",
      company: "Nexora Cloud",
      metric: "Tiempo de respuesta reducido 89%",
    },
    {
      quote:
        "El agente de onboarding integra datos de 7 sistemas diferentes automáticamente. Lo que antes tomaba 3 días hábiles por empleado nuevo, ahora se completa en 4 horas. Zero errores de configuración desde que lo activamos.",
      author: "Carolina Vargas",
      role: "VP de People Operations",
      company: "GrowthLab",
      metric: "Ahorra 340 horas mensuales de RRHH",
    },
  ],
};

// ─────────────────────────────────────────────────────────────
// Pricing Teaser
// ─────────────────────────────────────────────────────────────

export const PRICING_TEASER: {
  label: string;
  headline: string;
  tiers: PricingTier[];
} = {
  label: "Precios",
  headline: "Empieza gratis. Escala cuando tu operación crezca.",
  tiers: [
    {
      name: "Gratis",
      price: "$0",
      description: "Para individuos y equipos pequeños que quieren automatizar tareas personales",
      features: [
        "1 agente activo",
        "100 tareas mensuales",
        "Integraciones esenciales",
        "Soporte por comunidad",
        "Ejecución local incluida",
      ],
      cta: "Crear cuenta gratis",
      highlighted: false,
    },
    {
      name: "Pro",
      price: "$49",
      description: "Para equipos de operaciones que necesitan automatización real sin fricciones",
      features: [
        "10 agentes activos",
        "Tareas ilimitadas",
        "Todas las integraciones",
        "Procesamiento de documentos OCR",
        "Flujos de trabajo con condiciones",
        "Soporte prioritario por email",
        "Gateway en la nube incluido",
      ],
      cta: "Comenzar prueba de 14 días",
      highlighted: true,
    },
    {
      name: "Enterprise",
      price: "Personalizado",
      description: "Para organizaciones que requieren control total, seguridad avanzada y soporte dedicado",
      features: [
        "Agentes ilimitados",
        "Despliegue on-premise o VPC",
        "Auditoría completa y SSO",
        "SLA de uptime 99.99%",
        "Soporte dedicado 24/7",
        "Onboarding personalizado",
        "Precio por volumen",
      ],
      cta: "Hablar con ventas",
      highlighted: false,
    },
  ],
};

// ─────────────────────────────────────────────────────────────
// FAQ
// ─────────────────────────────────────────────────────────────

export const FAQ: {
  label: string;
  headline: string;
  items: FAQItem[];
} = {
  label: "Preguntas frecuentes",
  headline: "Todo lo que necesitas saber antes de desplegar tu primer agente",
  items: [
    {
      question: "¿OmniWorker es un chatbot? ¿En qué se diferencia?",
      answer:
        "No. Los chatbots responden preguntas. Los agentes de OmniWorker ejecutan acciones: leen documentos, actualizan bases de datos, envían mensajes, aprueban transacciones y completan flujos de trabajo completos sin intervención humana. Si un chatbot es un asistente conversacional, un agente de OmniWorker es un colaborador operativo que trabaja 24/7.",
    },
    {
      question: "¿Mis datos están seguros? ¿Dónde se procesan?",
      answer:
        "OmniWorker se ejecuta localmente por defecto. Tus datos nunca salen de tu infraestructura a menos que actives el gateway en la nube opcional. Incluso en ese caso, usamos cifrado end-to-end, no almacenamos datos de entrenamiento y cumplimos con SOC 2, GDPR y estándares sectoriales. En el plan Enterprise, puedes desplegar en tu VPC dedicada o centros de datos propios.",
    },
    {
      question: "¿Necesito un equipo técnico para implementarlo?",
      answer:
        "No. El 94% de nuestros usuarios configuran su primer agente sin escribir una sola línea de código. Describes la tarea en lenguaje natural, conectas tus herramientas mediante interfaces visuales y el sistema genera el flujo automáticamente. Para casos complejos, ofrecemos onboarding personalizado en el plan Enterprise.",
    },
    {
      question: "¿Con qué herramientas se integra OmniWorker?",
      answer:
        "OmniWorker se conecta con más de 200 aplicaciones empresariales incluyendo Salesforce, HubSpot, Slack, Notion, Airtable, Google Workspace, Microsoft 365, Stripe, QuickBooks, SAP, Shopify y bases de datos SQL/NoSQL. Además, nuestra API permite integraciones personalizadas para sistemas propietarios.",
    },
    {
      question: "¿Qué pasa si el agente comete un error?",
      answer:
        "Los agentes operan con reglas de confianza configurables. Para transacciones críticas, puedes exigir aprobación humana antes de la ejecución. Además, cada acción queda registrada en un trail de auditoría completo que puedes revisar, revertir o ajustar. El sistema aprende de las correcciones para reducir errores futuros.",
    },
    {
      question: "¿Puedo cambiar de plan o cancelar en cualquier momento?",
      answer:
        "Sí. No hay contratos de permanencia ni penalizaciones por cancelación. Puedes cambiar de plan, escalar agentes o pausar tu suscripción desde el panel de control. En el plan Enterprise, ofrecemos acuerdos anuales con descuentos por volumen si prefieres predecibilidad presupuestaria.",
    },
    {
      question: "¿Cuánto tiempo toma ver resultados?",
      answer:
        "La mayoría de los equipos despliegan su primer agente funcional en menos de 60 minutos y comienzan a ver automatización real en las primeras 24 horas. Los procesos complejos que involucran múltiples sistemas suelen estar completamente automatizados dentro de la primera semana. Ofrecemos un período de prueba de 14 días en el plan Pro para que valides el retorno antes de comprometerte.",
    },
  ],
};

// ─────────────────────────────────────────────────────────────
// Final CTA
// ─────────────────────────────────────────────────────────────

export const FINAL_CTA: {
  headline: string;
  subheadline: string;
  cta: string;
  urgency: string;
} = {
  headline:
    "Tu competencia ya está automatizando. Cada día que esperas cuesta dinero real.",
  subheadline:
    "Únete a más de 10,000 equipos que operan con agentes autónomos. Despliega tu primer agente en menos de 60 segundos. Sin tarjeta de crédito. Sin llamadas de ventas.",
  cta: "Comenzar gratis — desplegar mi primer agente",
  urgency:
    "Los primeros 500 usuarios Pro este mes reciben onboarding personalizado sin costo adicional",
};

// ─────────────────────────────────────────────────────────────
// Footer
// ─────────────────────────────────────────────────────────────

export const FOOTER: {
  tagline: string;
  columns: FooterColumn[];
  copyright: string;
} = {
  tagline: "OmniWorker — Agentes que ejecutan, no solo conversan.",
  columns: [
    {
      title: "Producto",
      links: [
        "Agentes autónomos",
        "Procesamiento de documentos",
        "Integraciones",
        "Seguridad y privacidad",
        "Roadmap",
        "Changelog",
      ],
    },
    {
      title: "Casos de uso",
      links: [
        "Automatización de finanzas",
        "Atención al cliente",
        "Onboarding de empleados",
        "Gestión de proveedores",
        "Cumplimiento regulatorio",
        "Operaciones de e-commerce",
      ],
    },
    {
      title: "Recursos",
      links: [
        "Documentación",
        "API Reference",
        "Blog",
        "Webinars",
        "Comunidad Discord",
        "Status page",
      ],
    },
    {
      title: "Compañía",
      links: [
        "Acerca de nosotros",
        "Carreras",
        "Prensa",
        "Contacto",
        "Términos de servicio",
        "Política de privacidad",
      ],
    },
  ],
  copyright: "© 2026 OmniWorker. Todos los derechos reservados.",
};
