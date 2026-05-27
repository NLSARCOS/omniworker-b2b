import type { AppLocale } from "../shared/i18n/types";

interface ElectronAPI {
  process: {
    platform: NodeJS.Platform;
    versions: {
      chrome: string;
      electron: string;
      node: string;
    };
  };
}

interface InstallStatus {
  installed: boolean;
  configured: boolean;
  hasApiKey: boolean;
  verified: boolean;
}

interface InstallProgress {
  step: number;
  totalSteps: number;
  title: string;
  detail: string;
  log: string;
}

interface KanbanTask {
  id: string;
  title: string;
  body: string | null;
  assignee: string | null;
  status: string;
  priority: number;
  tenant: string | null;
  workspace_kind: string;
  workspace_path: string | null;
  created_by: string | null;
  created_at: number | null;
  started_at: number | null;
  completed_at: number | null;
  result: string | null;
  skills: string[];
  max_retries: number | null;
}

interface KanbanBoard {
  slug: string;
  name: string;
  description?: string | null;
  icon?: string | null;
  color?: string | null;
  is_current: boolean;
  archived?: boolean;
  total: number;
  counts: Record<string, number>;
  db_path?: string;
}

interface KanbanComment {
  id: number;
  task_id: string;
  author: string | null;
  body: string;
  created_at: number;
}

interface KanbanEvent {
  id: number;
  task_id: string;
  kind: string;
  payload: Record<string, unknown> | null;
  created_at: number;
  run_id: number | null;
}

interface KanbanRun {
  id: number;
  task_id: string;
  profile: string | null;
  status: string | null;
  outcome: string | null;
  summary: string | null;
  error: string | null;
  started_at: number | null;
  ended_at: number | null;
  last_heartbeat_at: number | null;
}

interface KanbanTaskDetail {
  task: KanbanTask;
  comments: KanbanComment[];
  events: KanbanEvent[];
  parents: string[];
  children: string[];
  runs: KanbanRun[];
  latest_summary: string | null;
}

interface KanbanCreateTaskInput {
  title: string;
  body?: string;
  assignee?: string;
  priority?: number;
  tenant?: string;
  workspace?: string;
  triage?: boolean;
  skills?: string[];
  maxRetries?: number;
}

interface OmniWorkerAPI {
  // Installation
  checkInstall: () => Promise<InstallStatus>;
  verifyInstall: () => Promise<boolean>;
  startInstall: (
    authToken?: string,
  ) => Promise<{ success: boolean; error?: string }>;
  startSlmDownload: (
    authToken?: string,
  ) => Promise<{ success: boolean; error?: string }>;
  downloadAndInstallEngram: () => Promise<{ success: boolean; error?: string }>;
  onInstallProgress: (
    callback: (progress: InstallProgress) => void,
  ) => () => void;

  // OmniWorker engine info
  getOmniWorkerVersion: () => Promise<string | null>;
  refreshOmniWorkerVersion: () => Promise<string | null>;
  runOmniWorkerDoctor: () => Promise<string>;
  runOmniWorkerUpdate: () => Promise<{ success: boolean; error?: string }>;

  // OmniWorker migration
  checkOmniWorker: () => Promise<{ found: boolean; path: string | null }>;
  runClawMigrate: () => Promise<{ success: boolean; error?: string }>;

  getLocale: () => Promise<AppLocale>;
  setLocale: (locale: AppLocale) => Promise<AppLocale>;

  // Configuration (profile-aware)
  getEnv: (profile?: string) => Promise<Record<string, string>>;
  setEnv: (key: string, value: string, profile?: string) => Promise<boolean>;
  getConfig: (key: string, profile?: string) => Promise<string | null>;
  setConfig: (key: string, value: string, profile?: string) => Promise<boolean>;
  getOmniWorkerHome: (profile?: string) => Promise<string>;
  getModelConfig: (
    profile?: string,
  ) => Promise<{ provider: string; model: string; baseUrl: string }>;
  setModelConfig: (
    provider: string,
    model: string,
    baseUrl: string,
    profile?: string,
  ) => Promise<boolean>;

