export default {
  title: "Tools",
  subtitle:
    "Enable or disable the toolsets your agent can use during conversations",
  web: {
    label: "Web Search",
    description: "Search the web and extract content from URLs",
  },
  browser: {
    label: "Browser",
    description: "Navigate, click, type, and interact with web pages",
  },
  terminal: {
    label: "Terminal",
    description: "Execute shell commands and scripts",
  },
  file: {
    label: "File Operations",
    description: "Read, write, search, and manage files",
  },
  code_execution: {
    label: "Code Execution",
    description: "Execute Python and shell code directly",
  },
  vision: { label: "Vision", description: "Analyze images and visual content" },
  image_gen: {
    label: "Image Generation",
    description: "Generate images with DALL-E and other models",
  },
  tts: { label: "Text-to-Speech", description: "Convert text to spoken audio" },
  skills: {
    label: "Skills",
    description: "Create, manage, and execute reusable skills",
  },
  memory: {
    label: "Memory",
    description: "Store and recall persistent knowledge",
  },
  session_search: {
    label: "Session Search",
    description: "Search across past conversations",
  },
  clarify: {
    label: "Clarifying Questions",
    description: "Ask the user for clarification when needed",
  },
  delegation: {
    label: "Delegation",
    description: "Spawn sub-agents for parallel tasks",
  },
  cronjob: {
    label: "Cron Jobs",
    description: "Create and manage scheduled tasks",
  },
  moa: {
    label: "Mixture of Agents",
    description: "Coordinate multiple AI models together",
  },
  todo: {
    label: "Task Planning",
    description: "Create and manage to-do lists for complex tasks",
  },
  cli_anything: {
    label: "CLI Anything",
    description: "Generates CLI wrappers to automate desktop applications",
  },
  scrapling: {
    label: "Scrapling Web Fetcher",
    description: "Advanced stealth web fetching capabilities",
  },
  ecommerce: {
    label: "E-commerce",
    description:
      "Manage Shopify, WooCommerce, and PrestaShop products and orders",
  },
  whatsapp_bot: {
    label: "WhatsApp Bot Builder",
    description:
      "Create AI-powered WhatsApp customer service bots for businesses",
  },
  smtp_client: {
    label: "SMTP & IMAP Mail Client",
    description:
      "Connect and automate sending, receiving, and responding to emails through SMTP/IMAP",
  },
  mcpServers: "MCP Servers",
  mcpDescription:
    "Model Context Protocol servers configured in config.yaml. Manage via <code>flux-agent mcp add/remove</code> in the terminal.",
  http: "HTTP",
  stdio: "stdio",
  disabled: "disabled",
} as const;
