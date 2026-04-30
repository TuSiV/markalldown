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

hidden_imports = []
hidden_imports += collect_submodules('markitdown')
hidden_imports += collect_submodules('pdfminer')
hidden_imports += collect_submodules('pdfplumber')
hidden_imports += collect_submodules('pandas')
hidden_imports += collect_submodules('openpyxl')
hidden_imports += collect_submodules('xlrd')
hidden_imports += collect_submodules('mammoth')
hidden_imports += collect_submodules('lxml')
hidden_imports += collect_submodules('magika')
hidden_imports += collect_submodules('beautifulsoup4')
hidden_imports += collect_submodules('markdownify')
hidden_imports += collect_submodules('charset_normalizer')
hidden_imports += collect_submodules('defusedxml')
hidden_imports += collect_submodules('rarfile')
hidden_imports += collect_submodules('py7zr')
hidden_imports += collect_submodules('uvicorn')
hidden_imports += collect_submodules('fastapi')
hidden_imports += collect_submodules('multipart')

# Collect magika data files (models)
datas = []
datas += collect_data_files('magika')

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
        'PIL',
        'cv2',
        'torch',
        'tensorflow',
    ],
    win_no_prefer_redirects=False,
    win_private_assemblies=False,
    cipher=block_cipher,
    noarchive=False,
)

pyz = PYZ(a.pure, a.zipped_data, cipher=block_cipher)

exe = EXE(
    pyz,
    a.scripts,
    a.binaries,
    a.zipfiles,
    a.datas,
    [],
    name='markitdown-server',
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=True,
    upx_exclude=[],
    runtime_tmpdir=None,
    console=False,
    disable_windowed_traceback=False,
    argv_emulation=False,
    target_arch=None,
    codesign_identity=None,
    entitlements_file=None,
)
