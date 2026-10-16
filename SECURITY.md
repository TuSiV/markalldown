# Security and privacy

[Home](README.md) · [简体中文](README.zh-CN.md) · [Documentation](docs/README.md)

This document describes data handling and the limits of conversion, redaction, and recovery.

## Data flow

| Data / operation | Handling |
|---|---|
| Desktop conversion and OCR | Local service on loopback; sensitive API routes require the session token |
| Browser conversion and OCR | Local browser workers; app, engine, and model resources are downloaded from the deployment |
| Optional desktop AI | Off by default; explicit per-request consent sends masked text, up to 20,000 characters |
| Passwords and AI keys | UI session memory; not deliberately persisted |
| Desktop conversion cache | Plaintext; normal-exit cleanup, with possible crash remnants |
| Browser documents and mappings | Session memory, excluded from offline resource caches |
| Optional desktop recovery library | Encrypted packs persisted only on explicit request; separate from conversion-cache cleanup |

Offline support caches application resources, not user documents. Downloaded Markdown and recovery packs are files under the user's control.

## Redaction and export

1. Review each document's complete original and masked text.
2. Approve each file under the current rules and password.
3. Export masked text and keep the encrypted JSON recovery pack separately.

Desktop redacted export validates recovery against the original SHA-256, writes and reads back the separate encrypted pack, and publishes the staged export directory. ZIP does not contain the pack. Browser export requires downloading the pack and acknowledging it; the browser cannot prove that a download was saved successfully.

**Ordinary preview, copy, and export still use original text.** Automated replacement covers Markdown text, not image pixels, unidentified content, link targets, or source metadata. Operator approval is not proof that all sensitive information was removed.

## Encryption and recovery

| Component | Design |
|---|---|
| Encryption | AES-256-GCM with random salt and nonce |
| Key derivation | scrypt, N=16384, r=8, p=1; 32-byte key |
| Version-2 packs | Authenticated encrypted document metadata and export manifests |
| Association | Random document/processing IDs and embedded markers; independent of file path |
| Output | Reviewed Markdown saved to a new file, without overwriting an existing file |

Exact, edited/excerpt, and legacy inputs are distinguished. Edited or legacy content requires additional acknowledgement; arbitrary edits are not authenticated merely because placeholders can be restored. Wrong passwords, unknown placeholders, and invalid authenticated data are rejected.

Recovery restores converted Markdown, not original PDF/Office binaries. Losing all pack copies or the password prevents recovery. Removing markers and placeholders can prevent association; identifiers alone cannot restore values.

### Local recovery library

The library stores ciphertext packs and lookup metadata such as random IDs, counts, and timestamps. Original text, passwords, filenames, and content hashes are not stored as public lookup fields; document metadata remains in the encrypted manifest.

Removing a library entry deletes database records and lookup references, not external packs, backups, or securely erased storage blocks. POSIX directory/database modes are 700/600; these are not a Windows ACL guarantee.

## External AI requests

AI output is untrusted candidate text, must occur in the sent text, and is never executed. Suggestions require manual adoption. HTTPS is required except explicitly selected loopback HTTP; redirects are rejected. A configured endpoint may intentionally address a local service, so choose endpoints you trust.

Production third-party AI providers were not exercised by release acceptance; protocol checks use a deterministic local server.

## Resource and path controls

| Boundary | Current limit / behavior |
|---|---|
| Source redaction text | 5,000,000 characters per document |
| Recovery input / output | 8,000,000 / 32,000,000 characters |
| JSON requests | 10 MB |
| Desktop candidate matches | At most 20,000 |
| Export paths | Traversal, reserved Windows names, and escaping symlinks rejected |
| ZIP collisions | Renamed instead of silently overwritten |

Expansion is checked before recovery substitution. Plaintext caches are not encrypted by enabling redaction, and normal cleanup is not secure erasure.

## Distribution and evidence

Native acceptance exercises the bundled service, installed application, recovery, and local library. UI rendering uses clearly identified synthetic fixtures. macOS bundles require deep/strict signature checks, but ad-hoc signing does not establish Developer ID trust or notarization.

[Release evidence](docs/README.md#release-evidence) · [Build and verification](BUILDING.md)
