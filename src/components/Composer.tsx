import { useEffect, useRef, useState } from "react";
import { ArrowUp, Square } from "lucide-react";

interface Props {
  streaming: boolean;
  onSend: (text: string) => void;
  onStop: () => void;
}

export default function Composer({ streaming, onSend, onStop }: Props) {
  const [value, setValue] = useState("");
  const ref = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "0px";
    el.style.height = Math.min(el.scrollHeight, 180) + "px";
  }, [value]);

  const submit = () => {
    const text = value.trim();
    if (!text || streaming) return;
    setValue("");
    onSend(text);
    requestAnimationFrame(() => ref.current?.focus());
  };

  return (
    <div className="composer-wrap">
      <div className="composer">
        <textarea
          ref={ref}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              submit();
            }
          }}
          placeholder="Ask Luno anything — maths, code, essays, big questions…"
          rows={1}
          autoFocus
        />
        {streaming ? (
          <button className="send-btn stop" onClick={onStop} title="Stop generating"><Square size={16} /></button>
        ) : (
          <button className="send-btn" onClick={submit} disabled={!value.trim()} title="Send (Enter)"><ArrowUp size={18} /></button>
        )}
      </div>
      <div className="composer-hint">Enter to send · Shift+Enter for a new line · Luno can make mistakes — Deep Think + tools verify the important stuff</div>
    </div>
  );
}
