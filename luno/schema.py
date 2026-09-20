"""Third-party dependency (pydantic) only if available, otherwise a tiny
stdlib shim. This keeps the API objects typed nicely without forcing users
to install anything just to try Luno.
"""

from __future__ import annotations

from typing import TYPE_CHECKING, Any

try:  # pragma: no cover - env dependent
    from pydantic import BaseModel, Field  # type: ignore
except ImportError:  # pragma: no cover - env dependent
    BaseModel = None  # type: ignore[assignment]
    Field = None  # type: ignore[assignment]


if TYPE_CHECKING:  # pragma: no cover
    from typing import Optional


class _BaseModel(Any):  # type: ignore[misc]  # pydantic or plain-object stand-in
    pass


if BaseModel is not None:  # pydantic path

    class ChatMessage(BaseModel):
        role: str
        content: str

    class ChatCompletionRequest(BaseModel):
        model: str = "luno-zero-0.1"
        messages: list[ChatMessage]
        max_tokens: int = 256
        temperature: float = 0.8
        top_p: float = 1.0
        stream: bool = False

    class _GenRequestFields:  # convenience holder for intellisense
        pass

else:  # stdlib path: accept raw dicts (server handles everything manually)

    class ChatMessage(dict):  # type: ignore[no-redef]
        @property
        def role(self) -> str:
            return self.get("role", "")

        @property
        def content(self) -> str:
            return self.get("content", "")

    class ChatCompletionRequest(dict):  # type: ignore[no-redef]
        @property
        def model(self) -> str:
            return self.get("model", "luno-zero-0.1")

        @property
        def messages(self) -> list[ChatMessage]:
            return [ChatMessage(m) for m in self.get("messages", [])]

        @property
        def max_tokens(self) -> int:
            return int(self.get("max_tokens", 256))

        @property
        def temperature(self) -> float:
            return float(self.get("temperature", 0.8))

        @property
        def top_p(self) -> float:
            return float(self.get("top_p", 1.0))

        @property
        def stream(self) -> bool:
            return bool(self.get("stream", False))


__all__ = ["ChatMessage", "ChatCompletionRequest", "Field"]
