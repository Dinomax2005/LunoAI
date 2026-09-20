"""Luno's local HTTP API.

A small, OpenAI-compatible REST API that serves the Luno model running in
``this`` process — no server, no internet, no paid API. Endpoints:

============  =======================================================
``GET  /``                  service information
``GET  /v1/models``         list the Luno model family
``POST /v1/chat/completions``  chat completion (OpenAI-style)
``GET  /health``            liveness + which engine is loaded
============  =======================================================

Runs on the standard library when FastAPI/uvicorn are missing, and upgrades
to FastAPI automatically when they are installed.
"""

from __future__ import annotations

import argparse
import json
import logging
import threading
import time
from pathlib import Path
from typing import Any, Callable, Optional

from luno import __version__, config
from luno.engines import ChatMessage as EngineMessage
from luno.engines import GenerationParams
from luno.family import list_models
from luno.model_loader import LoadedModel, load_model

logger = logging.getLogger("luno.server")


# --------------------------------------------------------------------------
# Request handling (shared between the stdlib and FastAPI servers)
# --------------------------------------------------------------------------

def build_params(body: dict[str, Any]) -> GenerationParams:
    """Build generation parameters from a raw request body."""
    params = GenerationParams(
        max_tokens=int(body.get("max_tokens", config.DEFAULT_MAX_TOKENS)),
        temperature=float(body.get("temperature", config.DEFAULT_TEMPERATURE)),
        top_p=float(body.get("top_p", config.DEFAULT_TOP_P)),
        top_k=int(body.get("top_k", 40)),
        stop=list(body.get("stop") or []),
        seed=body.get("seed"),
    )
    params.clamp()
    return params


def build_messages(body: dict[str, Any]) -> list[EngineMessage]:
    """Normalize OpenAI-style messages to engine messages."""
    messages: list[EngineMessage] = []
    for item in body.get("messages", []):
        if not isinstance(item, dict):
            continue
        content = item.get("content", "")
        # OpenAI allows array content (image parts, etc.); flatten text parts.
        if isinstance(content, list):
            content = "\n".join(
                part.get("text", "")
                for part in content
                if isinstance(part, dict) and part.get("type") == "text"
            )
        role = str(item.get("role", "user"))
        content = str(content)
        if content.strip():
            messages.append(EngineMessage(role=role, content=content))
    if not messages:
        raise ValueError("No messages were provided in the request.")
    return messages


def chat_response(loaded: LoadedModel, body: dict[str, Any]) -> dict[str, Any]:
    """Run one non-streaming completion and shape an OpenAI-style response."""
    messages = build_messages(body)
    params = build_params(body)

    result = loaded.engine.complete(messages, params)

    now = time.time()
    return {
        "id": "chatcmpl-luno-{id}".format(id=f"{int(now * 1000) % 10_000_000:07d}"),
        "object": "chat.completion",
        "created": int(now),
        "model": loaded.model.slug,
        "engine": result.engine,
        "weights_loaded": loaded.weights_loaded,
        "choices": [
            {
                "index": 0,
                "message": {"role": "assistant", "content": result.text},
                "finish_reason": result.finish_reason,
            }
        ],
        "usage": {
            "prompt_tokens": result.usage.get("prompt_words", result.usage.get("prompt_tokens", 0)),
            "completion_tokens": result.usage.get("completion_words", result.usage.get("completion_tokens", 0)),
            "total_tokens": (
                result.usage.get("prompt_words", result.usage.get("prompt_tokens", 0))
                + result.usage.get("completion_words", result.usage.get("completion_tokens", 0))
            ),
        },
    }


def models_response() -> dict[str, Any]:
    """OpenAI-style ``/v1/models`` payload for the Luno family."""
    return {
        "object": "list",
        "data": [
            {
                "id": m.slug,
                "object": "model",
                "created": 0,
                "owned_by": "LunoAI",
                "name": m.name,
                "family": m.family,
                "version": m.version,
                "released": m.released,
                "quantization": m.quantization,
                "tagline": m.tagline,
            }
            for m in list_models()
        ],
    }


