# Desktop startup changes

Base: `feature/local-web-conversion`, commit `e24ab88c35e203b3b5462e8863956bb48a08abc0`.

## Behavior

- PyInstaller now builds an `onedir` service. Tauri installs the entire environment under its resource directory at `runtime/`. The executable resolves its sibling `_internal` directory without extraction at every launch.
- The build script replaces its generated runtime directory as a unit. macOS Mach-O files are signed before Tauri seals the outer app. The bundle inspection script supports both the historical sidecar path and the new resource path.
- Basic API startup does not import MarkItDown, AnyDoc, ONNX Runtime, OpenCV or RapidOCR. Conversion workers load only the components needed for a task. ONNX telemetry disabling remains before conversion dependency initialization.
- Importing files is independent of backend readiness. The existing queue starts pending files when the connection becomes ready. A startup error leaves the workspace and files intact; retry restarts the service without reloading the page.
- Health checks use a 200 ms initial interval, backing off to 1 s, with the existing overall deadline and native child-exit checks. This implementation uses polling; process readiness event delivery is not implemented.
- The UI shows elapsed waiting time, a message after 15 seconds, and a retry action after failure; it does not display an invented percentage.

## Measurements

`service-startup.log` captures process output. `service-timings.jsonl` in the app log directory records only stage, elapsed time and PID. The native launcher records spawn duration. Python records entry, base imports, application readiness and component-load timings. Diagnostics do not transmit data and do not record document text, file names or credentials.

`GET /api/startup` requires the session token and returns Python stage timings. The public health endpoint remains compatible. `scripts/benchmark_startup.py` measures packaged process start to authenticated API readiness and reports five individual samples, median and maximum. The first sample is retained separately; the report explicitly does not claim OS-cold performance or a statistically meaningful P95 from five runs.

## Validation completed locally

- Frontend tests: 60 passed, including pre-readiness queue handling and startup failure/retry preserving selected files.
- TypeScript and Vite production build passed.
- Startup dependency-isolation tests: 2 passed, with heavy conversion dependencies blocked from importing.
- Conversion responsiveness/engine-isolation tests: 4 passed, with deterministic mocked conversion components.
- Redaction tests: 13 passed.
- Python compilation checks passed.
- PyInstaller successfully built the actual Linux x86_64 directory distribution.
- Packaged-service smoke passed with Python removed from PATH: old Office, text PDF, Markdown, OCR, PDF pause/resume/checkpoints, redaction/export/restoration and encrypted recovery library.
- Five packaged starts: median 520.27 ms, maximum 589.28 ms on this Linux host. These are service readiness measurements, not window rendering, first-task latency or Windows/macOS results.
- Copied the complete runtime into the configured Tauri staging directory, checked executable permission and dependencies, and measured five additional starts from that relocated directory.
- Windows and merged macOS configuration shapes passed the installed Tauri JSON schema (custom numeric/URI formats were not validated by the generic validator).

Raw synthetic timing evidence: `docs/desktop-startup-linux-acceptance.json`.

The complete Python suite was interrupted by automatic approval review after an outbound Microsoft telemetry request; that run is not a pass. The exact source and payload were not established. The engine-isolation test now injects a fake module rather than importing the real engine while mocking telemetry initialization, and the standalone engine benchmark explicitly disables ONNX telemetry. These edits do not establish that every dependency is free of outbound activity. The complete suite has not been rerun.

## Pending native acceptance

Windows x64, macOS arm64 and Intel installation, upgrades, actual executable permissions, signing, startup timings, first conversion, OCR, pause/resume and process cleanup still require native CI/target-machine results. This environment has no native Rust toolchain or Windows/macOS runner. No installer, release or performance improvement percentage is claimed.

The existing native workflow has been updated for directory paths and startup benchmark artifacts. It is manually dispatchable for the review branch; no release publication trigger is added.

Suggested provisional acceptance goals: interactive import UI within 2 seconds and basic service within 3 seconds on a defined reference machine. Measure system-cold and repeated launches separately. Compare first-task completion as well as startup, including text, Office, scanned PDF and old Office samples. Adjust goals after obtaining baseline data.

## Acceptance fixes

- Excluded dependency test-suite modules from PyInstaller collection.
- Corrected the benchmark session-directory prefix to satisfy the service's existing validation; loader failures now retain diagnostic output.
- Corrected workspace flex sizing so the startup banner does not push controls outside the available height, and used the existing macOS surface variables for dark appearance.
- The sidecar-only build no longer requires Rust merely to print its target name.

## Deliberately deferred

Conversion jobs currently use disposable subprocesses for cancellation and failure isolation. Warming OCR in the parent would not allow those workers to reuse its model. Persistent warm workers, readiness events, and native first-window instrumentation are deferred; they need separate lifecycle and cancellation validation. No background service is left running after application exit.
