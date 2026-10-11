# MarkAllDown 1.2.0 release candidate

Adds optional local Markdown redaction, per-file full review, encrypted recovery mappings and opt-in OpenAI-compatible AI suggestions. Original export remains available with an explicit confirmation while privacy mode is active.

Redacted export verifies recovery against the source hash, saves the encrypted vault separately, then publishes the output batch. Filenames are anonymous by default. Windows and both macOS architectures include the Python converter/OCR/cryptography service and are checked after installation with Python removed from the launched app's PATH.

This is a prerelease. macOS apps are unsigned/not notarized. Text masking does not scrub image pixels or guarantee identification of all sensitive information. Keep the recovery vault and password separately; see SECURITY.md for scope and limits.
