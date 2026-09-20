/**
 * Mini Zero — Luno's built-in in-browser engine.
 *
 * This is a faithful port of `luno/engines/minizero.py` so the Luno website
 * works *instantly* in any browser — no Python, no npm, no downloads, no
 * server. It can write short Python functions, do arithmetic, and explain
 * AI concepts, and it is honest about what it can't do.
 *
 * When the web app can reach a real Luno API (e.g. `luno serve` running the
 * full Zero 0.1 weights), the API is used instead — this engine is only the
 * automatic zero-install fallback.
 */

const KNOWLEDGE: Record<string, string> = {
  python:
    "Python is a high-level programming language created by Guido van Rossum and first released in 1991. It emphasizes readable code and is one of the most popular languages for AI, data science and web development. It runs on almost every operating system and is a great first language.",
  "machine learning":
    "Machine learning is how computers learn from examples instead of following exact instructions. Models are trained on data, then make predictions on new data. Most modern language models — including transformer networks — are trained this way, which is exactly how Luno models like Zero, Mist and Strato are built.",
  "neural network":
    "A neural network is a program loosely inspired by the brain. Simple units (neurons) are connected in layers; each connection has a weight that gets adjusted during training. Large language models are a kind of neural network called a transformer.",
  transformer:
    "The transformer is a neural network architecture introduced in the 2017 paper 'Attention Is All You Need'. Its key idea, the attention mechanism, lets a model decide which parts of its input matter most. GPT-style models like the future Luno models are built on it.",
  "large language model":
    "A large language model (LLM) predicts the next token in text. Trained on enormous amounts of text, LLMs can answer questions, write code and hold conversations. They run as 'weights' plus an inference engine — which is exactly what Luno provides.",
  api:
    "An API (application programming interface) is a set of rules that lets one program talk to another. Luno's API is a local HTTP server on your own PC, so apps can talk to Luno without any internet connection or paid service.",
  git:
    "Git is a version control system that tracks changes to files. GitHub is a hosting service for Git repositories. Luno itself lives in a Git repository so you can share and improve it.",
  token:
    "A token is the basic unit a language model reads and writes — often a short word or part of a word. When Luno generates text it predicts one token at a time, up to a max-tokens limit.",
  "open source":
    "Open source means software whose source code is freely available to use, study and change. Luno is released under the Apache 2.0 license, an open-source license.",
  temperature:
    "In language models, temperature controls randomness. A low temperature (near 0) gives focused, predictable output; a higher one gives more variety. Luno exposes it as a parameter.",
};

const GREETINGS = new Set([
  "hi", "hello", "hey", "hola", "yo", "hiya", "howdy", "greetings",
  "good morning", "good afternoon", "good evening", "sup", "whats up",
  "what's up",
]);

const HELP_WORDS = [
  "help", "what can you do", "capabilities", "commands", "usage",
  "what can luno do", "how do i use",
];

const THANKS_WORDS = ["thanks", "thank you", "thx", "ty", "cheers"];

