import { memo } from "react";
import { Trash2 as Trash, Plus, Zap, FolderOpen, X } from "lucide-react";
import { useI18n } from "../../components/useI18n";
import type { UsageState } from "./types";

interface ChatHeaderProps {
  sessionId: string | null;
  usage: UsageState | null;
  fastMode: boolean;
  hasMessages: boolean;
  onToggleFast: () => void;
  onNewChat?: () => void;
  onClear: () => void;
  contextFolder?: string;
  onSelectContextFolder?: (folder: string | undefined) => void;
}

function UsageBadge({ usage }: { usage: UsageState }): React.JSX.Element {
  const tooltip =
    `Prompt: ${usage.promptTokens.toLocaleString()} | ` +
    `Completion: ${usage.completionTokens.toLocaleString()}` +
    (usage.cost != null ? ` | Cost: $${usage.cost.toFixed(4)}` : "");

  return (
    <span className="chat-token-counter" title={tooltip}>
      {usage.totalTokens.toLocaleString()} tokens
      {usage.cost != null && (
        <span className="chat-cost"> · ${usage.cost.toFixed(4)}</span>
      )}
    </span>
  );
}

export const ChatHeader = memo(function ChatHeader({
  sessionId,
  usage,
  fastMode,
  hasMessages,
  onToggleFast,
  onNewChat,
  onClear,
  contextFolder,
  onSelectContextFolder,
}: ChatHeaderProps): React.JSX.Element {
  const { t } = useI18n();

  const handleSelectFolder = async () => {
    if (onSelectContextFolder) {
      const folder = await window.omniworkerAPI.selectFolder();
      if (folder) {
        onSelectContextFolder(folder);
      }
    }
  };

  const handleClearFolder = () => {
    if (onSelectContextFolder) {
      onSelectContextFolder(undefined);
    }
  };

  return (
    <div className="chat-header">
      <div className="chat-header-left">
        <div className="chat-header-title">
          {sessionId
            ? t("chat.sessionTitle", { id: sessionId.slice(-6) })
            : t("chat.title")}
        </div>
        {usage && <UsageBadge usage={usage} />}
        {onSelectContextFolder && (
          <div className="flex items-center ml-3 shrink-0">
            {contextFolder ? (
              <div
                className="flex items-center gap-1.5 px-2 py-0.5 bg-amber-500/10 text-amber-500 border border-amber-500/20 rounded-md text-xs font-medium max-w-[200px] select-none"
                title={contextFolder}
              >
                <FolderOpen size={12} className="shrink-0" />
                <span className="truncate">
                  {contextFolder.split(/[\\/]/).pop() || contextFolder}
                </span>
                <button
                  className="hover:text-amber-300 cursor-pointer p-0.5 rounded hover:bg-amber-500/20 shrink-0"
                  onClick={handleClearFolder}
                  title="Remove context folder"
                >
                  <X size={10} />
                </button>
              </div>
            ) : (
              <button
                className="flex items-center gap-1 px-2 py-0.5 bg-slate-500/10 hover:bg-slate-500/20 text-slate-400 hover:text-slate-300 border border-slate-500/20 rounded-md text-xs font-medium cursor-pointer transition-colors"
                onClick={handleSelectFolder}
                title="Select working context folder"
              >
                <FolderOpen size={12} />
                <span>Context</span>
              </button>
            )}
          </div>
        )}
      </div>
      <div className="chat-header-actions">
        <div className="chat-fast-wrapper">
          <button
            className={`btn-ghost chat-fast-btn ${fastMode ? "chat-fast-active" : ""}`}
            onClick={onToggleFast}
          >
            <Zap size={14} />
          </button>
          <div className="chat-fast-popover">
            <strong>
              {fastMode ? t("chat.fastModeOn") : t("chat.fastMode")}
            </strong>
            <span>
              {fastMode ? t("chat.fastModeActive") : t("chat.fastModeInactive")}
            </span>
          </div>
        </div>
        {onNewChat && (
          <button
            className="btn-ghost chat-clear-btn"
            onClick={onNewChat}
            title={t("chat.newChat")}
          >
            <Plus size={16} />
          </button>
        )}
        {hasMessages && (
          <button
            className="btn-ghost chat-clear-btn"
            onClick={onClear}
            title={t("chat.clearChat")}
          >
            <Trash size={16} />
          </button>
        )}
      </div>
    </div>
  );
});
