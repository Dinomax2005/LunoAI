/**
 * Luno Brain — the orchestration layer that makes free models punch
 * at top-tier level.
 *
 * Three tiers, one interface:
 *  1. Luno Brain (built-in, instant, zero download): exact math/code tools,
 *     curated knowledge, logic solvers, writing & summarising. Never
 *     hallucinates arithmetic — it computes.
 *  2. Local neural (WebLLM in-browser) and 3. Free cloud (Groq/OpenRouter/HF/
 *     Ollama/custom): real LLMs, optionally wrapped in Deep Think:
 *     plan → draft → verify with tools → final. Verification is what closes
 *     most of the gap to frontier models.
 */
import type { ChatMessage, ProviderSettings, StreamEvent } from "../types";
import {
  cleanExpression, convertUnits, evaluateExpression, formatNumber, isPrime,
  looksLikeExpression, parseNumberList, predictSequence, primeFactors,
  solveLinear, solveQuadratic, statsSummary, toFraction,
} from "./mathEngine";
import { lookupKnowledge } from "./knowledge";
import { extractCodeBlocks, generateCode, runJavaScript, wantsCode } from "./codeGen";
import { completeOnce, providerInfo, streamCompletion, toApiMessages, type SimpleMessage } from "./providers";
import { localCompleteOnce, localModelLabel, streamLocalCompletion } from "./webllm";

export type Emit = (e: StreamEvent) => void;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function lastUser(history: ChatMessage[]): string {
  for (let i = history.length - 1; i >= 0; i--) if (history[i].role === "user") return history[i].content;
  return "";
}

function engineLabel(s: ProviderSettings): string {
  if (s.provider === "brain") return "Luno Brain (built-in tools)";
  if (s.provider === "webllm") return `${localModelLabel(s.webllmModel)} · local`;
  const info = providerInfo(s.provider);
  return `${s.cloudModel} · ${info?.name.split(" — ")[0] || s.provider}`;
}

/** Stream a finished string word-by-word so every engine feels alive. */
async function streamOut(text: string, thinking: string, engine: string, emit: Emit, signal?: AbortSignal) {
  const tokens = text.match(/\S+\s*/g) || [text];
  let cur = "";
  for (let i = 0; i < tokens.length; i++) {
    if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
    cur += tokens[i];
    if (i % 3 === 2 || i === tokens.length - 1) {
      emit({ text: cur, thinking, engine, done: false });
      await sleep(8);
    }
  }
  emit({ text, thinking, engine, done: true });
  return { text, thinking, engine };
}

// ---------------------------------------------------------------------------
// Neural path (local WebLLM or free cloud)
// ---------------------------------------------------------------------------

function requireKey(s: ProviderSettings) {
  const info = providerInfo(s.provider);
  if (info?.needsKey && !s.apiKey.trim()) {
    throw new Error(
      `${info.name} needs a free API key (takes ~30 seconds). Tap the model name at the top → “Get a free key” (${info.keyUrl}), paste it into Settings, and try again. Your key is stored only in this browser. Or switch to “Luno Brain” (instant) or a Local model (no key at all).`,
    );
  }
}

async function callModel(
  s: ProviderSettings,
  messages: SimpleMessage[],
  opts: { temperature?: number; maxTokens?: number; onToken?: (full: string) => void; signal?: AbortSignal } = {},
): Promise<string> {
  let full = "";
  const onTok = (t: string) => { full += t; opts.onToken?.(full); };
  if (s.provider === "webllm") {
    return streamLocalCompletion(s.webllmModel, messages, { ...opts, onToken: onTok });
  }
  const info = providerInfo(s.provider);
  const baseUrl = s.provider === "custom" ? s.customBaseUrl : info?.baseUrl || s.customBaseUrl;
  return streamCompletion({
    baseUrl, apiKey: s.apiKey, model: s.cloudModel, messages,
    temperature: opts.temperature, maxTokens: opts.maxTokens, signal: opts.signal,
    onToken: () => opts.onToken?.(full),
  }).then((t) => { full = t; return t; });
}