function normalize(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function stripPunctuation(text: string): string {
  return text.replace(/[^\w\s]/g, "");
}

function countMentions(haystack: string, word: string): number {
  const re = new RegExp(`\\b${word}\\b`, "g");
  return (haystack.match(re) || []).length;
}

// --------------------------------------------------------------------------
// Code generation (same snippets as the Python engine)
// --------------------------------------------------------------------------

function code(text: string): string {
  return "```python\n" + text.trim() + "\n```";
}

function tryPython(spec: string): string | null {
  const s = spec.toLowerCase();

  if (s.includes("fibonacci") || s.includes("fib(") || /\bfib\b/.test(s)) {
    return code(
      "def fib(n):\n" +
        '    """Return the n-th Fibonacci number."""\n' +
        "    a, b = 0, 1\n" +
        "    for _ in range(n):\n" +
        "        a, b = b, a + b\n" +
        "    return a\n\n" +
        "# print the first ten:\n" +
        "print([fib(i) for i in range(10)])"
    );
  }
  if (s.includes("prime") && (s.includes("check") || s.includes("is prime") || s.includes("test"))) {
    return code(
      "def is_prime(n: int) -> bool:\n" +
        '    """Return True if n is prime."""\n' +
        "    if n < 2:\n" +
        "        return False\n" +
        "    for d in range(2, int(n ** 0.5) + 1):\n" +
        "        if n % d == 0:\n" +
        "            return False\n" +
        "    return True"
    );
  }
  if (s.includes("factorial") || s.includes("fact(")) {
    return code(
      "def fact(n: int) -> int:\n" +
        '    """Return n! (n >= 0)."""\n' +
        "    result = 1\n" +
        "    for i in range(2, n + 1):\n" +
        "        result *= i\n" +
        "    return result"
    );
  }
  if (s.includes("palindrome")) {
    return code(
      "def is_palindrome(text: str) -> bool:\n" +
        '    """Return True if text reads the same both ways."""\n' +
        '    cleaned = "".join(ch for ch in text.lower() if ch.isalnum())\n' +
        "    return cleaned == cleaned[::-1]"
    );
  }
  if (s.includes("prime") && (s.includes("generate") || s.includes("list") || s.includes("find"))) {
    return code(
      "def primes(limit: int):\n" +
        '    """Generate primes up to limit (Sieve of Eratosthenes)."""\n' +
        "    sieve = [True] * (limit + 1)\n" +
        "    for p in range(2, int(limit ** 0.5) + 1):\n" +
        "        if sieve[p]:\n" +
        "            for multiple in range(p * p, limit + 1, p):\n" +
        "                sieve[multiple] = False\n" +
        "    return [p for p in range(2, limit + 1) if sieve[p]]"
    );
  }
  if (s.includes("reverse") && s.includes("string")) {
    return code(
      "def reverse_string(text: str) -> str:\n" +
        '    """Return text reversed."""\n' +
        "    return text[::-1]"
    );
  }
  if (s.includes("fizzbuzz")) {
    return code(
      "for i in range(1, 101):\n" +
        '    out = ""\n' +
        "    if i % 3 == 0:\n" +
        '        out += "Fizz"\n' +
        "    if i % 5 == 0:\n" +
        '        out += "Buzz"\n' +
        "    print(out or i)"
    );
  }
  if (s.includes("sort") && s.includes("list")) {
    return code(
      "def quicksort(items):\n" +
        '    """Sort a list quickly."""\n' +
        "    if len(items) <= 1:\n" +
        "        return items\n" +
        "    pivot = items[len(items) // 2]\n" +
        "    left = [x for x in items if x < pivot]\n" +
        "    mid = [x for x in items if x == pivot]\n" +
        "    right = [x for x in items if x > pivot]\n" +
        "    return quicksort(left) + mid + quicksort(right)"
    );
  }
  if (s.includes("read") && s.includes("file")) {
    return code(
      "def read_text(path: str) -> str:\n" +
        '    """Read a text file into a string."""\n' +
        '    with open(path, "r", encoding="utf-8") as handle:\n' +
        "        return handle.read()"
    );
  }
  if (s.includes("json")) {
    return code(
      "import json\n\n" +
        "def load_json(path: str):\n" +
        '    """Load a JSON file into Python objects."""\n' +
        '    with open(path, "r", encoding="utf-8") as handle:\n' +
        "        return json.load(handle)"
    );
  }
  if (s.includes("flask")) {
    return code(
      "from flask import Flask, jsonify\n\n" +
        "app = Flask(__name__)\n\n" +
        '@app.route("/")\n' +
        "def home():\n" +
        '    return jsonify(hello="world")\n\n' +
        'if __name__ == "__main__":\n' +
        "    app.run(debug=True)"
    );
  }
  return null;
}

// --------------------------------------------------------------------------
// Arithmetic (safe: digits + operators only, never evaluated freely)
// --------------------------------------------------------------------------

interface MathResult {
  handled: boolean;
  expr: string;
  result: string;
}

const SAFE_MATH_RE = /^[0-9+\-*/().^% ]+$/;

function formatNumber(value: unknown): string {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return String(value === Infinity ? "Infinity" : value === -Infinity ? "-Infinity" : "…");
  }
  if (Number.isInteger(value)) return String(value);
  return String(Number(value.toPrecision(6)));
}

function tryMath(prompt: string): MathResult {
  let candidate = prompt.trim();
  const m = candidate.match(/what\s+is\s+([0-9+\-*/().^% ]+)\??/i);
  if (m) candidate = m[1].trim();

  if (!SAFE_MATH_RE.test(candidate)) return { handled: false, expr: "", result: "" };
  if (!/\d/.test(candidate)) return { handled: false, expr: "", result: "" };
  if (!/[+\-*/^%]/.test(candidate)) return { handled: false, expr: "", result: "" };
  if (candidate.length > 400)
    return { handled: true, expr: candidate, result: "…(expression too long for me to evaluate safely)" };

  const expr = candidate.replace(/\^/g, "**");
  try {
    // The SAFE_MATH_RE whitelist above guarantees only digits and operators
    // can reach the evaluator, so this cannot execute arbitrary code.
    // eslint-disable-next-line no-new-func
    const value = new Function(`"use strict"; return (${expr});`)();
    return { handled: true, expr: candidate, result: formatNumber(value) };
  } catch {
    return { handled: true, expr: candidate, result: "…(I couldn't evaluate that)" };
  }
}

