#!/usr/bin/env python3
"""Measure packaged service readiness; repeated starts are not OS-cold starts."""
import argparse
import json
import os
from pathlib import Path
import secrets
import socket
import statistics
import subprocess
import tempfile
import time
from urllib.request import Request, urlopen
import psutil


def sample(executable):
    with socket.socket() as sock:
        sock.bind(('127.0.0.1', 0))
        port = sock.getsockname()[1]
    token = secrets.token_hex(32)
    with tempfile.TemporaryDirectory(prefix='markalldown-session-') as directory:
        env = os.environ.copy()
        env['MAD_STARTUP_LOG'] = str(Path(directory)/'timings.jsonl')
        started = time.perf_counter()
        output = open(Path(directory)/'loader.log', 'w+', encoding='utf-8')
        process = subprocess.Popen([str(executable), '--port', str(port), '--token', token, '--session-dir', directory], env=env, stdout=output, stderr=subprocess.STDOUT)
        try:
            deadline = time.monotonic() + 120
            while time.monotonic() < deadline:
                if process.poll() is not None:
                    output.flush()
                    output.seek(0)
                    raise RuntimeError('Packaged service exited before readiness: ' + output.read()[-4000:])
                try:
                    request = Request(f'http://127.0.0.1:{port}/api/startup', headers={'X-API-Token': token})
                    with urlopen(request, timeout=0.5) as response:
                        stages = json.load(response)['stages']
                    return {'readyMs': round((time.perf_counter()-started)*1000, 2), 'stages': stages}
                except (OSError, ValueError, KeyError):
                    time.sleep(0.05)
            raise RuntimeError('Packaged service startup timed out')
        finally:
            try:
                children = psutil.Process(process.pid).children(recursive=True)
            except psutil.NoSuchProcess:
                children = []
            for child in children:
                try: child.kill()
                except psutil.NoSuchProcess: pass
            process.kill()
            process.wait(timeout=10)
            psutil.wait_procs(children, timeout=10)
            output.close()


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('executable')
    parser.add_argument('--runs', type=int, default=5)
    parser.add_argument('--output', required=True)
    args = parser.parse_args()
    if args.runs < 1: parser.error('--runs must be positive')
    samples = [sample(Path(args.executable).resolve()) for _ in range(args.runs)]
    values = sorted(item['readyMs'] for item in samples)
    report = {'mode':'repeated-process-starts-not-OS-cold', 'samples':samples, 'medianMs':statistics.median(values), 'maxMs':max(values)}
    Path(args.output).write_text(json.dumps(report, indent=2)+'\n', encoding='utf-8')
    print(json.dumps({'medianMs':report['medianMs'], 'maxMs':report['maxMs']}))

if __name__ == '__main__': main()