  // Connection mode (local / remote / ssh)
  isRemoteMode: () => Promise<boolean>;
  isRemoteOnlyMode: () => Promise<boolean>;
  getDeviceFingerprint: () => Promise<string>;
  getDeviceName: () => Promise<string>;
  getConnectionConfig: () => Promise<{
    mode: "local" | "remote" | "ssh";
    remoteUrl: string;
    apiKey: string;
    ssh: {
      host: string;
      port: number;
      username: string;
      keyPath: string;
      remotePort: number;
      localPort: number;
    };
  }>;
  setConnectionConfig: (
    mode: "local" | "remote" | "ssh",
    remoteUrl: string,
    apiKey?: string,
  ) => Promise<boolean>;
  setSshConfig: (
    host: string,
    port: number,
    username: string,
    keyPath: string,
    remotePort: number,
    localPort: number,
  ) => Promise<boolean>;
  testRemoteConnection: (url: string, apiKey?: string) => Promise<boolean>;
  testSshConnection: (
    host: string,
    port: number,
    username: string,
    keyPath: string,
    remotePort: number,
  ) => Promise<boolean>;
  isSshTunnelActive: () => Promise<boolean>;
  startSshTunnel: () => Promise<boolean>;
  stopSshTunnel: () => Promise<boolean>;

  // Chat
  sendMessage: (
    message: string,
    profile?: string,
    resumeSessionId?: string,
    history?: Array<{ role: string; content: string }>,
  ) => Promise<{ response: string; sessionId?: string }>;
  abortChat: () => Promise<void>;
  onChatChunk: (callback: (chunk: string) => void) => () => void;
  onChatDone: (callback: (sessionId?: string) => void) => () => void;
  onChatToolProgress: (callback: (tool: string) => void) => () => void;
  onChatUsage: (
    callback: (usage: {
      promptTokens: number;
      completionTokens: number;
      totalTokens: number;
      cost?: number;
      rateLimitRemaining?: number;
      rateLimitReset?: number;
    }) => void,
  ) => () => void;
  onChatError: (callback: (error: string) => void) => () => void;

  // Gateway
  startGateway: () => Promise<boolean>;
  stopGateway: () => Promise<boolean>;
  gatewayStatus: () => Promise<boolean>;

  // Smart Router (local SLM ↔ cloud routing)
  startSmartRouter: () => Promise<boolean>;
  stopSmartRouter: () => Promise<boolean>;
  smartRouterStatus: () => Promise<boolean>;
  getSmartRouterUrl: (cloudFallback: string) => Promise<string>;

  // Platform toggles
  getPlatformEnabled: (profile?: string) => Promise<Record<string, boolean>>;
  setPlatformEnabled: (
    platform: string,
    enabled: boolean,
    profile?: string,
  ) => Promise<boolean>;

  // Sessions
  listSessions: (
    limit?: number,
    offset?: number,
  ) => Promise<
    Array<{
      id: string;
      source: string;
      startedAt: number;
      endedAt: number | null;
      messageCount: number;
      model: string;
      title: string | null;
      preview: string;
    }>
  >;
  getSessionMessages: (sessionId: string) => Promise<
    Array<{
      id: number;
      role: "user" | "assistant";
      content: string;
      timestamp: number;
    }>
  >;

  // Profiles
  listProfiles: () => Promise<
    Array<{
      name: string;
      path: string;
      isDefault: boolean;
      isActive: boolean;
      model: string;
      provider: string;
      hasEnv: boolean;
      hasSoul: boolean;
      skillCount: number;
      gatewayRunning: boolean;
    }>
  >;
  createProfile: (
    name: string,
    clone: boolean,
    options?: { soulPrompt?: string; disabledToolsets?: string[] },
  ) => Promise<{ success: boolean; error?: string }>;
  deleteProfile: (
    name: string,
  ) => Promise<{ success: boolean; error?: string }>;
  setActiveProfile: (name: string) => Promise<boolean>;

  // Memory
  readMemory: (profile?: string) => Promise<{
    memory: {
      content: string;
      exists: boolean;
      lastModified: number | null;
      entries: Array<{ index: number; content: string }>;
      charCount: number;
      charLimit: number;
    };
    user: {
      content: string;
      exists: boolean;
      lastModified: number | null;
      charCount: number;
      charLimit: number;
    };
    stats: { totalSessions: number; totalMessages: number };
  }>;

