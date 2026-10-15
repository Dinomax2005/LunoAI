/**
 * Free-cloud providers — OpenAI-compatible clients that run from the browser.
 * Every option here is free to use; keys (where needed) are free to create,
 * are stored only in your browser, and are sent only to the provider you pick.
 */
import type { ChatMessage, ProviderId } from "../types";

export interface ProviderInfo {
  id: ProviderId;
  name: string;
  tagline: string;
  baseUrl: string;
  needsKey: boolean;
  keyUrl?: string;
  models: { id: string; label: string }[];
}

export const PROVIDERS: ProviderInfo[] = [
  {
    id: "groq",
    name: "Groq — free cloud",
    tagline: "Llama 3.3 70B on Groq's free tier. Fast, and the strongest free option here.",
    baseUrl: "https://api.groq.com/openai/v1",
    needsKey: true,
    keyUrl: "https://console.groq.com/keys",
    models: [
      { id: "llama-3.3-70b-versatile", label: "Llama 3.3 70B Versatile (recommended)" },
      { id: "llama-3.1-8b-instant", label: "Llama 3.1 8B Instant (fastest)" },
      { id: "deepseek-r1-distill-llama-70b", label: "DeepSeek R1 Distill 70B (reasoning)" },
      { id: "qwen-qwq-32b", label: "Qwen QwQ 32B (reasoning)" },
      { id: "gemma2-9b-it", label: "Gemma 2 9B" },
    ],
  },
  {
    id: "openrouter",
    name: "OpenRouter — Free Models",
    tagline: "DeepSeek V3 / R1 and Llama 70B free variants behind one free key.",
    baseUrl: "https://openrouter.ai/api/v1",
    needsKey: true,
    keyUrl: "https://openrouter.ai/keys",
    models: [
      { id: "deepseek/deepseek-chat-v3-0324:free", label: "DeepSeek V3 (free tier)" },
      { id: "deepseek/deepseek-r1:free", label: "DeepSeek R1 :free (reasoning)" },
      { id: "meta-llama/llama-3.3-70b-instruct:free", label: "Llama 3.3 70B :free" },
      { id: "google/gemini-2.0-flash-exp:free", label: "Gemini 2.0 Flash Exp :free" },
      { id: "qwen/qwen-2.5-coder-32b-instruct:free", label: "Qwen 2.5 Coder 32B :free (code)" },
    ],
  },
  {
    id: "huggingface",
    name: "Hugging Face — Free Inference",
    tagline: "Open models on HF's free inference providers with a free token.",
    baseUrl: "https://router.huggingface.co/v1",
    needsKey: true,
    keyUrl: "https://huggingface.co/settings/tokens",
    models: [
      { id: "meta-llama/Llama-3.3-70B-Instruct", label: "Llama 3.3 70B Instruct" },
      { id: "Qwen/Qwen2.5-72B-Instruct", label: "Qwen 2.5 72B Instruct" },
      { id: "deepseek-ai/DeepSeek-R1", label: "DeepSeek R1" },
      { id: "Qwen/Qwen2.5-Coder-32B-Instruct", label: "Qwen 2.5 Coder 32B (code)" },
    ],
  },
  {
    id: "ollama",
    name: "Ollama — Your Computer",
    tagline: "Models on your own machine via Ollama. No key, fully private.",
    baseUrl: "http://localhost:11434/v1",
    needsKey: false,
    models: [
      { id: "llama3.2", label: "llama3.2 (run: ollama pull llama3.2)" },
      { id: "qwen2.5-coder", label: "qwen2.5-coder (code)" },
      { id: "deepseek-r1", label: "deepseek-r1 (reasoning)" },
    ],
  },
  {
    id: "custom",
    name: "Custom Endpoint",
    tagline: "Any OpenAI-compatible server: LM Studio, vLLM, a tunnel — anything.",
    baseUrl: "http://localhost:1234/v1",
    needsKey: false,
    models: [{ id: "local-model", label: "local-model (edit below)" }],
  },
];

export function providerInfo(id: ProviderId): ProviderInfo | undefined {
  return PROVIDERS.find((p) => p.id === id);
}

