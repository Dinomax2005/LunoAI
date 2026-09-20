import { useEffect, useRef, useState } from "react";
import type { Conversation } from "../types";
import { fetchModels } from "../lib/api";

interface ModelInfo {
  id: string;
  name: string;
  family?: string;
  version?: string;
  released?: boolean;
}

interface ModelPickerProps {
  activeId: string;
  conversations: Conversation[];
  onChange: (conversationId: string, model: string) => void;
}

const FALLBACK_MODELS: ModelInfo[] = [
  { id: "luno-zero-0.1", name: "Luno Zero 0.1", family: "Zero", version: "0.1", released: false },
  { id: "luno-mist-0.1", name: "Luno Mist 0.1", family: "Mist", version: "0.1", released: false },
  { id: "luno-strato-0.1", name: "Luno Strato 0.1", family: "Strato", version: "0.1", released: false },
];

export function ModelPicker({ activeId, conversations, onChange }: ModelPickerProps) {
  const [open, setOpen] = useState(false);
  const [models, setModels] = useState<ModelInfo[]>(FALLBACK_MODELS);
  const [loaded, setLoaded] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  const conversation = conversations.find((c) => c.id === activeId);
  const currentId = conversation?.model ?? "luno-zero-0.1";
  const current = models.find((m) => m.id === currentId) ?? models[0];

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const data = await fetchModels();
        if (active && data.length) {
          setModels(
            data.map((m) => ({
              id: m.id,
              name: m.name ?? m.id,
              family: m.family ?? "",
              version: m.version ?? "",
              released: m.released ?? false,
            }))
          );
          setLoaded(true);
        }
      } catch {
        /* keep fallback list */
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  return (
    <div className="model-picker" ref={rootRef}>
      <button className="model-chip" onClick={() => setOpen((v) => !v)}>
        <span className="model-chip-name">{current?.name ?? "Luno Zero 0.1"}</span>
        <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="m6 9 6 6 6-6" />
        </svg>
      </button>
      {open && (
        <div className="model-menu">
          <div className="model-menu-label">Model</div>
          {models.map((m) => (
            <button
              key={m.id}
              className={`model-menu-item ${m.id === currentId ? "selected" : ""}`}
              onClick={() => {
                onChange(activeId, m.id);
                setOpen(false);
              }}
            >
              <span className="model-item-name">{m.name}</span>
              <span className="model-item-meta">
                {m.family} {m.version}
                {!m.released && " · planned"}
              </span>
              {m.id === currentId && (
                <svg className="check" viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="m5 12 4.5 4.5L19 7" />
                </svg>
              )}
            </button>
          ))}
          <div className="model-menu-foot muted">
            {!loaded ? "Using built-in list (API not reached yet)" : "Luno model family"}
          </div>
        </div>
      )}
    </div>
  );
}
