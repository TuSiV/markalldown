# Browser and local conversion engines

[中文首页](../README.md) · [English](../README.en.md) · [Documentation](README.md)

[Try the browser app](https://tusiv.github.io/markalldown/) · [Build from source](../BUILDING.md)

The browser workspace is a separate build mode. It processes documents locally without connecting to the desktop Python service.

## Implementation map

| Area | Desktop | Browser |
|---|---|---|
| Conversion | Existing PDF/modern Office/OCR paths plus local AnyDoc legacy-text extraction | WASM worker with modern and legacy Office support |
| Legacy formats | DOC, PPT/PPS/POT, RTF, ODT/ODS/ODP, XLSB text extraction | Includes DOC/PPT/XLS/XLSB conversion |
| Embedded Office resources | New legacy path extracts text and reports omissions | Resources can accompany Markdown in ZIP |
| OCR / PDF | Bundled local Python OCR/PDF components | Same-origin Tesseract language resources and PDF.js |
| Recovery | Encrypted packs and optional local library | Independent pack import/export; desktop protocol interoperability |
| UI language | Desktop settings | Header English/Chinese switch; remembered where storage permits |

Browser tasks support cancellation, retry, size/time limits, and sequential processing. Desktop concurrency and PDF checkpoint behavior are separate features.

## OCR and PDF

The browser uses locally loaded English/Chinese OCR models. Mixed PDFs preserve text pages and OCR scanned pages in page order. OCR initialization can be cancelled; disabling required OCR produces an explicit error rather than an empty success.

| Default / bound | Browser behavior |
|---|---|
| File-size setting | Default 30 MB; configurable in settings |
| Task timeout | Default 120 seconds; configurable in settings |
| OCR | Bounded by page/image limits shown in the UI |
| Complex layout | Tables, merged cells, formulas, and page layout may lose structure |

Browser size/time setting changes apply to the next file. PDF images are not generally exported; Office resource extraction is a distinct path.

## Redaction and recovery

Rules, custom terms, allowlists, full-text review, and filename review precede masked download. Save the encrypted recovery pack and acknowledge it before downloading the masked text. The browser cannot verify that the download has actually reached storage.

Masked export contains Markdown only: original images and attachments are excluded, so resource links may no longer resolve. Recovery supports desktop pack interoperability, including legacy formats and authenticated version-2 manifests. Wrong passwords, invalid authentication, and unknown placeholders are rejected; edited files require acknowledgement and review.

[Encryption, consent, and recovery limits](../SECURITY.md)

## Offline resources and session data

| Resource | Lifecycle |
|---|---|
| App shell and conversion engine | Automatically cached |
| PDF/OCR resources | Prepared through the settings action |
| Completion marker | Written after all required resource preparation succeeds |
| Documents, plaintext mappings, passwords | Current page memory; not placed in resource caches |

Preparation reports resource progress and can be cancelled/retried. Browser cache eviction can remove offline support. Refreshing/closing clears session documents and passwords; download results and recovery packs first. Mobile access requires HTTPS, while localhost works for desktop development.

## Scope and limits

- No cloud AI or automatic local recovery library in the browser.
- No native iOS/Android app, system-share import registration, or print/PDF-output feature.
- Markdown conversion does not reproduce the original page layout or guarantee OCR accuracy.
- English/Chinese UI switching preserves tasks and content; it does not translate documents.
- The production browser app is hosted on GitHub Pages. The Pages workflow builds and verifies `/markalldown/` on pushes to `main` (documentation-only changes are skipped), then deploys after the browser checks pass. Failed checks leave the previous deployment intact.

## Verification

The [3.0.0 release run](https://github.com/TuSiV/markalldown/actions/runs/38850938759) passed actual browser conversion, local OCR, offline preparation/reopen, recovery interoperability, language, and responsive-layout checks. Synthetic mobile viewports are not physical iPhone Safari or Android acceptance.

Use the commands and interpreter settings in the [build guide](../BUILDING.md). CI uploads browser screenshots/check records and the `dist-web/` static bundle.

## Historical benchmarks

The original engine comparison used ten synthetic/open-source documents with five repeats per engine, excluding process launch/import time. RSS samples and package-directory sizes are development-host observations, not mobile memory guarantees, installer deltas, or completeness scores.

[Raw engine report](local-engine-benchmark.json) · [Original implementation and benchmark snapshot](archive/LOCAL_WEB-development-history.md)
