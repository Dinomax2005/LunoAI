"""The ``luno`` command line interface.

Usage examples:

    luno chat                         # interactive chat with the default model
    luno chat -m Zero                 # chat with a specific model
    luno ask "what is a transformer?"  # one-shot question
    luno code "fibonacci in python"    # one-shot code request
    luno models                       # list the Luno model family
    luno serve                        # start the local API

The CLI is intentionally honest about state: when the real weights aren't
installed it tells you Mini Zero is the fallback, and exactly how to swap in
the real Luno Zero 0.1.
"""

from __future__ import annotations

import argparse
import sys
from typing import Optional

from luno import __version__, config
from luno.engines import ChatMessage, GenerationParams
from luno.family import list_models
from luno.model_loader import LoadedModel, load_model


def _bold(text: str) -> str:
    return f"\033[1m{text}\033[0m"


def _dim(text: str) -> str:
    return f"\033[2m{text}\033[0m"


def _snippet(text: str, limit: int = 120) -> str:
    text = " ".join(text.split())
    return text if len(text) <= limit else text[: limit - 1] + "…"


def _one_shot(loaded: LoadedModel, prompt: str, params: GenerationParams) -> str:
    messages = [
        ChatMessage(role="system", content="You are Luno, a friendly local AI."),
        ChatMessage(role="user", content=prompt),
    ]
    result = loaded.engine.complete(messages, params)
    return result


def cmd_chat(args: argparse.Namespace, loaded: LoadedModel) -> int:
    history: list[ChatMessage] = []
    if args.system:
        history.append(ChatMessage(role="system", content=args.system))

    print()
    print(f"{_bold('Luno')} {loaded.model.version} — {loaded.model.name}")
    print(_dim(f"engine: {loaded.engine.name}  •  real weights: {loaded.weights_loaded}"))
    if not loaded.weights_loaded:
        print(
            _dim(
                "Note: running on the built-in Mini Zero (no downloads needed). "
                "Install real weights to unlock the full Zero 0.1 "
                "(see docs/plan.md)."
            )
        )
    print(_dim("Type /exit, /quit or Ctrl+D to leave."))
    print()

    try:
        while True:
            try:
                raw = input(f"{_bold('you')} > ").strip()
            except EOFError:
                print()
                break
            if not raw:
                continue
            if raw in ("/exit", "/quit", "exit", "quit"):
                break
            if raw in ("/help", "help"):
                print(
                    _dim(
                        "Commands: /exit quit • /models list family • "
                        "/clear reset conversation. Anything else is asked to Luno."
                    )
                )
                continue
            if raw in ("/models",):
                for m in list_models():
                    status = "released" if m.released else "planned"
                    print(f"  • {m.name:<18} {m.version:>4}  [{m.family:>6}]  {_dim(status)}")
                continue
            if raw == "/clear":
                history = [m for m in history if m.role == "system"]
                print(_dim("Conversation cleared."))
                continue

            history.append(ChatMessage(role="user", content=raw))
            result = loaded.engine.complete(_window(history), args.params())
            history.append(ChatMessage(role="assistant", content=result.text))
            print(f"{_bold('luno')} > {result.text}")
            print()
    except KeyboardInterrupt:
        print()
    finally:
        loaded.engine.close()
    return 0


def _window(history: list[ChatMessage], max_turns: int = 10) -> list[ChatMessage]:
    """Keep the system message plus the most recent conversation turns."""
    system = [m for m in history if m.role == "system"]
    rest = [m for m in history if m.role != "system"]
    return system + rest[-max_turns:]


def cmd_ask(args: argparse.Namespace, loaded: LoadedModel) -> int:
    result = _one_shot(loaded, args.prompt, args.params())
    print(result.text)
    loaded.engine.close()
    return 0


def cmd_code(args: argparse.Namespace, loaded: LoadedModel) -> int:
    prompt = (
        f"Write Python code for this task. Just the code: {args.prompt}"
    )
    result = _one_shot(loaded, prompt, args.params())
    print(result.text)
    loaded.engine.close()
    return 0


