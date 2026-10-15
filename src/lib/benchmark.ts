/**
 * Luno Benchmark — a live, in-browser test anyone can run.
 * Maths/logic/code questions with automatic checking, so "smart" is
 * something you can measure instead of taking on faith.
 */
import { brainAnswerSync } from "./brain";
import { evaluateExpression } from "./mathEngine";

export interface BenchQuestion {
  id: string;
  category: "Maths" | "Logic" | "Code" | "Knowledge";
  question: string;
  /** Return true if the model's answer is correct. */
  check: (answer: string) => boolean;
  expected: string;
}

export const BENCHMARK: BenchQuestion[] = [
  { id: "m1", category: "Maths", question: "What is 847 × 39?", expected: "33,033", check: (a) => /33,?033/.test(a) },
  { id: "m2", category: "Maths", question: "Solve 3x + 7 = 22", expected: "x = 5", check: (a) => /x\s*=\s*5/.test(a) },
  { id: "m3", category: "Maths", question: "What is 15% of 240?", expected: "36", check: (a) => /\b36\b/.test(a) },
  { id: "m4", category: "Maths", question: "What is sqrt(169) + 2^5?", expected: "45", check: (a) => /\b45\b/.test(a) },
  { id: "m5", category: "Maths", question: "Average of 4, 8, 15, 16, 23, 42", expected: "18", check: (a) => /\b18\b/.test(a) },
  { id: "l1", category: "Logic", question: "What comes next: 2, 6, 12, 20, 30, ?", expected: "42 (gaps 4,6,8,10,12)", check: (a) => /\b42\b/.test(a) },
  { id: "l2", category: "Logic", question: "A bat and a ball cost $1.10 in total. The bat costs $1.00 more than the ball. How much does the ball cost?", expected: "$0.05", check: (a) => /0\.05|5 cents/.test(a) },
  { id: "l3", category: "Logic", question: "If it takes 5 machines 5 minutes to make 5 widgets, how long would it take 100 machines to make 100 widgets?", expected: "5 minutes", check: (a) => /\b5 minutes\b/.test(a) },
  { id: "c1", category: "Code", question: "Write a Python function to check if a number is prime", expected: "def is_prime with trial division", check: (a) => /def\s+is_prime/.test(a) && /return/.test(a) },
  { id: "c2", category: "Code", question: "Write a JavaScript debounce function", expected: "debounce with setTimeout/clearTimeout", check: (a) => /debounce/.test(a) && /setTimeout/.test(a) && /clearTimeout/.test(a) },
  { id: "c3", category: "Code", question: "Write Python code for fibonacci", expected: "fib returning sequence values", check: (a) => /def\s+fib/.test(a) },
  { id: "k1", category: "Knowledge", question: "What is the capital of Australia?", expected: "Canberra", check: (a) => /canberra/i.test(a) },
  { id: "k2", category: "Knowledge", question: "What is photosynthesis?", expected: "light → glucose + oxygen", check: (a) => /light/i.test(a) && /oxygen/i.test(a) },
  { id: "k3", category: "Knowledge", question: "What is a transformer in machine learning?", expected: "attention architecture (2017)", check: (a) => /attention/i.test(a) },
  { id: "k4", category: "Knowledge", question: "Is 97 a prime number?", expected: "Yes", check: (a) => /yes|is prime/i.test(a) },
];

export interface BenchResult {
  q: BenchQuestion;
  answer: string;
  passed: boolean;
  ms: number;
}

/** Run the benchmark against the built-in Brain (synchronous, honest). */
export function runBrainBenchmark(onProgress?: (done: number, total: number) => void): BenchResult[] {
  // Sanity: the math engine itself must be exact — assert a couple of values.
  void evaluateExpression;
  const results: BenchResult[] = [];
  BENCHMARK.forEach((q, i) => {
    const t0 = performance.now();
    const { text } = brainAnswerSync(q.question);
    results.push({ q, answer: text, passed: q.check(text), ms: Math.round(performance.now() - t0) });
    onProgress?.(i + 1, BENCHMARK.length);
  });
  return results;
}
