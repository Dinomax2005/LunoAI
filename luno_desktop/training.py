"""Manage a durable, separate LoRA worker. The last Trainer checkpoint is reusable."""

from __future__ import annotations

import math
import os
import re
import signal
import subprocess
import sys
import threading
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from .config import atomic_write_json, ensure_directories, home_path, load_settings, read_json
from .models import get_model

_CHECKPOINT = re.compile(r"checkpoint-(\d+)$")


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _alive(pid: int | None) -> bool:
    if not isinstance(pid, int) or pid <= 0:
        return False
    try:
        os.kill(pid, 0)
        return True
    except ProcessLookupError:
        return False
    except PermissionError:
        return True
    except OSError:
        return False


def worker_python(home: Path | str | None = None) -> Path:
    """Prefer the per-user venv; the frozen GUI cannot itself execute `-m`."""
    base = home_path(home)
    venv_python = base / "runtime" / ("Scripts/python.exe" if os.name == "nt" else "bin/python")
    if venv_python.is_file():
        return venv_python
    if getattr(sys, "frozen", False):
        raise RuntimeError("Python runtime is missing. Run Setup first (Python 3.11+ required).")
    return Path(sys.executable)


class TrainingManager:
    def __init__(self, home: Path | str | None = None, *, python_executable: Path | str | None = None):
        self.home = home_path(home)
        self.python_executable = Path(python_executable) if python_executable else None
        self.state_path = self.home / "state" / "training-state.json"
        self.stop_path = self.home / "state" / "training-stop.request.json"
        self._lock = threading.RLock()
        self._process: subprocess.Popen | None = None

    def output_dir(self, model_id: str | None = None) -> Path:
        model_id = model_id or load_settings(self.home).selected_model
        get_model(model_id)  # Do not allow a model ID to become an arbitrary path.
        return self.home / "training" / model_id

    def latest_checkpoint(self, model_id: str | None = None) -> Path | None:
        output = self.output_dir(model_id)
        if not output.is_dir():
            return None
        matches = []
        for path in output.iterdir():
            match = _CHECKPOINT.fullmatch(path.name)
            if path.is_dir() and match:
                matches.append((int(match.group(1)), path))
        # Trainer writes trainer_state.json last. After a power cut, avoid an
        # incomplete highest-numbered directory when an older full save exists.
        complete = [item for item in matches if (item[1] / "trainer_state.json").is_file()]
        if complete:
            matches = complete
        elif any(any(path.iterdir()) for _, path in matches):
            return None  # Only half-written checkpoints exist.
        return max(matches, default=(None, None), key=lambda pair: pair[0])[1]

    def read_state(self) -> dict[str, Any]:
        with self._lock:
            state = read_json(self.state_path, {})
            if not isinstance(state, dict):
                raise ValueError(f"Invalid training state: {self.state_path}")
            alive = _alive(state.get("pid"))
            if self._process is not None and self._process.pid == state.get("pid"):
                alive = self._process.poll() is None  # Reap an exited child, not a zombie.
            if state.get("status") in ("running", "stopping") and not alive:
                state.update(
                    status="interrupted",
                    latest_checkpoint=str(self.latest_checkpoint(state.get("model"))) if state.get("model") else None,
                    updated_at=_now(),
                    message="Worker exited. Starting again resumes from the latest saved checkpoint.",
                )
                atomic_write_json(self.state_path, state)
            return state or {"status": "idle", "latest_checkpoint": None}

    def update_state(self, **changes: Any) -> dict[str, Any]:
        with self._lock:
            state = read_json(self.state_path, {}) or {}
            state.update(changes, updated_at=_now())
            atomic_write_json(self.state_path, state)
            return state

    def build_command(
        self, dataset: Path | str, *, hours: float = 1.0, epochs: float = 1.0,
        save_steps: int = 50, model_id: str | None = None,
    ) -> list[str]:
        model_id = model_id or load_settings(self.home).selected_model
        get_model(model_id)
        if not math.isfinite(hours) or not math.isfinite(epochs) or hours <= 0 or epochs <= 0 or save_steps < 1:
            raise ValueError("hours, epochs and save_steps must be finite and positive")
        python = self.python_executable or worker_python(self.home)
        command = [
            str(python), "-m", "luno_desktop.train_worker",
            "--home", str(self.home), "--model", model_id,
            "--dataset", str(Path(dataset).expanduser().resolve()),
            "--epochs", str(epochs), "--max-hours", str(hours),
            "--save-steps", str(save_steps),
        ]
        checkpoint = self.latest_checkpoint(model_id)
        if checkpoint is not None:
            command += ["--resume-from", str(checkpoint)]
        return command

    def start(
        self, dataset: Path | str, *, hours: float = 1.0, epochs: float = 1.0,
        save_steps: int = 50, model_id: str | None = None,
    ) -> dict[str, Any]:
        if not load_settings(self.home).permissions.training:
            raise PermissionError("Training permission is off. Enable it in Settings first.")
        dataset = Path(dataset).expanduser().resolve()
        if not dataset.is_file() or dataset.suffix.lower() != ".jsonl":
            raise ValueError("Select an existing .jsonl dataset")
        model_id = model_id or load_settings(self.home).selected_model
        with self._lock:
            previous = self.read_state()
            if previous.get("status") in ("running", "stopping"):
                raise RuntimeError("A training worker is already running")
            command = self.build_command(dataset, hours=hours, epochs=epochs,
                                         save_steps=save_steps, model_id=model_id)
            ensure_directories(self.home)
            self.stop_path.unlink(missing_ok=True)
            log_path = self.home / "logs" / "training.log"
            env = os.environ.copy()
            env["LUNO_HOME"] = str(self.home)
            self.update_state(status="launching", pid=None, model=model_id, dataset=str(dataset),
                              message="Starting a separate training worker")
            try:
                with log_path.open("a", encoding="utf-8") as log:
                    log.write(f"\n[{_now()}] Starting: {' '.join(command)}\n")
                    log.flush()
                    self._process = subprocess.Popen(
                        command, stdout=log, stderr=subprocess.STDOUT, env=env,
                        close_fds=True,
                        **({"creationflags": subprocess.CREATE_NEW_PROCESS_GROUP} if os.name == "nt" else {"start_new_session": True}),
                    )
            except OSError as exc:
                self.update_state(status="failed", message=str(exc))
                raise
            return self.update_state(
                status="running", pid=self._process.pid, model=model_id, dataset=str(dataset),
                hours=hours, epochs=epochs, save_steps=save_steps,
                latest_checkpoint=str(self.latest_checkpoint(model_id)) if self.latest_checkpoint(model_id) else None,
                started_at=_now(), finished_at=None, log=str(log_path), message="Training started",
            )

    def stop(self) -> dict[str, Any]:
        """Request a checkpoint at the next step on all OSes; SIGTERM nudges POSIX."""
        with self._lock:
            state = self.read_state()
            if state.get("status") not in ("running", "stopping"):
                return state
            pid = state["pid"]
            atomic_write_json(self.stop_path, {"pid": pid, "requested_at": _now()})
            state = self.update_state(status="stopping", message="Saving a checkpoint at the next training step")
            if os.name != "nt":
                try:
                    os.kill(pid, signal.SIGTERM)
                except ProcessLookupError:
                    pass
            return state
