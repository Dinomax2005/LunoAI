"""Resolve a Luno model name to a running engine.

Loading order for real weights (best first):

1. A GGUF file matching the model's declared ``weight_files`` → llama.cpp
   engine (with optional GPU offload).
2. Otherwise the zero-dependency :class:`MiniZeroEngine` — so Luno always
   works even before the real weights ship or on machines without them.

The fact a model is running on Mini Zero is reported honestly in CLI output,
the API and the docs — Mini Zero is a scaffold fallback, never a lie about
which weights are loaded.
"""

from __future__ import annotations

import logging
import os
from dataclasses import dataclass
from pathlib import Path
from typing import Optional

from luno import config
from luno.engines import Engine
from luno.engines.minizero import MiniZeroEngine
from luno.family import LunoModel, find_model

logger = logging.getLogger("luno.loader")


@dataclass
class LoadedModel:
    """An engine plus the Luno model it represents."""

    model: LunoModel
    engine: Engine
    #: True when real shipped weights are loaded (not the Mini Zero fallback).
    weights_loaded: bool

    @property
    def name(self) -> str:
        return self.model.name


def find_gguf(models_dir: Path, model: LunoModel) -> Optional[Path]:
    """Return the first existing weight file declared for ``model``."""
    for rel in model.weight_files:
        candidate = models_dir / rel
        if candidate.exists():
            return candidate
    # Also accept a loose file named after the slug (e.g. zero-0.1.gguf).
    for suffix in (".gguf",):
        candidate = models_dir / f"{model.slug}{suffix}"
        if candidate.exists():
            return candidate
    return None


def _gpu_layers_setting() -> int:
    """How many layers to offload to GPU (0 disables GPU entirely)."""
    raw = os.environ.get("LUNO_N_GPU_LAYERS", "-1")
    try:
        return int(raw)
    except ValueError:
        logger.warning("Ignoring invalid LUNO_N_GPU_LAYERS=%r", raw)
        return -1


def load_model(
    slug_or_name: Optional[str] = None,
    *,
    prefer_weights: bool = True,
    force_mini: bool = False,
) -> LoadedModel:
    """Load a Luno model by name/slug.

    Args:
        slug_or_name: ``"zero"``, ``"luno-zero-0.1"``, ``"Luno Zero 0.1"``, …
        prefer_weights: try real GGUF weights before falling back to Mini Zero.
        force_mini: always use the built-in Mini Zero engine (great for CI).
    """
    config.ensure_dirs()
    model = find_model(slug_or_name)

    gguf_path: Optional[Path] = None
    if not force_mini and prefer_weights:
        gguf_path = find_gguf(config.get_models_dir(), model)

    if gguf_path:
        from luno.engines.llama import LlamaCppEngine

        try:
            engine = LlamaCppEngine(
                gguf_path,
                n_gpu_layers=_gpu_layers_setting(),
            )
        except Exception as exc:  # noqa: BLE001 - fall back, but say so
            logger.warning(
                "Could not start the llama.cpp engine for %s (%s); "
                "falling back to Mini Zero.",
                model.slug,
                exc,
            )
            engine = MiniZeroEngine()
            weights_loaded = False
        else:
            weights_loaded = True
    else:
        engine = MiniZeroEngine()
        weights_loaded = False

    logger.info(
        "Loaded %s via %s (real weights: %s)",
        model.name,
        engine.name,
        weights_loaded,
    )
    return LoadedModel(model=model, engine=engine, weights_loaded=weights_loaded)
