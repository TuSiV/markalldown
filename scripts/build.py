#!/usr/bin/env python3
"""Build script for MarkAllDown Desktop App"""

import os
import sys
import shutil
import subprocess
import platform
from pathlib import Path

ROOT_DIR = Path(__file__).parent.parent
BACKEND_DIR = ROOT_DIR / "backend"
TAURI_DIR = ROOT_DIR / "src-tauri"
BINARIES_DIR = TAURI_DIR / "binaries"

def get_target_triple():
    result = subprocess.run(
        ["rustc", "--print", "host-tuple"],
        capture_output=True,
        text=True
    )
    return result.stdout.strip()

def build_python_sidecar():
    print("Building Python sidecar...")
    os.chdir(BACKEND_DIR)
    
    subprocess.run([
        sys.executable, "-m", "pip", "install", "-r", "requirements.txt"
    ], check=True)
    
    subprocess.run([
        sys.executable, "-m", "pip", "install", "pyinstaller"
    ], check=True)
    
    subprocess.run([
        sys.executable, "-m", "PyInstaller",
        "markalldown_server.spec",
        "--clean",
        "--distpath", str(BACKEND_DIR / "dist"),
    ], check=True)
    
    print("Python sidecar built successfully!")

def prepare_sidecar():
    print("Preparing sidecar for Tauri...")
    target_triple = get_target_triple()
    print(f"Target triple: {target_triple}")
    
    BINARIES_DIR.mkdir(parents=True, exist_ok=True)
    
    if platform.system() == "Windows":
        src_name = "markalldown-server.exe"
        dst_name = f"markalldown-server-{target_triple}.exe"
    else:
        src_name = "markalldown-server"
        dst_name = f"markalldown-server-{target_triple}"
    
    src_path = BACKEND_DIR / "dist" / src_name
    dst_path = BINARIES_DIR / dst_name
    
    shutil.copy2(src_path, dst_path)
    print(f"Copied sidecar to: {dst_path}")

def build_tauri_app():
    print("Building Tauri application...")
    os.chdir(ROOT_DIR)
    
    subprocess.run(["npm", "install"], check=True)
    subprocess.run(["npx", "tauri", "build"], check=True)
    
    print("Tauri application built successfully!")

def main():
    print("=" * 50)
    print("Building MarkAllDown Desktop App")
    print("=" * 50)
    
    build_python_sidecar()
    prepare_sidecar()
    build_tauri_app()
    
    print("\n" + "=" * 50)
    print("Build completed!")
    print("=" * 50)
    
    bundle_dir = TAURI_DIR / "target" / "release" / "bundle"
    if bundle_dir.exists():
        print(f"\nOutput location: {bundle_dir}")
        for item in bundle_dir.rglob("*"):
            if item.is_file() and item.suffix in ['.msi', '.exe', '.dmg', '.deb']:
                print(f"  - {item}")

if __name__ == "__main__":
    main()
