#!/usr/bin/env python3
"""Native cross-platform sidecar + Tauri build. Run on the target OS/architecture."""
import argparse
import json
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
def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--skip-install", action="store_true")
    parser.add_argument("--sidecar-only", action="store_true")
    parser.add_argument("--prerelease", action="store_true", default=os.environ.get("MAD_PRERELEASE") == "1")
    args = parser.parse_args()
    if not args.skip_install:
        run([sys.executable,"-m","pip","install","-r",str(BACKEND/"requirements.txt"),"pyinstaller"])
    run([sys.executable,"-m","PyInstaller","markalldown_server.spec","--clean","--noconfirm","--distpath",str(BACKEND/"dist")], BACKEND)
    suffix = ".exe" if platform.system() == "Windows" else ""
    source = BACKEND/"dist/markalldown-server"
    # Sign nested native dependencies before Tauri seals the outer .app.
    if platform.system() == "Darwin":
        macho = {b"\xfe\xed\xfa\xce", b"\xce\xfa\xed\xfe", b"\xfe\xed\xfa\xcf", b"\xcf\xfa\xed\xfe", b"\xca\xfe\xba\xbe", b"\xbe\xba\xfe\xca"}
        for path in sorted(source.rglob("*")):
            if path.is_symlink() or not path.is_file(): continue
            with path.open("rb") as stream: magic = stream.read(4)
            if magic in macho:
                run(["codesign", "--force", "--sign", "-", str(path)])
        run(["codesign", "--force", "--sign", "-", "--options", "runtime", "--entitlements", str(ROOT/"src-tauri/Entitlements.plist"), str(source/"markalldown-server")])
    dest = ROOT/"src-tauri/binaries/runtime"
    if dest.exists(): shutil.rmtree(dest)
    dest.parent.mkdir(parents=True, exist_ok=True)
    # Dereference PyInstaller symlinks so installer copying cannot strand targets.
    shutil.copytree(source, dest, symlinks=False)
    if not args.sidecar_only:
        npm = "npm.cmd" if platform.system() == "Windows" else "npm"
        if not args.skip_install: run([npm,"ci"])
        command = [npm,"run","tauri","--","build"]
        version = json.loads((ROOT/"package.json").read_text(encoding="utf-8"))["version"]
        if platform.system() == "Windows" and (args.prerelease or "-" in version):
            # MSI accepts only numeric prerelease components. Use NSIS for RC;
            # stable 2.0.0 retains both configured NSIS and MSI bundles.
            command += ["--bundles", "nsis"]
        run(command)
    print("Native build completed for " + platform.system() + " " + platform.machine())
if __name__ == "__main__": main()

