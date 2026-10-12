# MarkAllDown 2.2.0

Introduces a light A+B desktop workspace with persistent sidebar navigation and five independent pages: conversion, redaction review, recovery, export and settings. The layout adapts to smaller windows while keeping the same working actions.

Conversion has a queue and full Markdown preview with rendered/source modes. Review has a real file queue, pending/reviewed states, next-pending navigation, original comparison and existing per-file approval gates. Recovery provides explicit MD/JSON selection, encrypted library operations and authenticated preview before exclusive save. Export shows the actual batch, review count and successful output/recovery paths; original names remain the default.

Working settings include language, automatic preview, preview mode/font size, 1–4 concurrent conversions and export defaults. Only non-sensitive preferences persist. Concurrent requests use background workers with per-thread Markdown engines and shared OCR/PDF protection. Conversion no longer blocks service health requests.

No placeholder startup, updater, cache statistics, log-folder or OCR-mode controls are shipped. Failed full-text reads are labelled as excerpts and cannot be copied/downloaded as complete documents. Review/password data remains session-only; navigating workspaces retains the active session.

Includes Windows NSIS/MSI and both macOS architectures. macOS bundles are ad-hoc signed and integrity-checked, without Developer ID signing or notarization; first launch may require Privacy & Security > Open Anyway.
