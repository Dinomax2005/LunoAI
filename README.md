# Luno 🚀

> **Your own AI. Free. Local. No server. No API key.**

Luno is a personal AI by [Dinomax2005](https://github.com/Dinomax2005) that
runs **its own model** on **your** computer. It is not a paid API client —
the model is yours, the data stays on your machine, and it costs $0/month.

The model family rolls out in generations:

| Generation | Model          | Status      | What it will be                                   |
|:-----------|:---------------|:------------|:--------------------------------------------------|
| 1          | **Luno Zero**  | **0.1 — first model** | Small, fast, entirely local.                 |
| 2          | **Luno Mist**  | planned     | Mid-size local model with stronger reasoning.     |
| 3          | **Luno Strato**| planned     | The flagship — best-in-class local coding model.  |

---

## The website 🖥️

Luno now ships with a real web chat interface (see [`web/`](web/)) — a clean,
dark, ChatGPT/Claude-style experience: sidebar conversations, streaming
responses with markdown + syntax-highlighted code, and a floating composer.
It is a React + TypeScript app that talks to the **Luno API**.

**Zero installs — just open it.** The site includes a built-in **Mini Zero**
engine that runs *inside the page*, so it answers right away with no
downloads and no server. Point it at a real Luno model for the full thing.

Two ways to reach it:

1. **Via GitHub Pages** (nothing to install at all):
   See [`.github/workflows/deploy-pages.yml`](.github/workflows/deploy-pages.yml)
   and **docs/plan.md → “Hosting the website”**. The hosted page answers
   instantly with the built-in engine, and auto-discovers your local
   `luno serve` at `http://localhost:8787` for the full model.

2. **Fully local** (UI + model on your machine):
   ```bash
   cd web && npm install && npm run build   # one-time build of the UI
   cd .. && python -m luno.cli serve        # serves UI + API together
   ```
   Then open **http://127.0.0.1:8787**.

---

## Status — read this first

The repository is the **complete scaffold for Luno Zero 0.1**: the local
engine, the OpenAI-compatible API, the CLI, the model-family registry, and
the from-scratch training pipeline are all here and working *today*.

What ships out-of-the-box is the **Mini Zero** engine — a small, honest
starter AI that runs with **zero downloads** so the whole project works on
day one. It writes short Python functions, does arithmetic, and explains AI
concepts. It is *not* the real Luno Zero 0.1 weights (and it says so
clearly when it doesn't know something — it never pretends to be the full
model).

The moment real Luno Zero 0.1 weights (GGUF) are dropped into
`~/.luno/models`, the **same** interface serves them with **no code change**:

```
engine: mini-zero            ─── install weights ───▶   engine: llama.cpp
weights_loaded: False        ───     automatically    ─▶  weights_loaded: True
```

That swap is the whole point: Mini Zero proves the plumbing, and the real
models make Luno *smart*.

---

## Quick start

Luno's core needs **only Python 3.10+**. No pip installs, no model downloads,
no keys.

```bash
# chat with Luno (interactive)
python -m luno.cli chat

# one-shot questions
python -m luno.cli ask "what is a transformer?"
python -m luno.cli ask "what is 12 * 8 + 4?"

# ask for code
python -m luno.cli code "fibonacci in python"

# list the model family
python -m luno.cli models

# start the local API
python -m luno.cli serve
```

### Install it as a command

```bash
pip install .            # core (zero dependencies)
pip install .[server]    # + FastAPI/uvicorn for a nicer API server
pip install .[llm]       # + PyTorch/Transformers for future safetensors weights
pip install .[llama]     # + llama.cpp for real Luno GGUF weights
pip install .[dev]       # + pytest for running the test suite
```

Then: `luno chat`, `luno ask "…"`, `luno code "…"`, `luno models`, `luno serve`.

---

## The API (OpenAI-compatible, local)

```bash
luno serve                         # serves on http://127.0.0.1:8787
```

| Method | Endpoint                 | Purpose                              |
|:-------|:-------------------------|:-------------------------------------|
| GET    | `/`                      | Service info / model status          |
| GET    | `/health`                | Liveness + which engine is loaded    |
| GET    | `/v1/models`             | The Luno model family                |
| POST   | `/v1/chat/completions`   | Chat completion (OpenAI-style)       |

```bash
curl http://127.0.0.1:8787/v1/chat/completions \
  -H 'Content-Type: application/json' \
  -d '{
    "model": "luno-zero-0.1",
    "messages": [{"role": "user", "content": "write a python function to reverse a string"}],
    "max_tokens": 256,
    "temperature": 0.8
  }'
```

It is drop-in compatible with OpenAI's `/v1/chat/completions` shape, so SDKs
just work — point your `base_url` at `http://127.0.0.1:8787/v1`.

---

## Running your own real model (the point of Luno)

1. Train or obtain **Luno Zero 0.1** weights — see [`docs/plan.md`](docs/plan.md).
2. Put the GGUF here:
   ```
   ~/.luno/models/zero/zero-0.1-q4_k_m.gguf
   ```
3. Install the llama.cpp backend:
   ```bash
   pip install .[llama]
   ```
4. Run exactly the same commands. Luno auto-detects the weights and loads
   them locally — optionally offloading layers to your GPU
   (`LUNO_N_GPU_LAYERS=-1` for full GPU, `0` for CPU only).

---

## Your own model, from scratch

Luno includes a real, from-scratch training pipeline — a small GPT-style
transformer with hand-written NumPy backpropagation, so nothing is hidden
behind a framework:

```bash
pip install numpy
python -m luno.training.train --epochs 500 --sample     # trains on a demo corpus
python -m luno.training.train --data mycorpus.txt --out weights/zero-0.1.npz
```

It is sized to prove the full **data → training → sampling → save** loop on a
normal CPU in minutes — not to be a production LLM. Scaling that exact loop
up to real Zero, Mist, and Strato models is described in `docs/plan.md`.

---

## Repository layout

```
luno/
  cli.py                   # the `luno` command
  config.py                # paths and defaults (~/.luno)
  family.py                # the Zero / Mist / Strato model registry
  model_loader.py          # model name -> running engine (auto weight detection)
  schema.py                # API request/response models
  server.py                # local HTTP API (stdlib or FastAPI) + serves the web UI
  engines/
    minizero.py            # built-in starter engine (zero dependencies)
    llama.py               # real GGUF weights via llama.cpp
    transformers_engine.py # reserved for future safetensors weights
  training/
    train.py               # from-scratch transformer training (NumPy backprop)
    data.py                # corpus + tokenizer helpers
  data/sneeze.txt          # tiny cleared demo corpus for the trainer
web/                       # the chat website (React + TypeScript + Vite)
  src/
    components/            # Sidebar, ChatView, Composer, Message, CodeBlock, …
    hooks/                 # conversations, chat streaming, API status
    lib/                   # API client, local persistence
  index.html
  vite.config.ts
tests/                     # pytest suite (no external deps)
docs/plan.md               # the roadmap to a truly smart Luno
.github/workflows/         # CI: deploy the site to GitHub Pages
```

## Testing

```bash
pip install .[dev]
pytest -q
```

---

## License

[Apache License 2.0](LICENSE) — free to use, modify, and share. Luno is
open source so the model *and* the engine are yours. © Dinomax2005.
