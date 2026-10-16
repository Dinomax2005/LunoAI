"""Consent-gated, journaled setup. Reruns skip completed steps and resume .part files."""

from __future__ import annotations

import os
import shutil
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Callable

from . import __version__
from .config import atomic_write_json, ensure_directories, home_path, load_settings, read_json
from .downloads import download
from .models import get_model
from .service import LINUX_UNIT, MAC_LABEL, WINDOWS_TASK, install as install_service
from .training import worker_python

Log = Callable[[str], None]
Progress = Callable[[str, int, int | None], None]


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


class Setup:
    def __init__(self, home: Path | str | None = None, *, log: Log | None = None,
                 progress: Progress | None = None):
        self.home = home_path(home)
        self.state_path = self.home / "state" / "setup-state.json"
        self.log = log or (lambda message: None)
        self.progress = progress or (lambda step, current, total: None)

    def read_state(self) -> dict:
        state = read_json(self.state_path, {"steps": {}})
        if not isinstance(state, dict) or not isinstance(state.get("steps"), dict):
            raise ValueError(f"Invalid setup state: {self.state_path}")
        return state

    def _record(self, name: str, status: str, error: str | None = None) -> None:
        state = self.read_state()
        state["steps"][name] = {"status": status, "updated_at": _now(), "version": __version__}
        state["updated_at"] = _now()
        state["last_error"] = error
        atomic_write_json(self.state_path, state)

    def _step(self, name: str, task: Callable[[], None],
              valid: Callable[[], bool] | None = None) -> None:
        recorded = self.read_state()["steps"].get(name, {})
        if recorded.get("status") == "done" and recorded.get("version") == __version__ and (
            valid is None or valid()
        ):
            self.log(f"[skip] {name} already completed")
            return
        self.log(f"[start] {name}")
        self._record(name, "running")
        try:
            task()
        except Exception as exc:
            self._record(name, "failed", str(exc))
            self.log(f"[failed] {name}: {exc}")
            raise
        self._record(name, "done")
        self.log(f"[done] {name}")

    def _python(self) -> list[str]:
        candidates: list[list[str]] = []
        if os.environ.get("LUNO_PYTHON"):
            candidates.append([os.environ["LUNO_PYTHON"]])
        elif not getattr(sys, "frozen", False):
            candidates.append([sys.executable])
        else:
            for executable in ("python3.12", "python3.11", "python3", "python", "py"):
                path = shutil.which(executable)
                if path:
                    candidates.append([path] + (["-3"] if executable == "py" else []))
        for candidate in candidates:
            try:
                result = subprocess.run(candidate + ["-c", "import sys; print(sys.version_info[:2])"],
                                        text=True, capture_output=True, timeout=10)
                if result.returncode == 0 and any(f"({minor[0]}, {minor[1]})" in result.stdout
                                                   for minor in ((3, 11), (3, 12), (3, 13))):
                    return candidate
            except (OSError, subprocess.TimeoutExpired):
                continue
        raise RuntimeError(
            "Python 3.11-3.13 is required for local inference/training. Install Python, "
            "then retry Setup (or set LUNO_PYTHON to its executable)."
        )

    def _source(self) -> Path:
        if getattr(sys, "frozen", False):
            source = Path(sys._MEIPASS) / "bundle"
        else:
            source = Path(__file__).resolve().parent.parent
        if not (source / "pyproject.toml").is_file():
            raise RuntimeError(f"Bundled Luno package is missing: {source}")
        return source

    def _command(self, command: list[str]) -> None:
        self.log("Running: " + " ".join(command))
        with subprocess.Popen(command, stdout=subprocess.PIPE, stderr=subprocess.STDOUT,
                              text=True, errors="replace", bufsize=1) as process:
            assert process.stdout is not None
            for line in process.stdout:
                self.log(line.rstrip())
            code = process.wait()
        if code:
            raise RuntimeError(f"Command exited with code {code}: {' '.join(command)}")

    def _runtime(self) -> None:
        path = self.home / "runtime"
        python = path / ("Scripts/python.exe" if os.name == "nt" else "bin/python")
        if not python.is_file():
            command = self._python()
            self.log(f"Creating per-user Python environment at {path}")
            self._command(command + ["-m", "venv", str(path)])
        self._command([str(python), "-m", "pip", "install", "--disable-pip-version-check",
                       "--upgrade", str(self._source())])

    def _runtime_valid(self) -> bool:
        try:
            python = worker_python(self.home)
            if python.parent.parent != self.home / "runtime":
                return False
            result = subprocess.run([str(python), "-c", "import luno_desktop; print(luno_desktop.__version__)"],
                                    text=True, capture_output=True, timeout=10)
            return result.returncode == 0 and result.stdout.strip() == __version__
        except (OSError, RuntimeError, subprocess.TimeoutExpired):
            return False

    def _pip(self, *packages: str) -> None:
        self._command([str(worker_python(self.home)), "-m", "pip", "install",
                       "--disable-pip-version-check", *packages])

    def _consented(self, name: str, task: Callable[[], None]) -> None:
        if not getattr(load_settings(self.home).permissions, name):
            raise PermissionError(f"{name} permission was revoked during Setup")
        task()

    def _service_valid(self) -> bool:
        if sys.platform == "win32":
            result = subprocess.run(["schtasks", "/query", "/tn", WINDOWS_TASK],
                                    capture_output=True, timeout=10)
            return result.returncode == 0
        if sys.platform == "darwin":
            return (Path.home() / "Library" / "LaunchAgents" / f"{MAC_LABEL}.plist").is_file()
        return (Path.home() / ".config" / "systemd" / "user" / LINUX_UNIT).is_file()

    def run(self) -> dict:
        settings = load_settings(self.home)
        spec = get_model(settings.selected_model)
        permissions = settings.permissions
        self._step("directories", lambda: ensure_directories(self.home),
                   valid=lambda: (self.home / "state").is_dir())
        if any((permissions.model_download, permissions.training, permissions.background_service)):
            self._step("runtime", self._runtime, valid=self._runtime_valid)
        else:
            self.log("[permission off] Python runtime and optional components not installed")
        if permissions.model_download:
            self._step("llama_cpp", lambda: self._consented(
                "model_download", lambda: self._pip(
                    "--extra-index-url", "https://abetlen.github.io/llama-cpp-python/whl/cpu",
                    "llama-cpp-python==0.3.36",
                )))
            def model_progress(current: int, total: int | None) -> None:
                if not load_settings(self.home).permissions.model_download:
                    raise PermissionError("Model download permission was revoked; partial bytes remain")
                self.progress("model_download", current, total)
            self._step(f"model_download:{spec.id}", lambda: self._consented(
                "model_download", lambda: download(
                    spec.gguf_url, spec.path(self.home), expected_sha256=spec.sha256,
                    progress=model_progress,
                )), valid=lambda: spec.path(self.home).is_file())
        else:
            self.log("[permission off] Model/package download skipped")
        if permissions.training:
            self._step("training_extras", lambda: self._consented(
                "training", lambda: self._pip(
                    "torch", "transformers>=4.46,<5", "peft", "datasets", "accelerate",
                )))
        else:
            self.log("[permission off] Training dependencies skipped")
        if permissions.background_service and permissions.start_at_login:
            self._step("service_install", lambda: install_service(self.home),
                       valid=self._service_valid)
        else:
            self.log("[permission off] Login background service skipped")
        return self.read_state()
