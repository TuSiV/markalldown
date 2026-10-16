# Documentation

[English home](../README.en.md) · [中文首页](../README.md) · [Web app](https://markalldown-preview.ardentpeach129.chatgpt.site)

Current documentation describes the unified `main` source and the 3.0.0 stable release. Historical records are separated below.

## Start here

| Need | Document |
|---|---|
| Product overview and download | [English README](../README.en.md) / [中文 README](../README.md) |
| Changes, upgrade, and release assets | [Release notes](../RELEASE_NOTES.md) |
| Data flow, encryption, consent, and recovery limits | [Security and privacy](../SECURITY.md) |

## Build and implementation

| Need | Document |
|---|---|
| Development setup, native packaging, source checks | [Build guide](../BUILDING.md) |
| Browser engines, OCR, offline support, known limits | [Web implementation](LOCAL_WEB_IMPLEMENTATION.md) |
| Desktop readiness, lazy loading, diagnostics, measurement | [Startup guide](DESKTOP_STARTUP.md) |
| Fixture origins and licenses | [Test corpus notes](../tests/fixtures/local-engines/README.md) |

## Release evidence

| Record | Reference |
|---|---|
| Stable source | [bf0d481](https://github.com/TuSiV/markalldown/commit/bf0d48198f9afc30954f54850f7ccfac72ac04b9) |
| Native, UI, browser, and publication jobs | [3.0.0 acceptance run](https://github.com/TuSiV/markalldown/actions/runs/38850938759) |
| Installers and integrity checks | [3.0.0 release](https://github.com/TuSiV/markalldown/releases/tag/v3.0.0) |

That release run passed 94 backend and 64 frontend tests. Native installation, browser execution, and synthetic UI rendering establish different things; see the build guide and release notes for scope.

## Historical records

These are retained evidence, not current instructions or pending work.

| Snapshot | Purpose |
|---|---|
| [Original README](archive/README-development-history.md) | Previous append-only development record |
| [Startup development snapshot](archive/DESKTOP_STARTUP-development-history.md) | Original local measurements and implementation notes |
| [Web development snapshot](archive/LOCAL_WEB-development-history.md) | Original engine comparison and phased implementation record |
| [Linux startup data](desktop-startup-linux-acceptance.json) | Historical synthetic readiness measurements |
| [Engine benchmark data](local-engine-benchmark.json) | Historical per-document engine measurements |

## Documentation conventions

The root README defaults to Chinese and links to its English counterpart. Technical guides are maintained in English. Prefer stable release/commit references for evidence, label historical measurements, and keep user instructions separate from development history.
