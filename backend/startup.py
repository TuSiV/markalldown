"""Local stage timings only: no documents, paths, credentials or uploads."""
from contextlib import contextmanager
import json
import os
os.environ["ORT_DISABLE_TELEMETRY"] = "1"
import sys
import threading
import time

_started = time.perf_counter()
_stages = []
_lock = threading.Lock()


def record_stage(stage, elapsed_ms=None):
    item = {"stage": stage, "sinceEntryMs": round((time.perf_counter() - _started) * 1000, 2)}
    if elapsed_ms is not None:
        item["elapsedMs"] = round(elapsed_ms, 2)
    with _lock:
        _stages.append(item)
    line = json.dumps({"startup": item, "pid": os.getpid()})
    destination = os.environ.get("MAD_STARTUP_LOG")
    if destination:
        try:
            with open(destination, "a", encoding="utf-8") as stream:
                stream.write(line + "\n")
        except OSError:
            pass  # Diagnostic failures must never prevent conversion.
    elif sys.stderr is not None:
        print(line, file=sys.stderr, flush=True)


def snapshot():
    with _lock:
        return [dict(item) for item in _stages]


@contextmanager
def timed_stage(stage):
    started = time.perf_counter()
    try:
        yield
    finally:
        record_stage(stage, (time.perf_counter() - started) * 1000)
