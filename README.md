![Luno logo](assets/logo.png)

# Luno Desktop 5.0.0

Luno is a **local desktop AI app**. Your own PC is the data centre: the model, chats, inference, training and optional service run locally. There is no Luno AI cloud, account, API key or telemetry. The only network access is for packages and open model weights **after you allow downloads**. Once installed, chat inference runs offline.

## Download

**[Download Luno Desktop from GitHub Releases](https://github.com/Dinomax2005/LunoAI/releases/latest)**

- **Windows:** download `Luno-Setup-5.0.0.exe` and run the per-user installer. The desktop shortcut and GUI-at-login tasks are **unchecked** by default.
- **macOS:** download `Luno-macOS.zip`, extract it, and open `Luno.app`. This unsigned community build may require a one-time approval in Privacy & Security.
- **Linux:** download `Luno-linux.tar.gz`, extract it, then run `Luno/Luno`. A graphical session with Tk libraries is required.

The installer bundles the desktop UI, not a large model. **Python 3.11–3.13 must also be installed on your PC** for the separate per-user inference/training environment (set `LUNO_PYTHON` if it is not on PATH). Python's Tk support is needed for the GUI. Luno Setup creates a venv at your Luno data directory; it never needs administrator rights for the app or login service. Installing `llama-cpp-python` may require a C++ toolchain if a wheel is unavailable for your machine; Setup shows the real error instead of pretending installation succeeded. Builds are currently unsigned.

## First run and permissions

Open **Setup**, choose a model and explicitly select the activities you want, then click **Install / Resume**. All four permissions default to **off**:

| Permission | What it enables |
|---|---|
| Model download | Install local inference packages and download the selected GGUF model |
| Background service | Permit the loopback service to run outside the GUI |
| Training | Install training packages and start a separate LoRA worker |
| Start at login | With background-service consent, register a per-user login service |

Without model download permission, Luno does not download a model or claim to answer. Chat returns a clear **503** until a local model is installed. The GUI starts a loopback server only while needed for an explicit chat/training action, and stops its own server when closed; that is not an opt-in login service. The HTTP API listens **only** on `127.0.0.1:8765`.

Setup records every completed step in `state/setup-state.json`. A model downloads into `<model>.gguf.part`, with a `.part.state.json` journal. If power or network fails, the next Install / Resume sends a Range request for the saved bytes. If a server ignores Range, Luno safely restarts that file instead of appending an entire second copy. A trusted SHA-256 is verified when one is provided (the catalogue does not invent checksums). Settings and chats stay in your per-user data directory. Revoke consent in Settings; remove the login service there at any time.

Models (Qwen2.5 Instruct Q4_K_M GGUF): **0.5B** (~0.4 GB, minimum 4 GB RAM), **1.5B** (~1.0 GB, minimum 8 GB RAM, default), **3B** (~2.0 GB, minimum 12 GB RAM). These are approximate memory guides, not speed or quality guarantees.

## Thinking and training

The Chat page sends the **actual saved conversation history** to the local server as the model's context. Thinking levels set real generation budgets: low 180 tokens, medium 420, high 800 across draft/revise, max 1,200 across three candidates and a revision. Candidate scoring uses length/diversity and simple penalties; it is **not** fact-checking. Inference prefers `llama-cpp-python` with the installed GGUF. If unavailable, `transformers` can use **locally cached** Hugging Face weights; it does not silently download weights during chat.

Training accepts a UTF-8 `.jsonl` file with one `{"text":"..."}` or `{"prompt":"...","response":"..."}` object per line. Enable Training, install its extras, select a dataset and hours budget on the Training page. A separate process uses `transformers.Trainer` + `peft` LoRA, saves full Trainer checkpoints every 50 optimizer steps (keeping the latest 3), and saves a PEFT adapter. Stop or a time limit triggers a checkpoint at the next step; after an interruption, Start / Resume passes the highest `checkpoint-N` to Trainer. Unfinished work since the last checkpoint may need to be repeated after a sudden power cut. LoRA needs the **full HF-format base model as well as the chat GGUF**; its weights may be downloaded only with model-download consent. A completed adapter is applied on the local transformers backend; if that backend/weight cache is missing, Luno reports an error instead of silently using the unadapted GGUF.

**Honest scope:** fine-tuning improves a small local model for your own tasks. It does not train a frontier model from scratch. Frontier models need data-centre pretraining, substantial compute and data. Luno does not claim Claude/ChatGPT-level ability.

## Command line and source checkout

```bash
python -m luno_desktop status
python -m luno_desktop setup --model qwen2.5-1.5b --yes  # explicit download consent
python -m luno_desktop chat --level medium
python -m luno_desktop serve                   # loopback server, Ctrl-C to stop
python -m luno_desktop train start --dataset examples.jsonl --hours 2 --epochs 1
python -m luno_desktop train stop
python -m luno_desktop train status
python -m luno_desktop service install         # requires both service + login consent
python -m luno_desktop service uninstall
python -m luno_desktop                         # native GUI
```

`setup --training` and `setup --background` explicitly grant those respective permissions; `--background` also grants start-at-login. Set `LUNO_HOME` to relocate all user data. Default locations: Windows `%LOCALAPPDATA%\Luno`, macOS `~/Library/Application Support/Luno`, Linux `~/.local/share/luno`. From the source checkout, the stdlib tests need no ML packages:

```bash
python -m unittest discover -s tests
LUNO_HOME=/tmp/luno-smoke python -m luno_desktop status
```

See [architecture and recovery details](docs/ARCHITECTURE.md). MIT licensed; see [LICENSE](LICENSE).
