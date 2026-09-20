"""The Luno model family.

Model naming plan:

=============  ================================================
Code name      What it will be
=============  ================================================
Zero 0.1       First release. Small, fast, fully local. Ships
               with a tiny built-in engine that works with zero
               downloads, and can be swapped for real weights.
Mist (later)   Mid-size local model — better reasoning/coding.
Strato (later) The flagship — most capable local Luno model.
=============  ================================================

This module just declares the family so tools, the server and docs all
share one source of truth. The actual weights are resolved by
``luno.model_loader`` at runtime.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Optional


@dataclass(frozen=True)
class LunoModel:
    """Description of one model in the Luno family."""

    #: Stable programmatic id, e.g. "luno-zero-0.1"
    slug: str
    #: Human-friendly name, e.g. "Luno Zero 0.1"
    name: str
    #: Family code name: Zero, Mist, Strato
    family: str
    version: str
    tagline: str
    #: Typical quantization family the full weights are distributed in.
    quantization: str = "GGUF Q4_K_M"
    #: Set when the authoritative weights have actually been published.
    released: bool = False
    #: Free-form notes for humans.
    notes: str = ""
    #: Files (relative to LUNO_HOME/models) that back this model when present.
    weight_files: tuple[str, ...] = field(default_factory=tuple)


#: First-generation plan. "released" flips to True once the real weights
#: ship; the loader falls back to the built-in Mini Zero until then.
MODELS: tuple[LunoModel, ...] = (
    LunoModel(
        slug="luno-zero-0.1",
        name="Luno Zero 0.1",
        family="Zero",
        version="0.1",
        tagline="First generation — small, fast, and entirely yours.",
        released=False,
        notes=(
            "Planned as the first real Luno weights. Until its GGUF ships, "
            "Luno transparently loads the built-in Mini Zero engine, so "
            "everything still works with zero downloads."
        ),
        weight_files=("zero/zero-0.1-q4_k_m.gguf",),
    ),
    LunoModel(
        slug="luno-mist-0.1",
        name="Luno Mist 0.1",
        family="Mist",
        version="0.1",
        tagline="Planned — a mid-size local model with stronger reasoning.",
        released=False,
        notes="Second generation. Target: better long-form reasoning and code.",
        weight_files=("mist/mist-0.1-q4_k_m.gguf",),
    ),
    LunoModel(
        slug="luno-strato-0.1",
        name="Luno Strato 0.1",
        family="Strato",
        version="0.1",
        tagline="Planned — the flagship Luno model, most capable of the family.",
        released=False,
        notes="Third generation. Target: best-in-class local coding assistant.",
        weight_files=("strato/strato-0.1-q4_k_m.gguf",),
    ),
)

_MODEL_BY_SLUG = {m.slug: m for m in MODELS}


def list_models() -> list[LunoModel]:
    """Return every Luno model, oldest first."""
    return list(MODELS)


def get_model(slug: str) -> LunoModel:
    """Look up a model by its slug (e.g. ``"luno-zero-0.1"``)."""
    try:
        return _MODEL_BY_SLUG[slug]
    except KeyError as exc:  # pragma: no cover - exercised via cli tests
        raise KeyError(f"Unknown Luno model: {slug!r}") from exc


def default_slug() -> str:
    """Return the slug of the model Luno loads by default."""
    return MODELS[0].slug


def find_model(slug_or_name: Optional[str]) -> LunoModel:
    """Resolve a user-supplied name or slug to a :class:`LunoModel`.

    Accepts slugs (``luno-zero-0.1``), names (``Luno Zero 0.1``), family
    names (``Zero``) and bare codenames (``zero``). Falls back to the
    default model when ``slug_or_name`` is empty.
    """
    if not slug_or_name:
        return MODELS[0]

    key = slug_or_name.strip().lower()
    for model in MODELS:
        candidates = {
            model.slug,
            model.name.lower(),
            model.family.lower(),
            f"{model.family.lower()} {model.version}".strip(),
        }
        if key in candidates:
            return model

    # Friendly error + suggestion.
    raise ValueError(
        f"Unknown Luno model {slug_or_name!r}. "
        f"Available: {', '.join(m.slug for m in MODELS)}."
    )
