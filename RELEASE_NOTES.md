# MarkAllDown 2.1.0

Separates redaction review, export and file recovery into independent workspaces. Export saves already-reviewed masked text; recovery no longer requires conversion records or opening the export panel.

Adds random document/processing identities and authenticated encrypted version-2 batch recovery manifests. One JSON pack covers up to 100 documents and can restore any individual Markdown file, renamed copies, or combined exports. ZIP keeps mappings outside the shareable archive. Existing version-1 packs remain supported with a legacy integrity label.

Recovery previews the full restored document and distinguishes exact export matches from edited/excerpt and legacy input. Saving requires review; edited/legacy input requires additional acknowledgement, and existing files are never overwritten.

Adds an opt-in local encrypted recovery library with import, ID-based matching and removal. It keeps encrypted packs and opaque lookup metadata, never original document text or passwords. No export history is required for recovery.

Includes Windows NSIS/MSI and both macOS architectures. Native smoke checks exercise conversion/OCR, reviewed export, independent recovery and library persistence. macOS apps are ad-hoc signed with mandatory deep/strict validation but are not Developer ID signed or notarized; first launch may still need Privacy & Security > Open Anyway.
