# Privacy boundary

- All privacy HTTP routes reuse the existing authenticated loopback API. AI is optional and requires per-request outbound consent.
- Vault encryption uses AES-256-GCM with random nonce/salt and scrypt. The password and API key remain in UI session memory and are not deliberately persisted.
- Redacted export requires per-document review, validates text recovery against the original SHA-256, saves and reads back a separate encrypted vault before publishing a staged export directory. ZIP never contains that vault.
- Invalid paths, traversal, reserved Windows names and symlinks escaping export directories are rejected. Duplicate ZIP entries are renamed rather than silently overwritten.
- Original cache contents remain plaintext. Normal shutdown clears cache; crash remnants are possible. POSIX permissions do not establish a Windows ACL guarantee.
- Only Markdown text is replaced. Image pixels, unidentified content and source metadata are outside the automated redaction guarantee. Reviewing a document is an operator decision, not proof that no sensitive text remains.
- AI suggestions are untrusted candidate strings, bounded and required to occur in the sent text. No model output is executed. HTTPS is required except explicitly selected local-loopback HTTP; redirects are rejected. Configured endpoints can intentionally address local services; use trusted endpoints.
- Restore permits edited/partial Markdown if all encountered placeholders have mappings. It does not authenticate unrelated edits to Markdown; the export path validates exact recovery before writing. Losing the vault/password prevents recovery.
- Target-platform desktop and PyInstaller smoke checks are release requirements. This local implementation is not an installer release.