  addMemoryEntry: (
    content: string,
    profile?: string,
  ) => Promise<{ success: boolean; error?: string }>;
  updateMemoryEntry: (
    index: number,
    content: string,
    profile?: string,
  ) => Promise<{ success: boolean; error?: string }>;
  removeMemoryEntry: (index: number, profile?: string) => Promise<boolean>;
  writeUserProfile: (
    content: string,
    profile?: string,
  ) => Promise<{ success: boolean; error?: string }>;
  searchObservations: (
    query: string,
    limit?: number,
    project?: string,
    scope?: string,
  ) => Promise<any[]>;
  getTimeline: (
    observationId?: number,
    before?: number,
    after?: number,
  ) => Promise<any>;
  getConflicts: (
    project?: string,
    status?: string,
    limit?: number,
  ) => Promise<any>;
  judgeConflict: (
    judgmentId: string,
    relation: string,
    reason?: string,
    confidence?: number,
  ) => Promise<any>;
  getSyncStatus: (project?: string) => Promise<any>;
  triggerSync: (project?: string) => Promise<any>;
  subscribeMemoryChanges: (
    profile: string | undefined,
    callback: (payload: { changed: "memory" | "user"; profile?: string }) => void,
  ) => () => void;

  // Soul
  readSoul: (profile?: string) => Promise<string>;
  writeSoul: (content: string, profile?: string) => Promise<boolean>;
  resetSoul: (profile?: string) => Promise<string>;

  // Tools
  getToolsets: (
    profile?: string,
  ) => Promise<
    Array<{ key: string; label: string; description: string; enabled: boolean }>
  >;
  setToolsetEnabled: (
    key: string,
    enabled: boolean,
    profile?: string,
  ) => Promise<boolean>;

  // Skills
  listInstalledSkills: (
    profile?: string,
  ) => Promise<
    Array<{ name: string; category: string; description: string; path: string }>
  >;
  listBundledSkills: () => Promise<
    Array<{
      name: string;
      description: string;
      category: string;
      source: string;
      installed: boolean;
    }>
  >;
  getSkillContent: (skillPath: string) => Promise<string>;
  installSkill: (
    identifier: string,
    profile?: string,
  ) => Promise<{ success: boolean; error?: string }>;
  uninstallSkill: (
    name: string,
    profile?: string,
  ) => Promise<{ success: boolean; error?: string }>;
  createCustomSkill: (
    name: string,
    category: string,
    description: string,
    content: string,
    profile?: string,
  ) => Promise<{ success: boolean; error?: string }>;


  // Session cache
  listCachedSessions: (
    limit?: number,
    offset?: number,
  ) => Promise<
    Array<{
      id: string;
      title: string;
      startedAt: number;
      source: string;
      messageCount: number;
      model: string;
    }>
  >;
  syncSessionCache: () => Promise<
    Array<{
      id: string;
      title: string;
      startedAt: number;
      source: string;
      messageCount: number;
      model: string;
    }>
  >;
  updateSessionTitle: (sessionId: string, title: string) => Promise<void>;

  // Session search
  searchSessions: (
    query: string,
    limit?: number,
  ) => Promise<
    Array<{
      sessionId: string;
      title: string | null;
      startedAt: number;
      source: string;
      messageCount: number;
      model: string;
      snippet: string;
    }>
  >;

  // Credential Pool
  getCredentialPool: () => Promise<
    Record<string, Array<{ key: string; label: string }>>
  >;
  setCredentialPool: (
    provider: string,
    entries: Array<{ key: string; label: string }>,
  ) => Promise<boolean>;

  // Models
  listModels: () => Promise<
    Array<{
      id: string;
      name: string;
      provider: string;
      model: string;
      baseUrl: string;
      createdAt: number;
    }>
  >;
  addModel: (
    name: string,
    provider: string,
    model: string,
    baseUrl: string,
  ) => Promise<{
    id: string;
    name: string;
    provider: string;
    model: string;
    baseUrl: string;
    createdAt: number;
  }>;
  removeModel: (id: string) => Promise<boolean>;
  updateModel: (id: string, fields: Record<string, string>) => Promise<boolean>;

