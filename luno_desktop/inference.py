"""Local GGUF inference, with a strictly-offline transformers fallback."""

from __future__ import annotations

import re
import threading
from pathlib import Path
from typing import Protocol

from .config import home_path, load_settings
from .models import get_model

SYSTEM_PROMPT = (
    "You are Luno, a helpful AI assistant running entirely on the user's own computer. "
    "You have no cloud connection or API keys. Be accurate, acknowledge uncertainty, "
    "and do not claim to be a frontier model. Use the conversation history as context."
)
LEVELS = {"low": 180, "medium": 420, "high": 800, "max": 1200}


class InferenceError(RuntimeError):
    pass


class ModelNotInstalled(InferenceError):
    pass


class BackendUnavailable(InferenceError):
    pass


class Backend(Protocol):
    def complete(self, messages: list[dict[str, str]], *, max_tokens: int, temperature: float) -> str: ...


class GGUFBackend:
    def __init__(self, model_file: Path):
        from llama_cpp import Llama
        self.model = Llama(model_path=str(model_file), n_ctx=4096, n_gpu_layers=-1, verbose=False)

    def complete(self, messages: list[dict[str, str]], *, max_tokens: int, temperature: float) -> str:
        result = self.model.create_chat_completion(
            messages=messages, max_tokens=max_tokens, temperature=temperature,
        )
        return (result["choices"][0]["message"]["content"] or "").strip()


class TransformersBackend:
    """Use only locally cached HF weights; trained adapters take precedence over GGUF."""

    def __init__(self, repo_id: str, cache: Path, adapter: Path | None = None):
        import torch
        from transformers import AutoModelForCausalLM, AutoTokenizer, pipeline

        self.tokenizer = AutoTokenizer.from_pretrained(
            repo_id, cache_dir=str(cache), local_files_only=True,
        )
        model = AutoModelForCausalLM.from_pretrained(
            repo_id, cache_dir=str(cache), local_files_only=True,
            torch_dtype=torch.float16 if torch.cuda.is_available() else torch.float32,
        )
        if adapter is not None:
            from peft import PeftModel
            model = PeftModel.from_pretrained(model, str(adapter), local_files_only=True)
        self.generator = pipeline(
            "text-generation", model=model, tokenizer=self.tokenizer,
            device=0 if torch.cuda.is_available() else -1,
        )

    def complete(self, messages: list[dict[str, str]], *, max_tokens: int, temperature: float) -> str:
        if self.tokenizer.chat_template:
            prompt = self.tokenizer.apply_chat_template(messages, tokenize=False, add_generation_prompt=True)
        else:
            prompt = "\n".join(f"{m['role'].title()}: {m['content']}" for m in messages) + "\nAssistant:"
        result = self.generator(
            prompt, max_new_tokens=max_tokens, do_sample=True, temperature=temperature,
            return_full_text=False, pad_token_id=self.tokenizer.eos_token_id,
        )[0]["generated_text"]
        if isinstance(result, list):
            result = result[-1].get("content", "")
        return str(result).strip()


def score_candidate(text: str) -> float:
    """Simple, reproducible heuristics; not a claim of factual verification."""
    words = re.findall(r"\b[\w'-]+\b", text.lower())
    if not words:
        return -100.0
    length_score = min(len(words), 180) / 180 * 2
    diversity = len(set(words)) / len(words) * 2
    unclosed_fence = -2.0 if text.count("```") % 2 else 0.0
    refusal = -3.0 if re.search(r"\b(i (?:can't|cannot|won't)|as an ai|i'm unable)\b", text, re.I) else 0.0
    return length_score + diversity + unclosed_fence + refusal


class InferenceEngine:
    def __init__(self, home: Path | str | None = None, *, backend: Backend | None = None):
        self.home = home_path(home)
        self._backend = backend
        self._key: tuple[str, bool] | None = None
        self._lock = threading.RLock()  # Inference backends are not necessarily thread-safe.

    def _load(self) -> Backend:
        spec = get_model(load_settings(self.home).selected_model)
        if not spec.path(self.home).is_file():
            raise ModelNotInstalled(
                f"No model installed: {spec.id}. Enable model downloads and run Setup. "
                "Luno cannot answer without a local model."
            )
        if self._backend is not None and self._key is None:
            return self._backend  # A supplied backend is useful for tests and integrations.
        adapter = self.home / "training" / spec.id / "adapter"
        trained = (adapter / "adapter_config.json").is_file()
        key = (spec.id, trained)
        if self._backend is not None and self._key == key:
            return self._backend
        errors: list[str] = []
        cache = self.home / "models" / "hf"
        if trained:
            try:
                self._backend = TransformersBackend(spec.train_repo, cache, adapter)
                self._key = key
                return self._backend
            except (ImportError, OSError, RuntimeError, ValueError) as exc:
                # Never silently discard a user's trained adapter.
                raise BackendUnavailable(
                    f"Trained adapter exists but cannot be loaded locally: {exc}. "
                    "Install training extras and keep the cached HF weights."
                ) from exc
        try:
            self._backend = GGUFBackend(spec.path(self.home))
            self._key = key
            return self._backend
        except (ImportError, OSError, RuntimeError, ValueError) as exc:
            errors.append(f"llama-cpp-python: {exc}")
        try:
            self._backend = TransformersBackend(spec.train_repo, cache)
            self._key = key
            return self._backend
        except (ImportError, OSError, RuntimeError, ValueError) as exc:
            errors.append(f"transformers (local HF weights only): {exc}")
        raise BackendUnavailable(
            "No usable local inference backend. Run Setup to install llama-cpp-python; "
            "the transformers fallback requires locally cached HF weights and torch. "
            + " | ".join(errors)
        )

    def chat(self, messages: list[dict[str, str]], level: str = "medium") -> str:
        if level not in LEVELS:
            raise ValueError(f"Thinking level must be one of {', '.join(LEVELS)}")
        if not isinstance(messages, list) or not messages:
            raise ValueError("messages must be a nonempty list")
        if any(not isinstance(message, dict) or message.get("role") not in ("user", "assistant")
               or not isinstance(message.get("content"), str) for message in messages):
            raise ValueError("Each message needs a user/assistant role and string content")
        if messages[-1]["role"] != "user" or not messages[-1]["content"].strip():
            raise ValueError("The last message must be a nonempty user message")
        with self._lock:
            backend = self._load()
            history = [{"role": "system", "content": SYSTEM_PROMPT}] + messages
            if level in ("low", "medium"):
                answer = backend.complete(history, max_tokens=LEVELS[level], temperature=0.7)
            elif level == "high":
                draft = backend.complete(history, max_tokens=400, temperature=0.7)
                answer = backend.complete(history + [
                    {"role": "assistant", "content": draft},
                    {"role": "user", "content": "Review your draft for mistakes and omissions. Return only a revised final answer."},
                ], max_tokens=400, temperature=0.55)
            else:
                candidates = [backend.complete(history, max_tokens=250, temperature=t)
                              for t in (0.55, 0.75, 0.92)]
                winner = max(candidates, key=score_candidate)
                answer = backend.complete(history + [
                    {"role": "assistant", "content": winner},
                    {"role": "user", "content": "Check the previous draft for errors and improve it. Return only the final answer."},
                ], max_tokens=450, temperature=0.55)
            if not answer:
                raise InferenceError("The local model produced no answer; try again or use another level")
            return answer
