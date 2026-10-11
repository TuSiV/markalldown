# Native candidate builds

Use Node.js 22.12+ (CI: 24), Python 3.12 and stable Rust on the target OS. Windows needs the Visual Studio C++ build tools/WebView2; macOS needs Xcode command line tools. Install backend and developer requirements, then run `python scripts/build.py`.

- Stable versions use NSIS/MSI Windows bundles; prereleases use NSIS because MSI rejects nonnumeric prerelease identifiers. `tauri.macos.conf.json` overrides bundles to APP/DMG for macOS.
- PyInstaller creates a native service with OCR, converter and cryptography dependencies; its target-triple name is copied to Tauri `externalBin`.
- The desktop locates platform-specific service binaries beside the application or in resources. Source checkout paths are only searched in debug builds.
- CI builds Windows x64, macOS arm64 and macOS x64, runs source tests, exercises the frozen service, installs/copies the actual bundle, then launches the installed app and tests its service. The launched process PATH excludes installed Python, establishing that the packaged service is standalone.
- These checks exercise actual main-process and sidecar startup, conversion API logic and recovery workflow. They are not automated visual clicks of every desktop control. React interaction tests exercise review and consent state.
- Release upload runs only if all native jobs succeed. It creates a prerelease tag on the feature commit; main is untouched. Unsigned macOS candidates are not notarized.
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
