"""Stdlib-only tests; no network, model weights, Tk display or ML extras needed."""

from __future__ import annotations

import hashlib
import json
import os
import tempfile
import threading
import unittest
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from unittest.mock import patch
from urllib.error import HTTPError
from urllib.request import Request, urlopen

from luno_desktop.config import (Permissions, Settings, atomic_write_json, data_dir,
                                 load_settings, save_settings)
from luno_desktop.downloads import DownloadError, download
from luno_desktop.inference import InferenceEngine, score_candidate
from luno_desktop.installer import Setup
from luno_desktop.models import get_model
from luno_desktop.server import make_server
from luno_desktop.service import install as install_service
from luno_desktop.training import TrainingManager
from luno_desktop.train_worker import _examples

CONTENT = bytes(range(256)) * 180


class DownloadHandler(BaseHTTPRequestHandler):
    ranges: list[str] = []
    allow_range = True

    def do_GET(self) -> None:
        start = 0
        requested = self.headers.get("Range")
        type(self).ranges.append(requested or "")
        if requested and type(self).allow_range:
            start = int(requested.removeprefix("bytes=").removesuffix("-"))
            if start >= len(CONTENT):
                self.send_response(416)
                self.send_header("Content-Range", f"bytes */{len(CONTENT)}")
                self.send_header("Content-Length", "0")
                self.end_headers()
                return
        payload = CONTENT[start:]
        self.send_response(206 if requested and type(self).allow_range else 200)
        self.send_header("Content-Length", str(len(payload)))
        self.send_header("ETag", '"unchanged"')
        if requested and type(self).allow_range:
            self.send_header("Content-Range", f"bytes {start}-{len(CONTENT) - 1}/{len(CONTENT)}")
        self.end_headers()
        self.wfile.write(payload)

    def log_message(self, format: str, *args: object) -> None:
        pass