  // Claw3D
  claw3dStatus: () => Promise<{
    cloned: boolean;
    installed: boolean;
    devServerRunning: boolean;
    adapterRunning: boolean;
    port: number;
    portInUse: boolean;
    wsUrl: string;
    running: boolean;
    error: string;
  }>;
  claw3dSetup: () => Promise<{ success: boolean; error?: string }>;
  onClaw3dSetupProgress: (
    callback: (progress: {
      step: number;
      totalSteps: number;
      title: string;
      detail: string;
      log: string;
    }) => void,
  ) => () => void;
  claw3dGetPort: () => Promise<number>;
  claw3dSetPort: (port: number) => Promise<boolean>;
  claw3dGetWsUrl: () => Promise<string>;
  claw3dSetWsUrl: (url: string) => Promise<boolean>;
  claw3dStartAll: () => Promise<{ success: boolean; error?: string }>;
  claw3dStopAll: () => Promise<boolean>;
  claw3dGetLogs: () => Promise<string>;
  claw3dStartDev: () => Promise<boolean>;
  claw3dStopDev: () => Promise<boolean>;
  claw3dStartAdapter: () => Promise<boolean>;
  claw3dStopAdapter: () => Promise<boolean>;

  // Updates
  checkForUpdates: () => Promise<string | null>;
  downloadUpdate: () => Promise<boolean>;
  installUpdate: () => Promise<void>;
  getAppVersion: () => Promise<string>;
  onUpdateAvailable: (
    callback: (info: { version: string; releaseNotes: string }) => void,
  ) => () => void;
  onUpdateDownloadProgress: (
    callback: (info: { percent: number }) => void,
  ) => () => void;
  onUpdateDownloaded: (callback: () => void) => () => void;
  onUpdateError: (callback: (message: string) => void) => () => void;

  // Menu events
  onMenuNewChat: (callback: () => void) => () => void;
  onMenuSearchSessions: (callback: () => void) => () => void;

  // Cron Jobs
  listCronJobs: (
    includeDisabled?: boolean,
    profile?: string,
  ) => Promise<
    Array<{
      id: string;
      name: string;
      schedule: string;
      prompt: string;
      state: "active" | "paused" | "completed";
      enabled: boolean;
      next_run_at: string | null;
      last_run_at: string | null;
      last_status: string | null;
      last_error: string | null;
      repeat: { times: number | null; completed: number } | null;
      deliver: string[];
      skills: string[];
      script: string | null;
    }>
  >;
  createCronJob: (
    schedule: string,
    prompt?: string,
    name?: string,
    deliver?: string,
    profile?: string,
  ) => Promise<{ success: boolean; error?: string }>;
  removeCronJob: (
    jobId: string,
    profile?: string,
  ) => Promise<{ success: boolean; error?: string }>;
  pauseCronJob: (
    jobId: string,
    profile?: string,
  ) => Promise<{ success: boolean; error?: string }>;
  resumeCronJob: (
    jobId: string,
    profile?: string,
  ) => Promise<{ success: boolean; error?: string }>;
  triggerCronJob: (
    jobId: string,
    profile?: string,
  ) => Promise<{ success: boolean; error?: string }>;

  // Patterns / Autolearning
  listDetectedPatterns: (profile?: string) => Promise<
    Array<{
      id: string;
      canonical_prompt: string;
      pattern_type: string;
      schedule_inferred: string | null;
      confidence: number;
      occurrence_count: number;
      status: string;
      first_seen_at: number;
      last_seen_at: number;
      auto_created_job_id: string | null;
    }>
  >;
  approvePattern: (
    patternId: string,
    profile?: string,
  ) => Promise<{ success: boolean; error?: string; job_id?: string }>;
  rejectPattern: (
    patternId: string,
    profile?: string,
  ) => Promise<{ success: boolean; error?: string }>;
  toggleAutoLearning: (
    enabled: boolean,
    profile?: string,
  ) => Promise<{ success: boolean; error?: string }>;

