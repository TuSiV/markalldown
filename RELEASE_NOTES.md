# MarkAllDown 1.1.1

Adds native macOS installers for Apple Silicon and Intel to the main-branch converter, alongside refreshed Windows NSIS/MSI installers. The conversion and OCR service is bundled; Python does not need to be installed separately.

Fixes platform-specific service discovery, updates the PyInstaller build specification and cross-platform build script, and aligns the development URL. Native CI verifies real Markdown conversion, image OCR, cached full-text export in individual/combined/ZIP modes, and authentication. It then installs/copies the bundles and launches the actual desktop app with system Python removed from PATH.

macOS apps are unsigned and not notarized. Windows NSIS and macOS DMG installation/startup are tested; MSI packaging is verified but MSI installation is not separately exercised. This main-branch release contains the existing conversion features; optional redaction and AI remain in the separate 2.0.0 feature release.
