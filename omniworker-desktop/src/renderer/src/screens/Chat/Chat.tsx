import { useCallback, useEffect, useRef, useState } from "react";
import { ChatInput, type ChatInputHandle } from "./ChatInput";
import { ChatHeader } from "./ChatHeader";
import { ChatEmptyState } from "./ChatEmptyState";
import { MessageList } from "./MessageList";
import { ModelPicker } from "./ModelPicker";
import { useChatScroll } from "./hooks/useChatScroll";
import { useChatIPC } from "./hooks/useChatIPC";
import { useChatActions } from "./hooks/useChatActions";
import { useModelConfig } from "./hooks/useModelConfig";
import { useFastMode } from "./hooks/useFastMode";
import { useLocalCommands } from "./hooks/useLocalCommands";
import { useI18n } from "../../components/useI18n";
import type { ChatMessage, UsageState } from "./types";
import type { Attachment } from "../../../../shared/attachments";


export type { ChatMessage } from "./types";

interface ChatProps {
  messages: ChatMessage[];
  setMessages: React.Dispatch<React.SetStateAction<ChatMessage[]>>;
  sessionId: string | null;
  profile?: string;
  onSessionStarted?: () => void;
  onNewChat?: () => void;
  isPlanExpired?: boolean;
}

function Chat({
  messages,
  setMessages,
  sessionId,
  profile,
  onSessionStarted,
  onNewChat,
  isPlanExpired,
}: ChatProps): React.JSX.Element {
  const { t } = useI18n();
  const [isLoading, setIsLoading] = useState(false);

  const [omniworkerSessionId, setOmniWorkerSessionId] = useState<string | null>(
    null,
  );
  const [contextFolder, setContextFolder] = useState<string | undefined>(undefined);
  const [toolProgress, setToolProgress] = useState<string | null>(null);
  const [usage, setUsage] = useState<UsageState | null>(null);
  const chatInputRef = useRef<ChatInputHandle>(null);

  const [dragActive, setDragActive] = useState(false);
  const dragCounter = useRef(0);
  const [queuedCount, setQueuedCount] = useState(0);
  const queueRef = useRef<{ text: string; attachments: Attachment[] }[]>([]);
  // Local SuperMemory health (only relevant in local mode). Polled every
  // 10s so the banner is up-to-date without forcing a hard refresh.
  const [localMemory, setLocalMemory] = useState<{
    isHealthy: boolean;
    message: string;
    remoteMode: boolean;
    agentRunning: boolean;
    dbPath: string | null;
    schemaPresent: boolean;
    chunkCount: number;
    factCount: number;
  } | null>(null);

  const { containerRef, bottomRef } = useChatScroll(messages);
  const modelConfig = useModelConfig(profile);
  const {
    fastMode,
    toggle: toggleFastMode,
    set: setFastTier,
  } = useFastMode(profile);

  useChatIPC({
    setMessages,
    setOmniWorkerSessionId,
    setToolProgress,
    setIsLoading,
    setUsage,
  });

  // Sync internal session ID and reset context folder on session switch
  useEffect(() => {
    setOmniWorkerSessionId(sessionId);
    setContextFolder(undefined);
  }, [sessionId]);

  // Reset omniworker session when the parent clears messages (new chat).
  // Effect-driven sync because `messages` is owned by the parent; a key-based
  // remount would discard unrelated local state (model picker, etc.).
  useEffect(() => {
    if (messages.length === 0) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setOmniWorkerSessionId(null);
      setContextFolder(undefined);
    }
  }, [messages]);

  // Cmd/Ctrl+N → new chat
  useEffect(() => {
    function onKey(e: KeyboardEvent): void {
      if ((e.metaKey || e.ctrlKey) && e.key === "n") {
        e.preventDefault();
        onNewChat?.();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onNewChat]);

  // Poll local SuperMemory health so the user gets a banner when local
  // memory is off (agent offline / state.db missing / schema missing).
  useEffect(() => {
    let cancelled = false;
    async function tick(): Promise<void> {
      try {
        const status = await window.omniworkerAPI.getLocalMemoryStatus();
        if (!cancelled) setLocalMemory(status);
      } catch {
        /* ignore — banner just stays hidden */
      }
    }
    tick();
    const id = setInterval(tick, 10000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  const addAgentMessage = useCallback(
    (content: string) => {
      setMessages((prev) => [
        ...prev,
        { id: `agent-local-${Date.now()}`, role: "agent", content },
      ]);
    },
    [setMessages],
  );

  const handleClear = useCallback(() => {
    if (isLoading) {
      window.omniworkerAPI.abortChat();
      setIsLoading(false);
    }
    setMessages([]);
    setOmniWorkerSessionId(null);
    setUsage(null);
    setToolProgress(null);
  }, [isLoading, setMessages]);

  const localCommands = useLocalCommands({
    profile,
    usage,
    setFastMode: setFastTier,
    onNewChat,
    onClear: handleClear,
    addAgentMessage,
  });

  const actions = useChatActions({
    profile,
    omniworkerSessionId,
    messages,
    isLoading,
    setIsLoading,
    setMessages,
    onSessionStarted,
    chatInputRef,
    localCommands,
    contextFolder,
  });

  // Stable ref to handleSend so the drain effect doesn't re-trigger on
  // identity changes
  const handleSendRef = useRef(actions.handleSend);
  useEffect(() => {
    handleSendRef.current = actions.handleSend;
  });

  // Drain queued messages one at a time when the agent finishes.
  useEffect(() => {
    if (isLoading) return;
    const next = queueRef.current.shift();
    if (!next) return;
    setQueuedCount(queueRef.current.length);
    handleSendRef.current(next.text, next.attachments).catch(() => {
      queueRef.current.unshift(next);
      setQueuedCount(queueRef.current.length);
    });
  }, [isLoading]);

  const handleSubmitOrQueue = useCallback(
    (text: string, attachments: Attachment[]) => {
      if (isLoading) {
        queueRef.current.push({ text, attachments });
        setQueuedCount(queueRef.current.length);
        return;
      }
      void handleSendRef.current(text, attachments);
    },
    [isLoading],
  );

  const eventHasFiles = useCallback((e: React.DragEvent): boolean => {
    const types = e.dataTransfer?.types;
    if (!types) return false;
    for (let i = 0; i < types.length; i++) {
      if (types[i] === "Files") return true;
    }
    return false;
  }, []);

  const handleDragEnter = useCallback(
    (e: React.DragEvent) => {
      if (!eventHasFiles(e)) return;
      e.preventDefault();
      dragCounter.current += 1;
      if (dragCounter.current === 1) setDragActive(true);
    },
    [eventHasFiles],
  );

  const handleDragOver = useCallback(
    (e: React.DragEvent) => {
      if (!eventHasFiles(e)) return;
      e.preventDefault();
      if (e.dataTransfer) e.dataTransfer.dropEffect = "copy";
    },
    [eventHasFiles],
  );

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    dragCounter.current = Math.max(0, dragCounter.current - 1);
    if (dragCounter.current === 0) setDragActive(false);
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      if (!eventHasFiles(e)) return;
      e.preventDefault();
      dragCounter.current = 0;
      setDragActive(false);
      const files = Array.from(e.dataTransfer.files);
      if (files.length === 0) return;
      void chatInputRef.current?.addFiles(files);
    },
    [eventHasFiles],
  );

  const handleSuggestion = useCallback((text: string) => {
    chatInputRef.current?.setText(text);
  }, []);

  return (
    <div
      className="chat-container"
      onDragEnter={handleDragEnter}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      <ChatHeader
        sessionId={sessionId}
        usage={usage}
        fastMode={fastMode}
        hasMessages={messages.length > 0}
        onToggleFast={toggleFastMode}
        onNewChat={onNewChat}
        onClear={handleClear}
        contextFolder={contextFolder}
        onSelectContextFolder={setContextFolder}
      />

      {localMemory && !localMemory.isHealthy && !localMemory.remoteMode && (
        <div
          className="local-memory-banner"
          role="status"
          title={
            localMemory.dbPath
              ? `${localMemory.dbPath} — agent ${localMemory.agentRunning ? "running" : "offline"}`
              : "state.db not found"
          }
        >
          <span className="local-memory-banner__icon" aria-hidden>
            ⚠
          </span>
          <span className="local-memory-banner__text">{localMemory.message}</span>
          <button
            type="button"
            className="local-memory-banner__action"
            onClick={async () => {
              try {
                const status = await window.omniworkerAPI.refreshLocalMemoryStatus();
                setLocalMemory(status);
              } catch {
                /* ignore */
              }
            }}
          >
            Recheck
          </button>
        </div>
      )}

      <div className={messages.length === 0 ? "chat-messages" : "chat-messages !overflow-hidden !p-0"} ref={containerRef}>
        {messages.length === 0 ? (
          <>
            <ChatEmptyState onSelectSuggestion={handleSuggestion} />
            <div ref={bottomRef} />
          </>
        ) : (
          <MessageList
            messages={messages}
            isLoading={isLoading}
            toolProgress={toolProgress}
            onApprove={actions.handleApprove}
            onDeny={actions.handleDeny}
          />
        )}
      </div>

      {queuedCount > 0 && (
        <div className="chat-queue-indicator">
          {t("chat.queued", { count: queuedCount }) || `${queuedCount} message(s) queued`}
        </div>
      )}

      <div className="chat-input-area">
        <ChatInput
          ref={chatInputRef}
          isLoading={isLoading}
          hasSession={!!omniworkerSessionId}
          onSubmit={handleSubmitOrQueue}
          onQuickAsk={actions.handleQuickAsk}
          onAbort={actions.handleAbort}
          isPlanExpired={isPlanExpired}
        />
        <ModelPicker
          currentModel={modelConfig.currentModel}
          currentProvider={modelConfig.currentProvider}
          currentBaseUrl={modelConfig.currentBaseUrl}
          displayModel={modelConfig.displayModel}
          onOpen={modelConfig.reload}
          onSelectModel={modelConfig.selectModel}
        />
      </div>
      {dragActive && (
        <div className="chat-drop-overlay" aria-hidden>
          <div className="chat-drop-overlay-inner">
            {t("chat.dropToAttach") || "Drop files to attach"}
          </div>
        </div>
      )}
    </div>
  );
}

export default Chat;
