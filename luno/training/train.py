"""Train a Luno model from scratch — CPU-only, battery included.

Teaches a small character-level transformer (GPT-style: causal multi-head
self-attention + MLP blocks, layer-norm, learned embeddings) on a plain
text corpus. Implemented in NumPy with full, hand-written backpropagation —
no autograd framework required.

This is intentionally the *smallest thing that is a real transformer*, not a
production model. It proves the full Luno path — data → training → sampling
→ saved weights — which is the panel the real Zero/Mist/Strato models scale
up at:

    python -m luno.training.train            # train on bundled demo corpus
    python -m luno.training.train --data mycorpus.txt --epochs 2000
    python -m luno.training.train --sample   # print samples after training
"""

from __future__ import annotations

import argparse
import time
from pathlib import Path
from typing import Optional

from luno import config
from luno.training.data import build_indices, default_corpus, load_text

try:
    import numpy as np
except ImportError:  # pragma: no cover
    np = None  # type: ignore[assignment]

# Micromodel size: a real (if small) transformer, trainable in minutes on CPU.
N_LAYER = 3
N_HEAD = 4
N_EMBD = 128
BLOCK_SIZE = 32
EPS = 1e-5


# --------------------------------------------------------------------------
# Math helpers
# --------------------------------------------------------------------------

def _gelu(x):
    c = np.sqrt(2.0 / np.pi)
    return 0.5 * x * (1.0 + np.tanh(c * (x + 0.044715 * x ** 3)))


def _gelu_backward(dy, x):
    c = np.sqrt(2.0 / np.pi)
    inner = c * (x + 0.044715 * x ** 3)
    tanh = np.tanh(inner)
    dgelu = 0.5 * (1.0 + tanh) + 0.5 * x * (1.0 - tanh ** 2) * c * (1.0 + 3 * 0.044715 * x ** 2)
    return dy * dgelu


def _softmax(x):
    x = x - x.max(axis=-1, keepdims=True)
    e = np.exp(x)
    return e / e.sum(axis=-1, keepdims=True)


def _layernorm(x, g, b):
    mu = x.mean(axis=-1, keepdims=True)
    var = x.var(axis=-1, keepdims=True)
    x_hat = (x - mu) / np.sqrt(var + EPS)
    return g * x_hat + b, (x_hat, mu, var)


def _layernorm_backward(dy, cache, g, b):
    x_hat, mu, var = cache
    C = dy.shape[-1]
    sigma = np.sqrt(var + EPS)
    dx_hat = dy * g
    db = dy.sum(axis=(0, 1))
    dg = (dy * x_hat).sum(axis=(0, 1))
    # Standard layernorm backward (biased variance, per-position).
    xmu = x_hat * sigma  # == (x - mu)
    dvar = (dx_hat * xmu * -0.5 * (var + EPS) ** -1.5).sum(axis=-1, keepdims=True)
    dmu = (dx_hat * (-1.0 / sigma)).sum(axis=-1, keepdims=True)
    dx = dx_hat / sigma + dvar * 2.0 * xmu / C + dmu / C
    return dx, dg, db


def _cross_entropy(logits, targets):
    B, T, V = logits.shape
    flat = logits.reshape(-1, V)
    t = targets.reshape(-1)
    p = _softmax(flat)
    loss = -np.log(p[np.arange(t.size), t] + 1e-12).mean()
    return loss, p


def _cross_entropy_backward(p, logits, targets):
    B, T, V = logits.shape
    t = targets.reshape(-1)
    n = t.size
    onehot = np.zeros((n, V))
    onehot[np.arange(n), t] = 1.0
    dlogits = (p - onehot) / n
    return dlogits.reshape(B, T, V)


# --------------------------------------------------------------------------
# Transformer block
# --------------------------------------------------------------------------