def cmd_models(_args: argparse.Namespace) -> int:
    print(f"{_bold('Luno model family')}  (v{__version__})")
    print()
    for m in list_models():
        status = "released" if m.released else "planned"
        print(f"{_bold(m.name)}\t{m.family} {m.version}\t[{status}]")
        print(f"  {m.tagline}")
        if m.quantization:
            print(_dim(f"  distribution: {m.quantization}"))
        print()
    print(_dim("Install weights in ~/.luno/models to load real models."))
    return 0


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="luno",
        description="Luno — a free, local, personal AI. Runs its own model with no server.",
    )
    parser.add_argument("--version", action="version", version=f"luno {__version__}")

    def add_model_arg(p: argparse.ArgumentParser) -> None:
        p.add_argument(
            "--model", "-m", default=None,
            help="Luno model (zero, mist, strato, luno-zero-0.1, …; default: luno-zero-0.1)",
        )

    def add_gen_args(p: argparse.ArgumentParser) -> None:
        p.add_argument("--max-tokens", type=int, default=config.DEFAULT_MAX_TOKENS)
        p.add_argument("--temperature", type=float, default=config.DEFAULT_TEMPERATURE)
        p.add_argument("--top-p", type=float, default=config.DEFAULT_TOP_P)
        p.add_argument("--seed", type=int, default=None)

    def make_params(args: argparse.Namespace) -> GenerationParams:
        p = GenerationParams(
            max_tokens=args.max_tokens,
            temperature=args.temperature,
            top_p=args.top_p,
        )
        p.seed = args.seed
        return p

    sub = parser.add_subparsers(dest="command", required=True)

    p_chat = sub.add_parser("chat", help="Interactive chat")
    add_model_arg(p_chat)
    add_gen_args(p_chat)
    p_chat.add_argument("--system", default=None, help="System prompt for Luno")
    p_chat.set_defaults(func=cmd_chat)

    p_ask = sub.add_parser("ask", help="Ask one question")
    add_model_arg(p_ask)
    add_gen_args(p_ask)
    p_ask.add_argument("prompt", help="The question to ask")
    p_ask.set_defaults(func=cmd_ask)

    p_code = sub.add_parser("code", help="Ask Luno to write code")
    add_model_arg(p_code)
    add_gen_args(p_code)
    p_code.add_argument("prompt", help="Describe the code you want")
    p_code.set_defaults(func=cmd_code)

    p_models = sub.add_parser("models", help="List the Luno model family")
    p_models.set_defaults(func=cmd_models)

    p_serve = sub.add_parser("serve", help="Start the local API server")
    add_model_arg(p_serve)
    p_serve.add_argument("--host", default=config.DEFAULT_HOST)
    p_serve.add_argument("--port", type=int, default=config.DEFAULT_PORT)
    p_serve.add_argument("--force-mini", action="store_true")
    p_serve.set_defaults(func=cmd_serve)

    # Make params a method on namespace so chat/ask/code share it.
    argparse.Namespace.params = lambda self: make_params(self)  # type: ignore[attr-defined]

    return parser


def cmd_serve(args: argparse.Namespace) -> int:
    from luno.server import run_server

    run_server(
        model=args.model,
        host=args.host,
        port=args.port,
        force_mini=getattr(args, "force_mini", False),
    )
    return 0


def main(argv: Optional[list] = None) -> int:
    parser = build_parser()
    args = parser.parse_args(argv)

    # Commands that do not need to pre-load a model.
    if args.command in ("models", "serve"):
        return args.func(args)

    try:
        force_mini = getattr(args, "force_mini", False)
        loaded: LoadedModel = load_model(args.model, force_mini=force_mini)
    except ValueError as exc:
        print(f"luno: error: {exc}", file=sys.stderr)
        return 2

    return args.func(args, loaded)


if __name__ == "__main__":
    raise SystemExit(main())