  // Kanban
  kanbanListBoards: (
    includeArchived?: boolean,
    profile?: string,
  ) => Promise<{ success: boolean; data?: KanbanBoard[]; error?: string }>;
  kanbanCurrentBoard: (
    profile?: string,
  ) => Promise<{ success: boolean; data?: string; error?: string }>;
  kanbanSwitchBoard: (
    slug: string,
    profile?: string,
  ) => Promise<{ success: boolean; error?: string }>;
  kanbanCreateBoard: (
    slug: string,
    name?: string,
    switchAfter?: boolean,
    profile?: string,
  ) => Promise<{ success: boolean; error?: string }>;
  kanbanRemoveBoard: (
    slug: string,
    hardDelete?: boolean,
    profile?: string,
  ) => Promise<{ success: boolean; error?: string }>;
  kanbanListTasks: (filters?: {
    status?: string;
    assignee?: string;
    tenant?: string;
    includeArchived?: boolean;
    profile?: string;
  }) => Promise<{ success: boolean; data?: KanbanTask[]; error?: string }>;
  kanbanGetTask: (
    taskId: string,
    profile?: string,
  ) => Promise<{ success: boolean; data?: KanbanTaskDetail; error?: string }>;
  kanbanCreateTask: (
    input: KanbanCreateTaskInput,
    profile?: string,
  ) => Promise<{ success: boolean; data?: { id: string }; error?: string }>;
  selectFolder: () => Promise<string | null>;
  kanbanAssignTask: (
    taskId: string,
    assignee: string | null,
    profile?: string,
  ) => Promise<{ success: boolean; error?: string }>;
  kanbanCompleteTask: (
    taskId: string,
    result?: string,
    profile?: string,
  ) => Promise<{ success: boolean; error?: string }>;
  kanbanBlockTask: (
    taskId: string,
    reason?: string,
    profile?: string,
  ) => Promise<{ success: boolean; error?: string }>;
  kanbanUnblockTask: (
    taskId: string,
    profile?: string,
  ) => Promise<{ success: boolean; error?: string }>;
  kanbanArchiveTask: (
    taskId: string,
    profile?: string,
  ) => Promise<{ success: boolean; error?: string }>;
  kanbanSpecifyTask: (
    taskId: string,
    profile?: string,
  ) => Promise<{ success: boolean; error?: string }>;
  kanbanReclaimTask: (
    taskId: string,
    reason?: string,
    profile?: string,
  ) => Promise<{ success: boolean; error?: string }>;
  kanbanCommentTask: (
    taskId: string,
    body: string,
    profile?: string,
  ) => Promise<{ success: boolean; error?: string }>;
  kanbanDispatchOnce: (
    dryRun?: boolean,
    profile?: string,
  ) => Promise<{ success: boolean; data?: unknown; error?: string }>;

  // Shell
  openExternal: (url: string) => Promise<void>;

  // Backup / Import
  runOmniWorkerBackup: (
    profile?: string,
  ) => Promise<{ success: boolean; path?: string; error?: string }>;
  runOmniWorkerImport: (
    archivePath: string,
    profile?: string,
  ) => Promise<{ success: boolean; error?: string }>;

  // Enhanced Backup / Import
  scanBackupData: (
    profile?: string,
    options?: { includeSessions?: boolean; includeKanban?: boolean },
  ) => Promise<any>;
  createBackup: (
    profile?: string,
    options?: { includeSessions?: boolean; includeKanban?: boolean },
  ) => Promise<{
    success: boolean;
    path?: string;
    size?: number;
    error?: string;
  }>;
  readBackupManifest: () => Promise<{ manifest: any | null; error?: string; path?: string | null }>;
  restoreBackup: (
    archivePath: string,
    profile?: string,
    options?: {
      includeSessions?: boolean;
      includeKanban?: boolean;
      overwrite?: boolean;
    },
  ) => Promise<{ success: boolean; error?: string; restoredItems: string[] }>;
  onBackupProgress: (
    callback: (progress: {
      phase: string;
      currentFile: string;
      percent: number;
    }) => void,
  ) => () => void;
  onAppStateChanged: (callback: () => void) => () => void;

  // Debug dump
  runOmniWorkerDump: () => Promise<string>;

