import { useCallback, useRef, useState } from "react";
import type { Conversation, Message, StreamingStatus } from "../types";
import { streamChat } from "../lib/api";
import { uid } from "../lib/storage";
import { chunkText, generateReply } from "../engine/minizero";

interface ChatStore {
  conversation: Conversation | null;
  appendMessages: (id: string, messages: Message[]) => void;
  patchMessage: (id: string, messageId: string, content: string) => void;
}

/**
 * Chat orchestration. The conversation store is the single source of truth.
 *
 * Reaches a real Luno API when possible; otherwise falls back to the
 * built-in in-browser engine so Luno works with zero installs.
 */
export function useChat() {
  const [status, setStatus] = useState<StreamingStatus>("idle");
  const [pending, setPending] = useState(false);
  const [localMode, setLocalMode] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  const send = useCallback(
    async (raw: string, store: ChatStore) => {
      const text = raw.trim();
      if (!text || status === "streaming") return;
      const { conversation, appendMessages, patchMessage } = store;
      if (!conversation) return;

      const model = conversation.model || "luno-zero-0.1";
      const history: Message[] = conversation.messages.map((m) => ({
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

      // If the user resubmits while the same assistant bubble is pending,
      // reuse a fresh id — simplest is a new assistant message each send.
      const controller = new AbortController();
      abortRef.current = controller;

      appendMessages(conversation.id, [...history, userMessage, assistantMessage]);
      setStatus("streaming");
      setPending(true);
      setLocalMode(false);

      const assistantId = assistantMessage.id;

      const apiMessages = [
        { role: "system", content: "You are Luno, a friendly, helpful, local AI." },
        ...history.map((m) => ({ role: m.role, content: m.content })),
        { role: "user", content: text },
      ];

      let streamedFromApi = false;
      try {
        let acc = "";
        await streamChat(apiMessages, model, (delta) => {
          acc += delta;
          streamedFromApi = true;
          patchMessage(conversation.id, assistantId, acc);
        }, controller.signal);
      } catch (err) {
        const aborted = err instanceof DOMException && err.name === "AbortError";
        if (!aborted) {
          // API unreachable → generate with the in-browser engine.
          setLocalMode(true);
          const reply = generateReply(text);
          for (const chunk of chunkText(reply, 6)) {
            if (controller.signal.aborted) break;
            const index = assistantId;
            // accumulate locally with a tiny delay for a streaming feel
            await new Promise((r) => setTimeout(r, 16));
            if (controller.signal.aborted) break;
            const existing = store.conversation?.messages.find((m) => m.id === index)?.content ?? "";
            patchMessage(conversation.id, index, existing + chunk);
          }
        }
      } finally {
        setStatus("idle");
        setPending(false);
        abortRef.current = null;
        // If the stream was aborted before anything arrived, keep placeholder.
        void streamedFromApi;
      }
    },
    [status]
  );

  const stop = useCallback(() => {
    abortRef.current?.abort();
    setStatus("idle");
    setPending(false);
  }, []);

  return { send, stop, status, pending, localMode };
}
