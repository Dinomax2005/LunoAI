"""Model-family registry tests."""

from __future__ import annotations

import pytest

from luno.family import find_model, get_model, list_models


def test_first_model_is_zero():
    models = list_models()
    assert models[0].slug == "luno-zero-0.1"
    assert models[0].family == "Zero"
    assert models[0].version == "0.1"


def test_all_families_present():
    slugs = {m.slug for m in list_models()}
    assert "luno-zero-0.1" in slugs
    assert "luno-mist-0.1" in slugs
    assert "luno-strato-0.1" in slugs


def test_find_by_slug():
    assert find_model("luno-mist-0.1").family == "Mist"


def test_find_by_name():
    assert find_model("Luno Strato 0.1").slug == "luno-strato-0.1"


def test_find_by_codename():
    assert find_model("zero").slug == "luno-zero-0.1"
    assert find_model("MIST").family == "Mist"


def test_find_default_on_empty():
    assert find_model("").slug == "luno-zero-0.1"
    assert find_model(None).slug == "luno-zero-0.1"


def test_find_unknown_raises():
    with pytest.raises(ValueError):
        find_model("not-a-luno-model")


def test_get_model():
    assert get_model("luno-zero-0.1").name == "Luno Zero 0.1"
