# -*- mode: python ; coding: utf-8 -*-

import sys
import os
from pathlib import Path
from PyInstaller.utils.hooks import collect_data_files, collect_submodules

block_cipher = None

# Get magika models path
import magika
magika_path = Path(magika.__file__).parent
magika_models = str(magika_path / "models")

# Keep runtime modules; do not ship dependency test suites and their runners.
def runtime_module(name):
    return not any(part in {'tests', 'testing', 'test'} for part in name.split('.'))

hidden_imports = []
hidden_imports += collect_submodules('markitdown', filter=runtime_module)
hidden_imports += collect_submodules('anydoc', filter=runtime_module)
hidden_imports += collect_submodules('pdfminer', filter=runtime_module)
hidden_imports += collect_submodules('pdfplumber', filter=runtime_module)
hidden_imports += collect_submodules('pandas', filter=runtime_module)
hidden_imports += collect_submodules('openpyxl', filter=runtime_module)
hidden_imports += collect_submodules('xlrd', filter=runtime_module)
hidden_imports += collect_submodules('mammoth', filter=runtime_module)
hidden_imports += collect_submodules('lxml', filter=runtime_module)
hidden_imports += collect_submodules('magika', filter=runtime_module)
hidden_imports += collect_submodules('beautifulsoup4', filter=runtime_module)
hidden_imports += collect_submodules('markdownify', filter=runtime_module)
hidden_imports += collect_submodules('charset_normalizer', filter=runtime_module)
hidden_imports += collect_submodules('defusedxml', filter=runtime_module)
hidden_imports += collect_submodules('rarfile', filter=runtime_module)
hidden_imports += collect_submodules('py7zr', filter=runtime_module)
hidden_imports += collect_submodules('uvicorn', filter=runtime_module)
hidden_imports += collect_submodules('fastapi', filter=runtime_module)
hidden_imports += collect_submodules('multipart', filter=runtime_module)
hidden_imports += collect_submodules('rapidocr_onnxruntime', filter=runtime_module)
hidden_imports += ['redaction', 'redaction_api', 'cryptography.hazmat.primitives.ciphers.aead']
# cache.py is a local module
hidden_imports += collect_submodules('pypdfium2', filter=runtime_module)
hidden_imports += collect_submodules('cv2', filter=runtime_module)
hidden_imports += collect_submodules('pyclipper', filter=runtime_module)
hidden_imports += collect_submodules('PIL', filter=runtime_module)
hidden_imports += ['cv2', 'pyclipper', 'PIL', 'PIL.Image', 'PIL.ImageDraw', 'PIL.ImageFont']

# Collect magika data files (models)
datas = []
datas += collect_data_files('magika')
datas += collect_data_files('rapidocr_onnxruntime')
datas += collect_data_files('pypdfium2')

a = Analysis(
    ['server.py'],
    pathex=[],
    binaries=[],
    datas=datas,
    hiddenimports=hidden_imports,
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=[
        'tkinter',
        'matplotlib',
        'scipy',
        'numpy.testing',
        'torch',
        'tensorflow',
    ],
    win_no_prefer_redirects=False,
    win_private_assemblies=False,
    cipher=block_cipher,
    noarchive=False,
)

pyz = PYZ(a.pure)

exe = EXE(
    pyz,
    a.scripts,
    [],
    exclude_binaries=True,
    name='markalldown-server',
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=False,
    upx_exclude=[],
    runtime_tmpdir=None,
    console=sys.platform != "win32",
    disable_windowed_traceback=False,
    argv_emulation=False,
    target_arch=None,
    codesign_identity=None,
    entitlements_file=None,
)


# Installed as a complete directory; no per-launch temporary extraction.
coll = COLLECT(exe, a.binaries, a.datas, strip=False, upx=False, name='markalldown-server')
