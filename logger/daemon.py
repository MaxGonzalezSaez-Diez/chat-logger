"""Local HTTP logger for extension events.

Writes one JSON file per site/day:
PATH/<site>/YYYY-MM-DD.json
"""

from __future__ import annotations

import json
import os
import threading
from datetime import datetime, timezone
from http import HTTPStatus
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import Any

_SETTINGS = Path(__file__).resolve().parent.parent / "settings.yaml"
_DEFAULT_LOG_ROOT = Path.home() / "Library" / "Application Support" / "read_chat_gui" / "chats"


def _load_settings() -> dict[str, Any]:
    out: dict[str, Any] = {
        "log_root": str(_DEFAULT_LOG_ROOT),
        "host": "127.0.0.1",
        "port": 17842,
    }
    if _SETTINGS.is_file():
        for raw in _SETTINGS.read_text(encoding="utf-8").splitlines():
            line = raw.split("#", 1)[0].strip()
            if not line or ":" not in line:
                continue
            key, val = line.split(":", 1)
            key = key.strip()
            val = val.strip().strip("\"'")
            if key in {"log_root", "host"}:
                out[key] = val
            elif key == "port":
                try:
                    out[key] = int(val)
                except ValueError:
                    pass
    env = os.environ.get("READ_CHAT_GUI_LOG_ROOT", "").strip()
    if env:
        out["log_root"] = env
    out["log_root"] = str(Path(os.path.expandvars(os.path.expanduser(str(out["log_root"])))))
    return out


_CFG = _load_settings()
PATH = str(_CFG["log_root"])

VALID_SITES = {"chatgpt", "gemini", "claude"}
WRITE_LOCK = threading.Lock()


def _normalize_site(site: Any) -> str:
    normalized = str(site or "").strip().lower()
    if normalized not in VALID_SITES:
        raise ValueError("site must be one of: chatgpt, gemini, claude")
    return normalized


def _iso_day_from_ts(ts_iso: Any) -> str | None:
    text = str(ts_iso or "").strip()
    if not text:
        return None

    if text.endswith("Z"):
        text = text[:-1] + "+00:00"

    try:
        dt = datetime.fromisoformat(text)
    except ValueError:
        return None

    return dt.date().isoformat()


def _event_day(event: dict[str, Any]) -> str:
    return _iso_day_from_ts(event.get("tsIso")) or datetime.now(timezone.utc).date().isoformat()


def _day_file(root_path: str | Path, site: str, day_iso: str) -> Path:
    return Path(root_path).expanduser() / site / f"{day_iso}.json"


def _validate_event(event: Any) -> dict[str, Any]:
    if not isinstance(event, dict):
        raise ValueError("event must be a JSON object")

    event_id = str(event.get("eventId") or "").strip()
    if not event_id:
        raise ValueError("eventId is required")

    ts_iso = str(event.get("tsIso") or "").strip()
    if not ts_iso:
        raise ValueError("tsIso is required")

    role = str(event.get("role") or "").strip().lower()
    if role not in {"user", "assistant"}:
        raise ValueError("role must be one of: user, assistant")

    text = str(event.get("text") or "").strip()
    if not text:
        raise ValueError("text must be non-empty")

    site = _normalize_site(event.get("site"))

    out = dict(event)
    out["site"] = site
    out["role"] = role
    out["text"] = text
    return out


def _read_day_payload(path: Path, site: str, day_iso: str) -> dict[str, Any]:
    if not path.exists():
        return {"site": site, "date": day_iso, "events": []}

    try:
        payload = json.loads(path.read_text(encoding="utf-8"))
    except json.JSONDecodeError as exc:
        raise ValueError(f"invalid JSON in existing day file: {path}") from exc

    if not isinstance(payload, dict):
        raise ValueError("existing day file must contain a JSON object")

    events = payload.get("events")
    if not isinstance(events, list):
        raise ValueError("existing day file must contain an events array")

    return {
        "site": site,
        "date": day_iso,
        "events": events,
    }


