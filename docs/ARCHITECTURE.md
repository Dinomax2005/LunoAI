# Luno Desktop architecture and recovery

## Boundaries

`app.py` is a Tkinter client. It sends chats and training commands only to the stdlib `ThreadingHTTPServer` bound to **127.0.0.1:8765**; the CLI can run chat inference directly. The foreground server starts on demand while the GUI is open. A login service is a separate opt-in OS registration, requiring both `background_service` and `start_at_login`; turning off `background_service` causes a running service to exit on its next heartbeat. Chat history is stored locally under `chats/` and sent back as the entire conversation on each request; there is no fabricated memory or cloud backend.

PyInstaller bundles the stdlib-first UI and a copy of the package source. Setup needs a separately installed system Python 3.11–3.13, creates `<LUNO_HOME>/runtime` as a venv, installs that bundled package into it, then installs consented ML packages. This avoids attempting to pip-install into a frozen executable. The service and training worker execute this venv's `python -m luno_desktop ...`. `llama_cpp` is preferred for GGUF inference. Transformers is an offline-only fallback when HF-format weights are locally cached, and is required to apply PEFT adapters. Training downloads HF weights only when model-download permission is on; training itself requires its separate permission.

## Durable state

| File | Meaning / recovery |
|---|---|
| `settings.json` | Permission booleans default false; JSON updates use atomic replace |
| `state/setup-state.json` | Done/running/failed per setup step; a done step is skipped if its output is still valid |
| `models/<filename>.part` | Authoritative bytes of an unfinished GGUF; use HTTP Range from its actual size |
| `models/<filename>.part.state.json` | Source URL/checksum/ETag/Last-Modified and last observed byte count |
| `state/training-state.json` | Worker PID, dataset/model, status, log path and latest checkpoint |
| `state/training-stop.request.json` | Stop request addressed to a particular PID, polled by worker callbacks |
| `training/<model>/checkpoint-N/` | Trainer/PEFT model, optimizer, scheduler, RNG and trainer state; keep last 3 |
| `training/<model>/adapter/` | Final PEFT adapter loaded by the HF inference backend |
| `state/service-heartbeat.json` | PID, started time, last seen and stopped/running state |

The download state is written before transfer. After a power loss, use the `.part` **file size**, not a potentially stale JSON byte counter. Send `Range: bytes=<size>-`; accept only a 206 with the correct Content-Range (and matching validators). A 200 truncates and restarts cleanly. A short response is not installed. If a trusted SHA-256 is supplied, an invalid partial is removed. The catalogue deliberately has no invented checksums.

`TrainingManager.latest_checkpoint()` selects the highest numeric `checkpoint-N` for the selected model. Every new start passes `--resume-from` to the separate worker when a checkpoint exists. `Trainer.train(resume_from_checkpoint=...)` restores optimizer/scheduler/RNG/trainer state, not merely adapter weights. A graceful stop, permission revocation or time limit requests a save at the next training step; a sudden power cut may lose progress *since* the previous checkpoint, never the previous checkpoint. Every completed run, including a short run, saves a final checkpoint. Stop does not delete any training data. Training is real LoRA fine-tuning of a small open-weight model, not frontier-model pretraining.

## Permissions and API

Defaults are false for `model_download`, `background_service`, `training` and `start_at_login`. No dependency/model download, training subprocess or OS login registration happens when its corresponding consent is absent. Explicit chat starts a foreground local server; only registering it to run outside the app is a background-service action. Service removal and training stop remain possible even after consent is revoked.

`GET /health` reports server liveness without loading a model. `GET /v1/status` reports installed model and permission state. `POST /v1/chat` accepts `{"messages":[{"role":"user","content":"..."}],"level":"medium"}` and returns a real local answer, or HTTP 503 if no model/backend. `GET /v1/training`, `POST /v1/training/start`, `POST /v1/training/stop` require training permission; they return 403 otherwise. POST accepts JSON only; the server never binds a public address.

## Packaging

`.github/workflows/release.yml` tests and builds on Windows/macOS/Linux with Python 3.11 and PyInstaller onedir. Inno Setup produces the per-user, unsigned Windows EXE; the macOS `.app` is zipped and Linux onedir output is tarred. A single release job publishes the three artifacts. No cloud inference service is deployed; the old website and GitHub Pages workflow have been deleted.
