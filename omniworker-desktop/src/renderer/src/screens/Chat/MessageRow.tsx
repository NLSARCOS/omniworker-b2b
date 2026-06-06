import { memo, useState } from "react";

import { AgentMarkdown } from "../../components/AgentMarkdown";
import { AttachmentChip } from "../../components/AttachmentChip";
import { useI18n } from "../../components/useI18n";
import { FluxLogo } from "../../components/common/FluxLogo";
import { LiveToolGroupCard } from "./LiveToolGroupCard";
import type { Attachment, ChatMessage } from "./types";

export const APPROVAL_RE =
  /⚠️.*dangerous|requires? (your )?approval|\/approve.*\/deny|do you want (me )?to (proceed|continue|run|execute)/i;

export const OmniWorkerAvatar = memo(function OmniWorkerAvatar({
  size = 30,
}: {
  size?: number;
}): React.JSX.Element {
  return (
    <div
      className="chat-avatar chat-avatar-agent"
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        width: size,
        height: size,
        borderRadius: "50%",
        overflow: "hidden",
      }}
    >
      <FluxLogo size={size} />
    </div>
  );
});

interface MessageRowProps {
  msg: ChatMessage;
  isLast: boolean;
  isLoading: boolean;
  onApprove: () => void;
  onDeny: () => void;
}

export const MessageRow = memo(function MessageRow({
  msg,
  isLast,
  isLoading,
  onApprove,
  onDeny,
}: MessageRowProps): React.JSX.Element {
  const { t } = useI18n();
  const [previewAttachment, setPreviewAttachment] = useState<Attachment | null>(
    null,
  );
  const showApprovalBar =
    msg.role === "agent" &&
    !isLoading &&
    isLast &&
    APPROVAL_RE.test(msg.content);
  const hasAttachments = !!msg.attachments && msg.attachments.length > 0;

  return (
    <div className={`chat-message chat-message-${msg.role}`}>
      {msg.role === "user" ? (
        <div className="chat-avatar chat-avatar-user">U</div>
      ) : (
        <OmniWorkerAvatar />
      )}
      <div className={`chat-bubble chat-bubble-${msg.role}`}>
        {hasAttachments && (
          <div className="chat-message-attachments">
            {msg.attachments!.map((att) => (
              <AttachmentChip
                key={att.id}
                attachment={att}
                onPreview={(a) => a.kind === "image" && setPreviewAttachment(a)}
              />
            ))}
          </div>
        )}
        {msg.content &&
          (msg.role === "agent" ? (
            <AgentMarkdown>{msg.content}</AgentMarkdown>
          ) : (
            msg.content
          ))}
        {/* Structured tool call groups (live stream) */}
        {msg.role === "agent" && msg.toolGroups && msg.toolGroups.length > 0 && (
          <div className="chat-tool-groups">
            {msg.toolGroups.map((group) => (
              <LiveToolGroupCard key={group.groupId} group={group} />
            ))}
          </div>
        )}
      </div>
      {showApprovalBar && (
        <div className="chat-approval-bar">
          <button
            className="chat-approval-btn chat-approve"
            onClick={onApprove}
          >
            {t("chat.approve")}
          </button>
          <button className="chat-approval-btn chat-deny" onClick={onDeny}>
            {t("chat.deny")}
          </button>
        </div>
      )}
      {previewAttachment && previewAttachment.dataUrl && (
        <div
          className="chat-image-preview-backdrop"
          onClick={() => setPreviewAttachment(null)}
          role="dialog"
          aria-modal="true"
        >
          <img
            src={previewAttachment.dataUrl}
            alt={previewAttachment.name}
            className="chat-image-preview-image"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}
    </div>
  );
});