  // Memory providers
  discoverMemoryProviders: (profile?: string) => Promise<
    Array<{
      name: string;
      description: string;
      installed: boolean;
      active: boolean;
      envVars: string[];
    }>
  >;

  // MCP servers
  listMcpServers: (
    profile?: string,
  ) => Promise<
    Array<{ name: string; type: string; enabled: boolean; detail: string }>
  >;


  // Log viewer
  readLogs: (
    logFile?: string,
    lines?: number,
  ) => Promise<{ content: string; path: string }>;

  // WhatsApp Bot
  whatsappBotStatus: () => Promise<{
    configured: boolean;
    running: boolean;
    port: number;
    portInUse: boolean;
    provider: string;
    businessName: string;
    agentName: string;
    error: string;
  }>;
  whatsappBotSetup: (
    settings: Record<string, unknown>,
  ) => Promise<{ success: boolean; error?: string }>;
  onWhatsappBotSetupProgress: (
    callback: (progress: {
      step: number;
      totalSteps: number;
      title: string;
      detail: string;
      log: string;
    }) => void,
  ) => () => void;
  whatsappBotStart: () => Promise<{ success: boolean; error?: string }>;
  whatsappBotStop: () => Promise<boolean>;
  whatsappBotGetLogs: () => Promise<string>;
  whatsappBotGetSettings: () => Promise<Record<string, unknown> | null>;
  whatsappBotSetSettings: (
    settings: Record<string, unknown>,
  ) => Promise<{ success: boolean; error?: string }>;
  whatsappBotTest: (
    message: string,
  ) => Promise<{ response: string; error?: string }>;
  whatsappBotGetConversations: () => Promise<
    Array<{
      phone: string;
      lastMessage: string;
      timestamp: string;
      messageCount: number;
    }>
  >;

  // OpenWA Local Installer
  startOpenwaInstall: () => Promise<{ success: boolean; error?: string }>;
  onOpenwaInstallProgress: (
    callback: (progress: { step: number; total: number; message: string }) => void,
  ) => () => void;

  // SMTP Settings
  getSmtpSettings: (profile?: string) => Promise<any>;
  saveSmtpSettings: (settings: any, profile?: string) => Promise<boolean>;
  testSmtpConnection: (
    host: string,
    port: number,
    encryption: "none" | "ssl" | "tls",
    type: "smtp" | "imap",
  ) => Promise<{ success: boolean; message: string }>;

  // Onboarding
  getOnboardingStatus: () => Promise<boolean>;
  saveOnboardingData: (data: {
    userName: string;
    language: string;
    role: "normal" | "coder";
    tone: "direct" | "collaborative" | "academic";
    proactivity: boolean;
    agentGoal?: string;
    agentTasks?: string;
    customMission?: string;
    autolearning: boolean;
    gatewayEnabled?: boolean;
  }) => Promise<{ success: boolean; error?: string }>;

  // Plan Enforcement
  setPlanExpired: (expired: boolean) => Promise<boolean>;
  checkPlanExpired: () => Promise<boolean>;

  // Fetch Proxy
  proxyRequest: (options: {
    url: string;
    method?: string;
    headers?: Record<string, string>;
    body?: string;
    isStream?: boolean;
    requestId: string;
  }) => Promise<{ status: number; headers: Record<string, string>; body?: string; error?: string; isStream?: boolean }>;
  abortProxyRequest: (requestId: string) => Promise<boolean>;
  onProxyStreamChunk: (callback: (data: { requestId: string; chunk: string }) => void) => () => void;
  onProxyStreamEnd: (callback: (data: { requestId: string }) => void) => () => void;
  onProxyStreamError: (callback: (data: { requestId: string; error: string }) => void) => () => void;

  // safeStorage Token Methods
  saveTokens: (tokens: { accessToken: string; refreshToken: string }) => Promise<void>;
  getTokens: () => Promise<{ accessToken: string; refreshToken: string }>;
  deleteTokens: () => Promise<void>;
  removeEnv: (key: string, profile?: string) => Promise<void>;
}


declare global {
  interface Window {
    electron: ElectronAPI;
    omniworkerAPI: OmniWorkerAPI;
  }
}
