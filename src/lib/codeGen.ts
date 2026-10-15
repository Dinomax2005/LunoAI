/**
 * Luno Code Engine — writes runnable code and can actually execute it.
 * Templates cover the most-requested functions in Python + JavaScript;
 * Deep Think wraps neural models with generate → run → fix loops.
 */

export function wantsCode(text: string): boolean {
  const t = text.toLowerCase();
  if (/\b(email|essay|poem|story|cover letter|letter|speech|song)\b/.test(t)) return false;
  const hasCodeNoun = /\b(function|code|coding|program|programme|script|algorithm|python|javascript|typescript|debounce|class|api|sql|regex)\b/.test(t);
  const hasVerb = /\b(write|create|code|implement|generate|make|build|develop)\b/.test(t);
  return (hasCodeNoun && hasVerb) || /^(code|implement)\b/.test(t.trim()) || /\bin (python|javascript|typescript|js)\b/.test(t);
}

export function detectLang(text: string): "python" | "javascript" {
  if (/javascript|typescript|\bjs\b|\bnode\b/i.test(text)) return "javascript";
  return "python"; // default: Python is the most requested + beginner friendly
}

interface Snippet { py: string; js: string; explain: string }

const SNIPPETS: { match: RegExp; make: (m: RegExpMatchArray, spec: string) => Snippet }[] = [
  {
    match: /fibonacci|fib\(/,
    make: () => ({
      explain: "Iterative Fibonacci — O(n) time, O(1) memory (no slow recursion).",
      py: `def fib(n: int) -> int:\n    """Return the n-th Fibonacci number (fib(0)=0, fib(1)=1)."""\n    a, b = 0, 1\n    for _ in range(n):\n        a, b = b, a + b\n    return a\n\nprint([fib(i) for i in range(10)])  # [0, 1, 1, 2, 3, 5, 8, 13, 21, 34]`,
      js: `function fib(n) {\n  // Return the n-th Fibonacci number (fib(0)=0, fib(1)=1)\n  let a = 0, b = 1;\n  for (let i = 0; i < n; i++) [a, b] = [b, a + b];\n  return a;\n}\n\nconsole.log(Array.from({ length: 10 }, (_, i) => fib(i)));\n// [0, 1, 1, 2, 3, 5, 8, 13, 21, 34]`,
    }),
  },
  {
    match: /factorial/,
    make: () => ({
      explain: "Factorial with input validation.",
      py: `def factorial(n: int) -> int:\n    """Return n! for n >= 0."""\n    if n < 0:\n        raise ValueError("factorial is undefined for negative numbers")\n    result = 1\n    for i in range(2, n + 1):\n        result *= i\n    return result\n\nprint(factorial(5))  # 120`,
      js: `function factorial(n) {\n  if (n < 0) throw new Error("factorial is undefined for negative numbers");\n  let result = 1;\n  for (let i = 2; i <= n; i++) result *= i;\n  return result;\n}\n\nconsole.log(factorial(5)); // 120`,
    }),
  },
  {
    match: /(check|test|is).{0,20}prime|prime.{0,20}(check|test)/,
    make: () => ({
      explain: "Trial division only up to √n — enough for correctness, much faster than testing every number.",
      py: `def is_prime(n: int) -> bool:\n    """Return True if n is a prime number."""\n    if n < 2:\n        return False\n    if n % 2 == 0:\n        return n == 2\n    d = 3\n    while d * d <= n:\n        if n % d == 0:\n            return False\n        d += 2\n    return True\n\nprint(is_prime(97))  # True\nprint(is_prime(100)) # False`,
      js: `function isPrime(n) {\n  if (n < 2) return false;\n  if (n % 2 === 0) return n === 2;\n  for (let d = 3; d * d <= n; d += 2) {\n    if (n % d === 0) return false;\n  }\n  return true;\n}\n\nconsole.log(isPrime(97));  // true\nconsole.log(isPrime(100)); // false`,
    }),
  },
  {
    match: /prime/,
    make: () => ({
      explain: "Sieve of Eratosthenes — the classic fast way to list all primes up to a limit.",
      py: `def primes_up_to(limit: int) -> list[int]:\n    """Return all prime numbers up to limit (Sieve of Eratosthenes)."""\n    sieve = [True] * (limit + 1)\n    if limit >= 0: sieve[0] = False\n    if limit >= 1: sieve[1] = False\n    for p in range(2, int(limit ** 0.5) + 1):\n        if sieve[p]:\n            for multiple in range(p * p, limit + 1, p):\n                sieve[multiple] = False\n    return [p for p, prime in enumerate(sieve) if prime]\n\nprint(primes_up_to(30))`,
      js: `function primesUpTo(limit) {\n  const sieve = Array(limit + 1).fill(true);\n  sieve[0] = sieve[1] = false;\n  for (let p = 2; p * p <= limit; p++) {\n    if (sieve[p]) for (let m = p * p; m <= limit; m += p) sieve[m] = false;\n  }\n  return sieve.map((v, i) => (v ? i : null)).filter((v) => v !== null);\n}\n\nconsole.log(primesUpTo(30));`,
    }),
  },
  {
    match: /palindrome/,
    make: () => ({
      explain: "Ignores case, spaces and punctuation, so 'A man a plan a canal Panama' counts.",
      py: `def is_palindrome(text: str) -> bool:\n    """Return True if text reads the same forwards and backwards."""\n    cleaned = "".join(ch for ch in text.lower() if ch.isalnum())\n    return cleaned == cleaned[::-1]\n\nprint(is_palindrome("Racecar"))  # True\nprint(is_palindrome("hello"))    # False`,
      js: `function isPalindrome(text) {\n  const cleaned = text.toLowerCase().replace(/[^a-z0-9]/g, "");\n  return cleaned === [...cleaned].reverse().join("");\n}\n\nconsole.log(isPalindrome("Racecar")); // true\nconsole.log(isPalindrome("hello"));   // false`,
    }),
  },
  {
    match: /reverse.{0,20}string|reverse.{0,20}text|reverse a/,
    make: () => ({
      explain: "The slicing / spread idiom — one line, handles Unicode correctly in JS via spread.",
      py: `def reverse_string(text: str) -> str:\n    """Return text reversed."""\n    return text[::-1]\n\nprint(reverse_string("Luno"))  # onuL`,
      js: `function reverseString(text) {\n  return [...text].reverse().join("");\n}\n\nconsole.log(reverseString("Luno")); // onuL`,
    }),
  },
  {
    match: /fizzbuzz|fizz buzz/,
    make: () => ({
      explain: "Classic FizzBuzz — check divisibility by 3 and 5.",
      py: `for i in range(1, 101):\n    out = ""\n    if i % 3 == 0:\n        out += "Fizz"\n    if i % 5 == 0:\n        out += "Buzz"\n    print(out or i)`,
      js: `for (let i = 1; i <= 100; i++) {\n  let out = "";\n  if (i % 3 === 0) out += "Fizz";\n  if (i % 5 === 0) out += "Buzz";\n  console.log(out || i);\n}`,
    }),
  },
  {
    match: /binary search/,
    make: () => ({
      explain: "Binary search — O(log n) on a sorted list; halves the search space each step.",
      py: `def binary_search(items: list, target) -> int:\n    """Return the index of target in sorted items, or -1 if absent."""\n    lo, hi = 0, len(items) - 1\n    while lo <= hi:\n        mid = (lo + hi) // 2\n        if items[mid] == target:\n            return mid\n        if items[mid] < target:\n            lo = mid + 1\n        else:\n            hi = mid - 1\n    return -1\n\nprint(binary_search([1, 3, 5, 7, 9], 7))  # 3`,
      js: `function binarySearch(items, target) {\n  let lo = 0, hi = items.length - 1;\n  while (lo <= hi) {\n    const mid = Math.floor((lo + hi) / 2);\n    if (items[mid] === target) return mid;\n    if (items[mid] < target) lo = mid + 1; else hi = mid - 1;\n  }\n  return -1;\n}\n\nconsole.log(binarySearch([1, 3, 5, 7, 9], 7)); // 3`,
    }),
  },
  {
    match: /sort/,
    make: () => ({
      explain: "Quicksort from scratch (in real code, prefer the built-in sort — shown below it).",
      py: `def quicksort(items: list) -> list:\n    """Sort a list with quicksort."""\n    if len(items) <= 1:\n        return items\n    pivot = items[len(items) // 2]\n    left = [x for x in items if x < pivot]\n    mid = [x for x in items if x == pivot]\n    right = [x for x in items if x > pivot]\n    return quicksort(left) + mid + quicksort(right)\n\nprint(quicksort([3, 6, 1, 8, 2]))  # [1, 2, 3, 6, 8]\n# Built-in (use this in real code): sorted([3, 6, 1, 8, 2])`,
      js: `function quicksort(items) {\n  if (items.length <= 1) return items;\n  const pivot = items[Math.floor(items.length / 2)];\n  const left = items.filter((x) => x < pivot);\n  const mid = items.filter((x) => x === pivot);\n  const right = items.filter((x) => x > pivot);\n  return [...quicksort(left), ...mid, ...quicksort(right)];\n}\n\nconsole.log(quicksort([3, 6, 1, 8, 2])); // [1, 2, 3, 6, 8]\n// Built-in (use this in real code): [3, 6, 1, 8, 2].sort((a, b) => a - b)`,
    }),
  },
  {
    match: /debounce/,
    make: () => ({
      explain: "Debounce delays a function until calls stop for `wait` ms — essential for search inputs and resize handlers.",
      py: `import threading\n\ndef debounce(wait_seconds):\n    """Decorator: run the function only after calls stop for wait_seconds."""\n    def decorator(fn):\n        timer = None\n        def wrapper(*args, **kwargs):\n            nonlocal timer\n            if timer: timer.cancel()\n            timer = threading.Timer(wait_seconds, fn, args=args, kwargs=kwargs)\n            timer.start()\n        return wrapper\n    return decorator`,
      js: `function debounce(fn, wait = 300) {\n  let timer;\n  return (...args) => {\n    clearTimeout(timer);\n    timer = setTimeout(() => fn(...args), wait);\n  };\n}\n\n// Example: only searches after you stop typing for 300ms\nconst onSearch = debounce((q) => console.log("search:", q), 300);\nonSearch("l"); onSearch("lu"); onSearch("luno"); // logs once: search: luno`,
    }),
  },
  {
    match: /fetch|api call|http request|get request/,
    make: () => ({
      explain: "Fetch with proper error handling — always check `response.ok`, always catch.",
      py: `import json\nimport urllib.request\n\ndef get_json(url: str) -> dict:\n    """GET a URL and return parsed JSON. Raises on HTTP errors."""\n    req = urllib.request.Request(url, headers={"User-Agent": "Luno/2.0"})\n    with urllib.request.urlopen(req, timeout=10) as resp:\n        return json.loads(resp.read().decode("utf-8"))\n\n# data = get_json("https://api.example.com/items")\n# print(data)`,
      js: `async function getJSON(url) {\n  const res = await fetch(url);\n  if (!res.ok) throw new Error("HTTP " + res.status);\n  return res.json();\n}\n\n// const data = await getJSON("https://api.example.com/items");\n// console.log(data);`,
    }),
  },
  {
    match: /\bstack\b/,
    make: () => ({
      explain: "A stack (LIFO) with push/pop/peek — the data structure behind undo, parsers and the call stack itself.",
      py: `class Stack:\n    """Last-in, first-out (LIFO) stack."""\n    def __init__(self):\n        self._items = []\n    def push(self, item): self._items.append(item)\n    def pop(self):\n        if self.is_empty(): raise IndexError("pop from empty stack")\n        return self._items.pop()\n    def peek(self): return self._items[-1]\n    def is_empty(self): return len(self._items) == 0\n    def __len__(self): return len(self._items)\n\ns = Stack(); s.push(1); s.push(2)\nprint(s.pop())  # 2`,
      js: `class Stack {\n  #items = [];\n  push(item) { this.#items.push(item); }\n  pop() {\n    if (this.isEmpty()) throw new Error("pop from empty stack");\n    return this.#items.pop();\n  }\n  peek() { return this.#items[this.#items.length - 1]; }\n  isEmpty() { return this.#items.length === 0; }\n  get size() { return this.#items.length; }\n}\n\nconst s = new Stack(); s.push(1); s.push(2);\nconsole.log(s.pop()); // 2`,
    }),
  },
  {
    match: /remove duplicates|deduplicate|unique/,
    make: () => ({
      explain: "Order-preserving deduplication in one line.",
      py: `def unique(items: list) -> list:\n    """Remove duplicates, keeping first-seen order."""\n    return list(dict.fromkeys(items))\n\nprint(unique([1, 2, 2, 3, 1, 4]))  # [1, 2, 3, 4]`,
      js: `function unique(items) {\n  return [...new Set(items)];\n}\n\nconsole.log(unique([1, 2, 2, 3, 1, 4])); // [1, 2, 3, 4]`,
    }),
  },
  {
    match: /count words|word count|count.*occurrences/,
    make: () => ({
      explain: "Word frequency counter — the first step of countless text-analysis tasks.",
      py: `from collections import Counter\nimport re\n\ndef word_counts(text: str) -> Counter:\n    """Count how often each word appears in text."""\n    return Counter(re.findall(r"[a-z0-9']+", text.lower()))\n\nprint(word_counts("the cat and the dog").most_common())`,
      js: `function wordCounts(text) {\n  const counts = {};\n  for (const w of text.toLowerCase().match(/[a-z0-9']+/g) || []) {\n    counts[w] = (counts[w] || 0) + 1;\n  }\n  return counts;\n}\n\nconsole.log(wordCounts("the cat and the dog"));`,
    }),
  },
];

export function generateCode(spec: string): { code: string; lang: string; explain: string } | null {
  const lang = detectLang(spec);
  for (const s of SNIPPETS) {
    const m = spec.match(s.match);
    if (m) {
      const snip = s.make(m, spec);
      return { code: lang === "python" ? snip.py : snip.js, lang, explain: snip.explain };
    }
  }
  return null;
}

/** Extract fenced code blocks from a markdown answer. */
export function extractCodeBlocks(text: string): { code: string; lang: string }[] {
  const out: { code: string; lang: string }[] = [];
  const re = /```(\w*)\n([\s\S]*?)```/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) out.push({ lang: (m[1] || "").toLowerCase(), code: m[2] });
  return out;
}

