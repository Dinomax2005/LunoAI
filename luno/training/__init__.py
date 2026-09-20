"""Training utilities for Luno models.

Submodules are imported lazily so ``python -m luno.training.train`` works
cleanly without double-import warnings.
"""

from __future__ import annotations

__all__ = ["build_indices", "default_corpus", "load_text", "split", "MiniTransformer"]


def __getattr__(name: str):
    if name in {"build_indices", "default_corpus", "load_text", "split"}:
        from luno.training import data

        return getattr(data, name)
    if name == "MiniTransformer":
        from luno.training import train

        return train.MiniTransformer
    raise AttributeError(f"module 'luno.training' has no attribute {name!r}")
