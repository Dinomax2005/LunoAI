# Luno — the plan to a real model

Luno's promise: **an AI that is yours — free, local, no server, no API key,**
with a family of models named **Zero**, **Mist** and **Strato**.

This document is the honest roadmap. It separates what exists today from
what "smart at coding" actually requires, and it gives a concrete, staged
path to get there. No hype — just the engineering.

---

## 1. What exists right now

- **Luno CLI** — chat, ask, code, models, serve.
- **Luno API** — local, OpenAI-compatible, zero dependencies.
- **Model family registry** — Zero 0.1 → Mist 0.1 → Strato 0.1.
- **Pluggable inference** — Mini Zero (built-in) and llama.cpp (real weights).
- **Training pipeline** — a real, from-scratch GPT-style transformer in NumPy.

Everything runs on your hardware with no external calls.

## 2. The honest truth about "an AI that's smart at coding"

To make an AI that is genuinely good at coding you need, at minimum:

1. **A base model with billions of parameters.** Small *usable* coder models
   start around **1.5B–3B parameters** (~1.5–3 GB on disk). Below that,
   coding help is shallow.
2. **A good inference engine** that runs it **fast** on your hardware
   (llama.cpp with GPU offload is the pragmatic choice).
3. **Training compute.** Training an LLM from nothing takes thousands of
   GPUs and millions of dollars. Even a small real model needs a GPU to
   *fine-tune* and a big, legally-clean dataset to train on.

That is why the plan below is staged. The genuinely smart Luno is *built*,
step by step — starting from the part that is free and immediate.

## 3. The three stages

### Stage 1 — Scaffold complete ✅ (this repository)

The working local engine, API, CLI, model registry, and training loop.
Mini Zero makes everything usable with **zero downloads** today.

### Stage 2 — Luno Zero 0.1 (first real weights)

Options, in increasing order of capability:

| Path | How | Result |
|:-----|:----|:-------|
| **A. Fine-tune an open base** (recommended) | Fine-tune a small open coder base (1–3B) on Luno-style code/conversation data | A genuinely useful coding assistant, 100% yours to host |
| **B. Distill** | Train a small model on outputs of a larger open model | Smaller and faster, somewhat less capable |
| **C. From scratch** | Scale the `training/train.py` loop up with a real dataset and GPU | The most "ours", but least capable per unit of compute |

Recommended datasets (all rights-permissive/cleared):
fine-tune on **The Stack** or **StarCoder** splits, `smol-course`/`databricks-dolly`
style instruction data for conversation, and filter per their licenses.

**When it ships:** drop `zero-0.1-q4_k_m.gguf` into `~/.luno/models/zero/`
and Luno serves it immediately — zero code changes.

### Stage 3 — Mist, then Strato

- **Mist** — mid-size (7B–13B class) for stronger reasoning.
- **Strato** — the flagship; target best-in-class local coding across
  languages, tool use, and longer context.

## 4. Running the real model (today's installer)

```bash
# 1) get or build weights
# 2) place them under ~/.luno/models/<family>/<file>.gguf
# 3) install the llama.cpp backend
pip install .[llama]

# 4) run — Luno auto-detects the weights
luno serve --model zero
```

GPU control via environment variable (auto-detects CUDA):

```bash
LUNO_N_GPU_LAYERS=-1 luno serve      # offload as many layers as fit
LUNO_N_GPU_LAYERS=0  luno serve      # CPU only
```

Rename list when Hugging Face is reachable:
`snapshot_download` any GGUF → move into the path above. Luno needs no
network at inference time.

## 5. Hardware guidance

| Your machine          | Realistic local model size | Notes                                |
|:----------------------|:---------------------------|:-------------------------------------|
| CPU laptop, 8 GB      | 1–2B quantized             | Mini Zero or small GGUF, ~1 token/s  |
| GPU (6 GB VRAM)       | 3–7B quantized             | Fast GPU offload, good coding        |
| Apple Silicon 16 GB   | 7B–13B class               | Metal-accelerated, very usable       |
| Big PC / 24 GB VRAM   | 13B+ class                 | Near-Strato territory                |

## 6. What "done" looks like for each model

- [ ] **Zero 0.1** — real GGUF weights published under a clear, permissive
      license with training data cards.
- [ ] **Mist 0.1** — stronger reasoning selfbench; published weights + evals.
- [ ] **Strato 0.1** — flagship weights + evals + tool/API use.

## 7. Contributions & rules of the road

- Model weights must carry a **permissive, real license** (Apache-2.0 /
  MIT-style) so Luno stays genuinely free.
- Training data must be **rights-cleared**; keep provenance in the model card.
- Luno must stay **local and free** — no telemetry, no paid API, no lock-in.

---

*Luno is built so that every line today survives into the model that finally
out-codes the big guys — but on your desk, for free.*
