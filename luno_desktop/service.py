"""Consent-gated user-level background service; never requires administrator rights."""

from __future__ import annotations

import os
import plistlib
import shlex
import signal
import subprocess
import sys
import threading
from datetime import datetime, timezone
from pathlib import Path

from .config import atomic_write_json, ensure_directories, home_path, load_settings
from .training import worker_python

WINDOWS_TASK = "LunoBackground"
LINUX_UNIT = "luno.service"
MAC_LABEL = "ai.luno.desktop"


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _service_command(home: Path) -> list[str]:
    return [str(worker_python(home)), "-m", "luno_desktop", "service", "run"]


def _run(args: list[str], *, allow_failure: bool = False) -> None:
    result = subprocess.run(args, text=True, capture_output=True, check=False)
    if result.returncode and not allow_failure:
        raise RuntimeError(f"{' '.join(args)} failed: {result.stderr.strip() or result.stdout.strip()}")


def install(home: Path | str | None = None) -> str:
    home = ensure_directories(home)
    permissions = load_settings(home).permissions
    if not permissions.background_service or not permissions.start_at_login:
        raise PermissionError("Enable both background_service and start_at_login before installing a login service")
    command = _service_command(home)
    if sys.platform == "win32":
        username = os.environ.get("USERNAME")
        if not username:
            raise RuntimeError("Cannot identify the current Windows user for a non-admin scheduled task")
        # Current-user task, limited privileges, no stored password, no admin.
        _run(["schtasks", "/create", "/tn", WINDOWS_TASK, "/sc", "ONLOGON",
              "/tr", subprocess.list2cmdline(command), "/ru", username,
              "/np", "/rl", "LIMITED", "/f"])
        return WINDOWS_TASK
    if sys.platform == "darwin":
        path = Path.home() / "Library" / "LaunchAgents" / f"{MAC_LABEL}.plist"
        path.parent.mkdir(parents=True, exist_ok=True)
        with path.open("wb") as stream:
            plistlib.dump({
                "Label": MAC_LABEL, "ProgramArguments": command,
                "EnvironmentVariables": {"LUNO_HOME": str(home)},
                "RunAtLoad": True, "KeepAlive": False,
                "StandardOutPath": str(home / "logs" / "service.log"),
                "StandardErrorPath": str(home / "logs" / "service.log"),
            }, stream)
        _run(["launchctl", "bootout", f"gui/{os.getuid()}", str(path)], allow_failure=True)
        _run(["launchctl", "bootstrap", f"gui/{os.getuid()}", str(path)])
        return str(path)
    path = Path.home() / ".config" / "systemd" / "user" / LINUX_UNIT
    path.parent.mkdir(parents=True, exist_ok=True)
    # ExecStart is parsed by systemd, not a shell; shlex.quote handles spaces.
    quoted = shlex.join([piece.replace("%", "%%") for piece in command])
    environment = f'LUNO_HOME={home}'.replace("\\", "\\\\").replace('"', '\\"').replace("%", "%%")
    path.write_text(
        "[Unit]\nDescription=Luno Desktop local AI service\n"
        f"[Service]\nType=simple\nEnvironment=\"{environment}\"\n"
        f"ExecStart={quoted}\nRestart=on-failure\nRestartSec=10\n"
        "[Install]\nWantedBy=default.target\n", encoding="utf-8",
    )
    _run(["systemctl", "--user", "daemon-reload"])
    _run(["systemctl", "--user", "enable", "--now", LINUX_UNIT])
    return str(path)


def uninstall(home: Path | str | None = None) -> None:
    # Removing a service never requires permission: revocation must always work.
    if sys.platform == "win32":
        _run(["schtasks", "/delete", "/tn", WINDOWS_TASK, "/f"], allow_failure=True)
    elif sys.platform == "darwin":
        path = Path.home() / "Library" / "LaunchAgents" / f"{MAC_LABEL}.plist"
        if path.exists():
            _run(["launchctl", "bootout", f"gui/{os.getuid()}", str(path)], allow_failure=True)
            path.unlink()
    else:
        path = Path.home() / ".config" / "systemd" / "user" / LINUX_UNIT
        if path.exists():
            _run(["systemctl", "--user", "disable", "--now", LINUX_UNIT], allow_failure=True)
            path.unlink()
            _run(["systemctl", "--user", "daemon-reload"], allow_failure=True)


def remove_gui_startup_shortcut() -> None:
    """Undo the optional Inno Setup GUI-at-login task if consent is revoked."""
    if sys.platform == "win32":
        appdata = os.environ.get("APPDATA")
        if appdata:
            (Path(appdata) / "Microsoft" / "Windows" / "Start Menu" / "Programs" /
             "Startup" / "Luno Desktop.lnk").unlink(missing_ok=True)


def run(home: Path | str | None = None) -> None:
    from .server import make_server

    home = ensure_directories(home)
    if not load_settings(home).permissions.background_service:
        raise PermissionError("Background service permission is off")
    server = make_server(home=home)
    heartbeat = home / "state" / "service-heartbeat.json"
    stop = threading.Event()
    started = _now()

    def request_stop(signum: int, frame: object) -> None:
        stop.set()  # server.shutdown() belongs in the main loop, not the handler.

    signal.signal(signal.SIGTERM, request_stop)
    signal.signal(signal.SIGINT, request_stop)
    thread = threading.Thread(target=server.serve_forever, kwargs={"poll_interval": 0.5}, daemon=True)
    thread.start()
    try:
        while not stop.is_set():
            if not load_settings(home).permissions.background_service:
                break
            atomic_write_json(heartbeat, {"status": "running", "pid": os.getpid(),
                                          "started_at": started, "last_seen": _now()})
            stop.wait(5)
    finally:
        server.shutdown()
        server.server_close()
        thread.join(timeout=5)
        atomic_write_json(heartbeat, {"status": "stopped", "pid": os.getpid(),
                                      "started_at": started, "last_seen": _now()})
