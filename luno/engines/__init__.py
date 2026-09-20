"""Shared API and data types for Luno model backends.

An *engine* is anything that can turn a list of messages into new text.
Ships with two:

* :class:`luno.engines.minizero.MiniZeroEngine` — the tiny, zero-dependency
  built-in model (zero downloads, works everywhere).
* :class:`luno.engines.llama.LlamaCppEngine` — runs real Luno GGUF weights
  via llama.cpp when they (and llama-cpp-python) are installed.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Optional


@dataclass
class ChatMessage:
    """One message in a conversation."""

    role: str  # "system" | "user" | "assistant"
    content: str


@dataclass
class GenerationParams:
    """Sampling knobs shared by every Luno engine."""

    max_tokens: int = 256
    temperature: float = 0.8
    top_p: float = 1.0
    top_k: int = 40
    stop: list[str] = field(default_factory=list)
    seed: Optional[int] = None

    def clamp(self) -> None:
        """Keep values sane regardless of what a caller passes in."""
        self.max_tokens = max(1, min(int(self.max_tokens), 4096))
        self.temperature = max(0.0, min(float(self.temperature), 2.0))
        self.top_p = max(0.0, min(float(self.top_p), 1.0))
        self.top_k = max(1, int(self.top_k))


@dataclass
class GenerationResult:
    """The output of one generation."""

    text: str
    model: str
    engine: str
    usage: dict[str, int] = field(default_factory=dict)
    finish_reason: str = "stop"
    timings: dict[str, Any] = field(default_factory=dict)

    def to_dict(self) -> dict[str, Any]:
        """Serialize to a JSON-friendly mapping."""
        return {
            "text": self.text,
            "model": self.model,
            "engine": self.engine,
            "usage": self.usage,
            "finish_reason": self.finish_reason,
            "timings": self.timings,
        }


class Engine:
    """Base class every Luno engine implements."""

    #: Stable name used in logs, JSON payloads, and the CLI.
    name: str = "base"

    def complete(self, messages: list[ChatMessage], params: GenerationParams) -> GenerationResult:
        """Generate a completion for ``messages``."""
        raise NotImplementedError

    def close(self) -> None:
        """Release resources (GPU memory, mmap, open files)."""
