import { useEffect, useRef } from "react";
import type { ChatMessage, LiveToolGroup, ToolCallInfo, UsageState } from "../types";

interface UseChatIPCArgs {
  setMessages: React.Dispatch<React.SetStateAction<ChatMessage[]>>;
  setOmniWorkerSessionId: (id: string) => void;
  setToolProgress: (tool: string | null) => void;
  setIsLoading: (loading: boolean) => void;
  setUsage: React.Dispatch<React.SetStateAction<UsageState | null>>;
}

/**
 * Registers all chat-related IPC listeners once and tears them down on unmount.
 *
 * Handles three event sources:
 *  - `onChatChunk`:        streaming text from the agent (may contain thinking prefix)
 *  - `onChatToolProgress`: structured tool-call activity events (grouped display)
 *  - `onChatDone/Error`:   session lifecycle
 */
export function useChatIPC({
  setMessages,
  setOmniWorkerSessionId,
  setToolProgress,
  setIsLoading,
  setUsage,
}: UseChatIPCArgs): void {
  // Monotonic counter for tool group IDs within the current agent turn
  const groupCounterRef = useRef(0);

  useEffect(() => {
    const cleanupChunk = window.omniworkerAPI.onChatChunk((chunk) => {
      setMessages((prev) => {
        const last = prev[prev.length - 1];
        if (last && last.role === "agent") {
          // Detect thinking prefix (<think>…</think>) — strip from main content,
          // append to `thinking` field instead
          const thinkMatch = chunk.match(/^<think>([\s\S]*?)<\/think>([\s\S]*)$/);
          if (thinkMatch) {
            return [
              ...prev.slice(0, -1),
              {
                ...last,
                thinking: (last.thinking || "") + thinkMatch[1],
                content: last.content + thinkMatch[2],
              },
            ];
          }
          return [
            ...prev.slice(0, -1),
            { ...last, content: last.content + chunk },
          ];
        }
        // Skip empty initial chunks so we don't create an empty bubble
        if (!chunk || !chunk.trim()) return prev;
        return [
          ...prev,
          { id: `agent-${Date.now()}`, role: "agent", content: chunk },
        ];
      });
    });

    const cleanupDone = window.omniworkerAPI.onChatDone((sessionId) => {
      if (sessionId) setOmniWorkerSessionId(sessionId);
      setToolProgress(null);
      setIsLoading(false);
      // Close all open tool groups when the turn ends
      setMessages((prev) => {
        const last = prev[prev.length - 1];
        if (!last || last.role !== "agent" || !last.toolGroups?.some((g) => g.open)) {
          return prev;
        }
        return [
          ...prev.slice(0, -1),
          {
            ...last,
            toolGroups: last.toolGroups.map((g) => ({ ...g, open: false })),
          },
        ];
      });
    });

    const cleanupError = window.omniworkerAPI.onChatError((error) => {
      setMessages((prev) => [
        ...prev,
        {
          id: `error-${Date.now()}`,
          role: "agent",
          content: `Error: ${error}`,
        },
      ]);
      setToolProgress(null);
      setIsLoading(false);
    });

    const cleanupToolProgress = window.omniworkerAPI.onChatToolProgress(
      (tool) => {
        setToolProgress(tool);

        // Also update the structured tool group on the last agent message.
        // The backend sends either a plain string ("emoji label") or a JSON
        // payload routed through the SSE omniworker.tool.progress event.
        // Either way we keep a running group of calls per turn.
        setMessages((prev) => {
          const last = prev[prev.length - 1];
          if (!last || last.role !== "agent") return prev;

          const existingGroups: LiveToolGroup[] = last.toolGroups ?? [];
          const openGroup = existingGroups.find((g) => g.open);

          // Parse "emoji tool_name" or plain "label"
          const parts = tool.split(" ");
          const emoji = parts[0].match(/\p{Emoji}/u) ? parts[0] : undefined;
          const toolName = emoji ? parts.slice(1).join(" ") : tool;

          const newCall: ToolCallInfo = {
            id: `call-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
            tool: toolName,
            emoji,
            status: "running",
            label: toolName,
          };

          if (openGroup) {
            // Mark the previous running call as done before adding the new one
            const updatedGroup: LiveToolGroup = {
              ...openGroup,
              calls: [
                ...openGroup.calls.map((c) =>
                  c.status === "running" ? { ...c, status: "done" as const } : c
                ),
                newCall,
              ],
            };
            return [
              ...prev.slice(0, -1),
              {
                ...last,
                toolGroups: existingGroups.map((g) =>
                  g.groupId === openGroup.groupId ? updatedGroup : g
                ),
              },
            ];
          }

          // Start a new group for this turn
          groupCounterRef.current += 1;
          const newGroup: LiveToolGroup = {
            groupId: `group-${groupCounterRef.current}`,
            calls: [newCall],
            open: true,
          };
          return [
            ...prev.slice(0, -1),
            { ...last, toolGroups: [...existingGroups, newGroup] },
          ];
        });
      },
    );

    const cleanupUsage = window.omniworkerAPI.onChatUsage((u) => {
      setUsage((prev) => ({
        promptTokens: (prev?.promptTokens || 0) + u.promptTokens,
        completionTokens: (prev?.completionTokens || 0) + u.completionTokens,
        totalTokens: (prev?.totalTokens || 0) + u.totalTokens,
        cost: u.cost != null ? (prev?.cost || 0) + u.cost : prev?.cost,
      }));
    });

    return () => {
      cleanupChunk();
      cleanupDone();
      cleanupError();
      cleanupToolProgress();
      cleanupUsage();
    };
  }, [
    setMessages,
    setOmniWorkerSessionId,
    setToolProgress,
    setIsLoading,
    setUsage,
  ]);
}
