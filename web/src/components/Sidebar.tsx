import { useMemo, useState } from "react";
import type { Conversation } from "../types";
import { ConversationList } from "./ConversationList";

interface SidebarProps {
  conversations: Conversation[];
  activeId: string;
  collapsed: boolean;
  onToggleCollapse: () => void;
  onNewChat: () => void;
  onSelect: (id: string) => void;
  onDelete: (id: string) => void;
}

function LogoMark({ size = 30 }: { size?: number }) {
  return (
    <span
      className="logo-mark"
      style={{ width: size, height: size, fontSize: size * 0.62 }}
      aria-hidden
    >
      <svg viewBox="0 0 24 24" width={size * 0.72} height={size * 0.72} fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="10" r="6.4" />
        <path d="M4.2 18.4c1.7-2.2 4.5-3.4 7.8-3.4s6.1 1.2 7.8 3.4" />
        <path d="M2.8 9.2a4 4 0 0 1 4-4M21.2 9.2a4 4 0 0 0-4-4" />
      </svg>
    </span>
  );
}

export default function Sidebar({
  conversations,
  activeId,
  collapsed,
  onToggleCollapse,
  onNewChat,
  onSelect,
  onDelete,
}: SidebarProps) {
  const [query, setQuery] = useState("");
  const [menuOpen, setMenuOpen] = useState(false);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return conversations;
    return conversations.filter(
      (c) =>
        c.title.toLowerCase().includes(q) ||
        c.messages.some((m) => m.content.toLowerCase().includes(q))
    );
  }, [conversations, query]);

  // -- collapsed rail (desktop, 64px icon strip) --------------------------
  if (collapsed) {
    return (
      <div className="sidebar sidebar-collapsed">
        <button className="icon-button rail-toggle" onClick={onToggleCollapse} aria-label="Expand sidebar" title="Expand sidebar">
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <path d="M9 6l6 6-6 6" />
          </svg>
        </button>
        <button className="icon-button rail-new" onClick={onNewChat} aria-label="New conversation" title="New conversation">
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
            <path d="M12 5v14M5 12h14" />
          </svg>
        </button>
        <div className="rail-list">
          {conversations.slice(0, 24).map((c) => (
            <button
              key={c.id}
              className={`rail-item ${c.id === activeId ? "active" : ""}`}
              onClick={() => onSelect(c.id)}
              title={c.title}
            >
              <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 11.5a8.4 8.4 0 0 1-9 8.4 8.6 8.6 0 0 1-3.1-.6L3 21l1.7-5.5A8.3 8.3 0 0 1 3.2 11.5a8.5 8.5 0 0 1 9-8.5 8.7 8.7 0 0 1 8.8 8.5Z" />
              </svg>
            </button>
          ))}
        </div>
        <div className="rail-bottom">
          <div className="rail-avatar" title="You">Y</div>
        </div>
      </div>
    );
  }

  // -- full sidebar --------------------------------------------------------
  return (
    <div className="sidebar">
      <div className="sidebar-header">
        <div className="brand">
          <LogoMark />
          <span className="brand-name">Luno</span>
          <span className="brand-sub">AI</span>
        </div>
        <button className="icon-button" onClick={onToggleCollapse} aria-label="Collapse sidebar" title="Collapse sidebar">
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <path d="M15 6l-6 6 6 6" />
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
          aria-label="Search conversations"
        />
      </div>

      <ConversationList
        conversations={filtered}
        activeId={activeId}
        onSelect={onSelect}
        onDelete={onDelete}
      />

      <div className="sidebar-footer">
        <button className="user-row" onClick={() => setMenuOpen((v) => !v)}>
          <span className="avatar">Y</span>
          <span className="user-meta">
            <span className="user-name">You</span>
            <span className="user-plan">Luno · free &amp; local</span>
          </span>
          <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <path d="m18 9-6 6-6-6" />
          </svg>
        </button>
        {menuOpen && (
          <div className="user-popover">
            <div className="user-popover-head">
              <span className="avatar">Y</span>
              <span className="user-meta">
                <span className="user-name">You</span>
                <span className="user-plan">Luno · free &amp; local</span>
              </span>
            </div>
            <div className="popover-divider" />
            <button className="popover-item">
              <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="3.2" />
                <path d="M19.4 15a1.7 1.7 0 0 0 .34 1.87l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.7 1.7 0 0 0-1.87-.34 1.7 1.7 0 0 0-1 1.55V21a2 2 0 1 1-4 0v-.09A1.7 1.7 0 0 0 9 19.4a1.7 1.7 0 0 0-1.87.34l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.7 1.7 0 0 0 .34-1.87 1.7 1.7 0 0 0-1.55-1H3a2 2 0 1 1 0-4h.09A1.7 1.7 0 0 0 4.6 9a1.7 1.7 0 0 0-.34-1.87l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.7 1.7 0 0 0 1.87.34H9a1.7 1.7 0 0 0 1-1.55V3a2 2 0 1 1 4 0v.09a1.7 1.7 0 0 0 1 1.55 1.7 1.7 0 0 0 1.87-.34l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.7 1.7 0 0 0-.34 1.87V9a1.7 1.7 0 0 0 1.55 1H21a2 2 0 1 1 0 4h-.09a1.7 1.7 0 0 0-1.55 1Z" />
              </svg>
              Settings
            </button>
            <button className="popover-item" onClick={() => localStorage.removeItem("luno_api_base")}>
              <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 12a9 9 0 1 1-9-9" />
                <path d="M21 3v6h-6" />
              </svg>
              Reset API connection
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
