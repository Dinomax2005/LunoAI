"""Transformers/PyTorch engine (planned).

Reserved for future Luno weight formats (e.g. safetensors checkpoints).
When the real Luno Zero 0.1 weights ship as safetensors, this engine will
load them with Hugging Face Transformers. Requires::

    pip install lunoai[llm]
"""

from __future__ import annotations

from luno.engines import Engine


class TransformersEngine(Engine):
    """Placeholder backend for future Transformers-based Luno weights."""

    name = "transformers"

    def __init__(self, model_path: str | None = None) -> None:
        raise NotImplementedError(
            "The Transformers engine is reserved for future Luno weight "
            "formats. Use the built-in mini-zero engine, or llama.cpp with "
            "GGUF weights, today."
        )
