"""Core behavior tests for the Luno engines."""

from __future__ import annotations

import pytest

from luno.engines import ChatMessage, GenerationParams
from luno.engines.minizero import MiniZeroEngine


@pytest.fixture()
def engine():
    return MiniZeroEngine()


def _complete(engine, *prompts, **params_overrides):
    params = GenerationParams()
    for key, value in params_overrides.items():
        setattr(params, key, value)
    messages = [ChatMessage(role="user", content=p) for p in prompts]
    return engine.complete(messages, params)


def test_greeting(engine):
    result = _complete(engine, "hello")
    assert result.text  # non-empty
    assert result.engine == "mini-zero"
    assert result.model == "luno-zero-0.1"


def test_math(engine):
    result = _complete(engine, "2 + 3 * 4")
    assert "14" in result.text


def test_math_power(engine):
    result = _complete(engine, "2 ^ 10")
    assert result.text != "2 ^ 10"
    assert "1024" in result.text


def test_code_fibonacci(engine):
    result = _complete(engine, "write a Python function to compute Fibonacci numbers")
    assert "```python" in result.text
    assert "def fib" in result.text


def test_code_prime(engine):
    result = _complete(engine, "write a python function that checks if a number is prime")
    assert "def is_prime" in result.text


def test_knowledge(engine):
    result = _complete(engine, "what is a transformer in machine learning?")
    lower = result.text.lower()
    assert "transformer" in lower or "attention" in lower


def test_max_tokens_truncates(engine):
    result = _complete(engine, "write a Python function to compute Fibonacci numbers", max_tokens=8)
    # Rough token budgeting means the answer got trimmed.
    assert len(result.text) <= 8 * 4 + 8


def test_empty_prompt(engine):
    result = _complete(engine, "")
    assert result.text


def test_unsafe_expression_rejected(engine):
    # "__import__" is not pure arithmetic and must never be evaluated.
    result = _complete(engine, "__import__('os').system('id')")
    assert "I don't have a good answer" in result.text


def test_close_is_harmless(engine):
    assert engine.close() is None
