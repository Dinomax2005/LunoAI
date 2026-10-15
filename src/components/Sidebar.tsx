import { useMemo, useState } from "react";
import { Moon, PenSquare, Search, Trash2, X } from "lucide-react";
import type { Conversation } from "../types";

interface Props {
  conversations: Conversation[];
  activeId: string | null;
  open: boolean;
  onClose: () => void;
  onNew: () => void;
  onSelect: (id: string) => void;
  onDelete: (id: string) => void;
  onClearAll: () => void;
  onHome: () => void;
}

export default function Sidebar({ conversations, activeId, open, onClose, onNew, onSelect, onDelete, onClearAll, onHome }: Props) {
  const [query, setQuery] = useState("");
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const sorted = [...conversations].sort((a, b) => b.updatedAt - a.updatedAt);
    if (!q) return sorted;
    return sorted.filter((c) => c.title.toLowerCase().includes(q) || c.messages.some((m) => m.content.toLowerCase().includes(q)));
  }, [conversations, query]);

  return (
    <>
      {open && <div className="scrim" onClick={onClose} />}
      <aside className={`sidebar ${open ? "open" : ""}`}>
        <div className="sidebar-top">
          <button className="wordmark" onClick={() => { onHome(); onClose(); }} aria-label="Luno home">
            <Moon size={20} strokeWidth={2.2} /> Luno
          </button>
          <button className="icon-btn mobile-only" onClick={onClose} aria-label="Close sidebar"><X size={18} /></button>
        </div>

        <button className="new-chat" onClick={() => { onNew(); onClose(); }}>
          <PenSquare size={15} /> New chat
        </button>

        <div className="search-box">
          <Search size={14} />
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search chats" />
        </div>

        <div className="conv-list">
          {filtered.length === 0 && <div className="conv-empty">No conversations yet. Everything you start is saved here, in this browser only.</div>}
          {filtered.map((c) => (
            <div key={c.id} className={`conv-item ${c.id === activeId ? "active" : ""}`} onClick={() => { onSelect(c.id); onClose(); }}>
              <span className="conv-title">{c.title}</span>
              <button
                className="conv-delete"
                title="Delete chat"
                onClick={(e) => { e.stopPropagation(); onDelete(c.id); }}
              >
                <Trash2 size={13} />
              </button>
            </div>
          ))}
        </div>

        <div className="sidebar-foot">
          <div className="free-badge">Free to use. No account.<br />Chats never leave this browser.</div>
          {conversations.length > 1 && (
            <button className="clear-all" onClick={onClearAll}>Delete all chats</button>
          )}
        </div>
      </aside>
    </>
  );
}
