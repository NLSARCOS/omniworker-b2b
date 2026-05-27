import { memo, useMemo, useRef, useState, useEffect, useCallback } from "react";
import * as reactWindow from "react-window";
// @ts-ignore
const List = (reactWindow.VariableSizeList || (reactWindow as any).default?.VariableSizeList || (reactWindow as any).default) as any;
import { OmniWorkerAvatar, MessageRow } from "./MessageRow";
import type { ChatMessage } from "./types";

interface MessageListProps {
  messages: ChatMessage[];
  isLoading: boolean;
  toolProgress: string | null;
  onApprove: () => void;
  onDeny: () => void;
}

type VirtualItem =
  | { type: "load-more"; id: string }
  | { type: "message"; id: string; msg: ChatMessage; isLast: boolean }
  | { type: "typing"; id: string }
  | { type: "progress"; id: string };

function TypingIndicator({
  toolProgress,
}: {
  toolProgress: string | null;
}): React.JSX.Element {
  return (
    <div className="chat-message chat-message-agent">
      <OmniWorkerAvatar />
      <div className="chat-bubble chat-bubble-agent">
        {toolProgress ? (
          <div className="chat-tool-progress">{toolProgress}</div>
        ) : (
          <div className="chat-typing">
            <span className="chat-typing-dot" />
            <span className="chat-typing-dot" />
            <span className="chat-typing-dot" />
          </div>
        )}
      </div>
    </div>
  );
}

const VirtualRow = memo(function VirtualRow({
  index,
  style,
  data,
}: {
  index: number;
  style: React.CSSProperties;
  data: {
    items: VirtualItem[];
    onHeightChange: (index: number, height: number) => void;
    isLoading: boolean;
    onApprove: () => void;
    onDeny: () => void;
    toolProgress: string | null;
    visibleCount: number;
    totalCount: number;
    onLoadMore: () => void;
  };
}) {
  const item = data.items[index];
  const rowRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = rowRef.current;
    if (!el) return;

    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const height = entry.borderBoxSize?.[0]?.blockSize ?? entry.contentRect.height;
        if (height && height > 0) {
          data.onHeightChange(index, height);
        }
      }
    });

    observer.observe(el);
    return () => observer.disconnect();
  }, [index, item.id, data]);

  return (
    <div style={style}>
      <div ref={rowRef} style={{ overflow: "hidden", paddingBottom: "16px" }}>
        {item.type === "load-more" && (
          <div className="flex flex-col items-center justify-center py-4 border-b border-white/5 bg-white/[0.02] rounded-lg mb-4 text-xs font-mono text-gray-400">
            <div className="mb-2">
              Showing {data.visibleCount} of {data.totalCount} messages
            </div>
            {data.visibleCount < data.totalCount && (
              <button
                onClick={data.onLoadMore}
                className="px-3 py-1 bg-white/5 hover:bg-white/10 text-white rounded transition-colors cursor-pointer"
              >
                Load earlier messages
              </button>
            )}
          </div>
        )}
        {item.type === "message" && (
          <MessageRow
            msg={item.msg}
            isLast={item.isLast}
            isLoading={data.isLoading}
            onApprove={data.onApprove}
            onDeny={data.onDeny}
          />
        )}
        {item.type === "typing" && (
          <TypingIndicator toolProgress={data.toolProgress} />
        )}
        {item.type === "progress" && (
          <div className="chat-tool-progress-inline">{data.toolProgress}</div>
        )}
      </div>
    </div>
  );
});