class Block:
    """One transformer block: LN → causal MHSA → residual → LN → MLP → residual."""

    def __init__(self, rng, C: int, n_head: int):
        self.n_head = n_head
        self.head_size = C // n_head
        self.q = rng.standard_normal((C, C)) * 0.02
        self.k = rng.standard_normal((C, C)) * 0.02
        self.v = rng.standard_normal((C, C)) * 0.02
        self.o = rng.standard_normal((C, C)) * 0.02
        self.mlp1 = rng.standard_normal((C, 4 * C)) * 0.02
        self.mlp2 = rng.standard_normal((4 * C, C)) * 0.02
        self.ln1g = np.ones(C)
        self.ln1b = np.zeros(C)
        self.ln2g = np.ones(C)
        self.ln2b = np.zeros(C)

    def forward(self, x):
        B, T, C = x.shape
        h = self.n_head
        hs = self.head_size
        xn1, ln1_cache = _layernorm(x, self.ln1g, self.ln1b)
        q = (xn1 @ self.q).reshape(B, T, h, hs).transpose(0, 2, 1, 3)
        k = (xn1 @ self.k).reshape(B, T, h, hs).transpose(0, 2, 1, 3)
        v = (xn1 @ self.v).reshape(B, T, h, hs).transpose(0, 2, 1, 3)

        scores = q @ k.transpose(0, 1, 3, 2) / (hs ** 0.5)  # (B,h,T,T)
        mask = np.tril(np.ones((T, T), dtype=bool))
        scores = np.where(mask, scores, -1e9)
        attn = _softmax(scores)
        out = (attn @ v).transpose(0, 2, 1, 3).reshape(B, T, C)
        attn_out = out @ self.o
        x1 = x + attn_out

        xn2, ln2_cache = _layernorm(x1, self.ln2g, self.ln2b)
        hidden = _gelu(xn2 @ self.mlp1)
        mlp_out = hidden @ self.mlp2
        y = x1 + mlp_out

        cache = (x, xn1, q, k, v, scores, attn, out, x1, ln1_cache, ln2_cache, hidden, xn2)
        return y, cache

    def backward(self, dy, cache):
        x, xn1, q, k, v, scores, attn, out, x1, ln1_cache, ln2_cache, hidden, xn2 = cache
        B, T, C = x.shape
        h, hs = self.n_head, self.head_size

        # MLP residual
        dmlp_out = dy
        dx1 = dy
        dhidden = dmlp_out @ self.mlp2.T
        gmlp2 = hidden.reshape(-1, 4 * C).T @ dmlp_out.reshape(-1, C)
        dmlp1_in = _gelu_backward(dhidden, xn2 @ self.mlp1)
        gmlp1 = xn2.reshape(-1, C).T @ dmlp1_in.reshape(-1, 4 * C)
        dxn2 = dmlp1_in @ self.mlp1.T
        dx1_ln2, gln2g, gln2b = _layernorm_backward(dxn2, ln2_cache, self.ln2g, self.ln2b)
        dx1 += dx1_ln2

        # Attention residual
        dattn_out = dx1
        do = out.reshape(-1, C).T @ dattn_out.reshape(-1, C)
        dout = dattn_out @ self.o.T

        dout = dout.reshape(B, T, h, hs).transpose(0, 2, 1, 3)  # (B,h,T,hs)
        dattn = dout @ v.transpose(0, 1, 3, 2)                  # scores gradient -> attn
        dattn = dattn * attn * (1 - attn) * (1.0 / (hs ** 0.5))
        dattn = np.where(np.tril(np.ones((T, T), dtype=bool)), dattn, 0.0)
        dv = attn.transpose(0, 1, 3, 2) @ dout
        dq = dattn @ k
        dk = dattn.transpose(0, 1, 3, 2) @ q

        dq = dq.transpose(0, 2, 1, 3).reshape(B, T, C)
        dk = dk.transpose(0, 2, 1, 3).reshape(B, T, C)
        dv = dv.transpose(0, 2, 1, 3).reshape(B, T, C)

        gq = xn1.reshape(-1, C).T @ dq.reshape(-1, C)
        gk = xn1.reshape(-1, C).T @ dk.reshape(-1, C)
        gv = xn1.reshape(-1, C).T @ dv.reshape(-1, C)
        dxn1_q = dq @ self.q.T
        dxn1_k = dk @ self.k.T
        dxn1_v = dv @ self.v.T
        dxn1 = dxn1_q + dxn1_k + dxn1_v

        dx, gln1g, gln1b = _layernorm_backward(dxn1, ln1_cache, self.ln1g, self.ln1b)
        dx += dx1  # + gradient from MLP residual (x1 collects both paths)

        grads = {
            "q": gq, "k": gk, "v": gv, "o": do,
            "mlp1": gmlp1, "mlp2": gmlp2,
            "ln1g": gln1g, "ln1b": gln1b,
            "ln2g": gln2g, "ln2b": gln2b,
        }
        return dx, grads


