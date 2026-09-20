"""API-server tests (against the stdlib WSGI app — no deps needed)."""

from __future__ import annotations

import json

import pytest

from luno import __version__
from luno.engines.minizero import MiniZeroEngine
from luno.family import get_model
from luno.model_loader import LoadedModel
from luno.server import _web_available, build_app


@pytest.fixture()
def loaded():
    model = get_model("luno-zero-0.1")
    return LoadedModel(model=model, engine=MiniZeroEngine(), weights_loaded=False)


@pytest.fixture()
def app(loaded):
    return build_app(loaded=loaded)


def _call(app, method, path, body=None):
    environ = {
        "REQUEST_METHOD": method,
        "PATH_INFO": path,
        "wsgi.input": type("IO", (), {"read": lambda self, n: json.dumps(body).encode() if body is not None else b""})(),
        "CONTENT_LENGTH": str(len(json.dumps(body))) if body is not None else "0",
    }
    status_holder = {}

    def start_response(status, headers):
        status_holder["status"] = status

    out = app(environ, start_response)
    payload = b"".join(out)
    return status_holder.get("status", "200 OK"), payload


def test_info_root(app):
    status, payload = _call(app, "GET", "/")
    assert status == "200 OK"
    # With a built web UI present, "/" serves the site; otherwise the API info.
    if _web_available():
        assert b"<!doctype html" in payload.lower() or b"<html" in payload.lower()
    else:
        data = json.loads(payload)
        assert data["app"] == "LunoAI"
        assert data["version"] == __version__
        assert data["model"] == "luno-zero-0.1"
        assert data["free"] is True and data["local"] is True


def test_health(app):
    status, _ = _call(app, "GET", "/health")
    assert status == "200 OK"


def test_models(app):
    status, payload = _call(app, "GET", "/v1/models")
    data = json.loads(payload)
    assert data["object"] == "list"
    slugs = {m["id"] for m in data["data"]}
    assert {"luno-zero-0.1", "luno-mist-0.1", "luno-strato-0.1"} <= slugs


def test_chat_completion(app):
    body = {
        "model": "luno-zero-0.1",
        "messages": [{"role": "user", "content": "what is 3 + 4?"}],
    }
    status, payload = _call(app, "POST", "/v1/chat/completions", body)
    assert status == "200 OK"
    data = json.loads(payload)
    assert data["object"] == "chat.completion"
    assert data["model"] == "luno-zero-0.1"
    assert data["choices"][0]["message"]["content"]
    assert data["choices"][0]["message"]["role"] == "assistant"
    assert data["usage"]["total_tokens"] >= 0


def test_chat_missing_messages_is_400(app):
    status, payload = _call(app, "POST", "/v1/chat/completions", {"model": "luno-zero-0.1"})
    assert status == "400 Bad Request"
    assert "messages" in json.loads(payload)["error"]


def test_chat_streaming(app):
    body = {
        "model": "luno-zero-0.1",
        "messages": [{"role": "user", "content": "hi"}],
        "stream": True,
    }
    status, payload = _call(app, "POST", "/v1/chat/completions", body)
    assert status == "200 OK"
    text = payload.decode()
    assert text.startswith("data: ")
    chunks = [json.loads(line[6:]) for line in text.splitlines() if line.startswith("data: ")]
    assert chunks, "expected at least one SSE chunk"
    assert chunks[0]["object"] == "chat.completion.chunk"


def test_cors_headers_present(app):
    environ = {
        "REQUEST_METHOD": "OPTIONS",
        "PATH_INFO": "/v1/chat/completions",
        "wsgi.input": type("IO", (), {"read": lambda self, n: b""})(),
        "CONTENT_LENGTH": "0",
    }
    headers = {}

    def start_response(status, hdrs):
        headers["status"] = status
        headers.update(dict(hdrs))

    app(environ, start_response)
    assert headers["status"] == "204 No Content"
    assert headers.get("Access-Control-Allow-Origin") == "*"


def test_unknown_route(app):
    status, payload = _call(app, "GET", "/nope")
    if _web_available():
        # SPA fallback serves the UI for client-side routes.
        assert status == "200 OK"
        assert b"<!doctype html" in payload.lower() or b"<html" in payload.lower()
    else:
        assert status == "404 Not Found"
