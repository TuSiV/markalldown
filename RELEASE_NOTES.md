# MarkAllDown 2.2.1

Completes the detailed A+B UI treatment beyond the workspace layout: file-type icons, status badges, import surfaces, button hierarchy, shared form controls and switch/segmented states, document typography, review highlights and original/masked comparison, recovery progress indicators, export option cards and persistent action area, and working settings tabs.

Redaction review has a three-column queue/document/summary workspace with detected-term highlights. All existing rule changes, full-document review gates, optional AI consent, encrypted recovery and per-file recovery remain intact. Detected terms are rendered as escaped text, never executable markup.

Adds browser rendering checks and screenshots for all five workspaces at 1440 and 800 pixels, including tab switching, sensitive highlights and review acknowledgement. Rendering uses explicitly synthetic service/dialog fixtures; backend and native smoke checks separately validate real service operations. Release requires UI rendering plus all three native platforms to pass.

Includes Windows NSIS/MSI and both macOS architectures. macOS bundles are ad-hoc signed and integrity-checked, without Apple Developer ID signing or notarization; first launch may require Privacy & Security > Open Anyway.
