import type { ChatChunk, ModelsResponse } from "../types";

/**
 * Which Luno API to talk to.
 *
 * 1. `localStorage["luno_api_base"]` — an explicit override the user set.
 * 2. A base discovered at runtime (see `setApiBase` + `discoverApiBase`).
 * 3. Same-origin (works when `luno serve` hosts the built web UI, and in
 *    dev through the Vite proxy that forwards /v1 to 127.0.0.1:8787).
 */

let runtimeBase: string | null = null;

export function apiBase(): string {
  const override = localStorage.getItem("luno_api_base");
  if (override) return override.replace(/\/+$/, "");
  if (runtimeBase) return runtimeBase;
  return window.location.origin;
}

/** Set the API base for this page load (does not persist). */
export function setApiBase(url: string): void {
  runtimeBase = url.replace(/\/+$/, "");
}

/**
 * Find a reachable Luno API, trying sensible candidates in order.
 * Used when the site is hosted somewhere (e.g. GitHub Pages) but the model
 * runs on the user's own machine.
 */
export async function discoverApiBase(): Promise<string | null> {
  const explicit = localStorage.getItem("luno_api_base");
  const candidates = [
    explicit,
    window.location.origin,
    "http://localhost:8787",
    "http://127.0.0.1:8787",
  ].filter((c): c is string => !!c);

  // Dedupe while preserving order.
  const seen = new Set<string>();
  for (const base of candidates) {
    const url = base.replace(/\/+$/, "");
    if (seen.has(url)) continue;
    seen.add(url);
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 2500);
      const res = await fetch(`${url}/health`, { signal: controller.signal });
      clearTimeout(timer);
      if (res.ok) {
        if (!explicit) setApiBase(url);
        return url;
      }
    } catch {
      // try next candidate
    }
  }
  return null;
}

/** Fetch the Luno model family from the API. */
export async function fetchModels(): Promise<ModelsResponse["data"]> {
  const res = await fetch(`${apiBase()}/v1/models`);
  if (!res.ok) throw new Error(`Failed to load models (${res.status})`);
  const body: ModelsResponse = await res.json();
  return body.data ?? [];
}

/** Send a chat request and consume its Server-Sent-Events stream. */
export async function streamChat(
  messages: { role: string; content: string }[],
  model: string,
  onChunk: (text: string) => void,
  signal: AbortSignal
): Promise<void> {
  const res = await fetch(`${apiBase()}/v1/chat/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model,
      messages,
      stream: true,
      max_tokens: 800,
      temperature: 0.8,
    }),
    signal,
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`Luno returned ${res.status}: ${detail.slice(0, 140)}`);
  }
  if (!res.body) throw new Error("No response body received.");

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed.startsWith("data:")) continue;
      const payload = trimmed.slice(5).trim();
      if (!payload || payload === "[DONE]") continue;
      try {
        const chunk: ChatChunk = JSON.parse(payload);
        const delta = chunk.choices?.[0]?.delta?.content;
        if (delta) onChunk(delta);
      } catch {
        // ignore malformed frames; keep streaming
      }
    }
  }
}
