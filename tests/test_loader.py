"""Model loader tests (mini-only, no external weights)."""

from __future__ import annotations

from luno.engines.minizero import MiniZeroEngine
from luno.model_loader import load_model


def test_load_model_falls_back_to_mini():
    loaded = load_model("luno-zero-0.1", force_mini=True)
    assert isinstance(loaded.engine, MiniZeroEngine)
    assert loaded.model.slug == "luno-zero-0.1"
    assert loaded.name == "Luno Zero 0.1"
    assert loaded.weights_loaded is False


def test_load_model_accepts_codename():
    loaded = load_model("strato", force_mini=True)
    assert loaded.model.slug == "luno-strato-0.1"


def test_load_matrix_copies_data_e2e():
    """A full run proves engine + loader + result plumbing works together."""
    from luno.engines import ChatMessage, GenerationParams

    loaded = load_model("zero", force_mini=True)
    result = loaded.engine.complete(
        [ChatMessage(role="user", content="2 + 2")],
        GenerationParams(),
    )
    assert "4" in result.text
    assert result.engine == "mini-zero"
