import { test } from "node:test";
import assert from "node:assert/strict";
import { evaluateExpression, solveLinear } from "../src/lib/mathEngine";
import { brainAnswerSync } from "../src/lib/brain";
import { BENCHMARK } from "../src/lib/benchmark";
import { generateCode } from "../src/lib/codeGen";

test("math engine computes exactly", () => {
  assert.equal(evaluateExpression("847 * 39"), 33033);
  assert.equal(evaluateExpression("sqrt(169) + 2^5"), 45);
  assert.equal(evaluateExpression("(4 + 6) / 2 * 3"), 15);
  assert.equal(evaluateExpression("5!"), 120);
});

test("linear solver solves and checks", () => {
  const out = solveLinear("3x + 7 = 22");
  assert.ok(out && out.includes("x = 5"));
});

test("code generator produces runnable-shaped code", () => {
  const py = generateCode("write a Python function to check if a number is prime");
  assert.ok(py && py.code.includes("def is_prime"));
  const js = generateCode("write a JavaScript debounce function");
  assert.ok(js && js.code.includes("clearTimeout"));
});

test("Luno Brain passes its whole public benchmark", () => {
  for (const q of BENCHMARK) {
    const { text } = brainAnswerSync(q.question);
    assert.ok(q.check(text), `Benchmark ${q.id} failed.\nQuestion: ${q.question}\nAnswer: ${text.slice(0, 400)}`);
  }
});
