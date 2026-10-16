"""Command-line control for the same local desktop engine and state."""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

from . import __version__
from .config import atomic_write_json, data_dir, load_settings, read_json, save_settings
from .inference import InferenceEngine, LEVELS
from .installer import Setup
from .models import CATALOGUE, get_model, installed_models
from .training import TrainingManager


def _agree(question: str) -> bool:
    if not sys.stdin.isatty():
        return False  # No implicit consent in unattended scripts.
    return input(f"{question} [y/N] ").strip().lower() in ("y", "yes")


def _chat(level: str, prompt: str | None) -> None:
    home = data_dir()
    path = home / "chats" / "cli.json"
    history = read_json(path, [])
    if not isinstance(history, list):
        raise ValueError("CLI chat history must be a JSON list")
    engine = InferenceEngine(home)

    def reply(question: str) -> None:
        nonlocal history
        pending = history + [{"role": "user", "content": question}]
        answer = engine.chat(pending, level)
        history = pending + [{"role": "assistant", "content": answer}]
        atomic_write_json(path, history)
        print(f"Luno: {answer}\n")

    if prompt is not None:
        reply(prompt)
        return
    print("Local chat. Type /exit or press Ctrl-D to leave. Conversation saved on this PC.")
    while True:
        try:
            text = input("You: ").strip()
        except EOFError:
            print()
            break
        if text == "/exit":
            break
        if text:
            reply(text)


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="luno", description=f"Luno Desktop {__version__} (local-only)")
    parser.add_argument("--version", action="version", version=__version__)
    commands = parser.add_subparsers(dest="command")

    setup = commands.add_parser("setup", help="Consent-gated, resumable local installation")
    setup.add_argument("--model", choices=CATALOGUE)
    setup.add_argument("--yes", action="store_true", help="Explicitly allow model/package downloads")
    setup.add_argument("--background", action="store_true", help="Allow background service and start at login")
    setup.add_argument("--training", action="store_true", help="Allow LoRA training and install its dependencies")

    chat = commands.add_parser("chat", help="Talk to the installed local model")
    chat.add_argument("--level", choices=LEVELS, default=None)
    chat.add_argument("prompt", nargs="*")

    commands.add_parser("serve", help="Serve the loopback HTTP API until stopped")
    service = commands.add_parser("service", help="Manage the optional login service")
    service.add_argument("action", choices=("run", "install", "uninstall"))

    train = commands.add_parser("train", help="Manage a separate LoRA worker")
    train.add_argument("action", choices=("start", "stop", "status"))
    train.add_argument("--dataset", type=Path)
    train.add_argument("--hours", type=float, default=1.0)
    train.add_argument("--epochs", type=float, default=1.0)

    commands.add_parser("status", help="Show local installation, permissions and training state")
    # The optional installer task is itself an explicit opt-in to GUI autostart.
    consent = commands.add_parser("settings", help="Manage installer integration")
    consent.add_argument("--enable-start-at-login", action="store_true")

    args = parser.parse_args(argv)
    try:
        if args.command is None:
            from .app import launch
            return launch()
        if args.command == "setup":
            settings = load_settings()
            if args.model:
                settings.selected_model = args.model
            if args.yes or (not settings.permissions.model_download and _agree("Allow model and package downloads?")):
                settings.permissions.model_download = True
            if args.background:
                settings.permissions.background_service = True
                settings.permissions.start_at_login = True
            if args.training:
                settings.permissions.training = True
            save_settings(settings)
            Setup(log=print, progress=lambda step, now, total: print(
                f"{step}: {now}/{total if total is not None else '?'} bytes", end="\r", flush=True,
            )).run()
            print("\nSetup finished. Nothing else was installed without permission.")
        elif args.command == "chat":
            _chat(args.level or load_settings().thinking_level, " ".join(args.prompt) if args.prompt else None)
        elif args.command == "serve":
            from .server import serve
            serve()
        elif args.command == "service":
            from . import service as service_module
            if args.action == "run":
                service_module.run()
            elif args.action == "install":
                print("Installed:", service_module.install())
            else:
                service_module.uninstall()
                print("Login service removed")
        elif args.command == "train":
            manager = TrainingManager()
            if args.action == "start":
                if not args.dataset:
                    parser.error("train start requires --dataset file.jsonl")
                print(json.dumps(manager.start(args.dataset, hours=args.hours, epochs=args.epochs), indent=2))
            elif args.action == "stop":
                print(json.dumps(manager.stop(), indent=2))
            else:
                print(json.dumps(manager.read_state(), indent=2))
        elif args.command == "status":
            settings = load_settings()
            model = get_model(settings.selected_model)
            manager = TrainingManager()
            print(json.dumps({
                "version": __version__, "data_dir": str(data_dir()),
                "selected_model": model.id,
                "model_installed": model.path().is_file(),
                "installed_models": installed_models(),
                "permissions": vars(settings.permissions),
                "training": manager.read_state(),
            }, indent=2))
        elif args.command == "settings":
            if args.enable_start_at_login:
                settings = load_settings()
                settings.permissions.start_at_login = True
                save_settings(settings)
                print("Start-at-login consent saved")
            else:
                print(json.dumps(vars(load_settings().permissions), indent=2))
        return 0
    except (RuntimeError, ValueError, OSError, PermissionError) as exc:
        print(f"Luno: {exc}", file=sys.stderr)
        return 1
    except KeyboardInterrupt:
        print("\nInterrupted", file=sys.stderr)
        return 130
