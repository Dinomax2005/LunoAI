import type { Conversation, ProviderSettings } from "../types";
import { uid } from "../types";

const CONV_KEY = "luno.conversations.v2";
const SETTINGS_KEY = "luno.settings.v2";

export const DEFAULT_SETTINGS: ProviderSettings = {
  provider: "brain",
  webllmModel: "Qwen2.5-3B-Instruct-q4f16_1-MLC",
  apiKey: "",
  cloudModel: "llama-3.3-70b-versatile",
  customBaseUrl: "http://localhost:1234/v1",
  thinkMode: "deep",
  toolsEnabled: true,
};

export function loadConversations(): Conversation[] {
  try {
    const raw = localStorage.getItem(CONV_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function saveConversations(convs: Conversation[]) {
  try {
    localStorage.setItem(CONV_KEY, JSON.stringify(convs.slice(0, 60)));
  } catch { /* storage full — chats still work for the session */ }
}

export function loadSettings(): ProviderSettings {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (!raw) return { ...DEFAULT_SETTINGS };
    return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export function saveSettings(s: ProviderSettings) {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(s));
  } catch { /* ignore */ }
}

// Keys are kept per-provider so switching providers doesn't lose them.
const KEYS_KEY = "luno.keys.v2";
export function loadKey(provider: string): string {
  try {
    return JSON.parse(localStorage.getItem(KEYS_KEY) || "{}")[provider] || "";
  } catch {
    return "";
  }
}
export function saveKey(provider: string, key: string) {
  try {
    const all = JSON.parse(localStorage.getItem(KEYS_KEY) || "{}");
    all[provider] = key;
    localStorage.setItem(KEYS_KEY, JSON.stringify(all));
  } catch { /* ignore */ }
}

export function newConversation(): Conversation {
  const now = Date.now();
  return { id: uid(), title: "New chat", messages: [], createdAt: now, updatedAt: now };
}

export function titleFrom(text: string): string {
  const t = text.replace(/\s+/g, " ").trim();
  return t.length > 42 ? t.slice(0, 42) + "…" : t || "New chat";
}
