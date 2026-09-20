"""Mini Zero — Luno's built-in starter engine.

**What this is**

Mini Zero is a small, deterministic, fully offline AI that ships inside
Luno so the whole product works with *zero downloads*: it can code Python,
write functions, explain concepts and hold short Q&A conversations.

**What this is NOT**

Mini Zero is **not** a neural language model and it is **not** "smart" the
way shipped Luno weights will be. It is the fallback that keeps Luno
useable from day one, and the reference implementation of the
:class:`~luno.engines.Engine` interface. The **real** Luno Zero 0.1 weights
plug into the exact same interface via
:class:`~luno.engines.llama.LlamaCppEngine` — see ``docs/plan.md``.

It is intentionally honest about its limits: when it doesn't know how to
help, it says so and tells you how to slot in a bigger Luno model.
"""

from __future__ import annotations

import ast
import random
import re
import time
from typing import Optional

from luno.engines import ChatMessage, Engine, GenerationParams, GenerationResult


def _extract_last_code_block(text: str) -> Optional[tuple[str, str]]:
    """Return ``(contents, language)`` of the last fenced code block, if any."""
    matches = re.findall(r"```([^\n`]*)\n(.*?)```", text, flags=re.DOTALL)
    if not matches:
        return None
    lang, code = matches[-1]
    return code.strip(), (lang or "").strip().lower()


def _ask_code_python(spec: str) -> str:
    """Return a short, safe, runnable Python snippet for ``spec``."""

    def code(text: str) -> str:
        return "```python\n" + text.strip() + "\n```"

    s = spec.lower()

    if "fibonacci" in s or "fib(" in s or "fib " in s:
        return code(
            "def fib(n):\n"
            "    \"\"\"Return the n-th Fibonacci number.\"\"\"\n"
            "    a, b = 0, 1\n"
            "    for _ in range(n):\n"
            "        a, b = b, a + b\n"
            "    return a\n\n"
            "# print the first ten:\n"
            "print([fib(i) for i in range(10)])"
        )
    if "prime" in s and ("check" in s or "is prime" in s or "test" in s):
        return code(
            "def is_prime(n: int) -> bool:\n"
            "    \"\"\"Return True if n is prime.\"\"\"\n"
            "    if n < 2:\n"
            "        return False\n"
            "    for d in range(2, int(n ** 0.5) + 1):\n"
            "        if n % d == 0:\n"
            "            return False\n"
            "    return True"
        )
    if "factorial" in s or "fact(" in s:
        return code(
            "def fact(n: int) -> int:\n"
            "    \"\"\"Return n! (n >= 0).\"\"\"\n"
            "    result = 1\n"
            "    for i in range(2, n + 1):\n"
            "        result *= i\n"
            "    return result"
        )
    if "palindrome" in s:
        return code(
            "def is_palindrome(text: str) -> bool:\n"
            "    \"\"\"Return True if text reads the same both ways.\"\"\"\n"
            "    cleaned = \"\".join(ch for ch in text.lower() if ch.isalnum())\n"
            "    return cleaned == cleaned[::-1]"
        )
    if "prime" in s and ("generate" in s or "list" in s or "find" in s):
        return code(
            "def primes(limit: int):\n"
            "    \"\"\"Generate primes up to limit (Sieve of Eratosthenes).\"\"\"\n"
            "    sieve = [True] * (limit + 1)\n"
            "    for p in range(2, int(limit ** 0.5) + 1):\n"
            "        if sieve[p]:\n"
            "            for multiple in range(p * p, limit + 1, p):\n"
            "                sieve[multiple] = False\n"
            "    return [p for p in range(2, limit + 1) if sieve[p]]"
        )
    if "reverse" in s and "string" in s:
        return code(
            "def reverse_string(text: str) -> str:\n"
            "    \"\"\"Return text reversed.\"\"\"\n"
            "    return text[::-1]"
        )
    if "fizzbuzz" in s:
        return code(
            "for i in range(1, 101):\n"
            "    out = \"\"\n"
            "    if i % 3 == 0:\n"
            "        out += \"Fizz\"\n"
            "    if i % 5 == 0:\n"
            "        out += \"Buzz\"\n"
            "    print(out or i)"
        )
    if "sort" in s and "list" in s:
        return code(
            "def quicksort(items):\n"
            "    \"\"\"Sort a list quickly.\"\"\"\n"
            "    if len(items) <= 1:\n"
            "        return items\n"
            "    pivot = items[len(items) // 2]\n"
            "    left = [x for x in items if x < pivot]\n"
            "    mid = [x for x in items if x == pivot]\n"
            "    right = [x for x in items if x > pivot]\n"
            "    return quicksort(left) + mid + quicksort(right)"
        )
    if "read" in s and "file" in s:
        return code(
            "def read_text(path: str) -> str:\n"
            "    \"\"\"Read a text file into a string.\"\"\"\n"
            "    with open(path, \"r\", encoding=\"utf-8\") as handle:\n"
            "        return handle.read()"
        )
    if "json" in s:
        return code(
            "import json\n\n"
            "def load_json(path: str):\n"
            "    \"\"\"Load a JSON file into Python objects.\"\"\"\n"
            "    with open(path, \"r\", encoding=\"utf-8\") as handle:\n"
            "        return json.load(handle)"
        )
    if "flask" in s:
        return code(
            "from flask import Flask, jsonify\n\n"
            "app = Flask(__name__)\n\n"
            "@app.route(\"/\")\n"
            "def home():\n"
            "    return jsonify(hello=\"world\")\n\n"
            "if __name__ == \"__main__\":\n"
            "    app.run(debug=True)"
        )
    raise ValueError("no pattern")


