"""Configuration and paths for Luno.

Everything lives under ``LUNO_HOME`` (defaults to ``~/.luno``). Model
weights are stored in ``LUNO_HOME/models`` and are deliberately kept out of
the Git repository.
"""

from __future__ import annotations

import os
from pathlib import Path

APP_NAME = "LunoAI"
APP_VERSION = "0.1.0"

DEFAULT_MODEL = "luno-mini-zero"

# Inference defaults
DEFAULT_MAX_TOKENS = 256
DEFAULT_TEMPERATURE = 0.8
DEFAULT_TOP_P = 1.0

# Server defaults
DEFAULT_HOST = "127.0.0.1"
DEFAULT_PORT = 8787


def get_home() -> Path:
    """Return the Luno data directory (``LUNO_HOME`` or ``~/.luno``)."""
    env = os.environ.get("LUNO_HOME")
    return Path(env).expanduser() if env else Path.home() / ".luno"


def get_models_dir() -> Path:
    """Return the directory where Luno model weights live."""
    return get_home() / "models"


def get_cache_dir() -> Path:
    """Return the directory Luno uses for small on-disk caches."""
    return get_home() / "cache"


def ensure_dirs() -> None:
    """Create the Luno data + model directories if they do not exist."""
    get_models_dir().mkdir(parents=True, exist_ok=True)
    get_cache_dir().mkdir(parents=True, exist_ok=True)
