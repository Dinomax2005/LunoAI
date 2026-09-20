import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import type { StreamingStatus } from "../types";

interface ComposerProps {
  onSend: (text: string) => void;
  onStop: () => void;
  status: StreamingStatus;
  disabled?: boolean;
}

export default function Composer({ onSend, onStop, status, disabled }: ComposerProps) {
  const [value, setValue] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const streaming = status === "streaming";

  // Auto-grow the textarea.
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = Math.min(el.scrollHeight, 240) + "px";
  }, [value]);

  const submit = () => {
    const text = value.trim();
    if (!text || streaming || disabled) return;
    onSend(text);
    setValue("");
    requestAnimationFrame(() => {
      const el = textareaRef.current;
      if (el) {
        el.style.height = "auto";
        el.focus();
      }
    });
  };

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      submit();
    }
  };

  return (
    <div className="composer-anchor">
      <div className="composer">
        <textarea
          ref={textareaRef}
          rows={1}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder="Message Luno…"
          aria-label="Message Luno"
        />
        <div className="composer-actions">
          <button className="composer-tool" title="Attach (coming soon)" aria-label="Attach file">
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21.4 11.05 12.25 20.2a5.5 5.5 0 0 1-7.78-7.78l9.15-9.15a3.67 3.67 0 0 1 5.19 5.19l-9.2 9.2a1.83 1.83 0 0 1-2.59-2.59l8.5-8.5" />
            </svg>
          </button>
          {streaming ? (
            <button className="stop-button" onClick={onStop} aria-label="Stop generating" title="Stop">
              <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor">
                <rect x="7" y="7" width="10" height="10" rx="2" />
              </svg>
              <span>Stop</span>
            </button>
          ) : (
            <button
              className="send-button"
              onClick={submit}
              disabled={!value.trim() || disabled}
              aria-label="Send message"
              title="Send"
            >
              <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 19V5M5 12l7-7 7 7" />
              </svg>
            </button>
          )}
        </div>
      </div>
      <p className="composer-caption">
        Luno can make mistakes. It answers instantly in this page — for the full model, run{" "}
        <code>luno serve</code> on your machine.
      </p>
    </div>
  );
}