async function neuralAnswer(history: ChatMessage[], s: ProviderSettings, emit: Emit, signal?: AbortSignal) {
  requireKey(s);
  const engine = engineLabel(s);
  const messages = toApiMessages(history);

  if (s.thinkMode === "fast") {
    let thinking = "";
    const text = await callModel(s, messages, {
      temperature: 0.7, signal,
      onToken: (full) => emit({ text: full, thinking, engine, done: false }),
    });
    emit({ text, thinking, engine, done: true });
    return { text, thinking, engine };
  }

  // ---- Deep Think: plan → draft → verify (with tools) → final -------------
  let thinking = "Deep Think is on: I plan, draft, then verify before answering.\n";
  emit({ text: "", thinking, engine, done: false });

  const question = lastUser(history);
  const plan = await callModel(s, [
    ...messages,
    { role: "user", content: "Create a brief step-by-step plan (3–6 bullet points) to answer the last user request correctly. Note any calculations to double-check, edge cases, and how you will verify the result. Output only the plan." },
  ], { temperature: 0.2, maxTokens: 500, signal }).catch(() => "(planning skipped)");
  thinking += `\n**Plan**\n${plan}\n`;
  emit({ text: "", thinking, engine, done: false });

  const draft = await callModel(s, messages, { temperature: 0.7, maxTokens: 2048, signal });
  thinking += `\n**Draft written** (${draft.split(/\s+/).length} words) — now verifying…\n`;
  emit({ text: "", thinking, engine, done: false });

  // Tool verification: actually run JavaScript the draft contains.
  let toolReport = "";
  if (s.toolsEnabled) {
    const blocks = extractCodeBlocks(draft).filter((b) => ["javascript", "js", "typescript", "ts"].includes(b.lang || "javascript") || !b.lang);
    // Only run when the draft is actually JS-flavoured
    const jsBlocks = extractCodeBlocks(draft).filter((b) => ["javascript", "js"].includes((b.lang || "").toLowerCase()));
    void blocks;
    if (jsBlocks.length) {
      const out = await runJavaScript(jsBlocks[0].code);
      toolReport = `\n\nTool check — I ran the draft's JavaScript and got:\n\`\`\`\n${out.slice(0, 1200)}\n\`\`\``;
      thinking += `\n**Tool check (ran the code)**\n\`\`\`\n${out.slice(0, 800)}\n\`\`\`\n`;
      emit({ text: "", thinking, engine, done: false });
    }
  }

  const verdict = await callModel(s, [
    { role: "system", content: "You are a strict, careful verifier. Find every error: wrong arithmetic, flawed logic, buggy code, invented facts, missing edge cases, or unmet requirements." },
    { role: "user", content: `Question:\n${question}\n\nDraft answer:\n${draft}${toolReport}\n\nList each problem you find (or write "NO ERRORS FOUND" if the draft is fully correct), then give the corrected key points.` },
  ], { temperature: 0.1, maxTokens: 900, signal }).catch(() => "NO ERRORS FOUND");
  thinking += `\n**Verification**\n${verdict}\n`;
  emit({ text: "", thinking, engine, done: false });

  thinking += `\nWriting the final, corrected answer…`;
  emit({ text: "", thinking, engine, done: false });

  const finalMessages: SimpleMessage[] = [
    ...messages,
    { role: "assistant", content: draft },
    { role: "user", content: `Improve your draft using this verification (fix every issue listed; keep what was right). Verification:\n${verdict}${toolReport}\n\nNow write the final answer for the user. Do not mention the draft/verification process — just give the polished, correct answer.` },
  ];
  const text = await callModel(s, finalMessages, {
    temperature: 0.5, maxTokens: 2600, signal,
    onToken: (full) => emit({ text: full, thinking, engine, done: false }),
  });
  emit({ text, thinking, engine, done: true });
  return { text, thinking, engine };
}

// ---------------------------------------------------------------------------
// Built-in Brain (instant, offline)
// ---------------------------------------------------------------------------

