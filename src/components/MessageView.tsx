import { memo, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import hljs from "highlight.js";
import "highlight.js/styles/github-dark.css";
import { Bot, Brain, Check, ChevronDown, Copy, Loader2, Play, User } from "lucide-react";
import type { ChatMessage } from "../types";
import { runJavaScript, runPython } from "../lib/codeGen";

function CodeBlock({ lang, code }: { lang: string; code: string }) {
  const [copied, setCopied] = useState(false);
  const [output, setOutput] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  const runnable = ["javascript", "js", "python", "py", ""].includes(lang.toLowerCase());
  const isPython = ["python", "py"].includes(lang.toLowerCase());

  let highlighted = code;
  try {
    const language = isPython ? "python" : "javascript";
    highlighted = hljs.highlight(code, { language }).value;
  } catch { /* plain */ }

  const run = async () => {
    setRunning(true);
    setOutput(isPython ? "Loading Python runtime & running…" : "Running…");
    const out = isPython ? await runPython(code) : await runJavaScript(code);
    setOutput(out);
    setRunning(false);
  };

  return (
    <div className="codeblock">
      <div className="codeblock-head">
        <span>{lang || "code"}</span>
        <span className="codeblock-actions">
          {runnable && (
            <button className="mini-btn run" onClick={run} disabled={running} title="Run this code in your browser">
              {running ? <Loader2 size={13} className="spin" /> : <Play size={13} />} Run
            </button>
          )}
          <button
            className="mini-btn"
            onClick={() => { navigator.clipboard?.writeText(code); setCopied(true); setTimeout(() => setCopied(false), 1400); }}
            title="Copy code"
          >
            {copied ? <Check size={13} /> : <Copy size={13} />} {copied ? "Copied" : "Copy"}
          </button>
        </span>
      </div>
      <pre><code dangerouslySetInnerHTML={{ __html: highlighted }} /></pre>
      {output !== null && (
        <div className="code-output">
          <div className="code-output-label">Output</div>
          <pre>{output}</pre>
        </div>
      )}
    </div>
  );
}

function MessageViewBase({ message, streaming }: { message: ChatMessage; streaming?: boolean }) {
  const [copied, setCopied] = useState(false);
  const [thinkOpen, setThinkOpen] = useState(false);
  const isUser = message.role === "user";

  if (isUser) {
    return (
      <div className="msg-row user">
        <div className="avatar user-avatar"><User size={16} /></div>
        <div className="bubble user-bubble">{message.content}</div>
      </div>
    );
  }

  return (
    <div className="msg-row assistant">
      <div className="avatar ai-avatar"><Bot size={16} /></div>
      <div className="bubble ai-bubble">
        {message.engine && <div className="engine-tag">{message.engine}</div>}
        {message.thinking && (
          <div className="thinking">
            <button className="thinking-head" onClick={() => setThinkOpen((v) => !v)}>
              <Brain size={14} /> Thought process <ChevronDown size={14} className={thinkOpen ? "rot" : ""} />
            </button>
            {thinkOpen && <div className="thinking-body">{message.thinking}</div>}
          </div>
        )}
        {message.content ? (
          <div className="markdown">
            <ReactMarkdown
              remarkPlugins={[remarkGfm]}
              components={{
                code({ className, children, ...props }) {
                  const match = /language-(\w+)/.exec(className || "");
                  const raw = String(children).replace(/\n$/, "");
                  const inline = !match && !raw.includes("\n");
                  if (inline) return <code className="inline-code" {...props}>{raw}</code>;
                  return <CodeBlock lang={match?.[1] || ""} code={raw} />;
                },
                pre({ children }) {
                  return <>{children}</>;
                },
              }}
            >
              {message.content}
            </ReactMarkdown>
            {streaming && <span className="cursor" />}
          </div>
        ) : (
          <div className="typing"><span /><span /><span /></div>
        )}
        {message.content && !streaming && (
          <button
            className="copy-answer"
            onClick={() => { navigator.clipboard?.writeText(message.content); setCopied(true); setTimeout(() => setCopied(false), 1400); }}
          >
            {copied ? <Check size={13} /> : <Copy size={13} />} {copied ? "Copied" : "Copy answer"}
          </button>
        )}
      </div>
    </div>
  );
}

const MessageView = memo(MessageViewBase);
export default MessageView;
