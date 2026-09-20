"""Llama.cpp engine — runs real Luno GGUF weights locally.

Requires the optional dependency::

    pip install lunoai[llama]      # or: pip install llama-cpp-python

and a Luno GGUF file (``~/.luno/models/...``). When weights are present
llama.cpp runs them locally — optionally with GPU layers offloaded — so no
server and no paid API is ever involved.
"""

from __future__ import annotations

import time
from pathlib import Path
from typing import Any, Optional

from luno.engines import ChatMessage, Engine, GenerationParams, GenerationResult


class _FormatMapper:
    """Map model roles to a llama.cpp chat template."""

    def role(self, role: str) -> str:
        if role == "system":
            return "system"
        if role == "assistant":
            return "assistant"
        return "user"

    # llama-cpp-python accepts a function role -> role name for its encoder.
    def __call__(self, role: str) -> str:
        return self.role(role)


class LlamaCppEngine(Engine):
    """Backend for Luno GGUF weights via ``llama_cpp``."""

    name = "llama.cpp"

    def __init__(
        self,
        model_path: str | Path,
        *,
        n_ctx: int = 2048,
        n_gpu_layers: int = -1,
        verbose: bool = False,
        n_threads: Optional[int] = None,
    ) -> None:
        try:
            from llama_cpp import Llama  # type: ignore
        except ImportError as exc:  # pragma: no cover - depends on user env
            raise RuntimeError(
                "The llama.cpp engine needs the 'llama-cpp-python' package. "
                "Install it with: pip install lunoai[llama]"
            ) from exc

        self._path = Path(model_path)
        if not self._path.exists():
            raise FileNotFoundError(
                f"Luno weights not found at {self._path}. "
                "Download a Luno GGUF into ~/.luno/models first "
                "(see docs/plan.md)."
            )

        kwargs: dict[str, Any] = dict(
            model_path=str(self._path),
            n_ctx=n_ctx,
            n_gpu_layers=n_gpu_layers,
            verbose=verbose,
        )
        if n_threads:
            kwargs["n_threads"] = n_threads
        self._model = Llama(**kwargs)
        self.model = self._model.model_path or str(self._path)

    def complete(self, messages: list[ChatMessage], params: GenerationParams) -> GenerationResult:
        params.clamp()
        start = time.perf_counter()

        prompt_messages = [
            {"role": m.role, "content": m.content}
            for m in messages
            if m.content.strip()
        ]

        response = self._model.create_chat_completion(
            messages=prompt_messages,
            max_tokens=params.max_tokens,
            temperature=params.temperature,
            top_p=params.top_p,
            top_k=params.top_k,
            stop=params.stop or None,
        )

        choice = response["choices"][0]
        message = choice["message"]
        text = (message.get("content") or "").strip()
        finish = choice.get("finish_reason") or "stop"
        usage = response.get("usage", {})

        elapsed = time.perf_counter() - start
        return GenerationResult(
            text=text,
            model=self.model,
            engine=self.name,
            usage={
                "prompt_tokens": int(usage.get("prompt_tokens", 0)),
                "completion_tokens": int(usage.get("completion_tokens", 0)),
            },
            finish_reason=str(finish),
            timings={"total_seconds": round(elapsed, 4)},
        )

    def close(self) -> None:
        close = getattr(self._model, "close", None)
        if callable(close):  # pragma: no cover - depends on llama-cpp version
            close()