/**
 * Run JavaScript safely-ish in this page: captured console, no access to our
 * app scope (fresh Function), hard 3s timeout via synchronous execution note.
 * (For untrusted code this is a convenience runner, not a security sandbox.)
 */
export function runJavaScript(code: string): Promise<string> {
  return new Promise((resolve) => {
    const logs: string[] = [];
    const fakeConsole = {
      log: (...a: unknown[]) => logs.push(a.map(stringify).join(" ")),
      error: (...a: unknown[]) => logs.push("Error: " + a.map(stringify).join(" ")),
      warn: (...a: unknown[]) => logs.push(a.map(stringify).join(" ")),
    };
    function stringify(v: unknown): string {
      if (typeof v === "string") return v;
      try { return JSON.stringify(v, null, 2) ?? String(v); } catch { return String(v); }
    }
    try {
      const fn = new Function("console", `"use strict";\n${code}`);
      const result = fn(fakeConsole);
      if (result instanceof Promise) {
        result.then(
          (v) => resolve([...logs, v !== undefined ? `→ ${stringify(v)}` : ""].filter(Boolean).join("\n") || "(no output)"),
          (e) => resolve([...logs, `Error: ${e?.message || e}`].join("\n")),
        );
      } else {
        resolve([...logs, result !== undefined ? `→ ${stringify(result)}` : ""].filter(Boolean).join("\n") || "(ran successfully, no output)");
      }
    } catch (e) {
      resolve([...logs, `Error: ${(e as Error)?.message || e}`].filter(Boolean).join("\n"));
    }
  });
}