def _try_python(spec: str) -> Optional[str]:
    try:
        return _ask_code_python(spec)
    except ValueError:
        return None


def _normalize(text: str) -> str:
    return re.sub(r"[^a-z0-9]+", " ", text.lower()).strip()


def _count_mentions(text: str, word: str) -> int:
    return len(re.findall(r"\b" + re.escape(word) + r"\b", text.lower()))


KNOWLEDGE = {
    "python": (
        "Python is a high-level programming language created by Guido van "
        "Rossum and first released in 1991. It emphasizes readable code and "
        "is one of the most popular languages for AI, data science and web "
        "development. It runs on almost every operating system and is a great "
        "first language."
    ),
    "machine learning": (
        "Machine learning is how computers learn from examples instead of "
        "following exact instructions. Models are trained on data, then make "
        "predictions on new data. Most modern language models — including "
        "transformer networks — are trained this way, which is exactly how "
        "Luno models like Zero, Mist and Strato are built."
    ),
    "neural network": (
        "A neural network is a program loosely inspired by the brain. Simple "
        "units (neurons) are connected in layers; each connection has a "
        "weight that gets adjusted during training. Large language models "
        "are a kind of neural network called a transformer."
    ),
    "transformer": (
        "The transformer is a neural network architecture introduced in the "
        "2017 paper 'Attention Is All You Need'. Its key idea, the attention "
        "mechanism, lets a model decide which parts of its input matter most. "
        "GPT-style models like the future Luno models are built on it."
    ),
    "large language model": (
        "A large language model (LLM) predicts the next token in text. "
        "Trained on enormous amounts of text, LLMs can answer questions, "
        "write code and hold conversations. They run as 'weights' plus an "
        "inference engine — which is exactly what Luno provides, locally."
    ),
    "api": (
        "An API (application programming interface) is a set of rules that "
        "lets one program talk to another. Luno's API is a local HTTP server "
        "on your own PC, so apps can talk to Luno without any internet "
        "connection or paid service."
    ),
    "git": (
        "Git is a version control system that tracks changes to files. "
        "GitHub is a hosting service for Git repositories. Luno itself lives "
        "in a Git repository so you can share and improve it."
    ),
    "token": (
        "A token is the basic unit a language model reads and writes — often "
        "a short word or part of a word. When Luno generates text it predicts "
        "one token at a time, up to a max-tokens limit."
    ),
    "open source": (
        "Open source means software whose source code is freely available to "
        "use, study and change. Luno is released under the Apache 2.0 "
        "license, an open-source license."
    ),
    "temperature": (
        "In language models, temperature controls randomness. A low "
        "temperature (near 0) gives focused, predictable output; a higher "
        "one gives more variety. Luno exposes it as a parameter."
    ),
}

