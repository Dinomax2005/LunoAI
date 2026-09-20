import { useMemo, useState } from "react";
import type { Conversation } from "../types";

interface ConversationListProps {
  conversations: Conversation[];
  activeId: string;
  onSelect: (id: string) => void;
  onDelete: (id: string) => void;
}

function titleFrom(c: Conversation): string {
  if (c.title && c.title !== "New conversation") return c.title;
  const first = c.messages.find((m) => m.role === "user");
  if (first) {
    const t = first.content.replace(/\s+/g, " ").trim();
    return t.length > 42 ? t.slice(0, 42) + "…" : t;
  }
  return "New conversation";
}

function groupKey(ts: number): string {
  const now = new Date();
  const d = new Date(ts);
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const startOfYesterday = startOfToday - 86_400_000;
  const startOfSeven = startOfToday - 6 * 86_400_000;
  if (d.getTime() >= startOfToday) return "Today";
  if (d.getTime() >= startOfYesterday) return "Yesterday";
  if (d.getTime() >= startOfSeven) return "Previous 7 days";
  return "Older";
}

function formatTime(ts: number): string {
  const d = new Date(ts);
  const now = new Date();
  const sameDay = d.toDateString() === now.toDateString();
  if (sameDay) {
    return d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  }
  return d.toLocaleDateString([], { month: "short", day: "numeric" });
}

export function ConversationList({
  conversations,
  activeId,
  onSelect,
  onDelete,
}: ConversationListProps) {
  const [menuFor, setMenuFor] = useState<string | null>(null);
  const [confirmFor, setConfirmFor] = useState<string | null>(null);

  const groups = useMemo(() => {
    const map = new Map<string, Conversation[]>();
    const sorted = [...conversations].sort((a, b) => b.updatedAt - a.updatedAt);
    for (const c of sorted) {
      const key = groupKey(c.updatedAt || c.createdAt);
      map.set(key, [...(map.get(key) ?? []), c]);
    }
    return [...map.entries()];
  }, [conversations]);

  if (!conversations.length) {
    return (
      <div className="conversation-list empty">
        <p className="muted">No conversations found.</p>
      </div>
    );
  }

  return (
    <div className="conversation-list" onClick={() => setMenuFor(null)}>
      {groups.map(([label, items]) => (
        <div className="conversation-group" key={label}>
          <div className="group-label">{label}</div>
          {items.map((c) => {
            const active = c.id === activeId;
            return (
              <div
                key={c.id}
                className={`conversation-row ${active ? "active" : ""}`}
                onClick={(e) => {
                  e.stopPropagation();
                  onSelect(c.id);
                }}
              >
                <span className="conv-icon">
                  <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M21 11.5a8.4 8.4 0 0 1-9 8.4 8.6 8.6 0 0 1-3.1-.6L3 21l1.7-5.5A8.3 8.3 0 0 1 3.2 11.5a8.5 8.5 0 0 1 9-8.5 8.7 8.7 0 0 1 8.8 8.5Z" />
                  </svg>
                </span>
                <span className="conv-title">
                  {titleFrom(c)}
                  <span className="conv-time">{formatTime(c.updatedAt || c.createdAt)}</span>
                </span>
                <button
                  className="conv-menu-button"
                  aria-label="Conversation options"
                  onClick={(e) => {
                    e.stopPropagation();
                    setMenuFor((v) => (v === c.id ? null : c.id));
                    setConfirmFor(null);
                  }}
                >
                  <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor">
                    <circle cx="5" cy="12" r="1.6" />
                    <circle cx="12" cy="12" r="1.6" />
                    <circle cx="19" cy="12" r="1.6" />
                  </svg>
                </button>

                {menuFor === c.id && (
                  <div className="conv-menu" onClick={(e) => e.stopPropagation()}>
                    {confirmFor === c.id ? (
                      <>
                        <div className="conv-menu-title">Delete this conversation?</div>
                        <div className="conv-menu-actions">
                          <button
                            className="menu-danger"
                            onClick={() => {
                              onDelete(c.id);
                              setMenuFor(null);
                            }}
                          >
                            Delete
                          </button>
                          <button onClick={() => setConfirmFor(null)}>Cancel</button>
                        </div>
                      </>
                    ) : (
                      <>
                        <button className="conv-menu-title-only" onClick={() => onSelect(c.id)}>
                          Open
                        </button>
                        <button
                          className="menu-danger"
                          onClick={() => setConfirmFor(c.id)}
                        >
                          Delete…
                        </button>
                      </>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}