// --------------------------------------------------------------------------
// Response assembly (mirrors the Python engine's decision order)
// --------------------------------------------------------------------------

function greeting(): string {
  const options = [
    'Hey! I\'m Luno, your AI. Ask me a question, a math problem, or to "write a Python function that checks if a number is prime".',
    "Hi! Luno here — running right in your browser, no installs needed. What are we making?",
    "Hello! I'm Luno. I can write short Python functions, do math, and explain AI concepts. What can I help with?",
  ];
  return options[Math.floor(Math.random() * options.length)];
}

function helpText(): string {
  return (
    "Here's what I can do: (1) write short Python functions — e.g. \"write a Python function to reverse a string\"; " +
    "(2) arithmetic — e.g. \"2 + 3 * 4\"; (3) explain AI concepts — ask me about transformers, LLMs or tokens. " +
    "For anything bigger I'd need larger Luno weights — run `luno serve` locally (see docs/plan.md)."
  );
}

function whyText(question: string): string {
  if (question.includes("python")) {
    return (
      "Python caught on because it's readable and versatile. Its huge ecosystem of libraries makes it the " +
      "default tool for AI work — which is why Luno itself is written in Python."
    );
  }
  if (/(temperature|random)/.test(question)) {
    return (
      "Because language models work in probabilities, not 'right answers'. Temperature raises the odds of " +
      "less-likely words, which reads as creativity — at the cost of precision."
    );
  }
  return (
    "That's a good 'why' — but answering it well takes a level of reasoning my tiny built-in brain doesn't " +
    "have yet. The bigger Luno models (Mist, Strato) are being planned to answer exactly this kind of question."
  );
}

function fallback(prompt: string): string {
  const snippet = prompt.length <= 160 ? prompt : prompt.slice(0, 157).trimEnd() + "…";
  return (
    "I don't have a good answer for that yet — I'm Luno's compact built-in engine running in your browser, " +
    "not the full Zero 0.1 weights. I shine when you: (1) ask me to write a short Python function, " +
    "(2) give me arithmetic, or (3) ask about AI concepts.\n\n" +
    `Your question was: ${snippet!}\n` +
    "To unlock a bigger Luno, run `luno serve` on your computer (see docs/plan.md)."
  );
}

function bestKnowledge(prompt: string): string | null {
  let best: { topic: string; entry: string; score: number } | null = null;
  for (const [topic, entry] of Object.entries(KNOWLEDGE)) {
    const score = countMentions(prompt, topic);
    if (score > 0 && (!best || score > best.score)) {
      best = { topic, entry, score };
    }
  }
  return best ? best.entry : null;
}

/** Generate a reply for a single user question. */
export function generateReply(prompt: string): string {
  const question = prompt.trim();
  if (!question) {
    return "I didn't get a message to answer. Try asking me a question or giving me a task.";
  }

  const stripped = stripPunctuation(question).trim();
  const norm = normalize(stripped);

  // 1) Code
  const snippet = tryPython(question);
  if (snippet !== null) return snippet;

  // 2) Greetings
  if (
    GREETINGS.has(norm) ||
    (norm.length < 24 && [...GREETINGS].some((g) => norm.includes(g)))
  ) {
    return greeting();
  }

  // 3) Thanks
  if (THANKS_WORDS.includes(norm) || (norm.includes("thank") && norm.length < 30)) {
    return "You're welcome! Anything else I can help you build?";
  }

  // 4) Help
  if (HELP_WORDS.some((h) => norm.includes(h))) {
    return helpText();
  }

  // 5) Math
  const math = tryMath(question);
  if (math.handled) {
    return `${math.expr} = ${math.result}`;
  }

  // 6) Knowledge
  const knowledge = bestKnowledge(norm);
  if (knowledge) return knowledge;

  // 7) "Why?" follow-ups
  if (norm.startsWith("why") || / why /.test(` ${norm} `)) {
    return whyText(norm);
  }

  // 8) Honest fallback
  return fallback(question);
}

/** Split text into ~`size`-character chunks without altering whitespace. */
export function chunkText(text: string, size = 6): string[] {
  const out: string[] = [];
  for (let i = 0; i < text.length; i += size) {
    out.push(text.slice(i, i + size));
  }
  return out;
}
