"""Per-user settings and crash-safe JSON persistence. No permission is implicit."""

from __future__ import annotations

import json
import os
import sys
import tempfile
from dataclasses import asdict, dataclass, field, fields
from pathlib import Path
from typing import Any


@dataclass
class Permissions:
    model_download: bool = False
    background_service: bool = False
    training: bool = False
    start_at_login: bool = False

    @classmethod
    def from_dict(cls, value: Any) -> "Permissions":
        value = value if isinstance(value, dict) else {}
        # Only literal JSON true grants consent; missing or malformed values do not.
        return cls(**{item.name: value.get(item.name) is True for item in fields(cls)})


@dataclass
class Settings:
    selected_model: str = "qwen2.5-1.5b"
    thinking_level: str = "medium"
    permissions: Permissions = field(default_factory=Permissions)

    @classmethod
    def from_dict(cls, value: Any) -> "Settings":
        if not isinstance(value, dict):
            raise ValueError("settings.json must contain a JSON object")
        model = value.get("selected_model", cls.selected_model)
        level = value.get("thinking_level", cls.thinking_level)
        if not isinstance(model, str) or not isinstance(level, str):
            raise ValueError("Invalid model or thinking level in settings.json")
        return cls(model, level, Permissions.from_dict(value.get("permissions")))


def data_dir() -> Path:
    override = os.environ.get("LUNO_HOME")
    if override:
        return Path(override).expanduser().resolve()
    if sys.platform == "win32":
        return Path(os.environ.get("LOCALAPPDATA", Path.home() / "AppData" / "Local")) / "Luno"
    if sys.platform == "darwin":
        return Path.home() / "Library" / "Application Support" / "Luno"
    return Path.home() / ".local" / "share" / "luno"


def home_path(home: Path | str | None = None) -> Path:
    return Path(home).expanduser().resolve() if home is not None else data_dir()


def ensure_directories(home: Path | str | None = None) -> Path:
    base = home_path(home)
    for name in ("", "models", "chats", "training", "state", "logs"):
        (base / name).mkdir(mode=0o700, parents=True, exist_ok=True)
    return base


def read_json(path: Path, default: Any = None) -> Any:
    try:
        with path.open("r", encoding="utf-8") as stream:
            return json.load(stream)
    except FileNotFoundError:
        return default
    except json.JSONDecodeError as exc:
        raise ValueError(f"Invalid JSON in {path}: {exc}") from exc


def atomic_write_json(path: Path, value: Any) -> None:
    """Atomic replacement; a crash cannot leave a half-written settings/state file."""
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary: str | None = None
    try:
        with tempfile.NamedTemporaryFile(
            mode="w", encoding="utf-8", dir=path.parent,
            prefix=f".{path.name}.", suffix=".tmp", delete=False,
        ) as stream:
            temporary = stream.name
            if os.name != "nt":
                os.chmod(temporary, 0o600)
            json.dump(value, stream, indent=2, ensure_ascii=False)
            stream.write("\n")
            stream.flush()
            os.fsync(stream.fileno())
        os.replace(temporary, path)
    finally:
        if temporary and os.path.exists(temporary):
            os.unlink(temporary)


def settings_path(home: Path | str | None = None) -> Path:
    return home_path(home) / "settings.json"


def load_settings(home: Path | str | None = None) -> Settings:
    raw = read_json(settings_path(home))
    return Settings() if raw is None else Settings.from_dict(raw)


def save_settings(settings: Settings, home: Path | str | None = None) -> None:
    atomic_write_json(settings_path(home), asdict(settings))
