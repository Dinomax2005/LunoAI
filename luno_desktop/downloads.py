"""Resumable HTTP downloads: .part is authoritative, state holds URL/validators."""

from __future__ import annotations

import hashlib
import os
import re
import time
from pathlib import Path
from typing import Callable
from urllib.error import HTTPError
from urllib.request import Request, urlopen

from .config import atomic_write_json, read_json


class DownloadError(RuntimeError):
    pass


Progress = Callable[[int, int | None], None]
_RANGE = re.compile(r"^bytes (\d+)-(\d+)/(\d+|\*)$")
_COMPLETE = re.compile(r"^bytes \*/(\d+)$")


def _sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def _finish(part: Path, destination: Path, state_path: Path, expected_sha256: str | None) -> Path:
    if expected_sha256 and _sha256(part).lower() != expected_sha256.lower():
        part.unlink(missing_ok=True)
        state_path.unlink(missing_ok=True)
        raise DownloadError(f"SHA-256 mismatch for {destination.name}; corrupt partial download removed")
    os.replace(part, destination)
    state_path.unlink(missing_ok=True)
    return destination


def download(
    url: str,
    destination: Path | str,
    *,
    expected_sha256: str | None = None,
    progress: Progress | None = None,
    chunk_size: int = 1024 * 1024,
    timeout: float = 60,
) -> Path:
    """Resume bytes from a prior run; do not mistake a full 200 for a 206.

    Existing .part files work even if power was lost before the state write.
    ETag/Last-Modified and Content-Range prevent joining two different files.
    The part remains intact on network errors; a short body is never installed.
    """
    destination = Path(destination)
    destination.parent.mkdir(parents=True, exist_ok=True)
    if chunk_size < 1:
        raise ValueError("chunk_size must be positive")
    if destination.is_file():
        if not expected_sha256 or _sha256(destination).lower() == expected_sha256.lower():
            if progress:
                progress(destination.stat().st_size, destination.stat().st_size)
            return destination
        destination.unlink()

    part = destination.with_name(destination.name + ".part")
    state_path = destination.with_name(destination.name + ".part.state.json")
    state = read_json(state_path, {})
    if not isinstance(state, dict):
        raise DownloadError(f"Invalid download state in {state_path}")
    if state and (state.get("url") != url or state.get("sha256") != expected_sha256):
        # A different URL/checksum must not append to someone else's bytes.
        part.unlink(missing_ok=True)
        state = {}
    existing = part.stat().st_size if part.exists() else 0
    state = {
        "url": url, "sha256": expected_sha256,
        "etag": state.get("etag"), "last_modified": state.get("last_modified"),
        "bytes": existing,
    }
    atomic_write_json(state_path, state)

    for attempt in range(2):
        headers = {"Accept-Encoding": "identity", "User-Agent": "Luno-Desktop/5.0.0"}
        if existing:
            headers["Range"] = f"bytes={existing}-"
            validator = state.get("etag") or state.get("last_modified")
            if validator:
                headers["If-Range"] = validator
        try:
            response = urlopen(Request(url, headers=headers), timeout=timeout)
        except HTTPError as exc:
            complete = _COMPLETE.match(exc.headers.get("Content-Range", ""))
            if exc.code == 416 and existing and complete and int(complete.group(1)) == existing:
                if progress:
                    progress(existing, existing)
                return _finish(part, destination, state_path, expected_sha256)
            raise DownloadError(f"HTTP {exc.code} downloading {url}") from exc

        with response:
            code = response.status
            if code not in (200, 206):
                raise DownloadError(f"Unexpected HTTP {code} downloading {url}")
            if code == 206:
                match = _RANGE.match(response.headers.get("Content-Range", ""))
                if not match or int(match.group(1)) != existing:
                    raise DownloadError("Server returned an invalid Content-Range; partial download kept")
                total = None if match.group(3) == "*" else int(match.group(3))
                if total is not None and total < existing:
                    raise DownloadError("Server reported a file shorter than our partial download")
                old_etag = state.get("etag")
                new_etag = response.headers.get("ETag")
                old_modified = state.get("last_modified")
                new_modified = response.headers.get("Last-Modified")
                if (old_etag and new_etag and old_etag != new_etag) or (
                    not old_etag and old_modified and new_modified and old_modified != new_modified
                ):
                    # An origin may ignore If-Range: discard the incompatible bytes.
                    part.unlink(missing_ok=True)
                    existing = 0
                    state.update(etag=None, last_modified=None, bytes=0)
                    atomic_write_json(state_path, state)
                    if attempt == 0:
                        continue
                    raise DownloadError("Source changed during download; retry setup")
                mode = "ab"
            else:
                # A 200 in response to Range is a *new* full response, never append.
                existing = 0
                mode = "wb"
                length = response.headers.get("Content-Length")
                total = int(length) if length and length.isdigit() else None
            state.update(
                etag=response.headers.get("ETag"),
                last_modified=response.headers.get("Last-Modified"), bytes=existing,
            )
            atomic_write_json(state_path, state)
            count = existing
            last_save = time.monotonic()
            last_bytes = count
            if progress:
                progress(count, total)
            with part.open(mode) as stream:
                while True:
                    block = response.read(chunk_size)
                    if not block:
                        break
                    stream.write(block)
                    count += len(block)
                    if progress:
                        progress(count, total)
                    if count - last_bytes >= 4 * 1024 * 1024 or time.monotonic() - last_save >= 2:
                        state["bytes"] = count
                        atomic_write_json(state_path, state)
                        last_save, last_bytes = time.monotonic(), count
                stream.flush()
                os.fsync(stream.fileno())
            state["bytes"] = count
            atomic_write_json(state_path, state)
            if total is not None and count != total:
                raise DownloadError(f"Incomplete download: {count}/{total} bytes saved in {part.name}")
            return _finish(part, destination, state_path, expected_sha256)
    raise DownloadError("Could not resume download safely")
