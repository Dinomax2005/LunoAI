"""Luno — a free, local, personal AI.

Luno runs its own model on your hardware. No server, no monthly fee, no
external API. The first model is **Luno Zero 0.1**; Mist and Strato follow.

This package exposes:

* ``luno.cli``       — the ``luno`` command line tool
* ``luno.engine``    — pluggable inference engines (built-in Mini Zero, llama.cpp, transformers)
* ``luno.server``    — a local HTTP API (OpenAI-style endpoints)
* ``luno.models``    — the Luno model family registry (Zero, Mist, Strato)
"""

from __future__ import annotations

__version__ = "0.1.0"
__app_name__ = "LunoAI"

#: First-generation Luno model family names, in release order.
ZERO = "Zero"
MIST = "Mist"
STRATO = "Strato"

__all__ = ["__version__", "__app_name__", "ZERO", "MIST", "STRATO"]
