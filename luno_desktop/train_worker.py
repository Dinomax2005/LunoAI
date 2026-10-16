"""Separate `python -m luno_desktop.train_worker` LoRA Trainer process.

Only this module imports heavyweight ML dependencies. Trainer saves model, optimizer,
scheduler, RNG and trainer state in checkpoint-N; a subsequent run passes that
checkpoint to Trainer.train(resume_from_checkpoint=...).
"""

from __future__ import annotations

import argparse
import json
import math
import os
import signal
import sys
import time
import traceback
from pathlib import Path

from .config import home_path, load_settings
from .models import get_model
from .training import TrainingManager

_STOP = False


def _request_stop(signum: int, frame: object) -> None:
    global _STOP
    _STOP = True  # Save on the next optimizer step, not from a signal handler.


def _examples(path: Path, tokenizer: object) -> list[str]:
    texts: list[str] = []
    with path.open("r", encoding="utf-8") as stream:
        for line_no, line in enumerate(stream, 1):
            if not line.strip():
                continue
            try:
                record = json.loads(line)
            except json.JSONDecodeError as exc:
                raise ValueError(f"{path}:{line_no}: invalid JSON: {exc}") from exc
            if not isinstance(record, dict):
                raise ValueError(f"{path}:{line_no}: expected an object")
            if isinstance(record.get("text"), str) and record["text"].strip():
                text = record["text"].strip()
            elif (isinstance(record.get("prompt"), str) and record["prompt"].strip()
                  and isinstance(record.get("response"), str) and record["response"].strip()):
                messages = [
                    {"role": "user", "content": record["prompt"].strip()},
                    {"role": "assistant", "content": record["response"].strip()},
                ]
                if getattr(tokenizer, "chat_template", None):
                    text = tokenizer.apply_chat_template(messages, tokenize=False, add_generation_prompt=False)
                else:
                    text = f"User: {record['prompt']}\nAssistant: {record['response']}"
            else:
                raise ValueError(f"{path}:{line_no}: use {{\"text\": ...}} or {{\"prompt\": ..., \"response\": ...}}")
            texts.append(text)
    if not texts:
        raise ValueError(f"Dataset is empty: {path}")
    return texts


