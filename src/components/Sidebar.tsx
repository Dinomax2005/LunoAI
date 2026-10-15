import { useMemo, useState } from "react";
import { MessageSquare, Plus, Search, Sparkles, Trash2, X } from "lucide-react";
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
}

export default function Sidebar({ conversations, activeId, open, onClose, onNew, onSelect, onDelete, onClearAll }: Props) {
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
          <div className="brand">
            <div className="brand-orb" />
            <div>
              <div className="brand-name">Luno</div>
              <div className="brand-sub">The smartest free AI</div>
            </div>
          </div>
          <button className="icon-btn mobile-only" onClick={onClose} aria-label="Close sidebar"><X size={18} /></button>
        </div>

        <button className="new-chat" onClick={() => { onNew(); onClose(); }}>
          <Plus size={16} /> New chat
        </button>

        <div className="search-box">
          <Search size={14} />
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search chats…" />
        </div>

        <div className="conv-list">
          {filtered.length === 0 && <div className="conv-empty">No chats yet.<br />Your conversations live here — stored only in this browser.</div>}
          {filtered.map((c) => (
            <div key={c.id} className={`conv-item ${c.id === activeId ? "active" : ""}`} onClick={() => { onSelect(c.id); onClose(); }}>
              <MessageSquare size={14} className="conv-icon" />
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
          <div className="free-badge"><Sparkles size={13} /> $0 forever · no account · private</div>
          {conversations.length > 0 && (
            <button className="clear-all" onClick={onClearAll}>Delete all chats</button>
          )}
        </div>
      </aside>
    </>
  );
}