class MiniTransformer:
    """Tiny GPT-style transformer for character-level language modeling."""

    def __init__(self, vocab_size: int, rng: Optional[np.random.Generator] = None):
        if np is None:
            raise RuntimeError("Training Luno needs numpy: pip install numpy")
        rng = rng or np.random.default_rng(3927)
        self.vocab_size = vocab_size
        self.wte = rng.standard_normal((vocab_size, N_EMBD)) * 0.02
        self.wpe = rng.standard_normal((BLOCK_SIZE, N_EMBD)) * 0.02
        self.head = rng.standard_normal((N_EMBD, vocab_size)) * 0.02
        self.ln_fg = np.ones(N_EMBD)
        self.ln_fb = np.zeros(N_EMBD)
        self.blocks = [Block(rng, N_EMBD, N_HEAD) for _ in range(N_LAYER)]

    # -- parameters ----------------------------------------------------------

    def named_parameters(self):
        yield "wte", self.wte
        yield "wpe", self.wpe
        yield "head", self.head
        yield "ln_fg", self.ln_fg
        yield "ln_fb", self.ln_fb
        for i, b in enumerate(self.blocks):
            for name in ("q", "k", "v", "o", "mlp1", "mlp2", "ln1g", "ln1b", "ln2g", "ln2b"):
                yield f"block{i}.{name}", getattr(b, name)

    def zero_like(self):
        return {name: np.zeros_like(p) for name, p in self.named_parameters()}

    def numel(self) -> int:
        return sum(p.size for _, p in self.named_parameters())

    # -- forward / backward --------------------------------------------------

    def forward(self, idx):
        B, T = idx.shape
        tok = self.wte[idx]
        pos = self.wpe[:T]
        x = tok + pos
        block_caches = []
        for block in self.blocks:
            x, cache = block.forward(x)
            block_caches.append(cache)
        x, ln_cache = _layernorm(x, self.ln_fg, self.ln_fb)
        logits = x @ self.head  # (B,T,V)
        return logits, (idx, T, x, ln_cache, block_caches)

    def backward(self, logits, cache, targets):
        idx, T, x, ln_cache, block_caches = cache
        loss, p = _cross_entropy(logits, targets)
        B = idx.shape[0]

        dlogits = _cross_entropy_backward(p, logits, targets)
        g_head = x.reshape(-1, N_EMBD).T @ dlogits.reshape(-1, self.vocab_size)
        dx = dlogits @ self.head.T

        dx, g_lnfg, g_lnfb = _layernorm_backward(dx, ln_cache, self.ln_fg, self.ln_fb)

        grads = self.zero_like()
        grads["head"] = g_head
        grads["ln_fg"] = g_lnfg
        grads["ln_fb"] = g_lnfb

        for i in range(len(self.blocks) - 1, -1, -1):
            dx, bgrads = self.blocks[i].backward(dx, block_caches[i])
            for name, g in bgrads.items():
                grads[f"block{i}.{name}"] = g

        g_wte = np.zeros_like(self.wte)
        np.add.at(g_wte, idx.reshape(-1), dx.reshape(-1, N_EMBD))
        grads["wte"] = g_wte
        g_wpe = np.zeros_like(self.wpe)
        g_wpe[:T] = dx.sum(axis=0)
        grads["wpe"] = g_wpe

        return loss, grads

    # -- sampling ------------------------------------------------------------

    def sample(self, stoi, itos, max_new: int = 200, prompt: str = ""):
        idxs = [stoi[c] for c in prompt[:BLOCK_SIZE]] or [stoi.get("\n", 0)]
        out = []
        for _ in range(max_new):
            window = idxs[-BLOCK_SIZE:]
            x = np.array([window] + [0] * (BLOCK_SIZE - len(window))) if False else np.pad(
                np.array([window]), ((0, 0), (BLOCK_SIZE - len(window), 0)), constant_values=0
            )
            logits, _ = self.forward(x)
            logits = logits[0, -1]
            probs = np.exp(logits - logits.max()) / np.exp(logits - logits.max()).sum()
            nxt = int(np.random.choice(len(probs), p=probs))
            idxs.append(nxt)
            out.append(itos[nxt])
        return prompt + "".join(out)

    # -- persistence ---------------------------------------------------------

    def save(self, path: Path, stoi) -> None:
        arrays = {"vocab": np.array(list(stoi.keys()))}
        for name, p in self.named_parameters():
            arrays[name.replace(".", "/")] = p
        path.parent.mkdir(parents=True, exist_ok=True)
        np.savez_compressed(path, **arrays)

    @classmethod
    def load(cls, path: Path):
        data = np.load(path)
        vocab = list(data["vocab"])
        stoi = {c: i for i, c in enumerate(vocab)}
        itos = {i: c for i, c in enumerate(vocab)}
        model = cls(vocab_size=len(vocab))
        for key in data.files:
            if key == "vocab":
                continue
            parts = key.split("/")
            target = model
            for part in parts[:-1]:
                if part.startswith("block"):
                    target = model.blocks[int(part[len("block"):])]
                else:
                    target = getattr(target, part)
            setattr(target, parts[-1], data[key])
        return model, stoi, itos