export const MessageList = memo(function MessageList({
  messages,
  isLoading,
  toolProgress,
  onApprove,
  onDeny,
}: MessageListProps): React.JSX.Element {
  const visibleMessages = useMemo(
    () => messages.filter((m) => (m.content || "").trim()),
    [messages],
  );

  const [visibleCount, setVisibleCount] = useState(() => Math.min(50, visibleMessages.length));
  
  // Track message length additions to keep newly sent / streamed messages visible
  const prevMsgLengthRef = useRef(visibleMessages.length);
  useEffect(() => {
    if (visibleMessages.length > prevMsgLengthRef.current) {
      const added = visibleMessages.length - prevMsgLengthRef.current;
      setVisibleCount((prev) => prev + added);
    }
    prevMsgLengthRef.current = visibleMessages.length;
  }, [visibleMessages.length]);

  const handleLoadMore = useCallback(() => {
    setVisibleCount((prev) => Math.min(prev + 50, visibleMessages.length));
  }, [visibleMessages.length]);

  const lastMessageIsAgent =
    visibleMessages.length > 0 && visibleMessages[visibleMessages.length - 1].role === "agent";

  const virtualItems = useMemo(() => {
    const items: VirtualItem[] = [];

    // Always include the load-more / count banner when there is more than 0 messages
    if (visibleMessages.length > 0) {
      items.push({
        type: "load-more",
        id: "load-more-header",
      });
    }

    const sliced = visibleMessages.slice(-visibleCount);
    sliced.forEach((msg, i) => {
      items.push({
        type: "message",
        id: msg.id,
        msg,
        isLast: i === sliced.length - 1,
      });
    });

    if (isLoading && !lastMessageIsAgent) {
      items.push({
        type: "typing",
        id: "typing-indicator",
      });
    }

    if (isLoading && toolProgress && lastMessageIsAgent) {
      items.push({
        type: "progress",
        id: "tool-progress-inline",
      });
    }

    return items;
  }, [visibleMessages, visibleCount, isLoading, lastMessageIsAgent, toolProgress]);

  // Height measurement caching
  const heightsRef = useRef<Record<string, number>>({});
  const listRef = useRef<any>(null);

  const getItemSize = useCallback(
    (index: number) => {
      const item = virtualItems[index];
      if (!item) return 80;

      if (heightsRef.current[item.id]) {
        return heightsRef.current[item.id];
      }

      if (item.type === "load-more") return 90;
      if (item.type === "typing") return 80;
      if (item.type === "progress") return 40;

      // Estimate heights based on content length
      const msg = item.msg;
      const contentLength = msg.content?.length || 0;
      if (msg.role === "user") {
        return Math.max(60, 40 + Math.ceil(contentLength / 45) * 20);
      } else {
        return Math.max(80, 80 + Math.ceil(contentLength / 35) * 22);
      }
    },
    [virtualItems],
  );

  const onHeightChange = useCallback(
    (index: number, height: number) => {
      const item = virtualItems[index];
      if (!item) return;

      if (heightsRef.current[item.id] !== height) {
        heightsRef.current[item.id] = height;
        listRef.current?.resetAfterIndex(index, false);
      }
    },
    [virtualItems],
  );

  // ResizeObserver for dynamic container dimension tracking
  const [dimensions, setDimensions] = useState({ width: 600, height: 600 });
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect;
        if (width > 0 && height > 0) {
          setDimensions({ width, height });
        }
      }
    });

    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // Scrolling & Auto-scroll logic
  const userScrolledUpRef = useRef(false);
  const totalHeight = useMemo(() => {
    return virtualItems.reduce((acc, _, index) => acc + getItemSize(index), 0);
  }, [virtualItems, getItemSize]);

  const scrollToBottom = useCallback(
    (force = false) => {
      if (force || !userScrolledUpRef.current) {
        if (virtualItems.length > 0 && listRef.current) {
          listRef.current.scrollToItem(virtualItems.length - 1, "end");
        }
      }
    },
    [virtualItems],
  );

  const onScroll = useCallback(
    ({ scrollOffset }: { scrollOffset: number }) => {
      const atBottom = scrollOffset + dimensions.height >= totalHeight - 100;
      userScrolledUpRef.current = !atBottom;
    },
    [dimensions.height, totalHeight],
  );

  // Trigger auto-scroll on new chunks or messages
  const prevItemsLength = useRef(virtualItems.length);
  useEffect(() => {
    const isNewMessage = virtualItems.length > prevItemsLength.current;
    const isUserSent =
      isNewMessage && virtualItems[virtualItems.length - 1]?.type === "message" &&
      (virtualItems[virtualItems.length - 1] as any).msg?.role === "user";

    if (isNewMessage) {
      scrollToBottom(isUserSent);
    }
    prevItemsLength.current = virtualItems.length;
  }, [virtualItems, scrollToBottom]);

  // Also auto-scroll if total estimated height shifts while loading chunks
  useEffect(() => {
    scrollToBottom();
  }, [totalHeight, scrollToBottom]);

  return (
    <div ref={containerRef} className="w-full h-full min-h-0 overflow-hidden flex flex-col flex-1">
      <List
        ref={listRef}
        height={dimensions.height}
        width={dimensions.width}
        itemCount={virtualItems.length}
        itemSize={getItemSize}
        onScroll={onScroll}
        itemData={{
          items: virtualItems,
          onHeightChange,
          isLoading,
          onApprove,
          onDeny,
          toolProgress,
          visibleCount,
          totalCount: visibleMessages.length,
          onLoadMore: handleLoadMore,
        }}
        className="w-full h-full overflow-y-auto"
        style={{ overflowX: "hidden" }}
      >
        {VirtualRow}
      </List>
    </div>
  );
});
