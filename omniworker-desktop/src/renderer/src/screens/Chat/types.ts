export type { Attachment } from "../../../../shared/attachments";
import type { Attachment } from "../../../../shared/attachments";

/** A single tool call tracked inside a live group. */
export interface ToolCallInfo {
  /** Unique per-call identifier (e.g. call_abc123 or sequential index). */
  id: string;
  /** Tool name, e.g. "search_web", "read_file". */
  tool: string;
  /** Emoji prefix when provided by the backend. */
  emoji?: string;
  /** Current status within the stream. */
  status: "running" | "done" | "error";
  /** Optional short label / summary shown to the user. */
  label?: string;
}

/**
 * A group of tool calls that happened during a single "reasoning → action"
 * cycle.  Groups are rendered as a collapsible card in the message list so
 * users can see all tool activity without noise in the main text.
 */
export interface LiveToolGroup {
  /** Unique group ID (monotonically incremented per agent turn). */
  groupId: string;
  calls: ToolCallInfo[];
  /** Whether the group is still accumulating calls or the cycle ended. */
  open: boolean;
}

export interface ChatMessage {
  id: string;
  role: "user" | "agent";
  content: string;
  attachments?: Attachment[];
  /** Thinking/reasoning text emitted before the main response. */
  thinking?: string;
  /** Live tool call groups for the current agent turn. */
  toolGroups?: LiveToolGroup[];
}

export interface ModelGroup {
  provider: string;
  providerLabel: string;
  models: {
    provider: string;
    model: string;
    label: string;
    baseUrl: string;
  }[];
}

export interface UsageState {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  /** Input tokens that were NOT served from cache (billable at full rate). */
  inputTokensNew: number;
  /** Tokens served from prompt cache (billed at ~0.1× rate). */
  cacheReadTokens: number;
  /** Tokens written to prompt cache (billed at ~1.25× rate). */
  cacheWriteTokens: number;
  /** Reasoning/thinking tokens. */
  reasoningTokens: number;
  cost?: number;
  /** Whether cost is a real estimate, subscription-included, or unknown. */
  costStatus?: string;
  /** Number of LLM API calls made for this session. */
  apiCalls?: number;
}