def info_response(loaded: LoadedModel) -> dict[str, Any]:
    return {
        "app": "LunoAI",
        "version": __version__,
        "model": loaded.model.slug,
        "name": loaded.model.name,
        "engine": loaded.engine.name,
        "weights_loaded": loaded.weights_loaded,
        "free": True,
        "local": True,
        "endpoints": {
            "chat": "POST /v1/chat/completions",
            "models": "GET /v1/models",
            "health": "GET /health",
        },
    }


def _handle_stream(loaded: LoadedModel, body: dict[str, Any]):
    """Return an iterable/generator of SSE chunks for streaming responses.

    Mini Zero replies instantly, so we emit the whole answer as one chunk;
    the interface is identical to a real token-by-token stream so clients
    (and future engines) behave exactly the same.
    """
    messages = build_messages(body)
    params = build_params(body)
    result = loaded.engine.complete(messages, params)
    now = time.time()
    chunk_id = f"chatcmpl-luno-{int(now * 1000) % 10_000_000:07d}"

    delta = {"role": "assistant", "content": result.text}
    yield {
        "id": chunk_id,
        "object": "chat.completion.chunk",
        "created": int(now),
        "model": loaded.model.slug,
        "choices": [{"index": 0, "delta": delta, "finish_reason": None}],
    }
    yield {
        "id": chunk_id,
        "object": "chat.completion.chunk",
        "created": int(now),
        "model": loaded.model.slug,
        "choices": [{"index": 0, "delta": {}, "finish_reason": "stop"}],
    }


# --------------------------------------------------------------------------
# CORS + static assets
# --------------------------------------------------------------------------

def _cors_headers() -> list[tuple[str, str]]:
    """Allow the Luno web UI (GitHub Pages / vite dev) to call this API.

    Luno is a local-first assistant: the API talks to the model on your
    machine, and the browser UI may be served from another origin (e.g.
    github.io), so we accept cross-origin calls from anywhere.
    """
    return [
        ("Access-Control-Allow-Origin", "*"),
        ("Access-Control-Allow-Methods", "GET, POST, OPTIONS"),
        ("Access-Control-Allow-Headers", "Content-Type, Authorization"),
        ("Access-Control-Max-Age", "86400"),
    ]


def _web_dist() -> Path:
    """Path to the built web UI (web/dist), if present."""
    return Path(__file__).resolve().parent.parent / "web" / "dist"


def _web_available() -> bool:
    return (_web_dist() / "index.html").exists()


_MIME = {
    ".html": "text/html; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".js": "application/javascript; charset=utf-8",
    ".mjs": "application/javascript; charset=utf-8",
    ".json": "application/json; charset=utf-8",
    ".svg": "image/svg+xml",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".ico": "image/x-icon",
    ".woff2": "font/woff2",
    ".woff": "font/woff",
    ".txt": "text/plain; charset=utf-8",
}


def _serve_static(path: str) -> Optional[tuple[str, list[tuple[str, str]], bytes]]:
    """Serve a file from the built web UI (SPA-style index fallback)."""
    dist = _web_dist()
    rel = path.lstrip("/") or "index.html"
    # SPA fallback: unknown paths without an extension resolve to index.html.
    if rel in ("/", ""):
        candidate = dist / "index.html"
    else:
        candidate = dist / rel
        if not candidate.exists() and "." not in rel.split("/")[-1]:
            candidate = dist / "index.html"
    if not candidate.exists() or not candidate.is_file():
        return None
    if not candidate.resolve().is_relative_to(dist.resolve()):
        return None  # never serve files outside the dist directory
    mime = _MIME.get(candidate.suffix, "application/octet-stream")
    return "200 OK", [("Content-Type", mime)], candidate.read_bytes()


# --------------------------------------------------------------------------
# HTTP errors
# --------------------------------------------------------------------------

class HTTPError(Exception):
    def __init__(self, status: int, message: str):
        super().__init__(message)
        self.status = status
        self.message = message


# --------------------------------------------------------------------------
# The application factory — returns a FastAPI app if available, else a
# stdlib WSGI app. Both behave identically.
# --------------------------------------------------------------------------

class LunoApi:
    """Small web framework that ships FastAPI when present, stdlib otherwise."""

    def __init__(self, loaded: LoadedModel):
        self.loaded = loaded
        self.routes: list[tuple[str, str, Callable]] = []

    def route(self, method: str, path: str):
        def decorator(fn: Callable):
            self.routes.append((method, path, fn))
            return fn
        return decorator


