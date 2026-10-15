/**
 * Browser-local neural models via WebLLM (MLC) — real LLMs running 100% on
 * the user's GPU, in this tab. Free forever, private by design: after the
 * one-time model download (cached by the browser), inference needs no
 * network at all. This is Luno's flagship free engine.
 */
import type { SimpleMessage } from "./providers";

export interface LocalModel {
  id: string;
  label: string;
  size: string;
  note: string;
}

export const LOCAL_MODELS: LocalModel[] = [
  { id: "Qwen2.5-3B-Instruct-q4f16_1-MLC", label: "Qwen 2.5 · 3B ★ best balance", size: "~1.9 GB", note: "Strong chat, code & reasoning for its size" },
  { id: "Llama-3.2-3B-Instruct-q4f16_1-MLC", label: "Llama 3.2 · 3B", size: "~1.9 GB", note: "Meta's compact flagship-quality small model" },
  { id: "Qwen2.5-1.5B-Instruct-q4f16_1-MLC", label: "Qwen 2.5 · 1.5B (fast download)", size: "~1.0 GB", note: "Quick to load, great for everyday chat" },
  { id: "Llama-3.2-1B-Instruct-q4f16_1-MLC", label: "Llama 3.2 · 1B (fastest)", size: "~0.7 GB", note: "Tiny and instant — good on any laptop" },
  { id: "Phi-3.5-mini-instruct-q4f16_1-MLC", label: "Phi 3.5 Mini · 3.8B", size: "~2.2 GB", note: "Microsoft's reasoning-strong mini" },
  { id: "gemma-2-2b-it-q4f16_1-MLC", label: "Gemma 2 · 2B", size: "~1.4 GB", note: "Google's efficient open model" },
  { id: "Qwen2.5-7B-Instruct-q4f16_1-MLC", label: "Qwen 2.5 · 7B (needs strong GPU)", size: "~4.3 GB", note: "Near-70B feel on a good GPU" },
];

export function localModelLabel(id: string): string {
  return LOCAL_MODELS.find((m) => m.id === id)?.label.replace(/ ★.*$/, "") || id;
}

export function webgpuAvailable(): boolean {
  return typeof navigator !== "undefined" && "gpu" in navigator;
}

// Engine is a singleton: loading a model takes a while, reuse it across chats.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let enginePromise: Promise<any> | null = null;
let loadedModelId: string | null = null;
let progressCb: ((text: string, progress: number) => void) | null = null;

export function onLoadProgress(cb: ((text: string, progress: number) => void) | null) {
  progressCb = cb;
}

export async function getLocalEngine(modelId: string) {
  if (enginePromise && loadedModelId === modelId) return enginePromise;
  enginePromise = null;
  loadedModelId = modelId;
  enginePromise = (async () => {
    if (!webgpuAvailable()) {
      throw new Error(
        "WebGPU isn't available in this browser, so local neural models can't run here. Use Chrome/Edge on a recent device — or pick Groq/OpenRouter (free cloud) or Luno Brain (instant, built-in) instead.",
      );
    }
    const webllm = await import("@mlc-ai/web-llm");
    const worker = new Worker(new URL("../webllm-worker.ts", import.meta.url), { type: "module" });
    const engine = await webllm.CreateWebWorkerMLCEngine(worker, modelId, {
      initProgressCallback: (report: { text: string; progress: number }) => {
        progressCb?.(report.text, report.progress);
      },
    });
    return engine;
  })();
  try {
    return await enginePromise;
  } catch (e) {
    enginePromise = null;
    loadedModelId = null;
    throw e;
  }
}

export async function streamLocalCompletion(
  modelId: string,
  messages: SimpleMessage[],
  opts: { temperature?: number; maxTokens?: number; onToken?: (t: string) => void; signal?: AbortSignal } = {},
): Promise<string> {
  const engine = await getLocalEngine(modelId);
  let full = "";
  const chunks = await engine.chat.completions.create({
    messages,
    temperature: opts.temperature ?? 0.7,
    max_tokens: opts.maxTokens ?? 2048,
    stream: true,
  });
  for await (const chunk of chunks) {
    if (opts.signal?.aborted) throw new DOMException("Aborted", "AbortError");
    const delta = chunk.choices?.[0]?.delta?.content || "";
    if (delta) {
      full += delta;
      opts.onToken?.(delta);
    }
  }
  if (!full.trim()) throw new Error("The local model returned an empty response. Try again or a larger model.");
  return full;
}

export async function localCompleteOnce(
  modelId: string,
  messages: SimpleMessage[],
  opts: { temperature?: number; maxTokens?: number } = {},
): Promise<string> {
  return streamLocalCompletion(modelId, messages, { ...opts });
}

export function unloadLocal() {
  enginePromise = null;
  loadedModelId = null;
}