def _atomic_write_json(path: Path, payload: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    temp = path.with_suffix(path.suffix + ".tmp")
    temp.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    temp.replace(path)


def append_event(root_path: str | Path, raw_event: Any) -> Path:
    event = _validate_event(raw_event)
    site = event["site"]
    day_iso = _event_day(event)
    target = _day_file(root_path, site, day_iso)

    with WRITE_LOCK:
        payload = _read_day_payload(target, site, day_iso)
        payload["events"].append(event)
        _atomic_write_json(target, payload)

    return target


def _json_response(handler: BaseHTTPRequestHandler, status: int, body: dict[str, Any]) -> None:
    data = (json.dumps(body, ensure_ascii=False) + "\n").encode("utf-8")
    handler.send_response(status)
    handler.send_header("Content-Type", "application/json")
    handler.send_header("Content-Length", str(len(data)))
    handler.send_header("Access-Control-Allow-Origin", "*")
    handler.send_header("Access-Control-Allow-Headers", "Content-Type")
    handler.send_header("Access-Control-Allow-Methods", "GET,POST,OPTIONS")
    handler.end_headers()
    handler.wfile.write(data)


def make_handler(root_path: str | Path):
    class Handler(BaseHTTPRequestHandler):
        def do_OPTIONS(self) -> None:  # noqa: N802
            _json_response(self, HTTPStatus.OK, {"ok": True})

        def do_GET(self) -> None:  # noqa: N802
            if self.path != "/health":
                _json_response(self, HTTPStatus.NOT_FOUND, {"ok": False, "error": "not found"})
                return

            _json_response(
                self,
                HTTPStatus.OK,
                {
                    "ok": True,
                    "root": str(Path(root_path).expanduser()),
                },
            )

        def do_POST(self) -> None:  # noqa: N802
            if self.path != "/events":
                _json_response(self, HTTPStatus.NOT_FOUND, {"ok": False, "error": "not found"})
                return

            try:
                length = int(self.headers.get("Content-Length") or "0")
            except ValueError:
                _json_response(self, HTTPStatus.BAD_REQUEST, {"ok": False, "error": "invalid content-length"})
                return

            raw = self.rfile.read(length)
            try:
                payload = json.loads(raw.decode("utf-8"))
            except json.JSONDecodeError:
                _json_response(self, HTTPStatus.BAD_REQUEST, {"ok": False, "error": "invalid JSON body"})
                return

            try:
                output = append_event(root_path, payload)
            except ValueError as exc:
                print(
                    f"[read_chat_gui_logger] POST /events reject: {exc} payload_keys={list(payload) if isinstance(payload, dict) else type(payload)}",
                    flush=True,
                )
                _json_response(self, HTTPStatus.BAD_REQUEST, {"ok": False, "error": str(exc)})
                return
            except Exception as exc:  # pragma: no cover
                print(f"[read_chat_gui_logger] POST /events error: {exc}", flush=True)
                _json_response(self, HTTPStatus.INTERNAL_SERVER_ERROR, {"ok": False, "error": str(exc)})
                return

            site = payload.get("site") if isinstance(payload, dict) else None
            role = payload.get("role") if isinstance(payload, dict) else None
            text = payload.get("text") if isinstance(payload, dict) else None
            text_len = len(text) if isinstance(text, str) else 0
            print(
                f"[read_chat_gui_logger] appended site={site!r} role={role!r} text_chars={text_len} -> {output}",
                flush=True,
            )

            _json_response(self, HTTPStatus.OK, {"ok": True, "path": str(output)})

    return Handler


def run_server(
    host: str | None = None,
    port: int | None = None,
    root_path: str | Path = PATH,
) -> int:
    host = host if host is not None else str(_CFG.get("host") or "127.0.0.1")
    port = port if port is not None else int(_CFG.get("port") or 17842)
    server = ThreadingHTTPServer((host, port), make_handler(root_path))
    print(f"[read_chat_gui_logger] serving on http://{host}:{port} root={Path(root_path).expanduser()}")
    try:
        server.serve_forever(poll_interval=0.5)
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()
    return 0


def main(argv: list[str] | None = None) -> int:
    return run_server(root_path=PATH)


if __name__ == "__main__":
    raise SystemExit(main())