def build_app(
    loaded: Optional[LoadedModel] = None,
    default_model: Optional[str] = None,
) -> Any:
    """Build the Luno web application.

    Returns a FastAPI ``app`` when fastapi+uvicorn are installed, otherwise
    a stdlib :func:`make_http_server` compatible handler function.
    """
    loaded = loaded or load_model(default_model)
    api = LunoApi(loaded)

    @api.route("GET", "/")
    def root(_req):
        return info_response(loaded)

    @api.route("GET", "/health")
    def health(_req):
        return {"status": "ok", **info_response(loaded)}

    @api.route("GET", "/v1/models")
    def models(_req):
        return models_response()

    @api.route("POST", "/v1/chat/completions")
    def completions(req):
        try:
            body = req.json_body if hasattr(req, "json_body") else req
        except Exception as exc:  # noqa: BLE001
            raise HTTPError(400, f"Invalid JSON body: {exc}") from exc
        if not isinstance(body, dict):
            raise HTTPError(400, "Request body must be a JSON object.")
        try:
            if body.get("stream"):
                return _handle_stream(loaded, body)
            return chat_response(loaded, body)
        except ValueError as exc:
            raise HTTPError(400, str(exc)) from exc

    try:  # pragma: no cover - fastapi path when installed
        import fastapi  # type: ignore
        from fastapi.middleware.cors import CORSMiddleware  # type: ignore
        from fastapi.responses import FileResponse  # type: ignore
        from fastapi.staticfiles import StaticFiles  # type: ignore

        fapp = fastapi.FastAPI(
            title="Luno API",
            description="Local, free, OpenAI-compatible API for Luno models.",
            version=__version__,
        )

        fapp.add_middleware(
            CORSMiddleware,
            allow_origins=["*"],
            allow_credentials=False,
            allow_methods=["*"],
            allow_headers=["*"],
        )

        @fapp.get("/")
        def f_root():
            # Serve the built web UI when present, else the API info.
            if _web_available():
                return FileResponse(str(_web_dist() / "index.html"))
            return info_response(loaded)

        @fapp.get("/health")
        def f_health():
            return {"status": "ok", **info_response(loaded)}

        @fapp.get("/v1/models")
        def f_models():
            return models_response()

        @fapp.post("/v1/chat/completions")
        def f_completions(req: dict):
            try:
                if req.get("stream"):
                    from fastapi.responses import StreamingResponse  # type: ignore

                    return StreamingResponse(
                        _sse_wrap(_handle_stream(loaded, req)),
                        media_type="text/event-stream",
                    )
                return chat_response(loaded, req)
            except ValueError as exc:
                raise fastapi.HTTPException(status_code=400, detail=str(exc)) from exc

        fapp.state.loaded = loaded

        # Mount the web UI assets (kept out of the way of the API routes).
        if _web_available():
            fapp.mount("/assets", StaticFiles(directory=str(_web_dist() / "assets")), name="assets")

            @fapp.get("/{full_path:path}")
            def f_spa(full_path: str):
                candidate = (_web_dist() / full_path).resolve()
                if candidate.is_file() and candidate.is_relative_to(_web_dist().resolve()):
                    return FileResponse(str(candidate))
                return FileResponse(str(_web_dist() / "index.html"))

        return fapp
    except ImportError:
        return _stdlib_app(api)


