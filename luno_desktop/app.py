"""Native Tkinter desktop UI; all slow local work runs off the UI thread."""

from __future__ import annotations

import json
import os
import queue
import subprocess
import sys
import threading
import time
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

from . import __version__
from .config import (Permissions, atomic_write_json, data_dir, ensure_directories,
                     load_settings, read_json, save_settings)
from .installer import Setup
from .models import CATALOGUE
from .training import TrainingManager, worker_python

try:
    import tkinter as tk
    from tkinter import filedialog, messagebox, ttk
except ImportError:
    tk = None

STONE = "#f5f2ee"
WHITE = "#ffffff"
INK = "#292622"
MUTED = "#736b64"
ACCENT = "#c67949"
BORDER = "#ded7cf"


def _logo_path() -> Path:
    root = Path(getattr(sys, "_MEIPASS", Path(__file__).resolve().parent.parent))
    return root / "assets" / "logo.png"


def _api(method: str, path: str, data: dict | None = None, timeout: float = 15) -> dict:
    body = json.dumps(data).encode("utf-8") if data is not None else None
    request = Request(f"http://127.0.0.1:8765{path}", data=body, method=method,
                      headers={"Content-Type": "application/json"} if body is not None else {})
    try:
        with urlopen(request, timeout=timeout) as response:
            return json.load(response)
    except HTTPError as exc:
        try:
            problem = json.load(exc).get("error", exc.reason)
        except (ValueError, AttributeError):
            problem = exc.reason
        raise RuntimeError(f"HTTP {exc.code}: {problem}") from exc


