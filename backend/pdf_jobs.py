"""One disposable PDF process at a time; a deadline never leaves a locked engine behind."""
import asyncio
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import time


class PdfError(Exception):
    pass


class PdfTimeout(Exception):
    pass


class PdfDisconnected(Exception):
    pass


def worker_main(source, result):
    # This entry point runs before server imports, including in the frozen sidecar.
    from converter import converter
    try:
        text, report = converter.convert_report(source)
        payload = {'text': text, 'report': report}
    except Exception as error:
        payload = {'error': str(error)}
    Path(result).write_text(json.dumps(payload, ensure_ascii=False), encoding='utf-8')


def worker_command(source, result):
    args = ['--pdf-worker', str(source), str(result)]
    if getattr(sys, 'frozen', False):
        return [sys.executable, *args]
    return [sys.executable, str(Path(__file__).with_name('server.py')), *args]


class PdfJobs:
    def __init__(self, timeout=300, command=worker_command):
        self.timeout = timeout
        self.command = command
        self._slot = asyncio.Semaphore(1)
        self.states = {}

    async def convert(self, content, request, job_id):
        if job_id in self.states:
            raise PdfError('重复的转换任务标识')
        self.states[job_id] = 'queued'
        task = asyncio.create_task(self._convert(content, job_id))
        try:
            while not task.done():
                if await request.is_disconnected():
                    raise PdfDisconnected()
                await asyncio.sleep(.1)
            return await task
        finally:
            if not task.done():
                task.cancel()
            try:
                await task
            except (asyncio.CancelledError, Exception):
                pass
            self.states.pop(job_id, None)

    async def _convert(self, content, job_id):
        async with self._slot:
            self.states[job_id] = 'running'
            with tempfile.TemporaryDirectory(prefix='mad_pdf_') as directory:
                source = Path(directory) / 'source.pdf'
                result = Path(directory) / 'result.json'
                await asyncio.to_thread(source.write_bytes, content)
                process = subprocess.Popen(
                    self.command(source, result), stdin=subprocess.DEVNULL,
                    stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
                    creationflags=subprocess.CREATE_NO_WINDOW if os.name == 'nt' else 0,
                )
                deadline = time.monotonic() + self.timeout
                try:
                    while process.poll() is None:
                        if time.monotonic() >= deadline:
                            raise PdfTimeout()
                        await asyncio.sleep(.1)
                    if process.returncode != 0 or not result.is_file():
                        raise PdfError('PDF 转换进程异常退出，请检查文件后重试')
                    payload = await asyncio.to_thread(lambda: json.loads(result.read_text(encoding='utf-8')))
                    if 'error' in payload:
                        raise PdfError(payload['error'])
                    return payload['text'], payload['report']
                finally:
                    # Reap before releasing the slot or deleting files (also required on Windows).
                    if process.poll() is None:
                        process.terminate()
                        try:
                            await asyncio.to_thread(process.wait, timeout=2)
                        except subprocess.TimeoutExpired:
                            process.kill()
                            await asyncio.to_thread(process.wait)
                    else:
                        process.wait()


pdf_jobs = PdfJobs()
