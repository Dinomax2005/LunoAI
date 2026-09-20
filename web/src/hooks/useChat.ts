import { useCallback, useRef, useState } from "react";
import type { Conversation, Message, StreamingStatus } from "../types";
import { streamChat } from "../lib/api";
import { uid } from "../lib/storage";

interface ChatStore {
  conversation: Conversation | null;
  appendMessages: (id: string, messages: Message[]) => void;
  patchMessage: (id: string, messageId: string, content: string) => void;
}

/**
 * Chat orchestration. The conversation store is the single source of truth:
 * `useChat` mutates it directly, so there is no local/remote message state
 * to get out of sync when switching conversations.
 */
export function useChat() {
  const [status, setStatus] = useState<StreamingStatus>("idle");
  const [pending, setPending] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  const send = useCallback(
    async (
      raw: string,
      store: ChatStore,
      model: string
    ) => {
      const text = raw.trim();
      if (!text || status === "streaming") return;
      const { conversation, appendMessages, patchMessage } = store;
      if (!conversation) return;

      const history = conversation.messages.map((m) => ({
        id: m.id,
        role: m.role,
        content: m.content,
        createdAt: m.createdAt,
        model: m.model,
      }));

      const userMessage: Message = {
        id: uid(),
        role: "user",
        content: text,
        createdAt: Date.now(),
      };
      const assistantMessage: Message = {
        id: uid(),
        role: "assistant",
        content: "",
        createdAt: Date.now(),
        model,
      };

      const controller = new AbortController();
      abortRef.current = controller;

      appendMessages(conversation.id, [...history, userMessage, assistantMessage]);
      setStatus("streaming");
      setPending(true);

      const assistantId = assistantMessage.id;

      try {
        const apiMessages = [
          { role: "system", content: "You are Luno, a friendly, helpful, local AI." },
          ...history.map((m) => ({ role: m.role, content: m.content })),
          { role: "user", content: text },
        ];

        let acc = "";
        await streamChat(apiMessages, model, (delta) => {
          acc += delta;
          patchMessage(conversation.id, assistantId, acc);
        }, controller.signal);
      } catch (err) {
        const aborted = err instanceof DOMException && err.name === "AbortError";
        if (!aborted) {
          const message = err instanceof Error ? err.message : String(err);
          const current = store.conversation?.messages.find((m) => m.id === assistantId);
          const base = current?.content ?? "";
          const suffix = `\n\n> ⚠️ Could not reach the Luno API (${message}). Start it locally with \`luno serve\` or \`python -m luno.cli serve\`.`;
          patchMessage(conversation.id, assistantId, base ? base + suffix : suffix.trim());
        }
      } finally {
        setStatus("idle");
        setPending(false);
        abortRef.current = null;
      }
    },
    [status]
  );

  const stop = useCallback(() => {
    abortRef.current?.abort();
    setStatus("idle");
    setPending(false);
  }, []);

  return { send, stop, status, pending };
}