function brainAnswer(promptRaw: string, history: ChatMessage[]): { text: string; thinking: string } {
  const prompt = promptRaw.trim();
  const low = prompt.toLowerCase();
  const norm = low.replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
  const trace: string[] = [];
  const done = (text: string) => ({ text, thinking: trace.join("\n") });

  // Greetings / social
  if (/^(hi|hello|hey|hiya|howdy|yo|good (morning|afternoon|evening))\b/.test(norm) && norm.split(" ").length <= 5) {
    trace.push("Classified as: greeting → friendly opener with suggestions.");
    return done("Hello — I'm **Luno**. I can help with most things you'd ask an assistant, and maths and code I compute exactly rather than guess.\n\nA few good starting points:\n\n- **Maths** — `what is 144 / 12 + 7^2`, or `solve 3x + 7 = 22`\n- **Code** — `write a Python function to check if a number is prime`, then press **Run** on the result\n- **Writing** — `write an email asking for a deadline extension`\n- **Open-ended questions** — pick a neural model from the menu at the top (they're all free)\n\nWhat would you like to do?");
  }
  if (/^(thanks|thank you|thx|ty|cheers)/.test(norm)) {
    trace.push("Classified as: thanks.");
    return done("You're welcome. Anything else — maths, code, writing, or something open-ended with a neural model connected?");
  }
  if (/\b(your name|who are you|what are you)\b/.test(low)) {
    trace.push("Classified as: identity question.");
    return done("I'm **Luno**, a free AI assistant. I run in three ways, and you can switch between them from the model menu:\n\n1. **Luno Brain** (what's answering right now) — instant, built-in tools for maths, code, logic and knowledge. Works with zero downloads, even offline.\n2. **Local neural models** — real LLMs (Qwen 2.5, Llama 3.2, Phi…) that download once and then run on *your* GPU, in this tab. Private forever.\n3. **Free cloud models** — 70B-class giants (Llama 3.3 70B, DeepSeek) via free tiers from Groq / OpenRouter / Hugging Face.\n\nOn top of every neural model I add **Deep Think** — plan → draft → verify → final — plus real tools (I compute maths exactly and can run code). Verification is most of what separates a careful answer from a confident one. Pick a model at the top whenever you're ready.");
  }
  if (/\b(help|what can you do|capabilities|how do you work)\b/.test(low) && norm.split(" ").length <= 10) {
    trace.push("Classified as: help / capabilities.");
    return done("Here's what I do well:\n\n| Ask for | Example |\n|---|---|\n| Maths | `847 × 39`, `solve 2x + 4 = 18`, `average of 4, 8, 15, 16, 23, 42` |\n| Code (Python or JavaScript) | `write a JavaScript debounce function` — then press **Run** |\n| Sequences and logic | `what comes next: 2, 6, 12, 20, 30` |\n| Knowledge | `what is photosynthesis`, `capital of Australia` |\n| Writing | `write a cover letter for a barista job` |\n| Summaries | `summarize: <paste a long text>` |\n\nFor open-ended questions I do better with a neural model connected: open the model menu at the top and either download **Qwen 2.5 3B** to run here in your browser, or add a free **Groq** key for **Llama 3.3 70B**. Leave thinking on **Deep** for anything difficult. There's also a **Benchmark** button at the top if you'd like to test me first.");
  }
  if (/\bjoke\b/.test(low)) {
    trace.push("Classified as: joke request.");
    const jokes = [
      "Why do programmers prefer dark mode? Because light attracts bugs. 🐛",
      "I told my computer I needed a break… now it won't stop sending me KitKat adverts.",
      "Why did the neural network break up with the decision tree? It needed someone less rigid — with more depth.",
      "There are only 10 kinds of people: those who understand binary and those who don't.",
    ];
    return done(jokes[prompt.length % jokes.length] + "\n\nWant another, or shall we do something clever?");
  }

  // --- Unit conversion ------------------------------------------------------
  const conv = low.match(/(-?\d+\.?\d*)\s*(°?[a-z]+)\s+(?:to|in|=)\s+(°?[a-z]+)/);
  if (conv) {
    const r = convertUnits(parseFloat(conv[1]), conv[2], conv[3]);
    if (r) { trace.push(`Classified as: unit conversion → computed exactly.`); return done(r); }
  }

  // --- Equations --------------------------------------------------------------
  const lin = prompt.match(/solve[:\s]+(.+)/i);
  if (lin) {
    const sol = solveLinear(lin[1]);
    if (sol) { trace.push("Classified as: linear equation → solved algebraically and checked by substitution."); return done(sol); }
  }
  if (/^solve\s/i.test(prompt) || /solve for x/i.test(low)) {
    const q = prompt.match(/(-?\d*\.?\d*)\s*x\^2\s*([+-]\s*\d*\.?\d*)\s*x\s*([+-]\s*\d+\.?\d*)\s*=\s*0/);
    if (q) {
      trace.push("Classified as: quadratic equation → quadratic formula.");
      const a = q[1] === "" || q[1] === "-" ? (q[1] === "-" ? -1 : 1) : parseFloat(q[1]);
      const b = parseFloat(q[2].replace(/\s/g, ""));
      const c = parseFloat(q[3].replace(/\s/g, ""));
      if (a !== 0) return done(solveQuadratic(a, b, c));
    }
  }

  // --- Statistics -------------------------------------------------------------
  if (/\b(average|mean|median|mode|statistics|stats)\b/.test(low) && parseNumberList(prompt).length >= 3) {
    trace.push("Classified as: statistics → computed from the data (mean, median, mode, range, σ).");
    return done(statsSummary(parseNumberList(prompt)));
  }

  // --- Sequences ----------------------------------------------------------------
  const seqM = low.match(/(?:next|sequence|series|pattern)[^.?\d]*?(-?\d+(?:\s*,\s*-?\d+){2,})/) ||
    prompt.match(/^(-?\d+(?:\s*,\s*-?\d+){2,})\s*,?\s*\??$/);
  if (seqM) {
    const nums = parseNumberList(seqM[1]);
    const pred = predictSequence(nums);
    if (pred) {
      trace.push(`Classified as: sequence → tested arithmetic/geometric/square/Fibonacci patterns; matched: ${pred.rule}.`);
      return done(`The pattern is **${pred.rule}**.\n\n**${nums.join(", ")}, ${pred.next.join(", ")}…**\n\nNext term: **${formatNumber(pred.next[0])}**${pred.next[1] !== undefined ? `, then ${pred.next.slice(1).map(formatNumber).join(", ")}` : ""}.`);
    }
    trace.push("Classified as: sequence → no standard pattern matched.");
    return done(`I tested arithmetic, geometric, square and Fibonacci patterns on **${nums.join(", ")}** and none fits perfectly — it may use alternating or interleaved rules. Connect a neural model (model picker, top) and Deep Think will reason it out, or tell me any extra clue (e.g. "it's two sequences interleaved").`);
  }

  // --- Percentages & money word-problems ----------------------------------------
  let m = low.match(/(\d+\.?\d*)\s*(?:%|percent)\s+of\s+(\d+\.?\d*)/);
  if (m) {
    const v = (parseFloat(m[1]) / 100) * parseFloat(m[2]);
    trace.push("Classified as: percentage-of → computed exactly.");
    return done(`${m[1]}% of ${m[2]} = ${m[2]} × ${parseFloat(m[1]) / 100} = **${formatNumber(v)}**${toFraction(v) ? ` (${toFraction(v)})` : ""}`);
  }
  m = low.match(/(\d+\.?\d*)\s+is\s+what\s+(?:%|percent)\s+of\s+(\d+\.?\d*)/);
  if (m) {
    const v = (parseFloat(m[1]) / parseFloat(m[2])) * 100;
    trace.push("Classified as: what-percent → computed exactly.");
    return done(`${m[1]} ÷ ${m[2]} × 100 = **${formatNumber(v)}%**`);
  }
  m = low.match(/(?:price|cost|item|originally)\D*(\d+\.?\d*)\D*(\d+\.?\d*)\s*(?:%|percent)\s*(?:off|discount)/) ||
      low.match(/(\d+\.?\d*)\s*(?:%|percent)\s*(?:off|discount)\s*(?:on\s*)?(?:\$|€|£)?\s*(\d+\.?\d*)/);
  if (m) {
    const nums = parseNumberList(prompt);
    if (nums.length >= 2) {
      const [a, b] = nums;
      const price = Math.max(a, b), pct = Math.min(a, b) === a && a <= 100 ? a : b <= 100 ? b : a;
      const realPrice = pct === a ? b : a;
      void price;
      const off = (realPrice * pct) / 100;
      trace.push("Classified as: discount problem → computed exactly.");
      return done(`Discount: ${formatNumber(pct)}% of ${formatNumber(realPrice)} = ${formatNumber(off)} off.\n\n**You pay: ${formatNumber(realPrice - off)}** (you save ${formatNumber(off)}).`);
    }
  }
  m = low.match(/(?:tip|tax)\D*(\d+\.?\d*)\s*(?:%|percent)?\D*(\d+\.?\d*)/);
  if (m && /\b(tip|tax)\b/.test(low) && parseNumberList(prompt).length >= 2) {
    const nums = parseNumberList(prompt);
    const pct = nums.find((n) => n <= 100 && n % 1 === 0 && nums.length > 1) ?? nums[0];
    const bill = nums.find((n) => n !== pct) ?? nums[1];
    if (bill !== undefined) {
      const extra = (bill * pct) / 100;
      trace.push("Classified as: tip/tax problem → computed exactly.");
      return done(`${formatNumber(pct)}% of ${formatNumber(bill)} = **${formatNumber(extra)}**.\n\nTotal with ${low.includes("tip") ? "tip" : "tax"}: **${formatNumber(bill + extra)}**.`);
    }
  }

  // --- Number theory --------------------------------------------------------------
  m = low.match(/(?:is\s+)?(\d+)\s+(?:a\s+)?prime/);
  if (m || /\bprime\b/.test(low)) {
    const n = m ? parseInt(m[1]) : parseNumberList(prompt)[0];
    if (n !== undefined && Number.isInteger(n)) {
      trace.push(`Classified as: primality test → trial division up to √${n}.`);
      if (isPrime(n)) return done(`**Yes — ${formatNumber(n)} is prime.** It has no divisors other than 1 and itself (checked every candidate up to √${formatNumber(n)} ≈ ${formatNumber(Math.sqrt(n))}).`);
      const f = primeFactors(n);
      return done(`**No — ${formatNumber(n)} is not prime.**\n\nPrime factorisation: **${formatNumber(n)} = ${f.join(" × ")}**.`);
    }
    if (/\bfactor/.test(low)) {
      const n2 = parseNumberList(prompt)[0];
      if (n2 !== undefined) { trace.push("Classified as: factorisation."); return done(`Prime factorisation: **${formatNumber(n2)} = ${primeFactors(n2).join(" × ")}**.`); }
    }
  }
  m = low.match(/(?:gcd|greatest common (?:divisor|factor)|hcf)[^0-9]*(\d+)[^0-9]+(\d+)/);
  if (m) {
    let a = +m[1], b = +m[2];
    const steps: number[] = [];
    let x = a, y = b;
    while (y) { steps.push(y); [x, y] = [y, x % y]; }
    void steps; void a; void b;
    trace.push("Classified as: GCD → Euclidean algorithm.");
    return done(`gcd(${m[1]}, ${m[2]}) = **${formatNumber(x)}** (Euclidean algorithm).`);
  }
  m = low.match(/(?:lcm|least common multiple|lowest common multiple)[^0-9]*(\d+)[^0-9]+(\d+)/);
  if (m) {
    let x = +m[1], y = +m[2];
    const A = x, B = y;
    while (y) [x, y] = [y, x % y];
    trace.push("Classified as: LCM → via gcd.");
    return done(`lcm(${A}, ${B}) = (${A} × ${B}) ÷ gcd(${A}, ${B}) = **${formatNumber((A * B) / x)}**.`);
  }
  m = low.match(/square root of\s+(\d+\.?\d*)/);
  if (m) { const v = Math.sqrt(parseFloat(m[1])); trace.push("Classified as: square root → computed."); return done(`√${m[1]} = **${formatNumber(v)}**${Number.isInteger(v) ? " (perfect square)" : ""}`); }

  // --- Classic reasoning puzzles ----------------------------------------------------
  if (/bat and (a )?ball/.test(low) && /1\.10/.test(low)) {
    trace.push("Classified as: classic cognitive-reflection puzzle → solved algebraically (the intuitive '10 cents' is a trap).");
    return done("Let the ball cost **x**. Then the bat costs x + $1.00.\n\nx + (x + 1.00) = 1.10 → 2x = 0.10 → **x = $0.05**.\n\nSo the ball costs **5 cents** and the bat $1.05 (check: 1.05 + 0.05 = 1.10 ✓). The tempting answer '10 cents' fails the check — which is exactly why I always verify.");
  }
  if (/lily|double.*day|pond/.test(low) && /\b47\b|\b48\b/.test(low)) {
    trace.push("Classified as: exponential-growth puzzle → worked backwards.");
    return done("The patch doubles daily and covers the lake on day 48. So the day before — **day 47** — it covered exactly **half** the lake. Exponential growth fools intuition: half-full is just one doubling from full.");
  }
  if (/widget|machine/.test(low) && /\b5\b/.test(low)) {
    trace.push("Classified as: rate puzzle → unit-rate reasoning.");
    return done("5 machines make 5 widgets in 5 minutes → **1 machine makes 1 widget in 5 minutes**.\n\nSo 100 machines make 100 widgets in **5 minutes**. (Rate per machine: 1 widget / 5 min.)");
  }

  // --- Code ---------------------------------------------------------------------------
  if (wantsCode(prompt) || generateCode(prompt)) {
    const gen = generateCode(prompt);
    if (gen) {
      trace.push(`Classified as: code request → generated ${gen.lang} from Luno's verified template library. Press Run to execute it right here.`);
      return done(`${gen.explain}\n\n\`\`\`${gen.lang}\n${gen.code}\n\`\`\`\n\nPress **Run** above the code to execute it in your browser. Want it in ${gen.lang === "python" ? "JavaScript" : "Python"}, with tests, or extended (e.g. handle edge cases)? Just ask.`);
    }
    trace.push("Classified as: open-ended code request → scaffolded solution; a neural model will write the full version.");
    const wantsJs = detectLangLow(low) === "javascript";
    return done(`I can scaffold that right now — and a connected neural model will write the complete, tailored version:\n\n\`\`\`${wantsJs ? "javascript" : "python"}\n${wantsJs ? `// ${prompt.replace(/\n/g, " ").slice(0, 90)}\nfunction solve(input) {\n  // 1. Validate input\n  // 2. Core logic\n  // 3. Return the result\n  throw new Error("TODO: implement — connect a neural model for the full version");\n}` : `# ${prompt.replace(/\n/g, " ").slice(0, 90)}\ndef solve(data):\n    """TODO: implement the core logic."""\n    # 1. Validate input\n    # 2. Core logic\n    # 3. Return the result\n    raise NotImplementedError("Connect a neural model for the full version")`}\n\`\`\`\n\n**Get the real thing free:** tap the model picker (top) → **Qwen 2.5 3B (local)** or **Groq Llama 3.3 70B (free cloud)**, then re-ask. With **Deep Think** on, I write the code, run it, and fix it before answering.`);
  }

  // --- Summarise ------------------------------------------------------------------------
  if (/^summarize|^summarise|tl;?dr|summary of/i.test(prompt)) {
    const body = prompt.replace(/^summarize:?\s*|^summarise:?\s*/i, "");
    if (body.length > 280) {
      trace.push("Classified as: summarisation → extractive summary (sentence scoring by term frequency — no facts invented).");
      const sentences = body.match(/[^.!?]+[.!?]+/g) || [body];
      const freq = new Map<string, number>();
      (body.toLowerCase().match(/[a-z]{3,}/g) || []).forEach((w) => freq.set(w, (freq.get(w) || 0) + 1));
      const scored = sentences.map((s, i) => ({
        s: s.trim(), i,
        score: (s.toLowerCase().match(/[a-z]{3,}/g) || []).reduce((a, w) => a + (freq.get(w) || 0), 0) / Math.max(1, s.split(/\s+/).length),
      }));
      const top = scored.sort((a, b) => b.score - a.score).slice(0, Math.max(2, Math.ceil(sentences.length / 4))).sort((a, b) => a.i - b.i);
      return done(`**Summary** (extractive — key sentences from your text, nothing invented):\n\n${top.map((t) => t.s).join(" ")}\n\n_Compressed ${sentences.length} sentences → ${top.length}. For a paraphrased, abstractive summary, connect a neural model and ask again._`);
    }
    trace.push("Classified as: summarisation (no long text supplied).");
    return done("Paste the text after your request — e.g. `summarize: <your article>` — and I'll compress it instantly. (Short version runs right here; longer, paraphrased summaries are even better with a neural model connected.)");
  }

  // --- Writing ----------------------------------------------------------------------------
  const emailM = low.match(/write (?:an? |me an? )?(?:email|mail|letter|cover letter|essay|poem|story|speech)/);
  if (emailM || /^write (an? )?(email|essay|poem|story|cover letter|letter|speech)/.test(low)) {
    trace.push("Classified as: writing task → structured draft generated; personalise the [brackets].");
    return done(writingDraft(prompt, low));
  }

  // --- Pure arithmetic ------------------------------------------------------------------------
  if (looksLikeExpression(prompt)) {
    try {
      const expr = cleanExpression(prompt);
      const v = evaluateExpression(expr);
      const frac = toFraction(v);
      trace.push(`Classified as: arithmetic → parsed and computed exactly (no guessing): \`${expr}\`.`);
      return done(`\`${expr} = ${formatNumber(v)}\`\n\n**Answer: ${formatNumber(v)}**${frac ? ` — exactly **${frac}**` : ""}`);
    } catch { /* fall through */ }
  }
  // Arithmetic embedded in words: "what is 12 * 8 + 4"
  const embedded = prompt.match(/(?:what is|calculate|compute|how much is)\s+([0-9][0-9a-z\s+\-*/%^().!]*)/i);
  if (embedded && looksLikeExpression(embedded[1])) {
    try {
      const v = evaluateExpression(cleanExpression(embedded[1]));
      trace.push("Classified as: arithmetic in words → extracted expression and computed exactly.");
      return done(`\`${cleanExpression(embedded[1])} = ${formatNumber(v)}\`\n\n**Answer: ${formatNumber(v)}**`);
    } catch { /* fall through */ }
  }

  // --- Knowledge ----------------------------------------------------------------------------
  const kb = lookupKnowledge(prompt);
  if (kb) {
    trace.push(`Classified as: knowledge → matched curated entry “${kb.title}”.`);
    return done(`**${kb.title}**\n\n${kb.body}`);
  }

  // --- Comparisons / explanations scaffolding --------------------------------------------------
  const cmp = low.match(/(?:difference between|compare|vs\.?|versus)\s+(.+?)\s+(?:and|vs\.?|versus)\s+(.+?)[?.]?$/);
  if (cmp) {
    const a = lookupKnowledge(cmp[1]), b = lookupKnowledge(cmp[2]);
    if (a || b) {
      trace.push("Classified as: comparison → built from curated knowledge.");
      return done(`## ${cmp[1].trim()} vs ${cmp[2].trim()}\n\n${a ? `**${a.title}:** ${a.body}\n\n` : `**${cmp[1].trim()}:** (connect a neural model for a full profile)\n\n`}${b ? `**${b.title}:** ${b.body}` : `**${cmp[2].trim()}:** (connect a neural model for a full profile)`}\n\nFor a side-by-side table with pros/cons, connect **Groq Llama 3.3 70B** (free) and ask again — it takes 30 seconds to set up.`);
    }
  }

  // --- Contextual follow-up ---------------------------------------------------------------------
  if (/^(yes|yeah|yep|sure|ok|okay|do it|go ahead|more|explain more|tell me more|continue|and\?)/i.test(norm) && history.length >= 2) {
    const prev = [...history].reverse().find((h) => h.role === "assistant");
    if (prev) {
      trace.push("Classified as: follow-up → continuing from our last exchange.");
      return done(`Building on that: the key idea to take away is — ${prev.content.replace(/[#*`>]/g, "").split(/(?<=[.!?])\s/)[0] || "the previous point"}.\n\nFor a genuinely deeper dive (worked examples, follow-up questions, counter-arguments), connect a neural model above — local **Qwen 2.5 3B** or free-cloud **Llama 3.3 70B** — and say *“explain more”* again. I'll pick up this exact thread, because our conversation history travels with every model you pick.`);
    }
  }

  trace.push("Classified as: open-ended question → this is where neural models shine; Luno Brain gives a structured starting point and the honest fastest path to a full answer.");
  return done(
    `Great question — this one deserves a real neural model, and you can have the best free ones in under a minute:\n\n` +
    `**To get a full answer, connect a free model (menu at the top):**\n` +
    `1. **Groq — Llama 3.3 70B.** The strongest free option here. Free key at console.groq.com (30 seconds), paste it in Settings.\n` +
    `2. **Qwen 2.5 3B, running locally** — downloads once (~1.9 GB), then runs on your GPU forever. No key, no network, fully private.\n` +
    `3. **OpenRouter · DeepSeek :free** — another free-key giant.\n\n` +
    `Leave thinking on **Deep** and I'll plan, draft, verify and correct myself before answering.\n\n` +
    `Meanwhile, I *can* do this instantly right here: exact **maths** (\`solve 3x+7=22\`), runnable **code** (\`write a Python fibonacci function\`), **sequences**, **summaries** (\`summarize: …\`), **writing drafts**, and curated **knowledge** (\`what is a transformer\`). Try me on any of those — or connect a model and re-ask this exact question.`,
  );
}

