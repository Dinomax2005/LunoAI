import { useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { CodeBlock } from "./CodeBlock";
import type { Message } from "../types";

/** Markdown from the assistant, rendered like a document (not a bubble). */
export function AssistantContent({ content }: { content: string }) {
  return (
    <div className="markdown-body">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          code(props) {
            const { className, children } = props as any;
            const inline = !className?.includes("language-");
            if (inline) return <code className="inline-code">{children}</code>;
            const lang = (className?.split("language-")[1] || "") as string;
            return <CodeBlock code={String(children).replace(/\n$/, "")} language={lang || "text"} />;
          },
          a(props) {
            return (
              <a href={props.href} target="_blank" rel="noreferrer noopener">
                {props.children}
              </a>
            );
          },
          table(props) {
            return (
              <div className="table-scroll">
                <table {...props} />
              </div>
            );
          },
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}

function UserBubble({ message }: { message: Message }) {
  return (
    <div className="message-row user">
      <div className="message-avatar user-avatar">You</div>
      <div className="user-message-wrap">
        <div className="user-message-content">{message.content}</div>
      </div>
    </div>
  );
}

function AssistantRow({ message, onRetry }: { message: Message; onRetry: () => void }) {
  const [copied, setCopied] = useState(false);
  const [feedback, setFeedback] = useState<"like" | "dislike" | null>(null);

  const copyAll = async () => {
    try {
      await navigator.clipboard.writeText(message.content);
      setCopied(true);
      setTimeout(() => setCopied(false), 1400);
    } catch {
      /* clipboard may be unavailable */
    }
  };

  return (
    <div className="message-row assistant">
      <div className="message-avatar assistant-avatar">
        <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="10" r="6.4" />
          <path d="M4.2 18.4c1.7-2.2 4.5-3.4 7.8-3.4s6.1 1.2 7.8 3.4" />
          <path d="M2.8 9.2a4 4 0 0 1 4-4M21.2 9.2a4 4 0 0 0-4-4" />
        </svg>
      </div>
      <div className="assistant-message-wrap">
        <div className="assistant-content">
          {message.content === "" && message.role === "assistant" && <span className="typing-caret" />}
          <AssistantContent content={message.content} />
        </div>
        {message.content !== "" && (
          <div className="message-toolbar">
            <button className="tool-button" onClick={copyAll} title="Copy response">
              {copied ? (
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="m5 12 4.5 4.5L19 7" />
                </svg>
              ) : (
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="9" y="9" width="11" height="11" rx="2" />
                  <path d="M5 15V5a2 2 0 0 1 2-2h10" />
                </svg>
              )}
              <span>{copied ? "Copied" : "Copy"}</span>
            </button>
            <button className="tool-button" onClick={onRetry} title="Regenerate">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 12a9 9 0 1 1-2.64-6.36M21 3v6h-6" />
              </svg>
              <span>Retry</span>
            </button>
            <button
              className={`tool-button ${feedback === "like" ? "active" : ""}`}
              onClick={() => setFeedback((f) => (f === "like" ? null : "like"))}
              title="Good response"
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
                <path d="M7 10v11H4a1 1 0 0 1-1-1v-9a1 1 0 0 1 1-1h3Zm0 0 4.2-8.4A2.6 2.6 0 0 1 18.4 4v2.2L16 11h5.3a1 1 0 0 1 1 1.2l-1.4 7a1.8 1.8 0 0 1-1.8 1.4h-5A2 2 0 0 1 12 19V10l-5-5" />
              </svg>
            </button>
            <button
              className={`tool-button ${feedback === "dislike" ? "active" : ""}`}
              onClick={() => setFeedback((f) => (f === "dislike" ? null : "dislike"))}
              title="Not helpful"
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
                <path d="M17 14V3h3a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1h-3Zm0 0-4.2 8.4A2.6 2.6 0 0 1 5.6 20v-2.2L8 13H2.7a1 1 0 0 1-1-1.2l1.4-7A1.8 1.8 0 0 1 4.9 3h5A2 2 0 0 1 12 5v9l-5 5" />
              </svg>
            </button>
          </div>
        )}
        <div className="message-model-tag">{message.model ?? "Luno Zero 0.1"}</div>
      </div>
    </div>
  );
}

export function MessageItem({ message, onRetry }: { message: Message; onRetry: () => void }) {
  return message.role === "user" ? (
    <UserBubble message={message} />
  ) : (
    <AssistantRow message={message} onRetry={onRetry} />
  );
}
