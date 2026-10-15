export type Role = "system" | "user" | "assistant";

export interface ChatMessage {
  id: string;
  role: Role;
  content: string;
  /** Reasoning / tool trace shown in the collapsible "Thought process" panel. */
  thinking?: string;
  /** Which engine produced this message, e.g. "Luno Brain", "Qwen2.5 3B (local)". */
  engine?: string;
  createdAt: number;
}

export interface Conversation {
  id: string;
  title: string;
  messages: ChatMessage[];
  createdAt: number;
  updatedAt: number;
}

export type ThinkMode = "fast" | "deep";

export type ProviderId =
  | "brain"
  | "webllm"
  | "groq"
  | "openrouter"
  | "huggingface"
  | "ollama"
  | "custom";

export interface ProviderSettings {
  provider: ProviderId;
  /** WebLLM model id (browser-local neural model). */
  webllmModel: string;
  /** API key — stored ONLY in this browser's localStorage. Never sent anywhere except the chosen provider. */
  apiKey: string;
  /** Model name for cloud / custom providers. */
  cloudModel: string;
  /** Base URL for the "custom" OpenAI-compatible provider. */
  customBaseUrl: string;
  thinkMode: ThinkMode;
  toolsEnabled: boolean;
}

export interface StreamEvent {
  /** Incremental answer text (the full text so far). */
  text: string;
  /** Incremental thinking trace (the full trace so far). */
  thinking: string;
  engine: string;
  done: boolean;
}

export function uid(): string {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}
