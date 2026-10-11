#!/usr/bin/env python3
"""Launch the actual installed desktop app and verify its bundled service."""
import argparse
import os
from pathlib import Path
import subprocess
import time
import psutil
from smoke_service import request, exercise

def main():
    p=argparse.ArgumentParser();p.add_argument('executable');args=p.parse_args()
    exe=Path(args.executable).resolve()
    env=os.environ.copy();env['PATH']=str(Path(env.get('SystemRoot','C:/Windows'))/'System32') if os.name=='nt' else '/usr/bin:/bin'
    app=subprocess.Popen([str(exe)],cwd=exe.parent,env=env)
    parent=psutil.Process(app.pid)
    try:
        deadline=time.monotonic()+120
        while time.monotonic()<deadline:
            if app.poll() is not None:raise RuntimeError('Desktop app exited during startup')
            for child in parent.children(recursive=True):
                try:cmd=child.cmdline()
                except (psutil.NoSuchProcess,psutil.AccessDenied):continue
                if '--port' in cmd and '--token' in cmd:
                    port=int(cmd[cmd.index('--port')+1]);token=cmd[cmd.index('--token')+1]
                    try:request(port,token,'health')
                    except Exception:continue
                    exercise(port,token)
                    assert app.poll() is None
                    print('Actual desktop launch and bundled service passed')
                    return
            time.sleep(0.5)
        raise RuntimeError('Desktop bundled service did not become ready')
    finally:
        children=parent.children(recursive=True) if parent.is_running() else []
        for child in children:
            try:child.terminate()
            except psutil.NoSuchProcess:pass
        app.terminate()
        try:app.wait(timeout=10)
        except subprocess.TimeoutExpired:app.kill()
        psutil.wait_procs(children,timeout=10)
if __name__=='__main__':main()