def train(args: argparse.Namespace) -> None:
    home = home_path(args.home)
    manager = TrainingManager(home)
    spec = get_model(args.model)
    permissions = load_settings(home).permissions
    if not permissions.training:
        raise PermissionError("Training permission is off")
    # Import only in the worker; neither the bundled GUI nor CLI status needs these.
    try:
        import torch
        from datasets import Dataset
        from peft import LoraConfig, get_peft_model
        from transformers import AutoModelForCausalLM, AutoTokenizer, Trainer, TrainerCallback, TrainingArguments
    except ImportError as exc:
        raise RuntimeError("Training dependencies missing. Enable Training and run Setup to install torch, transformers, peft, datasets and accelerate.") from exc

    cache = home / "models" / "hf"
    cache.mkdir(parents=True, exist_ok=True)
    # HF weights are downloaded only with explicit model_download consent.
    offline = not permissions.model_download
    print(f"Loading {spec.train_repo} (local files only: {offline}); LoRA runs entirely on this PC.", flush=True)
    try:
        tokenizer = AutoTokenizer.from_pretrained(spec.train_repo, cache_dir=str(cache), local_files_only=offline)
        dtype = (torch.bfloat16 if torch.cuda.is_available() and torch.cuda.is_bf16_supported()
                 else torch.float16 if torch.cuda.is_available() else torch.float32)
        base = AutoModelForCausalLM.from_pretrained(
            spec.train_repo, cache_dir=str(cache), local_files_only=offline, torch_dtype=dtype,
        )
    except (OSError, ValueError) as exc:
        raise RuntimeError(
            f"Could not load local training weights for {spec.train_repo}. "
            "Allow model downloads in Settings and run again, or pre-cache the HF model. "
            f"Details: {exc}"
        ) from exc

    if tokenizer.pad_token is None:
        tokenizer.pad_token = tokenizer.eos_token
    base.config.use_cache = False
    model = get_peft_model(base, LoraConfig(
        r=8, lora_alpha=16, lora_dropout=0.05, bias="none", task_type="CAUSAL_LM",
        target_modules=["q_proj", "k_proj", "v_proj", "o_proj", "gate_proj", "up_proj", "down_proj"],
    ))
    texts = _examples(Path(args.dataset), tokenizer)
    encoded = tokenizer(texts, truncation=True, max_length=768, add_special_tokens=False)
    if not all(encoded["input_ids"]):
        raise ValueError("A training example has no tokens")
    dataset = Dataset.from_dict({"input_ids": encoded["input_ids"], "attention_mask": encoded["attention_mask"]})

    def collate(features: list[dict]) -> dict:
        batch = tokenizer.pad(features, padding=True, return_tensors="pt")
        batch["labels"] = batch["input_ids"].clone()
        batch["labels"][batch["attention_mask"] == 0] = -100
        return batch

    output = manager.output_dir(args.model)
    output.mkdir(parents=True, exist_ok=True)
    deadline = time.monotonic() + args.max_hours * 3600

    class CheckpointOnStop(TrainerCallback):
        stopped = False

        def requested(self, state: object) -> bool:
            request = manager.stop_path
            if request.exists():
                from .config import read_json
                marker = read_json(request, {})
                if isinstance(marker, dict) and marker.get("pid") == os.getpid():
                    return True
            return _STOP or time.monotonic() >= deadline or not load_settings(home).permissions.training

        def on_step_begin(self, training_args: object, state: object, control: object, **kwargs: object) -> object:
            if self.requested(state):
                self.stopped = True
                control.should_training_stop = True
                control.should_save = True
            return control

        def on_step_end(self, training_args: object, state: object, control: object, **kwargs: object) -> object:
            if self.requested(state):
                self.stopped = True
                control.should_training_stop = True
                control.should_save = True
            # Even tiny datasets must leave a FULL resumable Trainer checkpoint.
            if state.global_step >= state.max_steps and state.global_step > 0:
                control.should_save = True
            return control

        def on_save(self, training_args: object, state: object, control: object, **kwargs: object) -> object:
            checkpoint = manager.latest_checkpoint(args.model)
            manager.update_state(latest_checkpoint=str(checkpoint) if checkpoint else None)
            return control

    callback = CheckpointOnStop()
    training_args = TrainingArguments(
        output_dir=str(output), num_train_epochs=args.epochs,
        per_device_train_batch_size=1, gradient_accumulation_steps=4,
        learning_rate=2e-4, logging_steps=1, save_strategy="steps",
        save_steps=args.save_steps, save_total_limit=3, report_to="none",
        remove_unused_columns=False,
        bf16=torch.cuda.is_available() and torch.cuda.is_bf16_supported(),
        fp16=torch.cuda.is_available() and not torch.cuda.is_bf16_supported(),
    )
    trainer = Trainer(model=model, args=training_args, train_dataset=dataset,
                      data_collator=collate, callbacks=[callback])
    if callback.requested(trainer.state):
        manager.update_state(status="paused", message="Stopped before training started; previous checkpoint retained")
        return
    print(f"Training {len(dataset)} examples; checkpoint every {args.save_steps} steps.", flush=True)
    trainer.train(resume_from_checkpoint=args.resume_from)
    # PEFT saves a small adapter, not another copy of the base model. Inference
    # uses it with the locally cached HF weights via the transformers backend.
    adapter = output / "adapter"
    trainer.save_model(str(adapter))
    tokenizer.save_pretrained(str(adapter))
    checkpoint = manager.latest_checkpoint(args.model)
    manager.update_state(
        status="paused" if callback.stopped else "completed",
        latest_checkpoint=str(checkpoint) if checkpoint else None,
        adapter=str(adapter), finished_at=time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        message="Stopped at a checkpoint; restart to resume" if callback.stopped else "LoRA adapter ready for local inference",
    )
    manager.stop_path.unlink(missing_ok=True)
    print(f"Saved adapter to {adapter}; last checkpoint: {checkpoint}", flush=True)


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Luno LoRA worker (started by TrainingManager)")
    parser.add_argument("--home", required=True)
    parser.add_argument("--model", required=True)
    parser.add_argument("--dataset", required=True)
    parser.add_argument("--epochs", type=float, default=1.0)
    parser.add_argument("--max-hours", type=float, default=1.0)
    parser.add_argument("--save-steps", type=int, default=50)
    parser.add_argument("--resume-from", type=str)
    args = parser.parse_args(argv)
    if (not math.isfinite(args.epochs) or not math.isfinite(args.max_hours)
            or args.epochs <= 0 or args.max_hours <= 0 or args.save_steps < 1):
        parser.error("epochs, max-hours and save-steps must be finite and positive")
    signal.signal(signal.SIGTERM, _request_stop)
    signal.signal(signal.SIGINT, _request_stop)
    manager = TrainingManager(args.home)
    try:
        train(args)
    except Exception as exc:
        traceback.print_exc()
        manager.update_state(status="failed", message=str(exc),
                             finished_at=time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()))
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
