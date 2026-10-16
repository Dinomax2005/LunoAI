"""Loopback-only stdlib HTTP API for the desktop UI and local integrations."""

from __future__ import annotations

import json
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import Any
from urllib.parse import urlsplit

from . import __version__
from .config import home_path, load_settings, read_json
from .inference import BackendUnavailable, InferenceEngine, InferenceError, ModelNotInstalled
from .models import get_model, installed_models
from .training import TrainingManager

HOST = "127.0.0.1"
PORT = 8765
_MAX_BODY = 2 * 1024 * 1024


class LunoHTTPServer(ThreadingHTTPServer):
    daemon_threads = True
    allow_reuse_address = True

    def __init__(self, port: int = PORT, *, home: Path | str | None = None,
                 engine: InferenceEngine | None = None, manager: TrainingManager | None = None):
        self.home = home_path(home)
        self.engine = engine or InferenceEngine(self.home)
        self.manager = manager or TrainingManager(self.home)
        super().__init__((HOST, port), LunoHandler)  # Never listen on a public interface.


class LunoHandler(BaseHTTPRequestHandler):
    server: LunoHTTPServer
    protocol_version = "HTTP/1.1"

    def _reply(self, code: int, payload: dict[str, Any]) -> None:
        data = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(data)))
        self.send_header("Cache-Control", "no-store")
        self.send_header("X-Content-Type-Options", "nosniff")
        self.end_headers()
        self.wfile.write(data)

    def _body(self) -> dict[str, Any]:
        if self.headers.get_content_type() != "application/json":
            raise ValueError("Content-Type must be application/json")
        try:
            length = int(self.headers.get("Content-Length", ""))
        except ValueError as exc:
            raise ValueError("Content-Length required") from exc
        if length < 1 or length > _MAX_BODY:
            raise ValueError("JSON request body must be between 1 byte and 2 MiB")
        try:
            value = json.loads(self.rfile.read(length))
        except (UnicodeDecodeError, json.JSONDecodeError) as exc:
            raise ValueError(f"Invalid JSON: {exc}") from exc
        if not isinstance(value, dict):
            raise ValueError("JSON body must be an object")
        return value

    def _training_allowed(self) -> bool:
        if not load_settings(self.server.home).permissions.training:
            self._reply(403, {"error": "Training permission is off. Enable it in Settings first."})
            return False
        return True

    def _trusted_local_request(self) -> bool:
        # Binding loopback alone does not defeat browser DNS rebinding.
        try:
            host = urlsplit("http://" + self.headers.get("Host", "")).hostname
            origin = self.headers.get("Origin")
            origin_host = urlsplit(origin).hostname if origin else None
        except ValueError:
            host, origin_host = None, None
        if host not in ("127.0.0.1", "localhost") or (origin and origin_host not in ("127.0.0.1", "localhost")):
            self._reply(403, {"error": "Local requests only"})
            return False
        return True

    def do_GET(self) -> None:
        if not self._trusted_local_request():
            return
        path = urlsplit(self.path).path
        try:
            if path == "/health":
                self._reply(200, {"app": "Luno", "version": __version__, "status": "ok"})
            elif path == "/v1/status":
                settings = load_settings(self.server.home)
                model = get_model(settings.selected_model)
                heartbeat = read_json(self.server.home / "state" / "service-heartbeat.json", {})
                self._reply(200, {
                    "version": __version__, "selected_model": model.id,
                    "model_installed": model.path(self.server.home).is_file(),
                    "installed_models": installed_models(self.server.home),
                    "permissions": vars(settings.permissions),
                    "service": heartbeat,
                })
            elif path == "/v1/training":
                if self._training_allowed():
                    self._reply(200, self.server.manager.read_state())
            else:
                self._reply(404, {"error": "Not found"})
        except (ValueError, OSError) as exc:
            self._reply(500, {"error": str(exc)})

    def do_POST(self) -> None:
        if not self._trusted_local_request():
            return
        path = urlsplit(self.path).path
        if path not in ("/v1/chat", "/v1/training/start", "/v1/training/stop"):
            self._reply(404, {"error": "Not found"})
            return
        try:
            if path.startswith("/v1/training/") and not self._training_allowed():
                return
            data = self._body()
            if path == "/v1/chat":
                answer = self.server.engine.chat(data.get("messages"), data.get("level", "medium"))
                self._reply(200, {"message": {"role": "assistant", "content": answer}})
            elif path == "/v1/training/start":
                self._reply(202, self.server.manager.start(
                    data.get("dataset", ""), hours=float(data.get("hours", 1)),
                    epochs=float(data.get("epochs", 1)),
                ))
            else:
                self._reply(200, self.server.manager.stop())
        except (ModelNotInstalled, BackendUnavailable, InferenceError) as exc:
            self._reply(503, {"error": str(exc)})
        except PermissionError as exc:
            self._reply(403, {"error": str(exc)})
        except (ValueError, TypeError) as exc:
            self._reply(400, {"error": str(exc)})
        except (OSError, RuntimeError) as exc:
            self._reply(500, {"error": str(exc)})

    def log_message(self, format: str, *args: object) -> None:
        # Request bodies (chats/datasets) are never logged.
        print(f"Luno loopback {self.address_string()}: {format % args}")


def make_server(port: int = PORT, *, home: Path | str | None = None,
                engine: InferenceEngine | None = None, manager: TrainingManager | None = None) -> LunoHTTPServer:
    return LunoHTTPServer(port, home=home, engine=engine, manager=manager)


def serve(port: int = PORT, *, home: Path | str | None = None) -> None:
    server = make_server(port, home=home)
    print(f"Luno {__version__} listening only on http://{HOST}:{server.server_port}", flush=True)
    try:
        server.serve_forever(poll_interval=0.5)
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()