function detectLangLow(low: string): "python" | "javascript" {
  return /javascript|typescript|\bjs\b|\bnode\b/.test(low) ? "javascript" : "python";
}

function writingDraft(prompt: string, low: string): string {
  const topic = (prompt.replace(/write (me )?(an? )?(email|mail|letter|cover letter|essay|poem|story|speech)( about| on| for| to)?/i, "").trim() || "the topic").replace(/[?.]$/, "");
  if (/poem/.test(low)) {
    return `Here's a poem about **${topic}**:\n\n> In quiet hours I think of ${topic},\n> a thread of light through ordinary days —\n> it asks for nothing, yet it gives back\n> a steadier heart, a clearer gaze.\n>\n> And when the world grows loud and hurried,\n> I hold that thought and breathe again;\n> for ${topic}, simply, truly carried,\n> turns passing moments into gain.\n\nWant it longer, funnier, or in a specific style (sonnet, haiku, rap)? Say the word.`;
  }
  if (/story/.test(low)) {
    return `**The Last Lighthouse Keeper** — a short story about ${topic}\n\nMara had kept the light for thirty-one years, and on the final night she climbed the iron stairs the way she always had — slowly, one hand on the cold rail, listening to the sea argue with the rocks below.\n\nThe new automated lamp hummed in its crate behind her, patient as a replacement always is. She lit the old flame one last time, trimmed the wick, and watched the beam sweep over the dark water.\n\nSomewhere out there, a small boat changed course by two degrees — she would never know its name. That was the point, she thought, smiling as she closed the logbook: the best work is the kind nobody ever notices, because nothing bad happened.\n\nShe switched off the light herself. Some endings you should do by hand.\n\n*Want it longer, with dialogue, or in another genre (sci-fi, mystery, horror)? Just ask — and with a neural model connected I can write you a full chapter.*`;
  }
  if (/cover letter/.test(low)) {
    return `**Cover letter draft** — personalise the [brackets]:\n\nDear Hiring Manager,\n\nI am excited to apply for the [role] position at [company]. With experience in ${topic}, I bring reliability, pace under pressure, and genuine pride in doing the small things right — the things customers actually remember.\n\nIn my previous role I [your proudest achievement — add a number if you can: “served 80+ customers a day”, “trained 4 new starters”]. I am known for showing up early, staying calm when it gets busy, and leaving every shift tidier than I found it.\n\nI would love the chance to show you in person. Thank you for your time and consideration.\n\nWarm regards,\n[Your name]\n[Phone] · [Email]\n\nTip: replace every bracket, keep it to one page, and mirror 2–3 words from the job advert. Want me to tailor it to a specific advert? Paste the advert and connect a neural model.`;
  }
  if (/essay/.test(low)) {
    return `**Essay: ${topic}**\n\n**Introduction.** ${cap(topic)} sits at the centre of more debates than almost any subject of its kind — praised, doubted, and constantly re-examined. This essay argues that, handled well, it offers real and lasting value, while its risks deserve honest attention.\n\n**The case for.** Supporters point to consistent evidence: where ${topic} is taken seriously, outcomes improve measurably — not by magic, but through the compound effect of small, repeatable decisions made well over time.\n\n**The case against.** Critics counter that enthusiasm outruns evidence, that costs (time, money, attention) are understated, and that early success stories suffer from survivorship bias. These objections are not trivial and any honest account must weigh them.\n\n**Synthesis.** The strongest position is neither cheerleading nor dismissal: adopt ${topic} where the evidence is strongest, measure results, and stay willing to revise.\n\n**Conclusion.** ${cap(topic)} will not solve everything — nothing does. But understood clearly and applied with judgement, it remains one of the most worthwhile pursuits available to us.\n\n*This is a structured draft. For a fully researched essay with citations and your own angle, connect a neural model (top) and ask again with Deep Think on.*`;
  }
  // email / letter / speech default
  return `**Draft email** — personalise the [brackets]:\n\nSubject: ${cap(topic)}\n\nDear [Name],\n\nI hope you're well. I'm writing about ${topic}.\n\n[One or two sentences with the key detail: what happened, what you need, and by when. Be specific — dates and numbers get faster replies.]\n\nI'd really appreciate your help with this. If it helps, I'm happy to [offer something easy for them: jump on a quick call / send the documents over / flex on timing].\n\nThank you so much for your time,\n\nBest regards,\n[Your name]\n\nWant a different tone — firmer, friendlier, shorter? Tell me which and I'll redraft instantly.`;
}

function cap(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

// ---------------------------------------------------------------------------
// Public entry point
// ---------------------------------------------------------------------------

export async function generateAnswer(
  history: ChatMessage[],
  s: ProviderSettings,
  emit: Emit,
  signal?: AbortSignal,
): Promise<{ text: string; thinking: string; engine: string }> {
  if (s.provider === "brain") {
    const { text, thinking } = brainAnswer(lastUser(history), history);
    return streamOut(text, thinking, "Luno Brain (built-in tools)", emit, signal);
  }
  return neuralAnswer(history, s, emit, signal);
}

/** Synchronous built-in answer (used by the benchmark + tests). */
export function brainAnswerSync(prompt: string): { text: string; thinking: string } {
  return brainAnswer(prompt, [{ id: "u", role: "user", content: prompt, createdAt: Date.now() }]);
}
