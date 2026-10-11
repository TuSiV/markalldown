# MarkAllDown 2.0.1

Fixes the missing outer macOS application signature shared by 2.0.0. macOS bundles now use Tauri ad-hoc signing, with mandatory deep/strict signature verification for the app and explicit verification of the main executable and conversion sidecar after DMG installation. CI also inspects the previous released DMG and records quarantine/Gatekeeper assessments separately from runtime tests.

Includes Windows NSIS/MSI, Apple Silicon DMG and Intel DMG, with SHA256SUMS.txt. Conversion/OCR/export runtime tests remain required; redaction and restoration tests remain required.

Ad-hoc signing verifies bundle integrity but is not an Apple Developer ID signature or notarization. macOS may still require explicit approval in System Settings > Privacy & Security > Open Anyway. Successful direct executable startup does not establish browser/Finder first-launch acceptance. No system-wide Gatekeeper disablement is required or recommended.
