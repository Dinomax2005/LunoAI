import { useCallback, useEffect, useMemo, useState } from "react";
import type { Conversation } from "../types";
import {
  loadActiveId,
  loadConversations,
  saveActiveId,
  saveConversations,
  uid,
} from "../lib/storage";

function makeConversation(): Conversation {
  const now = Date.now();
  return {
    id: uid(),
    title: "New conversation",
    model: "luno-zero-0.1",
    createdAt: now,
    updatedAt: now,
    messages: [],
  };
}

export function useConversations() {
  const [conversations, setConversations] = useState<Conversation[]>(() => {
    const stored = loadConversations();
    return stored.length ? stored : [makeConversation()];
  });
  const [activeId, setActiveIdState] = useState<string>(() => {
    const stored = loadActiveId();
    return stored ?? loadConversations()[0]?.id ?? "";
  });
  const [collapsed, setCollapsed] = useState(false);
  const [loaded, setLoaded] = useState(false);

  // Normalize the active id on first paint (e.g. stored id no longer exists).
  useEffect(() => {
    if (loaded) return;
    setConversations((prev) => {
      const list = prev.length ? prev : [makeConversation()];
      if (!list.some((c) => c.id === activeId)) {
        setActiveIdState(list[0].id);
      }
      return list;
    });
    setLoaded(true);
  }, [loaded, activeId]);

  // Persist.
  useEffect(() => {
    if (!loaded) return;
    saveConversations(conversations);
  }, [conversations, loaded]);

  useEffect(() => {
    saveActiveId(activeId);
  }, [activeId]);

  const setActiveId = useCallback((id: string) => setActiveIdState(id), []);

  const createConversation = useCallback(() => {
    const conversation = makeConversation();
    setConversations((prev) => [conversation, ...prev]);
    setActiveIdState(conversation.id);
  }, []);

  const updateTitle = useCallback((id: string, title: string) => {
    setConversations((prev) =>
      prev.map((c) => (c.id === id ? { ...c, title } : c))
    );
  }, []);

  const updateModel = useCallback((id: string, model: string) => {
    setConversations((prev) =>
      prev.map((c) => (c.id === id ? { ...c, model } : c))
    );
  }, []);

  const appendMessages = useCallback(
    (id: string, messages: Conversation["messages"]) => {
      setConversations((prev) =>
        prev.map((c) =>
          c.id === id
            ? { ...c, messages, updatedAt: Date.now() }
            : c
        )
      );
    },
    []
  );

  const patchMessage = useCallback(
    (id: string, messageId: string, content: string) => {
      setConversations((prev) =>
        prev.map((c) =>
          c.id === id
            ? {
                ...c,
                updatedAt: Date.now(),
                messages: c.messages.map((m) =>
                  m.id === messageId ? { ...m, content } : m
                ),
              }
            : c
        )
      );
    },
    []
  );

  const deleteConversation = useCallback(
    (id: string) => {
      setConversations((prev) => {
        const next = prev.filter((c) => c.id !== id);
        const keep = next.length ? next : [makeConversation()];
        if (id === activeId) {
          setActiveIdState(keep[0].id);
        }
        return keep;
      });
    },
    [activeId]
  );

  const clearConversationMessages = useCallback((id: string) => {
    setConversations((prev) =>
      prev.map((c) => (c.id === id ? { ...c, messages: [] } : c))
    );
  }, []);

  const activeConversation = useMemo(
    () => conversations.find((c) => c.id === activeId) ?? null,
    [conversations, activeId]
  );

  return {
    conversations,
    activeId,
    activeConversation,
    setActiveId,
    createConversation,
    updateTitle,
    updateModel,
    appendMessages,
    patchMessage,
    deleteConversation,
    clearConversationMessages,
    collapsed,
    setCollapsed,
  };
}
