# Desktop startup

[中文首页](../README.md) · [English](../README.en.md) · [Documentation](README.md)

This guide explains current startup behavior, diagnostics, and what the measurements establish.

## Startup behavior

| Stage | Implementation |
|---|---|
| Bundle launch | Tauri starts the complete directory-based Python runtime from application resources |
| Basic service readiness | Startup avoids importing heavy conversion/OCR engines |
| File selection | The UI accepts files before service readiness and retains them on startup failure |
| Conversion | Pending tasks run once ready; workers load the dependencies needed by their tasks |
| Retry | Restarts the service without reloading the page or clearing the selection |

The bundle contains `runtime/markalldown-server[.exe]` and its dependencies. macOS nested native files are signed before the outer application is sealed. Basic startup does not eagerly initialize MarkItDown, AnyDoc, ONNX Runtime, OpenCV, or RapidOCR.

Readiness uses polling, starting at 200 ms and backing off to 1 second, with the overall deadline and native child-exit checks. The UI shows elapsed time, a delayed-start message, and retry after failure. It does not claim a percentage of work completed.

## Diagnostics

| Record | Contents |
|---|---|
| `service-startup.log` | Process/loader output |
| `service-timings.jsonl` | Instrumented stages, elapsed times, and PID |
| Native application log | Service spawn timing |
| Authenticated `GET /api/startup` | Python startup-stage timings |

Instrumented timing records exclude document text, filenames, and credentials. General process output is a separate diagnostic stream; review logs before sharing.

`ORT_DISABLE_TELEMETRY=1` is set before ONNX initialization in runtime, build, test, and CI entrypoints. The Python disable call remains for older providers. Keep the environment setting before imports when changing entrypoints.

## Measure packaged readiness

```bash
python scripts/benchmark_startup.py /path/to/markalldown-server --runs 5 --output startup-benchmark.json
```

Use the packaged executable, including `.exe` on Windows. The script reports individual runs, first sample, median, and maximum.

| Measurement | Meaning |
|---|---|
| Process start → authenticated API ready | Bundled service readiness |
| First conversion / OCR | Separate engine/model-load and task latency |
| Window rendering | Requires separate UI instrumentation |
| OS-cold launch | Requires a defined machine/cache protocol |

Five repeated starts do not establish a meaningful P95 or an OS-cold performance claim. Moving dependencies to lazy loading can increase the first task's latency even when API readiness improves.

## Verified release state

Windows x64, Apple Silicon, and Intel native acceptance passed for [3.0.0](https://github.com/TuSiV/markalldown/actions/runs/38850938759), including installed-app/service checks and packaged startup reports. Native CI uploads per-platform measurements; UI tests also cover queuing before readiness and preserving files on retry.

Native smoke does not establish every Finder/browser first-launch path, physical-device behavior, or a before/after speedup percentage.

## Historical evidence

The earlier Linux five-run sample had a median of 520.27 ms and maximum of 589.28 ms. It measured service readiness on that development host, not Windows/macOS startup or first conversion.

[Raw Linux report](desktop-startup-linux-acceptance.json) · [Original development snapshot](archive/DESKTOP_STARTUP-development-history.md)

## Future measurement work

Persistent warm workers, readiness events, OS-cold comparisons, and native first-window timing require separate lifecycle and measurement work. Current conversion workers are disposable subprocesses; warming a model only in the parent would not make it shared by those workers.

[Build guide](../BUILDING.md) · [Security and privacy](../SECURITY.md)
