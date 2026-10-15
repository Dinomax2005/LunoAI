/**
 * Luno Math Engine — exact, step-showing mathematics with zero dependencies.
 *
 * A real recursive-descent parser (no `eval`), equation solvers, statistics,
 * unit conversion and number theory. Tools beat guessing: whenever a question
 * is mathematics, Luno *computes* the answer instead of hallucinating it —
 * which is exactly how a small free system out-scores giant models on math.
 */

export function formatNumber(n: number): string {
  if (!Number.isFinite(n)) return String(n);
  if (Number.isInteger(n) && Math.abs(n) < 1e15) return n.toLocaleString("en-US");
  const rounded = Math.round(n * 1e10) / 1e10;
  if (Number.isInteger(rounded)) return rounded.toLocaleString("en-US");
  return String(rounded);
}

function gcd(a: number, b: number): number {
  a = Math.abs(Math.round(a));
  b = Math.abs(Math.round(b));
  while (b) [a, b] = [b, a % b];
  return a || 1;
}

export function toFraction(n: number): string | null {
  if (!Number.isFinite(n) || Number.isInteger(n)) return null;
  if (Math.abs(n) > 1000) return null;
  for (let d = 2; d <= 1000; d++) {
    const num = n * d;
    if (Math.abs(num - Math.round(num)) < 1e-9) {
      const g = gcd(Math.round(num), d);
      return `${Math.round(num) / g}/${d / g}`;
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// Expression parser
// ---------------------------------------------------------------------------

type Tok =
  | { t: "num"; v: number }
  | { t: "ident"; v: string }
  | { t: "op"; v: string };

const FUNCS: Record<string, (x: number) => number> = {
  sqrt: Math.sqrt, cbrt: Math.cbrt, abs: Math.abs, exp: Math.exp,
  ln: Math.log, log: Math.log10, log2: Math.log2,
  sin: Math.sin, cos: Math.cos, tan: Math.tan,
  asin: Math.asin, acos: Math.acos, atan: Math.atan,
  floor: Math.floor, ceil: Math.ceil, round: Math.round,
};

function tokenize(src: string): Tok[] {
  const toks: Tok[] = [];
  let i = 0;
  const s = src.replace(/×/g, "*").replace(/÷/g, "/").replace(/−/g, "-").replace(/\*\*/g, "^");
  while (i < s.length) {
    const c = s[i];
    if (/\s/.test(c)) { i++; continue; }
    if (/[0-9.]/.test(c)) {
      let j = i;
      while (j < s.length && /[0-9.]/.test(s[j])) j++;
      toks.push({ t: "num", v: parseFloat(s.slice(i, j)) });
      i = j; continue;
    }
    if (/[a-zA-Z_]/.test(c)) {
      let j = i;
      while (j < s.length && /[a-zA-Z0-9_]/.test(s[j])) j++;
      toks.push({ t: "ident", v: s.slice(i, j).toLowerCase() });
      i = j; continue;
    }
    if ("+-*/%^(),!".includes(c)) { toks.push({ t: "op", v: c }); i++; continue; }
    throw new Error(`Unexpected character "${c}"`);
  }
  return toks;
}

function factorial(n: number): number {
  if (n < 0 || !Number.isInteger(n) || n > 170) throw new Error("Factorial needs a whole number 0–170");
  let r = 1;
  for (let k = 2; k <= n; k++) r *= k;
  return r;
}

/** Evaluate a math expression like `sqrt(144) + 3^2 * (4-1)`. Throws on bad input. */
export function evaluateExpression(raw: string): number {
  const toks = tokenize(raw);
  let pos = 0;
  const peek = () => toks[pos];
  const next = () => toks[pos++];
  const expect = (v: string) => {
    const t = next();
    if (!t || t.t !== "op" || t.v !== v) throw new Error(`Expected "${v}"`);
  };

  function parseExpr(): number {
    let v = parseTerm();
    while (peek()?.t === "op" && (peek()!.v === "+" || peek()!.v === "-")) {
      const op = next().v;
      const r = parseTerm();
      v = op === "+" ? v + r : v - r;
    }
    return v;
  }
  function parseTerm(): number {
    let v = parseFactor();
    while (peek()?.t === "op" && ["*", "/", "%"].includes((peek() as { v: string }).v)) {
      const op = next().v;
      const r = parseFactor();
      v = op === "*" ? v * r : op === "/" ? v / r : v % r;
    }
    return v;
  }
  function parseFactor(): number {
    // unary minus + power (right-associative)
    if (peek()?.t === "op" && peek()!.v === "-") { next(); return -parseFactor(); }
    if (peek()?.t === "op" && peek()!.v === "+") { next(); return parseFactor(); }
    let base = parsePostfix();
    if (peek()?.t === "op" && peek()!.v === "^") {
      next();
      base = Math.pow(base, parseFactor());
    }
    return base;
  }
  function parsePostfix(): number {
    let v = parseAtom();
    while (peek()?.t === "op" && peek()!.v === "!") { next(); v = factorial(v); }
    return v;
  }
  function parseAtom(): number {
    const t = next();
    if (!t) throw new Error("Unexpected end of expression");
    if (t.t === "num") return t.v;
    if (t.t === "ident") {
      if (t.v === "pi") return Math.PI;
      if (t.v === "e") return Math.E;
      if (t.v === "tau") return Math.PI * 2;
      const fn = FUNCS[t.v];
      if (!fn) throw new Error(`Unknown name "${t.v}"`);
      expect("(");
      const arg = parseExpr();
      expect(")");
      return fn(arg);
    }
    if (t.t === "op" && t.v === "(") {
      const v = parseExpr();
      expect(")");
      return v;
    }
    throw new Error("Could not parse expression");
  }

  const value = parseExpr();
  if (pos < toks.length) throw new Error("Trailing characters in expression");
  if (!Number.isFinite(value)) throw new Error("Result is not finite");
  return value;
}

/** True when the string looks like a pure arithmetic expression. */
export function looksLikeExpression(s: string): boolean {
  const cleaned = s.replace(/^(what is|calculate|compute|evaluate|solve|maths?|equals?)\s+/i, "").replace(/[?=.]\s*$/g, "").trim();
  if (!cleaned || cleaned.length > 120) return false;
  if (!/[0-9]/.test(cleaned)) return false;
  return /^[0-9a-zA-Z\s+\-*/%^().,!×÷−]+$/.test(cleaned) && /[+\-*/%^!\u00d7\u00f7]/.test(cleaned);
}

export function cleanExpression(s: string): string {
  return s
    .replace(/^(what is|calculate|compute|evaluate|how much is)\s+/i, "")
    .replace(/\?\s*$/g, "")
    .replace(/=\s*$/g, "")
    .trim();
}

// ---------------------------------------------------------------------------
// Equation solvers
// ---------------------------------------------------------------------------

/** Solve `ax + b = c` style linear equations (single unknown x). */
export function solveLinear(equation: string): string | null {
  const m = equation.replace(/\s+/g, "").match(/^([+-]?\d*\.?\d*)\*?x([+-]\d+\.?\d*)?=([+-]?\d+\.?\d*)$/i);
  if (!m) return null;
  const aRaw = m[1];
  const a = aRaw === "" || aRaw === "+" ? 1 : aRaw === "-" ? -1 : parseFloat(aRaw);
  const b = m[2] ? parseFloat(m[2]) : 0;
  const c = parseFloat(m[3]);
  if (a === 0) return null;
  const x = (c - b) / a;
  const frac = toFraction(x);
  return [
    `**Solving ${equation.trim()}**`,
    ``,
    `1. ${a === 1 ? "" : `Divide both sides by ${formatNumber(a)} after moving the constant: `}${formatNumber(a)}x = ${formatNumber(c)} − (${formatNumber(b)}) = ${formatNumber(c - b)}`,
    `2. x = ${formatNumber(c - b)} / ${formatNumber(a)}`,
    ``,
    `**x = ${formatNumber(x)}**${frac ? ` (exactly ${frac})` : ""}`,
    ``,
    `Check: ${formatNumber(a)} × ${formatNumber(x)} + ${formatNumber(b)} = ${formatNumber(a * x + b)} ✓`,
  ].join("\n");
}

/** Solve `ax^2 + bx + c = 0`. */
export function solveQuadratic(a: number, b: number, c: number): string {
  const disc = b * b - 4 * a * c;
  const head = `**Solving ${formatNumber(a)}x² ${b >= 0 ? "+" : "−"} ${formatNumber(Math.abs(b))}x ${c >= 0 ? "+" : "−"} ${formatNumber(Math.abs(c))} = 0**\n\nQuadratic formula: x = (−b ± √(b² − 4ac)) / 2a\n\nDiscriminant: Δ = (${formatNumber(b)})² − 4·${formatNumber(a)}·${formatNumber(c)} = **${formatNumber(disc)}**\n`;
  if (disc < 0) return head + `\nΔ < 0, so there are **no real solutions**. The complex solutions are x = ${formatNumber(-b / (2 * a))} ± ${formatNumber(Math.sqrt(-disc) / (2 * a))}i.`;
  const sq = Math.sqrt(disc);
  const x1 = (-b + sq) / (2 * a);
  const x2 = (-b - sq) / (2 * a);
  if (disc === 0) return head + `\nΔ = 0, so there is one repeated solution:\n\n**x = ${formatNumber(x1)}**`;
  return head + `\n**x₁ = ${formatNumber(x1)}**\n**x₂ = ${formatNumber(x2)}**`;
}

// ---------------------------------------------------------------------------
// Statistics & number theory helpers
// ---------------------------------------------------------------------------

export function parseNumberList(text: string): number[] {
  return (text.match(/-?\d+\.?\d*/g) || []).map(Number).filter(Number.isFinite);
}

export function statsSummary(nums: number[]): string {
  const sorted = [...nums].sort((a, b) => a - b);
  const sum = nums.reduce((a, b) => a + b, 0);
  const mean = sum / nums.length;
  const median = nums.length % 2 ? sorted[(nums.length - 1) / 2] : (sorted[nums.length / 2 - 1] + sorted[nums.length / 2]) / 2;
  const variance = nums.reduce((a, b) => a + (b - mean) ** 2, 0) / nums.length;
  const freq = new Map<number, number>();
  nums.forEach((n) => freq.set(n, (freq.get(n) || 0) + 1));
  const maxF = Math.max(...freq.values());
  const modes = [...freq.entries()].filter(([, f]) => f === maxF).map(([n]) => n);
  return [
    `For **${nums.join(", ")}**:`,
    ``,
    `| Measure | Value |`,
    `|---|---|`,
    `| Count | ${nums.length} |`,
    `| Sum | ${formatNumber(sum)} |`,
    `| Mean (average) | **${formatNumber(mean)}** |`,
    `| Median | ${formatNumber(median)} |`,
    `| Mode | ${maxF > 1 ? modes.map(formatNumber).join(", ") : "none (all values appear once)"} |`,
    `| Min → Max (range) | ${formatNumber(sorted[0])} → ${formatNumber(sorted[sorted.length - 1])} (${formatNumber(sorted[sorted.length - 1] - sorted[0])}) |`,
    `| Std. deviation | ${formatNumber(Math.sqrt(variance))} |`,
  ].join("\n");
}

export function isPrime(n: number): boolean {
  if (!Number.isInteger(n) || n < 2) return false;
  for (let d = 2; d * d <= n; d++) if (n % d === 0) return false;
  return true;
}

export function primeFactors(n: number): number[] {
  const out: number[] = [];
  let x = Math.abs(Math.round(n));
  for (let d = 2; d * d <= x; d++) while (x % d === 0) { out.push(d); x /= d; }
  if (x > 1) out.push(x);
  return out;
}

/** Predict the next term(s) of a simple sequence, with the reasoning. */
export function predictSequence(nums: number[]): { next: number[]; rule: string } | null {
  if (nums.length < 3) return null;
  const diffs = nums.slice(1).map((v, i) => v - nums[i]);
  if (diffs.every((d) => d === diffs[0])) {
    const d = diffs[0];
    const last = nums[nums.length - 1];
    return { next: [last + d, last + 2 * d, last + 3 * d], rule: `arithmetic — adds ${formatNumber(d)} each time` };
  }
  const diffs2 = diffs.slice(1).map((v, i) => v - diffs[i]);
  if (diffs2.every((d) => d === diffs2[0])) {
    const d2 = diffs2[0];
    const nextDiff = diffs[diffs.length - 1] + d2;
    const n1 = nums[nums.length - 1] + nextDiff;
    const n2 = n1 + nextDiff + d2;
    return { next: [n1, n2], rule: `second difference is constant (${formatNumber(d2)}) — gaps grow by ${formatNumber(d2)}` };
  }
  if (nums.every((n) => n !== 0)) {
    const ratios = nums.slice(1).map((v, i) => v / nums[i]);
    if (ratios.every((r) => Math.abs(r - ratios[0]) < 1e-9)) {
      const r = ratios[0];
      const last = nums[nums.length - 1];
      return { next: [last * r, last * r * r, last * r * r * r], rule: `geometric — multiplies by ${formatNumber(r)} each time` };
    }
  }
  const squares = nums.map((n) => Math.sqrt(n));
  if (squares.every((s) => Number.isInteger(s))) {
    const roots = squares;
    const d = roots[1] - roots[0];
    if (roots.slice(1).every((v, i) => v - roots[i] === d)) {
      const nr = roots[roots.length - 1] + d;
      return { next: [nr * nr, (nr + d) * (nr + d)], rule: `squares of ${roots.join(", ")}… (roots step by ${formatNumber(d)})` };
    }
  }
  // Fibonacci-like
  let fib = true;
  for (let i = 2; i < nums.length; i++) if (nums[i] !== nums[i - 1] + nums[i - 2]) fib = false;
  if (fib) {
    const n1 = nums[nums.length - 1] + nums[nums.length - 2];
    return { next: [n1, n1 + nums[nums.length - 1]], rule: `each term is the sum of the previous two (Fibonacci pattern)` };
  }
  return null;
}

// ---------------------------------------------------------------------------
// Unit conversion
// ---------------------------------------------------------------------------

const LENGTH: Record<string, number> = { mm: 0.001, cm: 0.01, m: 1, km: 1000, in: 0.0254, inch: 0.0254, inches: 0.0254, ft: 0.3048, foot: 0.3048, feet: 0.3048, yd: 0.9144, yard: 0.9144, mi: 1609.344, mile: 1609.344, miles: 1609.344 };
const MASS: Record<string, number> = { mg: 0.001, g: 1, kg: 1000, t: 1e6, tonne: 1e6, oz: 28.3495, ounce: 28.3495, ounces: 28.3495, lb: 453.592, lbs: 453.592, pound: 453.592, pounds: 453.592 };

export function convertUnits(value: number, from: string, to: string): string | null {
  const f = from.toLowerCase(), t = to.toLowerCase();
  if ((f === "c" || f === "°c" || f === "celsius") && (t === "f" || t === "°f" || t === "fahrenheit"))
    return `${formatNumber(value)} °C = **${formatNumber((value * 9) / 5 + 32)} °F**\n\nFormula: (°C × 9/5) + 32.`;
  if ((f === "f" || f === "°f" || f === "fahrenheit") && (t === "c" || t === "°c" || t === "celsius"))
    return `${formatNumber(value)} °F = **${formatNumber(((value - 32) * 5) / 9)} °C**\n\nFormula: (°F − 32) × 5/9.`;
  const tidy = (v: number) => formatNumber(Math.round(v * 1e6) / 1e6);
  if (LENGTH[f] && LENGTH[t]) {
    const meters = value * LENGTH[f];
    return `${formatNumber(value)} ${f} = **${tidy(meters / LENGTH[t])} ${t}**`;
  }
  if (MASS[f] && MASS[t]) {
    const grams = value * MASS[f];
    return `${formatNumber(value)} ${f} = **${tidy(grams / MASS[t])} ${t}**`;
  }
  return null;
}