class DesktopTests(unittest.TestCase):
    def setUp(self) -> None:
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.home = Path(self.temp.name)

    def _download_server(self) -> str:
        DownloadHandler.ranges = []
        DownloadHandler.allow_range = True
        httpd = ThreadingHTTPServer(("127.0.0.1", 0), DownloadHandler)
        thread = threading.Thread(target=httpd.serve_forever, daemon=True)
        thread.start()
        self.addCleanup(httpd.server_close)
        self.addCleanup(httpd.shutdown)
        return f"http://127.0.0.1:{httpd.server_port}/test.gguf"

    def test_resumes_preseeded_part_with_range(self) -> None:
        url = self._download_server()
        destination = self.home / "models" / "test.gguf"
        destination.parent.mkdir()
        part = destination.with_name(destination.name + ".part")
        part.write_bytes(CONTENT[:8192])
        state = destination.with_name(destination.name + ".part.state.json")
        atomic_write_json(state, {"url": url, "sha256": hashlib.sha256(CONTENT).hexdigest(),
                                  "etag": '"unchanged"', "bytes": 1024})
        progress = []
        result = download(url, destination, expected_sha256=hashlib.sha256(CONTENT).hexdigest(),
                          progress=lambda current, total: progress.append((current, total)), chunk_size=2048)
        self.assertEqual(result.read_bytes(), CONTENT)
        self.assertEqual(DownloadHandler.ranges, ["bytes=8192-"])
        self.assertEqual(progress[-1], (len(CONTENT), len(CONTENT)))
        self.assertFalse(part.exists())
        self.assertFalse(state.exists())

    def test_resume_without_state_uses_part_size(self) -> None:
        url = self._download_server()
        destination = self.home / "test.gguf"
        destination.with_name("test.gguf.part").write_bytes(CONTENT[:2048])
        download(url, destination)
        self.assertEqual(DownloadHandler.ranges, ["bytes=2048-"])
        self.assertEqual(destination.read_bytes(), CONTENT)

    def test_server_ignoring_range_restarts_cleanly(self) -> None:
        url = self._download_server()
        DownloadHandler.allow_range = False
        destination = self.home / "test.gguf"
        destination.with_name("test.gguf.part").write_bytes(CONTENT[:2048])
        download(url, destination)
        self.assertEqual(DownloadHandler.ranges, ["bytes=2048-"])
        self.assertEqual(destination.read_bytes(), CONTENT)

    def test_full_part_before_crash_finishes_after_http_416(self) -> None:
        url = self._download_server()
        destination = self.home / "test.gguf"
        destination.with_name("test.gguf.part").write_bytes(CONTENT)
        download(url, destination, expected_sha256=hashlib.sha256(CONTENT).hexdigest())
        self.assertEqual(DownloadHandler.ranges, [f"bytes={len(CONTENT)}-"])
        self.assertEqual(destination.read_bytes(), CONTENT)

    def test_sha256_mismatch_never_installs_corruption(self) -> None:
        url = self._download_server()
        destination = self.home / "test.gguf"
        with self.assertRaises(DownloadError):
            download(url, destination, expected_sha256="0" * 64)
        self.assertFalse(destination.exists())
        self.assertFalse(destination.with_name("test.gguf.part").exists())

    def test_settings_roundtrip_and_default_permissions_off(self) -> None:
        with patch.dict(os.environ, {"LUNO_HOME": str(self.home / "my data")}):
            self.assertEqual(data_dir(), (self.home / "my data").resolve())
            default = load_settings()
            self.assertEqual(default.selected_model, "qwen2.5-1.5b")
            self.assertEqual(vars(default.permissions), {name: False for name in vars(default.permissions)})
            default.selected_model = "qwen2.5-3b"
            default.permissions.training = True
            save_settings(default)
            self.assertEqual(load_settings(), default)
            raw = json.loads((data_dir() / "settings.json").read_text())
            self.assertFalse(raw["permissions"]["model_download"])
            atomic_write_json(data_dir() / "settings.json", {"permissions": {"training": "yes"}})
            self.assertFalse(load_settings().permissions.training)  # Only JSON true is consent.

    def test_catalogue_urls_and_default(self) -> None:
        for size, ram in (("0.5", 4), ("1.5", 8), ("3", 12)):
            spec = get_model(f"qwen2.5-{size}b")
            self.assertEqual(spec.min_ram_gb, ram)
            self.assertEqual(spec.gguf_url, f"https://huggingface.co/Qwen/Qwen2.5-{size}B-Instruct-GGUF/resolve/main/qwen2.5-{size}b-instruct-q4_k_m.gguf")
            self.assertEqual(spec.train_repo, f"Qwen/Qwen2.5-{size}B-Instruct")

    def test_latest_checkpoint_and_resume_command(self) -> None:
        manager = TrainingManager(self.home, python_executable="/usr/bin/python3")
        folder = manager.output_dir("qwen2.5-1.5b")
        for name in ("checkpoint-50", "checkpoint-150", "checkpoint-100", "checkpoint-bad"):
            (folder / name).mkdir(parents=True)
        self.assertEqual(manager.latest_checkpoint(), folder / "checkpoint-150")
        command = manager.build_command(self.home / "data.jsonl")
        self.assertEqual(command[:3], ["/usr/bin/python3", "-m", "luno_desktop.train_worker"])
        self.assertEqual(command[command.index("--resume-from") + 1], str(folder / "checkpoint-150"))
        self.assertEqual(command[command.index("--save-steps") + 1], "50")

    def test_training_state_roundtrip_and_stale_worker(self) -> None:
        manager = TrainingManager(self.home)
        state = manager.update_state(status="paused", pid=12345, dataset="/local/data.jsonl",
                                     latest_checkpoint="checkpoint-150")
        self.assertEqual(manager.read_state(), state)
        self.assertEqual(json.loads(manager.state_path.read_text())["dataset"], "/local/data.jsonl")
        manager.update_state(status="running", pid=999999999)
        self.assertEqual(manager.read_state()["status"], "interrupted")

    def test_incomplete_checkpoint_is_not_used_over_complete_one(self) -> None:
        manager = TrainingManager(self.home, python_executable="/usr/bin/python3")
        good = manager.output_dir() / "checkpoint-100"
        bad = manager.output_dir() / "checkpoint-150"
        good.mkdir(parents=True)
        bad.mkdir()
        (good / "trainer_state.json").write_text("{}")
        (bad / "adapter_model.safetensors").write_bytes(b"partial")
        self.assertEqual(manager.latest_checkpoint(), good)
        self.assertEqual(manager.build_command(self.home / "data.jsonl")[-2:],
                         ["--resume-from", str(good)])

    def test_http_health_chat_503_and_training_403(self) -> None:
        server = make_server(port=0, home=self.home)
        self.assertEqual(server.server_address[0], "127.0.0.1")
        thread = threading.Thread(target=server.serve_forever, daemon=True)
        thread.start()
        self.addCleanup(server.server_close)
        self.addCleanup(server.shutdown)
        base = f"http://127.0.0.1:{server.server_port}"
        with urlopen(base + "/health") as response:
            self.assertEqual(response.status, 200)
            self.assertEqual(json.load(response)["app"], "Luno")
        body = json.dumps({"messages": [{"role": "user", "content": "Hello"}], "level": "low"}).encode()
        request = Request(base + "/v1/chat", data=body,
                          headers={"Content-Type": "application/json"}, method="POST")
        with self.assertRaises(HTTPError) as result:
            urlopen(request)
        self.assertEqual(result.exception.code, 503)
        self.assertIn("No model installed", json.load(result.exception)["error"])
        with self.assertRaises(HTTPError) as result:
            urlopen(base + "/v1/training")
        self.assertEqual(result.exception.code, 403)
        request = Request(base + "/v1/training/start", data=b"{}",
                          headers={"Content-Type": "application/json"}, method="POST")
        with self.assertRaises(HTTPError) as result:
            urlopen(request)
        self.assertEqual(result.exception.code, 403)
        bad_host = Request(base + "/health", headers={"Host": "attacker.example"})
        with self.assertRaises(HTTPError) as result:
            urlopen(bad_host)
        self.assertEqual(result.exception.code, 403)

    def test_permission_gates_service_training_and_setup(self) -> None:
        with self.assertRaises(PermissionError):
            install_service(self.home)
        with self.assertRaises(PermissionError):
            TrainingManager(self.home).start(self.home / "data.jsonl")
        log = []
        journal = Setup(self.home, log=log.append).run()
        self.assertEqual(list(journal["steps"]), ["directories"])
        second = Setup(self.home, log=log.append).run()
        self.assertEqual(second["steps"], journal["steps"])
        self.assertIn("[skip] directories already completed", log)
        self.assertFalse((self.home / "runtime").exists())
        self.assertFalse((self.home / "models" / get_model("qwen2.5-1.5b").filename).exists())

    def test_jsonl_training_examples_are_real_text_or_prompt_response(self) -> None:
        class Tokenizer:
            chat_template = "available"

            def apply_chat_template(self, messages, *, tokenize, add_generation_prompt):
                return f"<user>{messages[0]['content']}</user><assistant>{messages[1]['content']}</assistant>"

        path = self.home / "examples.jsonl"
        path.write_text('{"text":"A local example"}\n{"prompt":"Question","response":"Answer"}\n')
        self.assertEqual(_examples(path, Tokenizer()),
                         ["A local example", "<user>Question</user><assistant>Answer</assistant>"])
        path.write_text('{"text":42}\n')
        with self.assertRaisesRegex(ValueError, "examples.jsonl:1"):
            _examples(path, Tokenizer())

    def test_thinking_levels_have_real_generation_passes_and_history(self) -> None:
        class Backend:
            def __init__(self):
                self.calls = []

            def complete(self, messages, *, max_tokens, temperature):
                self.calls.append((messages, max_tokens, temperature))
                return f"Local answer {len(self.calls)}"

        get_model("qwen2.5-1.5b").path(self.home).parent.mkdir()
        get_model("qwen2.5-1.5b").path(self.home).touch()
        backend = Backend()
        engine = InferenceEngine(self.home, backend=backend)
        history = [{"role": "user", "content": "First"},
                   {"role": "assistant", "content": "Earlier answer"},
                   {"role": "user", "content": "Follow-up"}]
        self.assertEqual(engine.chat(history, "low"), "Local answer 1")
        self.assertEqual(backend.calls[0][1], 180)
        self.assertEqual(backend.calls[0][0][-3:], history)
        engine.chat(history, "medium")
        self.assertEqual(backend.calls[1][1], 420)
        engine.chat(history, "high")
        self.assertEqual([call[1] for call in backend.calls[2:4]], [400, 400])
        engine.chat(history, "max")
        self.assertEqual([call[1] for call in backend.calls[4:]], [250, 250, 250, 450])
        self.assertEqual([call[2] for call in backend.calls[4:7]], [0.55, 0.75, 0.92])
        self.assertLess(score_candidate("I cannot help ```"), score_candidate("A complete, useful answer."))


if __name__ == "__main__":
    unittest.main()