class AdamW:
    """Minimal AdamW optimizer (no weight decay groups; fine for Luno-scale)."""

    def __init__(self, params, lr: float = 3e-3, betas=(0.9, 0.99), weight_decay: float = 0.0):
        self.params = list(params)  # materialize once (generator may be single-pass)
        self.lr = lr
        self.b1, self.b2 = betas
        self.wd = weight_decay
        self.m = {name: np.zeros_like(p) for name, p in self.params}
        self.v = {name: np.zeros_like(p) for name, p in self.params}
        self.t = 0

    def step(self, grads):
        self.t += 1
        for name, p in self.params:
            g = grads[name]
            self.m[name] = self.b1 * self.m[name] + (1 - self.b1) * g
            self.v[name] = self.b2 * self.v[name] + (1 - self.b2) * (g ** 2)
            mhat = self.m[name] / (1 - self.b1 ** self.t)
            vhat = self.v[name] / (1 - self.b2 ** self.t)
            p -= self.lr * (mhat / (np.sqrt(vhat) + EPS) + self.wd * p)


def main(argv: Optional[list] = None) -> int:
    parser = argparse.ArgumentParser(description="Train a tiny Luno model from scratch")
    parser.add_argument("--data", default=None, help="Training corpus (.txt); default: bundled demo")
    parser.add_argument("--epochs", type=int, default=300, help="Training steps (default 300)")
    parser.add_argument("--lr", type=float, default=3e-3, help="Learning rate (default 3e-3)")
    parser.add_argument("--out", default=None, help="Output .npz path")
    parser.add_argument("--sample", action="store_true", help="Print samples after training")
    args = parser.parse_args(argv)

    if np is None:
        print("error: training Luno needs numpy — run: pip install numpy")
        return 1

    corpus = load_text(Path(args.data).expanduser()) if args.data else default_corpus()
    _, stoi, itos = build_indices(corpus)
    data = [stoi[c] for c in corpus]

    model = MiniTransformer(vocab_size=len(stoi))
    opt = AdamW(model.named_parameters(), lr=args.lr)

    print(f"vocab={len(stoi)}  steps={args.epochs}  params≈{model.numel():,}")
    print(f"Training a demo-size Luno transformer on {len(data):,} tokens…")

    start = time.time()
    for step in range(1, args.epochs + 1):
        ix = int(np.random.randint(0, len(data) - BLOCK_SIZE - 1))
        xb = np.array([data[ix : ix + BLOCK_SIZE]])
        yb = np.array([data[ix + 1 : ix + BLOCK_SIZE + 1]])
        logits, cache = model.forward(xb)
        loss, grads = model.backward(logits, cache, yb)
        opt.step(grads)
        if step % 25 == 0 or step == 1:
            print(f"  step {step:>5}/{args.epochs}  loss={loss:.4f}  ({time.time() - start:.1f}s)")

    out = Path(args.out) if args.out else config.get_models_dir() / "minizero-trained" / "zero-tiny.npz"
    model.save(out, stoi)
    print(f"saved → {out}")

    if args.sample:
        print("\nsamples:")
        for _ in range(3):
            print("  •", model.sample(stoi, itos, max_new=80)[:100])
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
