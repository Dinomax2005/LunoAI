"""Dataset helpers for training Luno models.

Real Luno training starts from licensed, rights-cleared text (code,
conversations, docs). This module knows how to:

* read plain ``.txt`` files from ``luno/data`` or anywhere on disk,
* build char-level or word-level token indices,
* split into train/validation batches.

The bundled ``luno/data/sneeze.txt`` is a tiny cleared demo corpus used
only to prove the pipeline works.
"""

from __future__ import annotations

import re
from pathlib import Path
from typing import Optional

from luno import config


def load_text(path: str | Path, *, lower: bool = True) -> str:
    """Read a text file into a normalized string."""
    text = Path(path).expanduser().read_text(encoding="utf-8")
    text = re.sub(r"\s+", " ", text).strip()
    return text.lower() if lower else text


def default_corpus() -> str:
    """Return the bundled demo corpus (always available, no downloads)."""
    bundled = Path(__file__).resolve().parent.parent / "data" / "sneeze.txt"
    return load_text(bundled)


def build_indices(text: str) -> tuple[list[str], dict[str, int], dict[int, str]]:
    """Tokenize by characters and build char↔index maps."""
    chars = sorted(set(text))
    stoi = {ch: i for i, ch in enumerate(chars)}
    itos = {i: ch for i, ch in enumerate(chars)}
    return chars, stoi, itos


def make_batches(data: list[int], block_size: int, batch_size: int):
    """Yield (x, y) training batches over a flat token index array."""
    # Simple contiguous block windows — fine for a demo/tiny model.
    n_batches = (len(data) - 1) // (block_size * batch_size)
    for i in range(n_batches):
        x = []
        y = []
        for b in range(batch_size):
            start = i * block_size * batch_size + b * block_size
            x.append(data[start : start + block_size])
            y.append(data[start + 1 : start + block_size + 1])
        yield x, y


def split(text: str, ratio: float = 0.9) -> tuple[str, str]:
    """Split a corpus into train/validation text."""
    cut = int(len(text) * ratio)
    return text[:cut], text[cut:]
