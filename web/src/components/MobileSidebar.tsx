import { useEffect, useMemo, useState } from "react";
import type { Conversation } from "../types";
import { ConversationList } from "./ConversationList";

interface MobileSidebarProps {
  open: boolean;
  onClose: () => void;
  conversations: Conversation[];
  activeId: string;
  onNewChat: () => void;
  onSelect: (id: string) => void;
  onDelete: (id: string) => void;
}

export function MobileSidebar({
  open,
  onClose,
  conversations,
  activeId,
  onNewChat,
  onSelect,
  onDelete,
}: MobileSidebarProps) {
  const [query, setQuery] = useState("");

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    if (open) window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return conversations;
    return conversations.filter(
      (c) =>
        c.title.toLowerCase().includes(q) ||
        c.messages.some((m) => m.content.toLowerCase().includes(q))
    );
  }, [conversations, query]);

  return (
    <div className={`mobile-drawer ${open ? "open" : ""}`}>
      <div className="mobile-scrim" onClick={onClose} />
      <aside className="mobile-panel">
        <div className="sidebar-header">
          <div className="brand">
            <span className="logo-mark">
              <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="10" r="6.4" />
                <path d="M4.2 18.4c1.7-2.2 4.5-3.4 7.8-3.4s6.1 1.2 7.8 3.4" />
                <path d="M2.8 9.2a4 4 0 0 1 4-4M21.2 9.2a4 4 0 0 0-4-4" />
              </svg>
            </span>
            <span className="brand-name">Luno</span>
            <span className="brand-sub">AI</span>
          </div>
          <button className="icon-button" onClick={onClose} aria-label="Close menu">
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
        </div>

        <button className="new-chat-button" onClick={onNewChat}>
          <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round">
            <path d="M12 5v14M5 12h14" />
          </svg>
          New conversation
        </button>

        <div className="search-box">
          <svg className="search-icon" viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
            <circle cx="11" cy="11" r="7" />
            <path d="m20 20-3.2-3.2" />
          </svg>
          <input
            type="text"
            placeholder="Search conversations"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>

        <ConversationList
          conversations={filtered}
          activeId={activeId}
          onSelect={onSelect}
          onDelete={onDelete}
        />
      </aside>
    </div>
  );
}
