import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowRight, ArrowUpRight, ChevronDown, Menu, Moon, Plus } from "lucide-react";
import type { ChatMessage, Conversation, ProviderSettings } from "./types";
import { uid } from "./types";
import Sidebar from "./components/Sidebar";
import Composer from "./components/Composer";
import MessageView from "./components/MessageView";
import ModelModal from "./components/ModelModal";
import BenchmarkModal from "./components/BenchmarkModal";
import { generateAnswer } from "./lib/brain";
import { providerInfo } from "./lib/providers";
import { localModelLabel, onLoadProgress } from "./lib/webllm";
import {
  loadConversations, loadKey, loadSettings, newConversation, saveConversations, saveKey, saveSettings, titleFrom,
} from "./lib/store";

const SUGGESTIONS = [
  "What is 847 × 39?",
  "Solve 3x + 7 = 22",
  "Write a Python function to check whether a number is prime",
  "What comes next in the sequence 2, 6, 12, 20, 30?",
  "A bat and a ball cost $1.10 in total. How much does the ball cost?",
  "Write an email asking for a deadline extension",
];

function Wordmark({ onClick }: { onClick?: () => void }) {
  return (
    <button className="wordmark" onClick={onClick} aria-label="Luno home">
      <Moon size={21} strokeWidth={2.2} /> Luno
    </button>
  );
}

