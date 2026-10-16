#!/usr/bin/env python3
"""Run synthetic backend tests with ONNX telemetry disabled before discovery."""
from pathlib import Path
import sys
import unittest

# Test discovery may import format-detection dependencies directly, before the
# production converter's lazy initializer. Disable telemetry at this boundary.
import onnxruntime
onnxruntime.disable_telemetry_events()

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT/'backend'))
suite = unittest.defaultTestLoader.discover(str(ROOT/'tests'))
result = unittest.TextTestRunner(verbosity=2).run(suite)
raise SystemExit(0 if result.wasSuccessful() else 1)