def _stdlib_app(api: LunoApi):
    """Return a WSGI-compatible callable for the standard library server."""
    def app(environ: dict, start_response: Callable) -> list[bytes]:
        method = environ.get("REQUEST_METHOD", "GET")
        path = environ.get("PATH_INFO", "/")

        cors_hdrs = _cors_headers()

        # Preflight.
        if method == "OPTIONS":
            start_response("204 No Content", cors_hdrs)
            return []

        handler = None
        for route_method, route_path, fn in api.routes:
            if route_method == method and route_path == path:
                handler = fn
                break

        # API routes win over the SPA. Exception: GET / serves the web UI
        # when it is built (the API info stays available at /health).
        if handler is not None and not (method == "GET" and path == "/" and _web_available()):
            body = b""
            content_length = int(environ.get("CONTENT_LENGTH") or 0)
            if content_length:
                body = environ["wsgi.input"].read(content_length)

            try:
                payload = {}
                if body:
                    payload = json.loads(body.decode("utf-8"))

                # Attach json_body so handlers stay uniform.
                req = type("Req", (), {"json_body": payload})()

                result = handler(req)

                # Streaming path -> SSE.
                if hasattr(result, "__iter__") and not isinstance(result, (dict, list, bytes, str)):
                    start_response(
                        "200 OK",
                        [("Content-Type", "text/event-stream"), ("Cache-Control", "no-cache")] + cors_hdrs,
                    )
                    return [
                        ("data: " + json.dumps(chunk) + "\n\n").encode("utf-8")
                        for chunk in result
                    ]

                data = json.dumps(result).encode("utf-8")
                start_response(
                    "200 OK",
                    [("Content-Type", "application/json"), ("Content-Length", str(len(data)))] + cors_hdrs,
                )
                return [data]
            except HTTPError as exc:
                reason = {
                    400: "400 Bad Request",
                    404: "404 Not Found",
                    405: "405 Method Not Allowed",
                    500: "500 Internal Server Error",
                }.get(exc.status, f"{exc.status} Error")
                start_response(
                    reason,
                    [("Content-Type", "application/json")] + cors_hdrs,
                )
                return [json.dumps({"error": exc.message}).encode()]
            except Exception as exc:  # noqa: BLE001
                logger.exception("Unhandled error handling %s %s", method, path)
                start_response("500 Internal Server Error", [("Content-Type", "application/json")] + cors_hdrs)
                return [json.dumps({"error": str(exc)}).encode()]

        # Serve the built web UI when present (GET only).
        if method == "GET" and _web_available():
            static = _serve_static(path)
            if static is not None:
                status, headers, data = static
                start_response(status, headers + cors_hdrs)
                return [data]

        start_response("404 Not Found", [("Content-Type", "application/json")] + cors_hdrs)
        return [json.dumps({"error": "not_found"}).encode()]

    app._luno_routes = api.routes  # for tests/introspection
    return app


def _sse_wrap(chunks):
    """Yield SSE-formatted bytes from dict chunks (FastAPI streaming)."""
    for chunk in chunks:
        yield f"data: {json.dumps(chunk)}\n\n".encode("utf-8")


# --------------------------------------------------------------------------
# Entrypoint
# --------------------------------------------------------------------------

def run_server(
    *,
    model: Optional[str] = None,
    host: str = config.DEFAULT_HOST,
    port: int = config.DEFAULT_PORT,
    force_mini: bool = False,
) -> None:
    """Load the model and serve the Luno API until interrupted."""
    loaded = load_model(model, force_mini=force_mini)
    app = build_app(loaded, default_model=model)

    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    )

    try:
        import uvicorn  # type: ignore
    except ImportError:  # stdlib fallback
        from wsgiref.simple_server import make_server

        logger.info(
            "Serving %s via stdlib server (install uvicorn for a nicer one).",
            loaded.name,
        )
        logger.info("Luno API: http://%s:%d", host, port)
        httpd = make_server(host, port, app)
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            pass
        finally:
            loaded.engine.close()
    else:
        logger.info("Serving %s via uvicorn.", loaded.name)
        logger.info("Luno API: http://%s:%d", host, port)
        uvicorn.run(app, host=host, port=port, log_level="info")


def main(argv: Optional[list] = None) -> int:
    parser = argparse.ArgumentParser(prog="luno-server", description="Run the Luno API")
    parser.add_argument("--model", "-m", default=None, help="Model slug/name (default: luno-zero-0.1)")
    parser.add_argument("--host", default=config.DEFAULT_HOST, help="Bind address")
    parser.add_argument("--port", "-p", type=int, default=config.DEFAULT_PORT, help="Port")
    parser.add_argument("--force-mini", action="store_true", help="Always use built-in Mini Zero")
    args = parser.parse_args(argv)
    run_server(
        model=args.model,
        host=args.host,
        port=args.port,
        force_mini=args.force_mini,
    )
    return 0


if __name__ == "__main__":  # pragma: no cover
    raise SystemExit(main())
