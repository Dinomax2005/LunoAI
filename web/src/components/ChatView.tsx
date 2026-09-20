import { useEffect, useRef } from "react";
import type { Message, StreamingStatus } from "../types";
import { MessageItem } from "./Message";
import { Welcome } from "./Welcome";

interface ChatViewProps {
  messages: Message[];
  status: StreamingStatus;
  pending: boolean;
  onRetry: (text: string) => void;
  activeId: string;
  onClear: () => void;
}

export default function ChatView({
  messages,
  status,
  pending,
  onRetry,
  onClear,
}: ChatViewProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to the newest content while streaming / when messages change.
  useEffect(() => {
    if (bottomRef.current) {
      bottomRef.current.scrollIntoView({ behavior: status === "streaming" ? "auto" : "smooth" });
    }
  }, [messages, status]);

  const stale = pending;

  return (
    <main className="chat-scroll" ref={scrollRef}>
      <div className="chat-column">
        {messages.length === 0 ? (
          <Welcome onSuggestion={(s) => onRetry(s)} />
        ) : (
          <>
            <div className="conversation-top">
              <h1 className="conversation-title">
                {conversationTitle(messages)}
              </h1>
              {messages.length > 0 && (
                <button className="clear-chat" onClick={onClear} title="Clear messages">
                  <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M3 6h18M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2M6 6l1 14a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1l1-14M10 11v6M14 11v6" />
                  </svg>
                  Clear
                </button>
              )}
            </div>
            {messages.map((m, i) => {
              const lastUserBefore = [...messages.slice(0, i)].reverse().find((x) => x.role === "user");
              return (
                <MessageItem
                  key={m.id}
                  message={m}
                  onRetry={() => {
                    if (lastUserBefore) onRetry(lastUserBefore.content);
                  }}
                />
              );
            })}
            <div ref={bottomRef} />
            {stale && <div className="streaming-hint">Luno is thinking…</div>}
          </>
        )}
      </div>
    </main>
  );
}

function conversationTitle(messages: Message[]): string {
  const firstUser = messages.find((m) => m.role === "user");
  if (!firstUser) return "";
  const t = firstUser.content.replace(/\s+/g, " ").trim();
  return t.length > 80 ? t.slice(0, 80) + "…" : t;
}