class LunoApp(tk.Tk if tk else object):
    def __init__(self) -> None:
        if tk is None:
            raise RuntimeError("Tkinter is not installed. Install your OS Python Tk package to use the GUI.")
        super().__init__()
        self.home = ensure_directories()
        self.settings = load_settings(self.home)
        self.events: queue.Queue[tuple] = queue.Queue()
        self._server_lock = threading.Lock()
        self._owned_server: subprocess.Popen | None = None
        self._training_poll_busy = False
        self._setup_busy = False
        self.current_page = "Chat"
        self.title(f"Luno Desktop {__version__}")
        self.geometry("1020x700")
        self.minsize(900, 600)
        self.configure(bg=STONE)
        self.protocol("WM_DELETE_WINDOW", self._close)
        self._style()
        try:
            self.logo = tk.PhotoImage(file=str(_logo_path()))
            self.iconphoto(True, self.logo)
        except tk.TclError:
            self.logo = None
        self.model_var = tk.StringVar(value=self.settings.selected_model)
        self.level_var = tk.StringVar(value=self.settings.thinking_level)
        self.permission_vars = {
            key: tk.BooleanVar(value=getattr(self.settings.permissions, key))
            for key in ("model_download", "background_service", "training", "start_at_login")
        }
        self.chat_path = self.home / "chats" / "conversation.json"
        self.messages = read_json(self.chat_path, [])
        if not isinstance(self.messages, list):
            self.messages = []
        self._build()
        self.after(100, self._drain)
        self.after(5000, self._poll_training)

    def _style(self) -> None:
        style = ttk.Style(self)
        style.theme_use("clam")
        style.configure("TFrame", background=STONE)
        style.configure("TLabel", background=STONE, foreground=INK, font=("Arial", 11))
        style.configure("Title.TLabel", font=("Arial", 23, "bold"))
        style.configure("Muted.TLabel", foreground=MUTED, font=("Arial", 10))
        style.configure("TButton", padding=(15, 9), font=("Arial", 10))
        style.configure("Accent.TButton", foreground=WHITE, background=ACCENT)
        style.map("Accent.TButton", background=[("active", "#a96236")])
        style.configure("TCheckbutton", background=STONE, foreground=INK, font=("Arial", 10))
        style.configure("TCombobox", padding=5)
        style.configure("Horizontal.TProgressbar", background=ACCENT, troughcolor=BORDER)

    def _build(self) -> None:
        sidebar = tk.Frame(self, bg=WHITE, width=215, highlightbackground=BORDER, highlightthickness=1)
        sidebar.pack(side="left", fill="y")
        sidebar.pack_propagate(False)
        if self.logo:
            tk.Label(sidebar, image=self.logo, bg=WHITE).pack(pady=(29, 5))
        tk.Label(sidebar, text="LUNO", bg=WHITE, fg=INK, font=("Arial", 21, "bold")).pack()
        tk.Label(sidebar, text="DESKTOP  5.0.0", bg=WHITE, fg=MUTED, font=("Arial", 9)).pack(pady=(0, 32))
        for name in ("Chat", "Setup", "Training", "Settings"):
            button = tk.Button(sidebar, text=name, anchor="w", relief="flat", borderwidth=0,
                               padx=24, pady=13, bg=WHITE, fg=INK,
                               activebackground=STONE, font=("Arial", 12),
                               command=lambda page=name: self._show(page))
            button.pack(fill="x", padx=10, pady=2)
        tk.Label(sidebar, text="Private by design\nYour PC is the data centre.", bg=WHITE,
                 fg=MUTED, font=("Arial", 10), justify="left").pack(side="bottom", anchor="w", padx=25, pady=25)

        self.content = tk.Frame(self, bg=STONE)
        self.content.pack(side="left", fill="both", expand=True, padx=32, pady=27)
        self.pages = {name: tk.Frame(self.content, bg=STONE)
                      for name in ("Chat", "Setup", "Training", "Settings")}
        for page in self.pages.values():
            page.place(relx=0, rely=0, relwidth=1, relheight=1)
        self._chat_page(self.pages["Chat"])
        self._setup_page(self.pages["Setup"])
        self._training_page(self.pages["Training"])
        self._settings_page(self.pages["Settings"])
        self._show("Chat")

    def _heading(self, parent: object, title: str, subtitle: str) -> None:
        ttk.Label(parent, text=title, style="Title.TLabel").pack(anchor="w", pady=(0, 5))
        ttk.Label(parent, text=subtitle, style="Muted.TLabel").pack(anchor="w", pady=(0, 24))

    def _show(self, name: str) -> None:
        self.current_page = name
        self.pages[name].tkraise()
        if name == "Training":
            self._refresh_training()

    def _chat_page(self, page: object) -> None:
        self._heading(page, "Chat with Luno", "Your conversation stays on this computer. A local model is required.")
        tools = ttk.Frame(page)
        tools.pack(fill="x", pady=(0, 10))
        ttk.Label(tools, text="Thinking level").pack(side="left", padx=(0, 9))
        ttk.Combobox(tools, textvariable=self.level_var, values=("low", "medium", "high", "max"),
                     width=12, state="readonly").pack(side="left")
        ttk.Label(tools, text="History is the model's memory", style="Muted.TLabel").pack(side="right")
        transcript = tk.Frame(page, bg=WHITE, highlightbackground=BORDER, highlightthickness=1)
        transcript.pack(fill="both", expand=True)
        scrollbar = ttk.Scrollbar(transcript)
        scrollbar.pack(side="right", fill="y")
        self.transcript = tk.Text(transcript, wrap="word", relief="flat", bg=WHITE, fg=INK,
                                  font=("Arial", 11), padx=16, pady=16, state="disabled",
                                  yscrollcommand=scrollbar.set)
        self.transcript.pack(side="left", fill="both", expand=True)
        scrollbar.config(command=self.transcript.yview)
        self.transcript.tag_configure("speaker", foreground=ACCENT, font=("Arial", 11, "bold"))
        self.transcript.tag_configure("error", foreground="#a43e35")
        for item in self.messages:
            if isinstance(item, dict) and item.get("role") in ("user", "assistant"):
                self._append_chat("You" if item["role"] == "user" else "Luno", str(item.get("content", "")))
        bottom = ttk.Frame(page)
        bottom.pack(fill="x", pady=(13, 0))
        self.entry = tk.Text(bottom, height=3, wrap="word", bg=WHITE, fg=INK,
                             font=("Arial", 11), relief="flat", padx=10, pady=10,
                             highlightbackground=BORDER, highlightthickness=1)
        self.entry.pack(side="left", fill="x", expand=True, padx=(0, 10))
        self.entry.bind("<Control-Return>", lambda event: self._send())
        self.send_button = ttk.Button(bottom, text="Send  ↗", style="Accent.TButton", command=self._send)
        self.send_button.pack(side="right", fill="y")
        self.chat_status = ttk.Label(page, text="Ctrl+Enter to send · No AI cloud or API keys", style="Muted.TLabel")
        self.chat_status.pack(anchor="w", pady=(9, 0))

    def _append_chat(self, speaker: str, content: str, *, error: bool = False) -> None:
        self.transcript.configure(state="normal")
        self.transcript.insert("end", speaker + "\n", "error" if error else "speaker")
        self.transcript.insert("end", content + "\n\n")
        self.transcript.configure(state="disabled")
        self.transcript.see("end")

    def _send(self) -> None:
        text = self.entry.get("1.0", "end-1c").strip()
        if not text or self.send_button.instate(["disabled"]):
            return
        self.entry.delete("1.0", "end")
        self.messages.append({"role": "user", "content": text})
        atomic_write_json(self.chat_path, self.messages)
        self._append_chat("You", text)
        settings = load_settings(self.home)
        settings.thinking_level = self.level_var.get()
        save_settings(settings, self.home)
        self.send_button.state(["disabled"])
        self.chat_status.configure(text="Thinking on this computer…")
        pending = list(self.messages)
        level = self.level_var.get()

        def task() -> None:
            try:
                self._ensure_server()
                reply = _api("POST", "/v1/chat", {"messages": pending, "level": level}, 600)
                self.events.put(("chat_answer", reply["message"]["content"]))
            except (RuntimeError, URLError, OSError, KeyError, ValueError) as exc:
                self.events.put(("chat_error", str(exc)))
        threading.Thread(target=task, daemon=True).start()

    def _permission_checks(self, page: object) -> None:
        descriptions = (
            ("model_download", "Download model and install local inference packages"),
            ("background_service", "Allow a local background service"),
            ("training", "Allow LoRA fine-tuning and install training packages"),
            ("start_at_login", "Start the background service at login (requires background permission)"),
        )
        for key, text in descriptions:
            ttk.Checkbutton(page, text=text, variable=self.permission_vars[key]).pack(anchor="w", pady=5)

    def _setup_page(self, page: object) -> None:
        self._heading(page, "Set up your local AI", "Nothing downloads, trains or runs at login without your permission.")
        row = ttk.Frame(page)
        row.pack(fill="x", pady=(0, 10))
        ttk.Label(row, text="Model").pack(side="left", padx=(0, 15))
        ttk.Combobox(row, textvariable=self.model_var, values=list(CATALOGUE),
                     width=25, state="readonly").pack(side="left")
        ttk.Label(row, text="0.5B: 4 GB RAM  ·  1.5B: 8 GB  ·  3B: 12 GB", style="Muted.TLabel").pack(side="left", padx=14)
        self._permission_checks(page)
        self.setup_button = ttk.Button(page, text="Install / Resume", style="Accent.TButton", command=self._setup)
        self.setup_button.pack(anchor="w", pady=(17, 12))
        self.progress = ttk.Progressbar(page, maximum=100, mode="determinate")
        self.progress.pack(fill="x", pady=(0, 5))
        self.progress_label = ttk.Label(page, text="Ready", style="Muted.TLabel")
        self.progress_label.pack(anchor="w", pady=(0, 12))
        box = tk.Frame(page, bg=WHITE, highlightbackground=BORDER, highlightthickness=1)
        box.pack(fill="both", expand=True)
        self.setup_log = tk.Text(box, wrap="word", state="disabled", relief="flat", bg=WHITE,
                                 fg=INK, font=("Courier", 9), padx=12, pady=12)
        self.setup_log.pack(fill="both", expand=True)

    def _write_log(self, text: str) -> None:
        self.setup_log.configure(state="normal")
        self.setup_log.insert("end", text + "\n")
        self.setup_log.configure(state="disabled")
        self.setup_log.see("end")

    def _save_permissions(self) -> None:
        old = load_settings(self.home)
        new = Permissions(**{key: var.get() for key, var in self.permission_vars.items()})
        old_permissions = old.permissions
        old.permissions = new
        old.selected_model = self.model_var.get()
        save_settings(old, self.home)
        if old_permissions.training and not new.training:
            TrainingManager(self.home).stop()
        if (old_permissions.background_service and not new.background_service or
                old_permissions.start_at_login and not new.start_at_login):
            from .service import remove_gui_startup_shortcut, uninstall
            uninstall(self.home)
            if not new.start_at_login:
                remove_gui_startup_shortcut()

    def _setup(self) -> None:
        if self._setup_busy:
            return
        try:
            self._save_permissions()
        except (ValueError, OSError, RuntimeError) as exc:
            messagebox.showerror("Settings", str(exc))
            return
        self._setup_busy = True
        self.setup_button.state(["disabled"])
        self._write_log("Starting or resuming setup. Existing download bytes are kept.")
        if self.permission_vars["background_service"].get() and self.permission_vars["start_at_login"].get():
            self._release_server()

        def task() -> None:
            try:
                Setup(self.home, log=lambda text: self.events.put(("log", text)),
                      progress=lambda step, now, total: self.events.put(("progress", step, now, total))).run()
                self.events.put(("setup_done", "Setup finished. Your local model is ready if downloaded."))
            except Exception as exc:
                self.events.put(("setup_done", f"Setup stopped: {exc}. Press Install / Resume to retry."))
        threading.Thread(target=task, daemon=True).start()

    def _training_page(self, page: object) -> None:
        self._heading(page, "Fine-tune on your tasks", "Training runs as a separate process and resumes from saved checkpoints.")
        ttk.Label(page, text="Fine-tuning improves a small local model for your own tasks.\n"
                  "It is not frontier-model training; frontier models need data-centre pretraining.",
                  justify="left", wraplength=690).pack(anchor="w", pady=(0, 20))
        row = ttk.Frame(page)
        row.pack(fill="x", pady=7)
        self.dataset_var = tk.StringVar()
        ttk.Entry(row, textvariable=self.dataset_var).pack(side="left", fill="x", expand=True, padx=(0, 9))
        ttk.Button(row, text="Choose .jsonl", command=self._choose_dataset).pack(side="right")
        values = ttk.Frame(page)
        values.pack(fill="x", pady=12)
        self.hours_var = tk.StringVar(value="1")
        self.epochs_var = tk.StringVar(value="1")
        ttk.Label(values, text="Max hours per run").pack(side="left")
        ttk.Entry(values, textvariable=self.hours_var, width=7).pack(side="left", padx=(8, 25))
        ttk.Label(values, text="Epochs").pack(side="left")
        ttk.Entry(values, textvariable=self.epochs_var, width=7).pack(side="left", padx=8)
        buttons = ttk.Frame(page)
        buttons.pack(fill="x", pady=14)
        ttk.Button(buttons, text="Start / Resume", style="Accent.TButton",
                   command=self._start_training).pack(side="left", padx=(0, 12))
        ttk.Button(buttons, text="Stop after checkpoint", command=self._stop_training).pack(side="left")
        self.training_status = tk.Text(page, height=12, wrap="word", bg=WHITE, fg=INK,
                                       relief="flat", font=("Courier", 10), padx=16, pady=16,
                                       highlightbackground=BORDER, highlightthickness=1, state="disabled")
        self.training_status.pack(fill="both", expand=True, pady=(10, 0))

    def _choose_dataset(self) -> None:
        chosen = filedialog.askopenfilename(title="Choose JSONL training data",
                                             filetypes=[("JSON Lines", "*.jsonl"), ("All files", "*")])
        if chosen:
            self.dataset_var.set(chosen)

    def _training_action(self, path: str, data: dict) -> None:
        def task() -> None:
            try:
                self._ensure_server()
                result = _api("POST", path, data)
                self.events.put(("training", result))
            except (RuntimeError, URLError, OSError, ValueError) as exc:
                self.events.put(("training_error", str(exc)))
        threading.Thread(target=task, daemon=True).start()

    def _start_training(self) -> None:
        try:
            hours, epochs = float(self.hours_var.get()), float(self.epochs_var.get())
            if hours <= 0 or epochs <= 0:
                raise ValueError("Hours and epochs must be positive")
        except ValueError as exc:
            messagebox.showerror("Training", str(exc))
            return
        self._training_action("/v1/training/start", {"dataset": self.dataset_var.get(),
                                                     "hours": hours, "epochs": epochs})

    def _stop_training(self) -> None:
        self._training_action("/v1/training/stop", {})

    def _set_training_status(self, value: object) -> None:
        self.training_status.configure(state="normal")
        self.training_status.delete("1.0", "end")
        self.training_status.insert("end", json.dumps(value, indent=2) if isinstance(value, dict) else str(value))
        self.training_status.configure(state="disabled")

    def _refresh_training(self) -> None:
        if self._training_poll_busy or self.current_page != "Training":
            return
        if not load_settings(self.home).permissions.training:
            self._set_training_status("Training permission is off. Enable it in Setup or Settings first.")
            return
        self._training_poll_busy = True

        def task() -> None:
            try:
                self._ensure_server()
                result = _api("GET", "/v1/training")
                self.events.put(("training", result))
            except (RuntimeError, URLError, OSError) as exc:
                self.events.put(("training_error", str(exc)))
            finally:
                self.events.put(("training_polled",))
        threading.Thread(target=task, daemon=True).start()

    def _poll_training(self) -> None:
        self._refresh_training()
        self.after(5000, self._poll_training)

    def _settings_page(self, page: object) -> None:
        self._heading(page, "Settings & permissions", "All permissions start off. You can revoke them at any time.")
        self._permission_checks(page)
        ttk.Button(page, text="Save permissions", style="Accent.TButton", command=self._settings_save).pack(anchor="w", pady=18)
        ttk.Separator(page).pack(fill="x", pady=10)
        ttk.Label(page, text="Optional login service", font=("Arial", 15, "bold")).pack(anchor="w", pady=(10, 12))
        ttk.Label(page, text="Install needs both background and start-at-login consent. Removing always works.",
                  style="Muted.TLabel").pack(anchor="w", pady=(0, 12))
        row = ttk.Frame(page)
        row.pack(anchor="w")
        ttk.Button(row, text="Install service", command=self._install_service).pack(side="left", padx=(0, 12))
        ttk.Button(row, text="Remove service", command=self._remove_service).pack(side="left")
        self.settings_status = ttk.Label(page, text=f"Data stored at {self.home}", style="Muted.TLabel")
        self.settings_status.pack(anchor="w", pady=22)

    def _settings_save(self) -> None:
        try:
            self._save_permissions()
            self.settings_status.configure(text="Permissions saved. Revoked activities have been stopped/removed.")
        except (OSError, ValueError, RuntimeError) as exc:
            messagebox.showerror("Settings", str(exc))

    def _install_service(self) -> None:
        try:
            self._save_permissions()
            self._release_server()
        except (OSError, ValueError, RuntimeError) as exc:
            messagebox.showerror("Service", str(exc))
            return

        def task() -> None:
            from .service import install
            try:
                self.events.put(("settings", f"Installed: {install(self.home)}"))
            except (OSError, PermissionError, RuntimeError) as exc:
                self.events.put(("settings", f"Could not install service: {exc}"))
        threading.Thread(target=task, daemon=True).start()

    def _remove_service(self) -> None:
        def task() -> None:
            from .service import uninstall
            try:
                uninstall(self.home)
                self.events.put(("settings", "Login service removed."))
            except (OSError, RuntimeError) as exc:
                self.events.put(("settings", f"Could not remove service: {exc}"))
        threading.Thread(target=task, daemon=True).start()

    def _ensure_server(self) -> None:
        with self._server_lock:
            try:
                health = _api("GET", "/health", timeout=1)
                if health.get("app") == "Luno" and health.get("version") == __version__:
                    return
                raise RuntimeError("Port 8765 is occupied by an unexpected local service")
            except (URLError, OSError):
                pass
            python = worker_python(self.home)
            log_path = self.home / "logs" / "server.log"
            env = os.environ.copy()
            env["LUNO_HOME"] = str(self.home)
            with log_path.open("a", encoding="utf-8") as log:
                self._owned_server = subprocess.Popen(
                    [str(python), "-m", "luno_desktop", "serve"],
                    stdout=log, stderr=subprocess.STDOUT, env=env,
                    **({"creationflags": subprocess.CREATE_NO_WINDOW} if os.name == "nt" else {}),
                )
            for _ in range(80):
                if self._owned_server.poll() is not None:
                    raise RuntimeError(f"Local server exited. See {log_path}")
                try:
                    health = _api("GET", "/health", timeout=1)
                    if health.get("app") == "Luno" and health.get("version") == __version__:
                        return
                except (URLError, OSError):
                    time.sleep(0.2)
            raise RuntimeError(f"Local server did not start. See {log_path}")

    def _release_server(self) -> None:
        with self._server_lock:
            if self._owned_server and self._owned_server.poll() is None:
                self._owned_server.terminate()
                try:
                    self._owned_server.wait(timeout=5)
                except subprocess.TimeoutExpired:
                    self._owned_server.kill()
            self._owned_server = None

    def _drain(self) -> None:
        try:
            while True:
                event = self.events.get_nowait()
                kind = event[0]
                if kind == "log":
                    self._write_log(event[1])
                elif kind == "progress":
                    _, step, current, total = event
                    if total:
                        if self.progress["mode"] != "determinate":
                            self.progress.stop()
                            self.progress.configure(mode="determinate")
                        self.progress["value"] = min(100, current / total * 100)
                        self.progress_label.configure(text=f"{step}: {current:,} / {total:,} bytes")
                    else:
                        if self.progress["mode"] != "indeterminate":
                            self.progress.configure(mode="indeterminate")
                            self.progress.start(12)
                        self.progress_label.configure(text=f"{step}: {current:,} bytes saved")
                elif kind == "setup_done":
                    self._setup_busy = False
                    self.setup_button.state(["!disabled"])
                    self.progress.stop()
                    self.progress_label.configure(text=event[1])
                    self._write_log(event[1])
                elif kind == "chat_answer":
                    self.messages.append({"role": "assistant", "content": event[1]})
                    atomic_write_json(self.chat_path, self.messages)
                    self._append_chat("Luno", event[1])
                    self.send_button.state(["!disabled"])
                    self.chat_status.configure(text="Answered by a local model · Conversation saved on this PC")
                elif kind == "chat_error":
                    self._append_chat("Error (not an AI reply)", event[1], error=True)
                    self.send_button.state(["!disabled"])
                    self.chat_status.configure(text=event[1][:110])
                elif kind == "training":
                    self._set_training_status(event[1])
                elif kind == "training_error":
                    self._set_training_status("Training error: " + event[1])
                elif kind == "training_polled":
                    self._training_poll_busy = False
                elif kind == "settings":
                    self.settings_status.configure(text=event[1])
        except queue.Empty:
            pass
        self.after(100, self._drain)

    def _close(self) -> None:
        self._release_server()
        self.destroy()


def launch() -> int:
    if tk is None:
        print("Luno GUI needs Tkinter (install your OS Python Tk package). CLI commands still work.", file=sys.stderr)
        return 1
    try:
        LunoApp().mainloop()
        return 0
    except tk.TclError as exc:
        print(f"Luno GUI could not open a display: {exc}", file=sys.stderr)
        return 1