GREETING_WORDS = {
    "hi", "hello", "hey", "hola", "yo", "hiya", "howdy", "greetings",
    "good morning", "good afternoon", "good evening", "sup", "whats up",
    "what's up",
}

HELP_WORDS = {
    "help", "what can you do", "capabilities", "commands", "usage",
    "what can luno do", "how do i use",
}

THANKS_WORDS = {"thanks", "thank you", "thx", "ty", "cheers", "thanks!"}


def _strip_punctuation(text: str) -> str:
    return re.sub(r"[^\w\s]", "", text)


class MiniZeroEngine(Engine):
    """The tiny built-in starter engine (zero dependencies, zero downloads)."""

    name = "mini-zero"
    model = "luno-zero-0.1"

    def __init__(self) -> None:
        self._rng = random.Random()

    # -- Engine interface ---------------------------------------------------

    def complete(self, messages: list[ChatMessage], params: GenerationParams) -> GenerationResult:
        start = time.perf_counter()
        params.clamp()

        system_parts = [m.content for m in messages if m.role == "system"]
        user_parts = [m.content for m in messages if m.role == "user"]
        prompt = ("\n".join(system_parts + user_parts)).strip()
        # The operative question is the most recent user message.
        question = user_parts[-1].strip() if user_parts else prompt

        if not question:
            reply = (
                "I didn't get a message to answer. Try asking me a question "
                "or giving me a task."
            )
        else:
            partial = _try_python(question)
            text = partial if partial is not None else self._respond(question)
            reply = self._token_budget(text, params.max_tokens)

        elapsed = time.perf_counter() - start
        word_count = len(reply.split())
        return GenerationResult(
            text=reply,
            model=self.model,
            engine=self.name,
            usage={"prompt_words": len(question.split()), "completion_words": word_count},
            finish_reason="stop",
            timings={"total_seconds": round(elapsed, 4)},
        )

    # -- Response generation ------------------------------------------------

    def _respond(self, prompt: str) -> str:
        stripped = _strip_punctuation(prompt).strip()
        norm = _normalize(stripped)

        # 1) Greetings.
        if norm in GREETING_WORDS or (len(norm) < 24 and any(g in norm for g in GREETING_WORDS)):
            return self._greeting()

        # 2) Thanks.
        if norm in THANKS_WORDS or ("thank" in norm and len(norm) < 30):
            return "You're welcome! Anything else I can help you build?"

        # 3) Capabilities / help.
        if any(h in norm for h in HELP_WORDS):
            return self._help()

        # 4) Math.
        handled, expr, result = self._try_math(prompt.strip())
        if handled:
            return f"{expr} = {result}"

        # 5) Knowledge topics.
        for topic, entry in self._sorted_knowledge(stripped):
            if topic in norm:
                return entry

        # 6) "Why?" follow-ups on the last topic.
        if norm.startswith("why") or (" why " in f" {norm} "):
            return self._why(norm)

        # 7) Honest fallback.
        return self._fallback(prompt)

    def _sorted_knowledge(self, prompt: str):
        return sorted(
            ((k, v) for k, v in KNOWLEDGE.items()),
            key=lambda kv: _count_mentions(prompt, kv[0]),
            reverse=True,
        )

    def _greeting(self) -> str:
        options = [
            "Hey! I'm Luno, your AI. Ask me a question, a math problem, "
            "or to \"write a Python function that checks if a number is prime\".",
            "Hi! Luno here. I run %s on your PC — no server needed. "
            "What are we making?",
            "Hello! I'm Luno. I can write short Python functions, do math, "
            "and explain AI concepts. What can I help with?",
        ]
        choice = self._rng.choice(options)
        return choice % "locally" if "%s" in choice else choice

    def _help(self) -> str:
        return (
            "Here's what I can do: (1) write short Python functions — e.g. "
            "\"write a Python function to reverse a string\"; (2) arithmetic — "
            "e.g. \"2 + 3 * 4\"; (3) explain AI concepts — ask me about "
            "transformers, LLMs or tokens. For anything bigger I'd need "
            "smarter Luno weights (Zero full, then Mist/Strato): see docs/plan.md."
        )

    def _try_math(self, prompt: str) -> tuple[bool, str, str]:
        """Try to evaluate arithmetic in ``prompt``.

        Returns ``(handled, expression, formatted_result)``. Handles both
        bare expressions (``"2 + 3 * 4"``) and natural questions like
        ``"what is 12 * 8 + 4?"`` — but never evaluates anything that is
        not plain numbers and operators.
        """
        candidate = prompt
        match = re.search(r"what\s+is\s+([0-9+\-*/ ().^%]+)\??", prompt, flags=re.IGNORECASE)
        if match:
            candidate = match.group(1).strip()

        if not re.fullmatch(r"[0-9+*/\- ().^%\s]+", candidate):
            return False, "", ""
        if not re.search(r"\d", candidate):
            return False, "", ""
        if not re.search(r"[+\-*/^%]", candidate):
            return False, "", ""

        safety_char_limit = 400
        if len(candidate) > safety_char_limit:
            return True, candidate, "…(expression too long for me to evaluate safely)"

        expression = candidate.replace("^", "**")
        try:
            tree = ast.parse(expression, mode="eval")
        except SyntaxError:
            return False, "", ""
        for node in ast.walk(tree):  # extremely restrictive: numbers + operators only
            allowed = (
                ast.Expression, ast.BinOp, ast.UnaryOp, ast.USub, ast.UAdd,
                ast.Constant, ast.Add, ast.Sub, ast.Mult, ast.Div, ast.Mod,
                ast.Pow, ast.FloorDiv,
            )
            if not isinstance(node, allowed):
                return False, "", ""
            if isinstance(node, ast.UnaryOp) and not isinstance(node.op, (ast.USub, ast.UAdd)):
                return False, "", ""
        try:
            code = compile(tree, "<luno-math>", "eval")
            value = eval(code, {"__builtins__": {}}, {})
        except Exception as exc:  # pragma: no cover - defensive
            return True, candidate, f"…(I couldn't evaluate that: {exc})"
        return True, candidate, self._format_number(value)

    @staticmethod
    def _format_number(value) -> str:
        if isinstance(value, float):
            if value.is_integer():
                return str(int(value))
            return f"{value:.6g}"
        return str(value)

    def _why(self, question: str) -> str:
        # Very small, honest follow-up handling so conversations feel alive.
        if "python" in question:
            return (
                "Python caught on because it's readable and versatile. Its "
                "huge ecosystem of libraries makes it the default tool for "
                "AI work — which is why Luno itself is written in Python."
            )
        if any(w in question for w in ("temperature", "random")):
            return (
                "Because language models work in probabilities, not 'right "
                "answers'. Temperature raises the odds of less-likely words, "
                "which reads as creativity — at the cost of precision."
            )
        return (
            "That's a good 'why' — but answering it well takes a level of "
            "reasoning my tiny built-in brain doesn't have yet. The bigger "
            "Luno models (Mist, Strato) are being planned to answer exactly "
            "this kind of question."
        )

    def _fallback(self, prompt: str) -> str:
        snippet = prompt if len(prompt) <= 160 else prompt[:157].rstrip() + "…"
        return (
            "I don't have a good answer for that yet — I'm the tiny built-in "
            f"Mini Zero 'always works' engine, not the real Luno Zero 0.1 "
            "weights. I can sing better if you: (1) ask me to write a short "
            "Python function, (2) give me arithmetic, or (3) ask about AI "
            "concepts.\n\n"
            f"Your question was: {snippet!r}\n"
            "To unlock a smarter Luno locally, drop real GGUF weights into "
            "~/.luno/models (see docs/plan.md)."
        )

    # -- Output handling ----------------------------------------------------

    def _token_budget(self, text: str, max_tokens: int) -> str:
        """Trim output to roughly ``max_tokens`` tokens.

        This is a crude whitespace/character heuristic (a real tokenizer
        comes with the real weights) — good enough for a starter engine.
        """
        budget_chars = max(24, max_tokens * 4)
        if len(text) <= budget_chars:
            return text
        trimmed = text[:budget_chars].rstrip()
        return trimmed + "\n…"

    def close(self) -> None:  # nothing to release
        return None