export default function App() {
  const [view, setView] = useState<"home" | "chat">("home");
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
  }, [messages, activeId, view]);

  const modelLabel =
    settings.provider === "brain" ? "Luno Brain" :
    settings.provider === "webllm" ? localModelLabel(settings.webllmModel) :
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
      if (next.provider !== prev.provider) {
        const info = providerInfo(next.provider);
        const merged = { ...next, apiKey: loadKey(next.provider) };
        if (info && next.provider !== "custom") {
          const known = info.models.some((m) => m.id === next.cloudModel);
          if (!known || prev.provider === "brain" || prev.provider === "webllm") merged.cloudModel = info.models[0].id;
        }
        return merged;
      }
      if (next.apiKey !== prev.apiKey) saveKey(next.provider, next.apiKey);
      return next;
    });
  }, []);

  const startNew = useCallback(() => { setActiveId(null); setView("chat"); }, []);

  const send = useCallback(
    async (raw: string) => {
      const text = raw.trim();
      if (!text || streaming) return;
      setView("chat");

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
            ? "Stopped. Ask again whenever you're ready."
            : `Something interrupted that answer: ${(err as Error)?.message || String(err)}\n\nThe quickest fix is to open the model menu above and choose **Luno Brain** — it runs entirely on this page with no setup — or check the provider and key, then try again.`,
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

  /* ------------------------------------------------------------------ */
  /* Site (landing)                                                      */
  /* ------------------------------------------------------------------ */
  if (view === "home") {
    return (
      <div className="site">
        <header className="site-nav">
          <Wordmark />
          <nav>
            <a href="#models">Models</a>
            <a href="#how">How it works</a>
            <a href="#benchmark">Benchmark</a>
            <a href="#faq">FAQ</a>
          </nav>
          <div className="nav-right">
            <a className="nav-github" href="https://github.com/Dinomax2005/LunoAI" target="_blank" rel="noreferrer">
              GitHub <ArrowUpRight size={14} />
            </a>
            <button className="btn-dark" onClick={startNew}>Start chatting</button>
          </div>
        </header>

        <div className="site-main">
          <section className="hero">
            <div className="overline">Free AI assistant · No account</div>
            <h1>A capable assistant,<br /><em>without the paywall.</em></h1>
            <p className="hero-sub">
              Luno runs open models directly in your browser, or connects to free model tiers,
              and checks its own work before it answers. Ask it something to begin.
            </p>
            <Composer streaming={streaming} onSend={send} onStop={stop} />
            <div className="hero-examples">
              {SUGGESTIONS.slice(0, 4).map((s) => (
                <button key={s} className="example-chip" onClick={() => send(s)}>{s}</button>
              ))}
            </div>
            <p className="hero-models">
              Works with <strong>Qwen 2.5</strong> · <strong>Llama 3.2 &amp; 3.3</strong> · <strong>DeepSeek</strong> · <strong>Phi 3.5</strong> · <strong>Gemma 2</strong> — locally or on free tiers
            </p>
          </section>

          <section className="section" id="models">
            <div className="section-head">
              <div className="kicker">Models</div>
              <h2>Three ways to run it, all free</h2>
              <p>You don't pay for intelligence here — you choose where it runs. Switch at any time from the model menu in chat; your conversation comes with you.</p>
            </div>
            <div className="model-table-wrap">
              <table className="model-table">
                <thead>
                  <tr><th>Setup</th><th>Where it runs</th><th>Download</th><th>Good for</th></tr>
                </thead>
                <tbody>
                  <tr>
                    <td>Luno Brain<small>built in, default</small></td>
                    <td>This page. No network needed.</td>
                    <td>None</td>
                    <td>Maths, code, logic puzzles, quick facts — answered by exact tools, not guesswork.</td>
                  </tr>
                  <tr>
                    <td>Qwen 2.5 · 3B<small>or Llama 3.2, Phi 3.5, Gemma 2</small></td>
                    <td>Your GPU, in this tab (WebGPU).</td>
                    <td>0.7–4.3 GB, once</td>
                    <td>Everyday chat and writing that stays completely private and works offline.</td>
                  </tr>
                  <tr>
                    <td>Llama 3.3 · 70B<small>via Groq free tier</small></td>
                    <td>Groq's servers, free tier.</td>
                    <td>None — free key</td>
                    <td>Hard questions, long writing, analysis. The strongest option here.</td>
                  </tr>
                  <tr>
                    <td>DeepSeek V3 / R1<small>via OpenRouter free models</small></td>
                    <td>OpenRouter, free tier.</td>
                    <td>None — free key</td>
                    <td>Reasoning-heavy problems and code.</td>
                  </tr>
                </tbody>
              </table>
            </div>
            <p className="table-note">Keys are free to create (Groq and OpenRouter links are in the model menu), and are stored only in your browser. Nothing passes through a Luno server — there isn't one.</p>
          </section>

          <section className="section" id="how">
            <div className="section-head">
              <div className="kicker">How it works</div>
              <h2>It checks itself before it answers</h2>
              <p>Raw models — free or paid — share the same weakness: they sound right even when they're wrong. Luno's default mode for neural models adds a verification pass, and its built-in tools replace guessing with computing.</p>
            </div>
            <div className="steps">
              <div className="step">
                <div className="step-num">Step one</div>
                <h3>Plan</h3>
                <p>The model first outlines how it will approach your question — what to calculate, what to watch out for, how it will know it's right.</p>
              </div>
              <div className="step">
                <div className="step-num">Step two</div>
                <h3>Draft, then verify</h3>
                <p>It writes a draft, then reviews it as a sceptic: re-checking arithmetic, testing logic, and actually running any JavaScript it wrote.</p>
              </div>
              <div className="step">
                <div className="step-num">Step three</div>
                <h3>Answer</h3>
                <p>You get the corrected final answer. The reasoning is kept under “Thought process” if you want to inspect it — most of the time you won't need to.</p>
              </div>
            </div>
          </section>

          <section className="section">
            <div className="verify-grid">
              <div>
                <div className="kicker">Why verification matters</div>
                <h2>Intuition is fast. It's also wrong.</h2>
                <p>The question on the right is from a well-known study of human reasoning. Most people — and many chatbots answering quickly — say ten cents. It's wrong, and a five-second check proves it.</p>
                <p>Luno is built around that check. Maths is computed by a parser, equations are solved and substituted back, code is executed, and neural answers are verified before you see them.</p>
              </div>
              <div className="worked-example">
                <div className="we-label">Try it in chat</div>
                <div className="we-q">“A bat and a ball cost $1.10 in total. The bat costs $1.00 more than the ball. How much does the ball cost?”</div>
                <div className="we-a">
                  Let the ball cost <code>x</code>. Then <code>x + (x + 1.00) = 1.10</code>, so <code>2x = 0.10</code> and <strong>the ball costs $0.05</strong>. Check: $1.05 + $0.05 = $1.10.
                </div>
              </div>
            </div>
          </section>

          <section className="section" id="benchmark">
            <div className="bench-band">
              <div className="bench-big">15<small> / 15</small></div>
              <div className="bench-copy">
                <div className="kicker">Benchmark</div>
                <h2>Don't take our word for it</h2>
                <p>Fifteen questions — arithmetic, algebra, logic traps, code, general knowledge — graded automatically in your browser. Run it yourself, expand any answer, and check our working.</p>
                <button className="btn-dark" onClick={() => setBenchOpen(true)}>Run the benchmark <ArrowRight size={15} style={{ verticalAlign: -2 }} /></button>
              </div>
            </div>
          </section>

          <section className="section">
            <div className="section-head">
              <div className="kicker">Principles</div>
              <h2>Free as in actually free</h2>
            </div>
            <div className="principles">
              <div className="principle">
                <h3>No account, ever</h3>
                <p>There's no sign-up because there's no server to sign up to. The page you're reading is the whole product.</p>
              </div>
              <div className="principle">
                <h3>Your chats stay yours</h3>
                <p>Conversations are stored in your browser's local storage. Local models never send a keystroke anywhere.</p>
              </div>
              <div className="principle">
                <h3>Honest about limits</h3>
                <p>When the built-in tools can't do something well, Luno says so and points you to the model that can — instead of improvising.</p>
              </div>
            </div>
          </section>

          <section className="section" id="faq">
            <div className="section-head">
              <div className="kicker">FAQ</div>
              <h2>Common questions</h2>
            </div>
            <div className="faq-list">
              {[
                ["Is it really free? What's the catch?", "There isn't one, because there's no Luno infrastructure to fund. The page is static, local models run on your hardware, and cloud models run on Groq / OpenRouter / Hugging Face free tiers under your own free key. If a free tier ever changes its terms, you can switch providers in the model menu in seconds."],
                ["How do I get the strongest answers?", "Open a chat, tap the model name at the top, and either download Qwen 2.5 3B to run locally, or add a free Groq key and choose Llama 3.3 70B. Leave thinking set to Deep for anything difficult — it's slower, deliberately."],
                ["Which browser do I need for local models?", "A recent Chrome or Edge with WebGPU. The download (under 2 GB for the 3B models) happens once and is cached. If WebGPU isn't available, Luno Brain and the free cloud tiers work in any modern browser."],
                ["Can it write and run code?", "Yes. Ask for Python or JavaScript and press Run on the code block — JavaScript executes immediately, Python loads a browser runtime on first use. With Deep Think on, Luno runs its own draft code during verification before answering."],
                ["Where do my API keys go?", "Into your browser's local storage, and from there only to the provider you selected (Groq, OpenRouter, Hugging Face, or your own endpoint). You can clear them any time by clearing site data."],
              ].map(([q, a]) => (
                <details key={q} className="faq-item">
                  <summary>{q}</summary>
                  <div className="faq-body">{a}</div>
                </details>
              ))}
            </div>
          </section>
        </div>

        <footer className="site-footer">
          <div className="footer-inner">
            <Wordmark />
            <span>Free AI assistant. MIT-licensed, open source.</span>
            <nav>
              <a href="#models">Models</a>
              <a href="#how">How it works</a>
              <a href="#benchmark">Benchmark</a>
              <a href="https://github.com/Dinomax2005/LunoAI" target="_blank" rel="noreferrer">GitHub</a>
            </nav>
          </div>
        </footer>

        {modelOpen && <ModelModal settings={settings} onChange={handleSettings} onClose={() => setModelOpen(false)} />}
        {benchOpen && <BenchmarkModal onClose={() => setBenchOpen(false)} />}
      </div>
    );
  }

  /* ------------------------------------------------------------------ */
  /* Chat                                                                */
  /* ------------------------------------------------------------------ */
  return (
    <div className="app">
      <Sidebar
        conversations={conversations}
        activeId={activeId}
        open={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
        onNew={startNew}
        onSelect={(id) => { setActiveId(id); setView("chat"); }}
        onDelete={deleteConv}
        onClearAll={() => { setConversations([]); setActiveId(null); }}
        onHome={() => setView("home")}
      />

      <div className="main">
        <header className="topbar">
          <button className="icon-btn mobile-only" onClick={() => setSidebarOpen(true)} aria-label="Open sidebar"><Menu size={19} /></button>
          <button className="model-btn" onClick={() => setModelOpen(true)} title="Choose a model">
            <span>{modelLabel}</span>
            <ChevronDown size={15} className="chev" />
          </button>

          {settings.provider !== "brain" && (
            <div className="think-toggle" title="Fast answers in one pass. Deep thinks, drafts, verifies, then answers.">
              <button className={settings.thinkMode === "fast" ? "on" : ""} onClick={() => setSettings({ ...settings, thinkMode: "fast" })}>Fast</button>
              <button className={settings.thinkMode === "deep" ? "on" : ""} onClick={() => setSettings({ ...settings, thinkMode: "deep" })}>Deep think</button>
            </div>
          )}

          <div className="topbar-spacer" />
          <button className="ghost-btn" onClick={() => setBenchOpen(true)}>Benchmark</button>
          <button className="icon-btn" onClick={startNew} title="New chat"><Plus size={19} /></button>
        </header>

        {loadProgress && settings.provider === "webllm" && streaming && (
          <div className="load-banner">
            <span>{loadProgress.text || "Downloading the model — this happens once, then it's cached."}</span>
            <div className="load-bar"><div style={{ width: `${Math.round(loadProgress.progress * 100)}%` }} /></div>
            <strong>{Math.round(loadProgress.progress * 100)}%</strong>
          </div>
        )}

        <div className="chat-scroll" ref={scrollRef}>
          {messages.length === 0 ? (
            <div className="chat-empty">
              <h1>What can I help with?</h1>
              <p>Ask a question, set a problem, or describe the code you need. Maths and code work straight away; for open-ended questions, pick a neural model above.</p>
              <div className="chat-suggestions">
                {SUGGESTIONS.map((s) => (
                  <button key={s} className="chat-suggestion" onClick={() => send(s)}>
                    <span>{s}</span><span className="arr">→</span>
                  </button>
                ))}
              </div>
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
