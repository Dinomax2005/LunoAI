import { Brain, Check, Cloud, Cpu, ExternalLink, Eye, EyeOff, KeyRound, Laptop, Sparkles, Wrench, X, Zap } from "lucide-react";
import { useState } from "react";
import type { ProviderId, ProviderSettings } from "../types";
import { PROVIDERS, providerInfo } from "../lib/providers";
import { LOCAL_MODELS, webgpuAvailable } from "../lib/webllm";

interface Props {
  settings: ProviderSettings;
  onChange: (s: ProviderSettings) => void;
  onClose: () => void;
}

const TIER_ICON: Record<string, typeof Brain> = {
  brain: Zap, webllm: Laptop, groq: Cloud, openrouter: Cloud, huggingface: Cloud, ollama: Cpu, custom: Wrench,
};

export default function ModelModal({ settings, onChange, onClose }: Props) {
  const [showKey, setShowKey] = useState(false);
  const info = providerInfo(settings.provider);
  const set = (patch: Partial<ProviderSettings>) => onChange({ ...settings, ...patch });

  return (
    <div className="modal-scrim" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <div>
            <h2>Choose your intelligence</h2>
            <p>Every option is free. Switch any time — your chat history carries over.</p>
          </div>
          <button className="icon-btn" onClick={onClose} aria-label="Close"><X size={18} /></button>
        </div>

        <div className="tier-list">
          <button className={`tier ${settings.provider === "brain" ? "selected" : ""}`} onClick={() => set({ provider: "brain" })}>
            <span className="tier-icon"><Zap size={18} /></span>
            <span className="tier-text">
              <strong>Luno Brain · Instant</strong>
              <small>Built-in tools: exact maths, code writer + runner, logic, knowledge. Zero download, works offline. Best for maths/code/facts.</small>
            </span>
            {settings.provider === "brain" && <Check size={18} className="tier-check" />}
          </button>

          <button className={`tier ${settings.provider === "webllm" ? "selected" : ""}`} onClick={() => set({ provider: "webllm" })}>
            <span className="tier-icon"><Laptop size={18} /></span>
            <span className="tier-text">
              <strong>Local Neural · In your browser</strong>
              <small>Real LLMs on your GPU. One free download, then private forever — no key, no server. {webgpuAvailable() ? "✓ WebGPU ready" : "⚠ Needs Chrome/Edge + WebGPU"}</small>
            </span>
            {settings.provider === "webllm" && <Check size={18} className="tier-check" />}
          </button>

          {PROVIDERS.map((p) => {
            const Icon = TIER_ICON[p.id] || Cloud;
            return (
              <button key={p.id} className={`tier ${settings.provider === p.id ? "selected" : ""}`} onClick={() => set({ provider: p.id as ProviderId })}>
                <span className="tier-icon"><Icon size={18} /></span>
                <span className="tier-text">
                  <strong>{p.name}</strong>
                  <small>{p.tagline}</small>
                </span>
                {settings.provider === p.id && <Check size={18} className="tier-check" />}
              </button>
            );
          })}
        </div>

        {settings.provider === "webllm" && (
          <div className="modal-section">
            <label className="field-label">Local model (downloads once, cached by your browser)</label>
            <select value={settings.webllmModel} onChange={(e) => set({ webllmModel: e.target.value })}>
              {LOCAL_MODELS.map((m) => (
                <option key={m.id} value={m.id}>{m.label} — {m.size} · {m.note}</option>
              ))}
            </select>
            <p className="field-note">First message loads the model (watch the progress bar). After that it's instant and works offline. 3B models are the sweet spot; 7B needs a strong GPU.</p>
          </div>
        )}

        {settings.provider !== "brain" && settings.provider !== "webllm" && info && (
          <div className="modal-section">
            <label className="field-label">Model</label>
            <select value={settings.cloudModel} onChange={(e) => set({ cloudModel: e.target.value })}>
              {info.models.map((m) => (
                <option key={m.id} value={m.id}>{m.label} ({m.id})</option>
              ))}
            </select>
            <input
              className="mono-input"
              value={settings.cloudModel}
              onChange={(e) => set({ cloudModel: e.target.value })}
              placeholder="…or type any model id"
            />
            {settings.provider === "custom" && (
              <>
                <label className="field-label">Base URL (OpenAI-compatible, ending in /v1)</label>
                <input className="mono-input" value={settings.customBaseUrl} onChange={(e) => set({ customBaseUrl: e.target.value })} placeholder="http://localhost:1234/v1" />
              </>
            )}
            {info.needsKey && (
              <>
                <label className="field-label"><KeyRound size={13} /> Free API key <span className="opt">(stored only in this browser)</span></label>
                <div className="key-row">
                  <input
                    type={showKey ? "text" : "password"}
                    value={settings.apiKey}
                    onChange={(e) => set({ apiKey: e.target.value })}
                    placeholder="Paste your free key…"
                    autoComplete="off"
                  />
                  <button className="mini-btn" onClick={() => setShowKey((v) => !v)}>{showKey ? <EyeOff size={14} /> : <Eye size={14} />}</button>
                </div>
                {info.keyUrl && (
                  <a className="key-link" href={info.keyUrl} target="_blank" rel="noreferrer">
                    Get a free key <ExternalLink size={12} />
                  </a>
                )}
              </>
            )}
            {settings.provider === "ollama" && (
              <p className="field-note">Start Ollama with CORS for browsers: <code>OLLAMA_ORIGINS=* ollama serve</code>, then <code>ollama pull llama3.2</code> (or your model above).</p>
            )}
          </div>
        )}

        {settings.provider !== "brain" && (
          <div className="modal-section think-section">
            <label className="field-label"><Brain size={14} /> Thinking mode</label>
            <div className="segmented">
              <button className={settings.thinkMode === "fast" ? "on" : ""} onClick={() => set({ thinkMode: "fast" })}>⚡ Fast<small>One pass, instant</small></button>
              <button className={settings.thinkMode === "deep" ? "on" : ""} onClick={() => set({ thinkMode: "deep" })}>🧠 Deep Think<small>Plan → draft → verify → final</small></button>
            </div>
            <p className="field-note">Deep Think is Luno's secret weapon: it catches the arithmetic slips, logic traps and code bugs that make raw free models look dumb. Slower, much smarter. Use it for anything hard.</p>
            <label className="toggle-row">
              <input type="checkbox" checked={settings.toolsEnabled} onChange={(e) => set({ toolsEnabled: e.target.checked })} />
              <span><Wrench size={13} /> Tools: run draft code during verification</span>
            </label>
          </div>
        )}

        <div className="modal-foot">
          <Sparkles size={14} /> Free means free: no Luno account, no Luno server, no telemetry. Keys never leave your browser except to the provider you chose.
        </div>
      </div>
    </div>
  );
}
