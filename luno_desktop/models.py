"""Explicit catalogue of local Qwen 2.5 Instruct models."""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path

from .config import home_path


@dataclass(frozen=True)
class ModelSpec:
    id: str
    size: str
    approx_gb: float
    min_ram_gb: int
    default: bool = False
    sha256: str | None = None  # Supply a trusted checksum when available.

    @property
    def filename(self) -> str:
        return f"qwen2.5-{self.size}b-instruct-q4_k_m.gguf"

    @property
    def gguf_url(self) -> str:
        return (
            f"https://huggingface.co/Qwen/Qwen2.5-{self.size}B-Instruct-GGUF/"
            f"resolve/main/{self.filename}"
        )

    @property
    def train_repo(self) -> str:
        return f"Qwen/Qwen2.5-{self.size}B-Instruct"

    def path(self, home: Path | str | None = None) -> Path:
        return home_path(home) / "models" / self.filename


CATALOGUE: dict[str, ModelSpec] = {
    spec.id: spec for spec in (
        ModelSpec("qwen2.5-0.5b", "0.5", 0.4, 4),
        ModelSpec("qwen2.5-1.5b", "1.5", 1.0, 8, default=True),
        ModelSpec("qwen2.5-3b", "3", 2.0, 12),
    )
}
DEFAULT_MODEL = "qwen2.5-1.5b"


def get_model(model_id: str) -> ModelSpec:
    try:
        return CATALOGUE[model_id]
    except KeyError as exc:
        raise ValueError(f"Unknown model {model_id!r}; choose from {', '.join(CATALOGUE)}") from exc


def installed_models(home: Path | str | None = None) -> list[str]:
    return [model.id for model in CATALOGUE.values() if model.path(home).is_file()]
