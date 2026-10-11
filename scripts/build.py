#!/usr/bin/env python3
"""Native cross-platform sidecar + Tauri build. Run on the target OS/architecture."""
import argparse
import os
from pathlib import Path
import platform
import shutil
import subprocess
import sys
ROOT = Path(__file__).resolve().parents[1]
BACKEND = ROOT / "backend"
def run(args, cwd=ROOT):
    subprocess.run(args, cwd=cwd, check=True)
def host_target():
    output = subprocess.check_output(["rustc", "-vV"], text=True)
    return next(line.removeprefix("host: ") for line in output.splitlines() if line.startswith("host: "))
def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--skip-install", action="store_true")
    parser.add_argument("--sidecar-only", action="store_true")
    args = parser.parse_args()
    if not args.skip_install:
        run([sys.executable,"-m","pip","install","-r",str(BACKEND/"requirements.txt"),"pyinstaller"])
    run([sys.executable,"-m","PyInstaller","markalldown_server.spec","--clean","--noconfirm","--distpath",str(BACKEND/"dist")], BACKEND)
    suffix = ".exe" if platform.system() == "Windows" else ""
    source = BACKEND/"dist"/("markalldown-server"+suffix)
    dest = ROOT/"src-tauri/binaries"/("markalldown-server-"+host_target()+suffix)
    dest.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(source,dest)
    if not args.sidecar_only:
        npm = "npm.cmd" if platform.system() == "Windows" else "npm"
        if not args.skip_install: run([npm,"ci"])
        run([npm,"run","tauri","--","build"])
    print("Native build completed for " + host_target())
if __name__ == "__main__": main()
