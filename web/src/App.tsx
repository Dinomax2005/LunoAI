import { useEffect, useState } from "react";
import Sidebar from "./components/Sidebar";
import ChatView from "./components/ChatView";
import Composer from "./components/Composer";
import { useConversations } from "./hooks/useConversations";
import { useChat } from "./hooks/useChat";
import { useApiStatus } from "./hooks/useApiStatus";
import { MobileSidebar } from "./components/MobileSidebar";
import { ModelPicker } from "./components/ModelPicker";
import { ConnectionSettings } from "./components/ConnectionSettings";

export default function App() {
  const store = useConversations();
  const {
    conversations,
    activeId,
    activeConversation,
    setActiveId,
    createConversation,
    appendMessages,
    patchMessage,
    deleteConversation,
    clearConversationMessages,
    collapsed,
    setCollapsed,
  } = store;

  const { send, stop, status, pending } = useChat();
  const { status: apiStatus, base: apiBase, refresh: refreshApi } = useApiStatus();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [connOpen, setConnOpen] = useState(false);
  const [isDesktop, setIsDesktop] = useState(
    () => window.matchMedia("(min-width: 900px)").matches
  );

  useEffect(() => {
    const mq = window.matchMedia("(min-width: 900px)");
    const onChange = () => setIsDesktop(mq.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  const messages = activeConversation?.messages ?? [];

  const handleSend = async (raw: string) => {
    const model = activeConversation?.model ?? "luno-zero-0.1";
    await send(raw, { conversation: activeConversation, appendMessages, patchMessage }, model);
  };

  const handleNewChat = () => {
    if (status === "streaming") stop();
    createConversation();
  };

  const sidebarContent = (
    <Sidebar
      conversations={conversations}
      activeId={activeId}
      collapsed={collapsed}
      onToggleCollapse={() => setCollapsed(!collapsed)}
      onNewChat={handleNewChat}
      onSelect={(id) => {
        if (activeId !== id) setActiveId(id);
        setMobileOpen(false);
      }}
      onDelete={deleteConversation}
    />
  );

  return (
    <div className="app-shell">
      {isDesktop ? (
        <aside className="sidebar-rail">{sidebarContent}</aside>
      ) : (
        <MobileSidebar
          open={mobileOpen}
          onClose={() => setMobileOpen(false)}
          conversations={conversations}
          activeId={activeId}
          onNewChat={handleNewChat}
          onSelect={(id) => {
            if (activeId !== id) setActiveId(id);
            setMobileOpen(false);
          }}
          onDelete={deleteConversation}
        />
      )}

      <div className="app-main">
        <header className="topbar">
          <div className="topbar-left">
            {!isDesktop && (
              <button
                className="icon-button"
                aria-label="Open menu"
                onClick={() => setMobileOpen(true)}
              >
                <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
                  <path d="M4 6h16M4 12h16M4 18h16" />
                </svg>
              </button>
            )}
            <ModelPicker
              activeId={activeId}
              conversations={conversations}
              onChange={store.updateModel}
            />
          </div>
          <div className="topbar-right">
            <button
              className="connection-pill"
              onClick={() => setConnOpen((v) => !v)}
              title="API connection settings"
            >
              <span className={`dot ${apiStatus}`} />
              {pending
                ? "Luno is replying…"
                : apiStatus === "online"
                ? "Luno (local)"
                : apiStatus === "checking"
                ? "Checking…"
                : "No connection"}
            </button>
            {connOpen && (
              <div className="conn-popover">
                <ConnectionSettings
                  status={apiStatus}
                  base={apiBase}
                  onApply={(url) => {
                    refreshApi(url);
                    setConnOpen(false);
                  }}
                />
              </div>
            )}
          </div>
        </header>

        <ChatView
          messages={messages}
          status={status}
          pending={pending}
          onRetry={handleSend}
          activeId={activeId}
          onClear={() => clearConversationMessages(activeId)}
        />

        <Composer onSend={handleSend} onStop={stop} status={status} disabled={pending} />
      </div>
    </div>
  );
}
