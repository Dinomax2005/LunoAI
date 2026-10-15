import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Brain, Cloud, Cpu, Loader2, Menu, Plus, Sparkles, Trophy, Zap } from "lucide-react";
import type { ChatMessage, Conversation, ProviderSettings } from "./types";
import { uid } from "./types";
import Sidebar from "./components/Sidebar";
import Composer from "./components/Composer";
import MessageView from "./components/MessageView";
import ModelModal from "./components/ModelModal";
import BenchmarkModal from "./components/BenchmarkModal";
import { generateAnswer } from "./lib/brain";
import { providerInfo } from "./lib/providers";
import { LOCAL_MODELS, localModelLabel, onLoadProgress } from "./lib/webllm";
import {
  loadConversations, loadKey, loadSettings, newConversation, saveConversations, saveKey, saveSettings, titleFrom,
} from "./lib/store";

const SUGGESTIONS = [
  "What is 847 × 39?",
  "Solve 3x + 7 = 22",
  "Write a Python function to check if a number is prime",
  "What comes next: 2, 6, 12, 20, 30?",
  "A bat and a ball cost $1.10 — how much is the ball?",
  "Write an email asking for a deadline extension",
  "What is a transformer in machine learning?",
  "Explain photosynthesis like I'm 12",
];

export default function App() {
  const [conversations, setConversations] = useState<Conversation[]>(() => loadConversations());
  const [activeId, setActiveId] = useState<string | null>(null);
  const [settings, setSettings] = useState<ProviderSettings>(() => loadSettings());
  const [streaming, setStreaming] = useState(false);
  const [streamId, setStreamId] = useState<string | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [modelOpen, setModelOpen] = useState(false);
  const [benchOpen, setBenchOpen] = useState(false);
  const [loadProgress, setLoadProgress] = useState<{ text: string; progress: number } | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const active = useMemo(() => conversations.find((c) => c.id === activeId) || null, [conversations, activeId]);
  const messages = active?.messages || [];

  useEffect(() => { saveConversations(conversations); }, [conversations]);
  useEffect(() => { saveSettings(settings); }, [settings]);
  useEffect(() => { onLoadProgress((text, progress) => setLoadProgress({ text, progress })); }, []);

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, activeId]);

  const modelLabel =
    settings.provider === "brain" ? "Luno Brain · Instant" :
    settings.provider === "webllm" ? localModelLabel(settings.webllmModel) + " · Local" :
    `${settings.cloudModel.split("/").pop()} · ${providerInfo(settings.provider)?.name.split(" — ")[0] || "Cloud"}`;

  const patchMessage = useCallback((convId: string, msgId: string, patch: Partial<ChatMessage>) => {
    setConversations((prev) =>
      prev.map((c) =>
        c.id !== convId ? c : { ...c, updatedAt: Date.now(), messages: c.messages.map((m) => (m.id === msgId ? { ...m, ...patch } : m)) },
      ),
    );
  }, []);

  const handleSettings = useCallback((next: ProviderSettings) => {
    setSettings((prev) => {
      // When provider changes, restore that provider's saved key + a sane default model.
      if (next.provider !== prev.provider) {
        const info = providerInfo(next.provider);
        const merged = { ...next, apiKey: loadKey(next.provider) };
        if (info && !(next.provider === "custom")) {
          const known = info.models.some((m) => m.id === next.cloudModel);
          if (!known && ["groq", "openrouter", "huggingface", "ollama"].includes(next.provider)) {
            merged.cloudModel = info.models[0].id;
          }
        }
        // Coming from a cloud provider, seed with that provider's first model.
        if (prev.provider === "brain" || prev.provider === "webllm") {
          if (info) merged.cloudModel = info.models[0].id;
        }
        return merged;
      }
      if (next.apiKey !== prev.apiKey) saveKey(next.provider, next.apiKey);
      return next;
    });
  }, []);

  const startNew = useCallback(() => {
    setActiveId(null);
  }, []);

  const send = useCallback(
    async (raw: string) => {
      const text = raw.trim();
      if (!text || streaming) return;

      let convId = activeId;
      let base = active;
      if (!base) {
        base = newConversation();
        convId = base.id;
        setConversations((prev) => [base!, ...prev]);
        setActiveId(base.id);
      }
      const userMsg: ChatMessage = { id: uid(), role: "user", content: text, createdAt: Date.now() };
      const assistantId = uid();
      const placeholder: ChatMessage = { id: assistantId, role: "assistant", content: "", createdAt: Date.now() };
      const history = [...(base?.messages || []), userMsg];
      const targetConv = convId!;

      setConversations((prev) =>
        prev.map((c) =>
          c.id !== targetConv ? c : {
            ...c,
            title: c.messages.length === 0 ? titleFrom(text) : c.title,
            messages: [...c.messages, userMsg, placeholder],
            updatedAt: Date.now(),
          },
        ),
      );

      setStreaming(true);
      setStreamId(assistantId);
      const controller = new AbortController();
      abortRef.current = controller;
      try {
        await generateAnswer(
          history,
          settings,
          (e) => patchMessage(targetConv, assistantId, { content: e.text, thinking: e.thinking || undefined, engine: e.engine }),
          controller.signal,
        );
      } catch (err) {
        const aborted = (err as Error)?.name === "AbortError";
        patchMessage(targetConv, assistantId, {
          content: aborted
            ? "⏹️ Stopped. Ask again whenever you're ready."
            : `⚠️ **Something stopped me:** ${(err as Error)?.message || String(err)}\n\n**Fastest fix:** open the model picker above and choose **Luno Brain · Instant** (works right now, no setup), or check the provider/key and try again.`,
          engine: "Luno",
        });
      } finally {
        setStreaming(false);
        setStreamId(null);
        setLoadProgress(null);
        abortRef.current = null;
      }
    },
    [active, activeId, patchMessage, settings, streaming],
  );

  const stop = () => abortRef.current?.abort();

  const deleteConv = (id: string) => {
    setConversations((prev) => prev.filter((c) => c.id !== id));
    if (activeId === id) setActiveId(null);
  };

  return (
    <div className="app">
      <Sidebar
        conversations={conversations}
        activeId={activeId}
        open={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
        onNew={startNew}
        onSelect={setActiveId}
        onDelete={deleteConv}
        onClearAll={() => { setConversations([]); setActiveId(null); }}
      />

      <div className="main">
        <header className="topbar">
          <button className="icon-btn mobile-only" onClick={() => setSidebarOpen(true)} aria-label="Open sidebar"><Menu size={18} /></button>
          <button className="model-btn" onClick={() => setModelOpen(true)} title="Choose model / intelligence tier">
            <span className="model-dot" />
            <span>{modelLabel}</span>
          </button>

          {settings.provider !== "brain" && (
            <div className="think-toggle" title="Fast = one pass. Deep Think = plan, draft, verify, final.">
              <button className={settings.thinkMode === "fast" ? "on" : ""} onClick={() => setSettings({ ...settings, thinkMode: "fast" })}>⚡ Fast</button>
              <button className={settings.thinkMode === "deep" ? "on" : ""} onClick={() => setSettings({ ...settings, thinkMode: "deep" })}>🧠 Deep Think</button>
            </div>
          )}

          <div className="topbar-spacer" />
          <button className="ghost-btn" onClick={() => setBenchOpen(true)} title="Run the live benchmark"><Trophy size={15} /> Benchmark</button>
          <button className="icon-btn" onClick={startNew} title="New chat"><Plus size={18} /></button>
        </header>

        {loadProgress && settings.provider === "webllm" && streaming && (
          <div className="load-banner">
            <Loader2 size={15} className="spin" />
            <span>{loadProgress.text || "Loading local model… (one-time download, then cached forever)"}</span>
            <div className="load-bar"><div style={{ width: `${Math.round(loadProgress.progress * 100)}%` }} /></div>
            <strong>{Math.round(loadProgress.progress * 100)}%</strong>
          </div>
        )}

        <div className="chat-scroll" ref={scrollRef}>
          {messages.length === 0 ? (
            <div className="welcome">
              <div className="welcome-orb" />
              <h1>The smartest <span className="grad">free</span> AI.</h1>
              <p>
                Frontier-style intelligence at $0 — exact tools, real neural models on your own GPU,
                free 70B-class cloud giants, and Deep Think verification on top. No account. No paid API. Ever.
              </p>
              <div className="tier-cards">
                <div className="tier-card">
                  <Zap className="tc-icon" size={20} />
                  <h3>Instant Brain</h3>
                  <p>Zero-download tools that <em>compute</em> maths, write &amp; run code, and solve logic traps. Ask below — right now.</p>
                </div>
                <div className="tier-card">
                  <Cpu className="tc-icon" size={20} />
                  <h3>Local Neural</h3>
                  <p>Qwen 2.5 / Llama 3.2 running on <em>your</em> GPU in this tab. One download, private forever.</p>
                </div>
                <div className="tier-card">
                  <Cloud className="tc-icon" size={20} />
                  <h3>Free-Cloud 70B</h3>
                  <p>Llama 3.3 70B &amp; DeepSeek via free tiers + <strong>Deep Think</strong>: plan → draft → verify → final.</p>
                </div>
              </div>
              <div className="chips">
                {SUGGESTIONS.map((s) => (
                  <button key={s} className="chip" onClick={() => send(s)}>{s}</button>
                ))}
              </div>
              <p style={{ marginTop: 22, fontSize: 13 }}>
                <Sparkles size={13} style={{ verticalAlign: -2 }} /> Tip: press <strong>Benchmark</strong> (top right) and watch Luno ace a live test — then connect a 70B model and ask it something <em>really</em> hard.
              </p>
              <p style={{ display: "none" }}><Brain size={1} />{LOCAL_MODELS.length} local models ready</p>
            </div>
          ) : (
            <div className="chat-inner">
              {messages.map((m) => (
                <MessageView key={m.id} message={m} streaming={streaming && m.id === streamId} />
              ))}
            </div>
          )}
        </div>

        <Composer streaming={streaming} onSend={send} onStop={stop} />
      </div>

      {modelOpen && <ModelModal settings={settings} onChange={handleSettings} onClose={() => setModelOpen(false)} />}
      {benchOpen && <BenchmarkModal onClose={() => setBenchOpen(false)} />}
    </div>
  );
}