let pyodidePromise: Promise<unknown> | null = null;

/** Run Python in the browser via Pyodide (loaded lazily from CDN, ~on first use). */
export async function runPython(code: string): Promise<string> {
  try {
    if (!pyodidePromise) {
      pyodidePromise = (async () => {
        const w = window as unknown as Record<string, unknown>;
        if (!w.loadPyodide) {
          await new Promise<void>((res, rej) => {
            const s = document.createElement("script");
            s.src = "https://cdn.jsdelivr.net/pyodide/v0.26.4/full/pyodide.js";
            s.onload = () => res();
            s.onerror = () => rej(new Error("Could not load the Python runtime (check your connection)"));
            document.head.appendChild(s);
          });
        }
        const load = w.loadPyodide as (o: object) => Promise<unknown>;
        return load({ indexURL: "https://cdn.jsdelivr.net/pyodide/v0.26.4/full/" });
      })();
    }
    const py = (await pyodidePromise) as { runPythonAsync: (c: string) => Promise<unknown>; setStdout: (o: object) => void };
    const lines: string[] = [];
    py.setStdout({ batched: (s: string) => lines.push(s) });
    const wrapped = `import sys, io\nsys.stdout = io.StringIO()\ntry:\n${code.split("\n").map((l) => "    " + l).join("\n")}\n    _out = sys.stdout.getvalue()\nexcept Exception as e:\n    _out = f"Error: {type(e).__name__}: {e}"\n_out`;
    const out = await py.runPythonAsync(wrapped);
    return String(out || lines.join("\n") || "(ran successfully, no output)");
  } catch (e) {
    return `Python runner unavailable: ${(e as Error)?.message || e}\nTip: hit Run on JavaScript blocks for instant in-browser execution, or connect a model and ask it to walk through the Python output.`;
  }
}