export const LUNO_SYSTEM_PROMPT = `You are Luno, a free AI assistant. Answer as carefully as the best assistants do:

- Think step by step internally before answering. Show clear reasoning for math, logic and code; verify calculations and mentally test code before presenting it.
- Be accurate over confident: if you are unsure, say what you know, what you don't, and how to check. Never invent facts, citations, APIs or results.
- Use markdown well: short intro, structured sections when useful, tables for comparisons, fenced code blocks with language tags. Code must be complete, runnable and include a brief explanation + example.
- For math, show the working and give the exact answer (and decimal) clearly.
- Match the user's language and tone. Be warm and direct, not robotic. No filler like "As an AI language model".
- Prefer depth when the question deserves it; be concise for simple questions. Ask a clarifying question only when truly ambiguous.`;

export interface SimpleMessage { role: string; content: string }

export function toApiMessages(history: ChatMessage[], extraSystem?: string): SimpleMessage[] {
  const msgs: SimpleMessage[] = [
    { role: "system", content: LUNO_SYSTEM_PROMPT + (extraSystem ? "\n\n" + extraSystem : "") },
  ];
  for (const m of history) {
    if (m.role === "system") continue;
    msgs.push({ role: m.role, content: m.content });
  }
  return msgs;
}

export interface CompletionOptions {
  baseUrl: string;
  apiKey: string;
  model: string;
  messages: SimpleMessage[];
  temperature?: number;
  maxTokens?: number;
  onToken?: (token: string) => void;
  signal?: AbortSignal;
}

/** Stream an OpenAI-compatible chat completion. Returns the full text. */
export async function streamCompletion(opts: CompletionOptions): Promise<string> {
  const url = opts.baseUrl.replace(/\/$/, "") + "/chat/completions";
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (opts.apiKey) headers["Authorization"] = `Bearer ${opts.apiKey}`;
  // OpenRouter niceties (ignored elsewhere)
  if (url.includes("openrouter.ai")) {
    headers["HTTP-Referer"] = location.origin;
    headers["X-Title"] = "Luno AI";
  }

  const body = {
    model: opts.model,
    messages: opts.messages,
    temperature: opts.temperature ?? 0.7,
    max_tokens: opts.maxTokens ?? 2048,
    stream: true,
  };

  let res: Response;
  try {
    res = await fetch(url, { method: "POST", headers, body: JSON.stringify(body), signal: opts.signal });
  } catch (e) {
    throw new Error(
      `Could not reach the model server (${url}). Check your connection${url.includes("localhost") ? " and that the local server is running with CORS enabled (Ollama: set OLLAMA_ORIGINS=*)" : ""}. (${(e as Error).message})`,
    );
  }
  if (!res.ok || !res.body) {
    let detail = "";
    try { detail = (await res.text()).slice(0, 400); } catch { /* ignore */ }
    if (res.status === 401 || res.status === 403) throw new Error(`The provider rejected the API key (HTTP ${res.status}). Create/check your free key and paste it in Settings. ${detail}`);
    if (res.status === 404) throw new Error(`Model or endpoint not found (HTTP 404). Check the model name in the picker. ${detail}`);
    if (res.status === 429) throw new Error(`Free-tier rate limit hit (HTTP 429). Wait a moment and try again — or switch model/provider. ${detail}`);
    throw new Error(`Provider error HTTP ${res.status}. ${detail}`);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let full = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() || "";
    for (const line of lines) {
      const t = line.trim();
      if (!t.startsWith("data:")) continue;
      const data = t.slice(5).trim();
      if (data === "[DONE]") break;
      try {
        const json = JSON.parse(data);
        const delta = json.choices?.[0]?.delta?.content || json.choices?.[0]?.message?.content || "";
        if (delta) {
          full += delta;
          opts.onToken?.(delta);
        }
      } catch { /* partial JSON — wait for more */ }
    }
  }
  if (!full.trim()) throw new Error("The model returned an empty response. Try again or pick another model.");
  return full;
}

/** One-shot (non-streaming) completion for internal Deep Think steps. */
export async function completeOnce(
  opts: Omit<CompletionOptions, "onToken"> & { prefill?: string },
): Promise<string> {
  let streamed = "";
  return streamCompletion({ ...opts, onToken: (t) => { streamed += t; } }).then(() => streamed);
}
