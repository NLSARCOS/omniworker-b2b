/**
 * LiveToolGroupCard — renders a collapsible group of tool calls for an agent turn.
 *
 * Ported from hermes-desktop PR #545: "Render richer live chat stream events".
 *
 * Visual contract:
 *  - While `open = true`: shows a pulsing spinner + the currently running tool name.
 *  - While `open = false`: collapses into a summary pill showing tool count.
 *  - Clicking the summary expands all calls with their status icons.
 */

import { memo, useState } from "react";
import type { LiveToolGroup } from "./types";

const STATUS_ICON: Record<string, string> = {
  running: "⏳",
  done: "✓",
  error: "✗",
};

function ToolCallRow({
  tool,
  emoji,
  status,
  label,
}: {
  tool: string;
  emoji?: string;
  status: "running" | "done" | "error";
  label?: string;
}): React.JSX.Element {
  const icon = status === "running" ? "⏳" : STATUS_ICON[status];
  const displayName = label || tool;
  return (
    <div
      className={`live-tool-call live-tool-call-${status}`}
      title={tool}
    >
      <span className="live-tool-call-icon" aria-hidden>
        {emoji || icon}
      </span>
      <span className="live-tool-call-name">{displayName}</span>
      {status !== "running" && (
        <span className="live-tool-call-status" aria-label={status}>
          {STATUS_ICON[status]}
        </span>
      )}
      {status === "running" && (
        <span className="live-tool-call-spinner" aria-label="running" />
      )}
    </div>
  );
}

interface LiveToolGroupCardProps {
  group: LiveToolGroup;
}

export const LiveToolGroupCard = memo(function LiveToolGroupCard({
  group,
}: LiveToolGroupCardProps): React.JSX.Element {
  const [expanded, setExpanded] = useState(group.open);
  const doneCount = group.calls.filter((c) => c.status === "done").length;
  const runningCall = group.calls.find((c) => c.status === "running");
  const totalCount = group.calls.length;

  // Auto-expand when the group is live, auto-collapse when done
  const isLive = group.open && runningCall != null;

  return (
    <div className={`live-tool-group ${group.open ? "live-tool-group-open" : "live-tool-group-closed"}`}>
      {/* Summary pill / toggle */}
      <button
        className="live-tool-group-summary"
        onClick={() => setExpanded((e) => !e)}
        aria-expanded={expanded}
        title={expanded ? "Collapse tool activity" : "Expand tool activity"}
      >
        <span className="live-tool-group-icon" aria-hidden>
          {isLive ? "⚙️" : "🔧"}
        </span>
        <span className="live-tool-group-label">
          {isLive
            ? `${runningCall!.emoji ?? ""} ${runningCall!.label ?? runningCall!.tool}`.trim()
            : `${totalCount} tool${totalCount !== 1 ? "s" : ""} used`}
        </span>
        {isLive && <span className="live-tool-group-pulse" aria-hidden />}
        {!isLive && doneCount > 0 && (
          <span className="live-tool-group-count" aria-label={`${doneCount} completed`}>
            {doneCount}✓
          </span>
        )}
        <span className="live-tool-group-chevron" aria-hidden>
          {expanded ? "▲" : "▼"}
        </span>
      </button>

      {/* Expanded call list */}
      {expanded && (
        <div className="live-tool-group-calls" role="list" aria-label="Tool calls">
          {group.calls.map((call) => (
            <div key={call.id} role="listitem">
              <ToolCallRow
                tool={call.tool}
                emoji={call.emoji}
                status={call.status}
                label={call.label}
              />
            </div>
          ))}
        </div>
      )}
    </div>
  );
});
