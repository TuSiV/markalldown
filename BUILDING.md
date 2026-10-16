# Native desktop builds

Use Node.js 22.12+ (CI: 24), Python 3.12 and stable Rust on the target OS. Windows needs the Visual Studio C++ build tools/WebView2; macOS needs Xcode command line tools. Install backend and developer requirements, then run `python scripts/build.py`.

- Stable versions use NSIS/MSI Windows bundles; prereleases use NSIS because MSI rejects nonnumeric prerelease identifiers. `tauri.macos.conf.json` overrides bundles to APP/DMG for macOS.
- PyInstaller creates an `onedir` service with OCR, converter and cryptography dependencies. The entire directory is copied to `src-tauri/binaries/runtime/` and bundled as resources at `runtime/`. Never distribute only its executable.
- The desktop first locates `runtime/markalldown-server[.exe]` in the application resource directory; source checkout paths are only searched in debug builds. macOS Mach-O dependencies and the hardened service executable are signed before the outer app is sealed.
- CI builds Windows x64, macOS arm64 and macOS x64, runs source tests, exercises the frozen service, installs/copies the actual bundle, then launches the installed app and tests its service. The launched process PATH excludes installed Python, establishing that the packaged service is standalone.
- These checks exercise actual main-process and sidecar startup, conversion API logic and recovery workflow. They are not automated visual clicks of every desktop control. React interaction tests exercise review and consent state.
- Release upload runs only if all native jobs succeed. It creates the v2.1.0 release on the feature commit; main is untouched. macOS apps use ad-hoc signatures and are not Developer ID signed or notarized.
- The local AI protocol test uses a real loopback HTTP server with deterministic synthetic replies. A production model/provider requires its own endpoint, model and credentials. No third-party production AI verification is claimed.

Required source checks:

```bash
python -m pip install -r backend/requirements.txt -r backend/requirements-dev.txt
npm ci
python -m unittest discover -s tests -v
npm test
npm run build
npm audit
```

Frozen service check: `python scripts/smoke_service.py /path/to/markalldown-server[.exe]`.
Installed desktop check: `python scripts/smoke_desktop.py /path/to/main/executable`.

The installed DMG app must pass codesign deep/strict verification. Quarantined spctl assessments are recorded separately: ad-hoc signing does not imply Gatekeeper approval. Native process smoke alone is not browser/Finder first-launch acceptance.

Mac builds keep hardened runtime enabled. `src-tauri/Entitlements.plist` supplies
the library-validation exception required by the frozen Python loader and its
bundled ad-hoc signed libraries. Verify that entitlement on the **final bundled
sidecar**, after Tauri signing, with `scripts/check_macos_bundle.py`; testing only
`backend/dist` does not cover Tauri's re-signing step. No system security setting
needs to be changed.

The current desktop artwork is `src-tauri/icons/icon.png` (the document with M).
`python scripts/macos_icon.py` regenerates only `icon.icns` with 100 px of optical
padding on its 1024 px canvas. Pillow is required. `icon_source.png` is legacy
artwork and is not used by this generator.

The frozen-service and installed-desktop smoke checks also exercise version-2 export manifests, independent preview/save, and encrypted recovery library matching/removal. Unit tests verify old-pack compatibility, per-file batch recovery, modified-file acknowledgement, metadata tampering, non-overwrite saves and ciphertext-only persistence.


2.2.0 adds workspace/settings/preview interaction tests, bounded frontend conversion-queue coverage and backend concurrency/health plus shared-engine isolation checks. Native build smoke exercises the unchanged conversion/export/recovery endpoints and the rebuilt full application.



Startup measurement: `python scripts/benchmark_startup.py backend/dist/markalldown-server/markalldown-server[.exe] --runs 5 --output startup-benchmark.json`. This measures process launch to authenticated API readiness, not window rendering or true OS-cold starts. Native CI uploads one report per architecture. See `docs/DESKTOP_STARTUP.md` for pending acceptance criteria.
