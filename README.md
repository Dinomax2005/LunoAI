# Luno — a free AI assistant

Luno is a free AI assistant that runs open models in your browser, or connects to free model tiers, and checks its own work before answering. No account, no subscription, no Luno server.

Open the site and ask something. Maths, code, logic and knowledge work immediately with zero downloads; connect a free 70B-class model (or run one locally on your GPU) for open-ended questions, and Deep Think will plan, draft, verify and correct the answer before you see it.

---

## The three tiers of free intelligence

| Tier | What it is | Cost | Setup |
|---|---|---|---|
| **Luno Brain** (default) | Built-in exact tools: maths solver, code writer + **in-browser code runner**, logic-puzzle solver, sequences, statistics, unit conversion, summaries, writing drafts, curated knowledge | $0 | None. Works offline |
| **Local neural** | Real LLMs — Qwen 2.5 (1.5B/3B/7B), Llama 3.2 (1B/3B), Phi 3.5, Gemma 2 — running on **your GPU in this tab** via WebLLM/WebGPU | $0 | One download (0.7–4.3 GB, cached forever). No key, no server, private by design |
| **Free cloud** | 70B-class giants via free tiers: **Groq** (Llama 3.3 70B, DeepSeek R1 Distill, QwQ), **OpenRouter** (DeepSeek V3/R1 `:free`, Llama 70B `:free`), **Hugging Face**, **Ollama** on your machine, or any OpenAI-compatible endpoint | $0 | Free key (~30 s) where required — stored **only in your browser** |

Switch tiers any time from the model picker at the top. Your conversation history carries over to whichever brain you pick.

## Why Luno punches above its weight

1. **It computes, it doesn't guess.** Arithmetic, equations (linear + quadratic), percentages, GCD/LCM, primality, statistics and sequences are solved by a real parser/solver (`src/lib/mathEngine.ts`) — exact answers, every time, with working shown.
2. **It writes code, then runs it.** Python & JavaScript from a verified template library, plus a **Run** button on every code block (JS instantly; Python via Pyodide in-browser). Deep Think literally executes draft code and fixes what fails.
3. **Deep Think verification.** For neural models: Luno plans the answer, drafts it, attacks its own draft as a strict verifier (with tool results attached), then writes the corrected final. Self-verification is the single biggest free upgrade to raw model quality.
4. **Logic-trap immunity.** The classic traps (bat-and-ball, lily-pad doubling, widget rates) are solved algebraically with checks — try them.
5. **Provable, not promised.** Hit **Benchmark** (top right) and watch Luno take a 15-question auto-graded test — maths, logic, code, knowledge — live in your browser.

## Quick start

```bash
npm install
npm run dev        # → http://localhost:5173
```

That's it. Ask:

- `What is 847 × 39?` · `Solve 3x + 7 = 22` · `Average of 4, 8, 15, 16, 23, 42`
- `Write a Python function to check if a number is prime` → then press **Run**
- `What comes next: 2, 6, 12, 20, 30?`
- `A bat and a ball cost $1.10 in total…`
- `Write an email asking for a deadline extension`
- `Summarize: <paste a long text>`

### Get the giants (free, ~30 seconds each)

- **Groq** — free key at [console.groq.com/keys](https://console.groq.com/keys) → pick **Llama 3.3 70B Versatile**
- **OpenRouter** — free key at [openrouter.ai/keys](https://openrouter.ai/keys) → pick **DeepSeek V3 :free** or **R1 :free**
- **Hugging Face** — free token at [huggingface.co/settings/tokens](https://huggingface.co/settings/tokens)
- **Local (no key at all)** — model picker → **Local Neural** → Qwen 2.5 3B (needs Chrome/Edge with WebGPU)
- **Ollama** — `OLLAMA_ORIGINS=* ollama serve` + `ollama pull llama3.2`

Turn on **🧠 Deep Think** for anything hard. Use **⚡ Fast** for quick chats.

## Deploy it free (your own copy, forever)

This repo auto-deploys to **GitHub Pages** on every push to `main` (`.github/workflows/deploy-pages.yml`):

1. Repo **Settings → Pages → Source: GitHub Actions**
2. Push to `main` — your Luno is live at `https://<you>.github.io/LunoAI/`

Or host `npm run build` output (`dist/`) on Netlify, Vercel, Cloudflare Pages — any static host. There is no Luno server to pay for. Ever.

## Privacy

- No Luno account, no Luno backend, no telemetry, no analytics.
- Chats and settings live in your browser's `localStorage` only.
- Local models never send a byte anywhere. Cloud keys go only to the provider you selected, directly from your browser.

## Development

```bash
npm run dev      # dev server (0.0.0.0:5173)
npm run build    # typecheck + production build
npm test         # brain / math / code / benchmark tests (node:test via tsx)
```

```
src/
  App.tsx                  Chat UI, streaming, conversations
  components/              Sidebar · Composer · MessageView (markdown + runnable code)
                           ModelModal (tier picker) · BenchmarkModal (live test)
  lib/
    brain.ts               Orchestrator: intent routing + Deep Think pipeline
    mathEngine.ts          Exact parser, equation solvers, stats, sequences, units
    codeGen.ts             Verified Python/JS snippets + JS & Python (Pyodide) runners
    knowledge.ts           Curated knowledge base
    providers.ts           Groq / OpenRouter / HF / Ollama / custom (OpenAI-compatible, streaming)
    webllm.ts              In-browser neural models (WebLLM + WebGPU)
    benchmark.ts           15-question auto-graded live benchmark
    store.ts               localStorage persistence (chats, settings, per-provider keys)
tests/                     Automated tests — the public benchmark must pass 15/15
```

## The honest engineering note

No from-scratch model trained on a laptop beats GPT-4/Claude — capability comes from large open-weight models + scaffolding. So Luno doesn't pretend: it **ships the scaffolding and plugs into the strongest models that are genuinely free** (open weights locally, free tiers in the cloud), then adds the planning, tool use and verification that close most of the remaining gap. Every claim in the app is testable: run the benchmark, run the code, check the maths.

*Old Luno (Mini Zero scaffold) was removed in this rebuild; its history remains on the `main` branch's git log.*

## License

MIT — see [LICENSE](LICENSE). Free as in freedom, free as in $0.
