import type { ReactElement } from "react";

const SUGGESTIONS = [
  {
    icon: "sparkles",
    title: "Explain a concept",
    prompt: "Explain what a transformer is in simple terms.",
  },
  {
    icon: "pen",
    title: "Help me write something",
    prompt: "Help me write a clear, friendly project introduction.",
  },
  {
    icon: "code",
    title: "Write code",
    prompt: "Write a Python function that checks if a number is prime.",
  },
  {
    icon: "brain",
    title: "Brainstorm ideas",
    prompt: "Brainstorm five ideas for a small local-first app.",
  },
];

const ICONS: Record<string, ReactElement> = {
  sparkles: (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9L12 3Z" />
      <path d="M19 15l.7 1.8L21.5 17.5l-1.8.7L19 20l-.7-1.8-1.8-.7 1.8-.7L19 15Z" />
    </svg>
  ),
  pen: (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 19l7-7 2 2-7 7-2-2Z" />
      <path d="M18 13l-1.5-7.5L2 2l3.5 14.5L13 18l5-5Z" />
    </svg>
  ),
  code: (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      <path d="m8 7-5 5 5 5M16 7l5 5-5 5M14 4l-4 16" />
    </svg>
  ),
  brain: (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="9" />
      <path d="M12 3a4 4 0 0 0 0 18M12 3a4 4 0 0 1 0 18M3 12h6M15 12h6" />
    </svg>
  ),
};

export function Welcome({ onSuggestion }: { onSuggestion: (prompt: string) => void }) {
  return (
    <div className="welcome">
      <div className="welcome-logo">
        <svg viewBox="0 0 24 24" width="34" height="34" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="10" r="6.4" />
          <path d="M4.2 18.4c1.7-2.2 4.5-3.4 7.8-3.4s6.1 1.2 7.8 3.4" />
          <path d="M2.8 9.2a4 4 0 0 1 4-4M21.2 9.2a4 4 0 0 0-4-4" />
        </svg>
      </div>
      <h1 className="welcome-title">Hi, I'm Luno.</h1>
      <p className="welcome-subtitle">
        Your own AI — free, local, and yours to run. What shall we think about?
      </p>
      <div className="suggestion-grid">
        {SUGGESTIONS.map((s) => (
          <button key={s.title} className="suggestion-card" onClick={() => onSuggestion(s.prompt)}>
            <span className="suggestion-icon">{ICONS[s.icon]}</span>
            <span className="suggestion-title">{s.title}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
