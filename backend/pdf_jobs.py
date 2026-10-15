"""Bounded disposable conversion workers with session-local pause/resume state."""
import asyncio
from dataclasses import dataclass
import hashlib
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
import time
import uuid

class PdfError(Exception): pass
class PdfTimeout(Exception): pass
class PdfDisconnected(Exception): pass
class PdfPaused(Exception): pass
class JobMissing(Exception): pass


def worker_main(source, result):
    from pdf_checkpoint import convert_pdf, atomic_json
    from compression import archive_handler
    try:
        if archive_handler.is_archive(str(source)):
            from converter import converter
            # Archives are restartable as a whole; direct PDFs support page checkpoints.
            with tempfile.TemporaryDirectory(prefix='archive_', dir=Path(result).parent) as directory:
                files = []
                for path in archive_handler.extract(str(source), directory):
                    if not Path(path).is_file(): continue
                    name = os.path.relpath(path, directory)
                    try:
                        text, report = converter.convert_report(path)
                        files.append({'filename':name, 'text':text, 'report':report, 'success':True})
                    except Exception as error:
                        files.append({'filename':name, 'error':str(error), 'success':False})
                payload = {'archive':files}
        else:
            if Path(source).suffix.lower() == '.pdf': text, report = convert_pdf(source, Path(result).parent)
            else:
                from converter import converter
                text, report = converter.convert_report(source)
            payload = {'text':text, 'report':report}
    except Exception as error:
        payload = {'error':str(error)}
    atomic_json(result, payload)


def worker_command(source, result):
    args = ['--pdf-worker', str(source), str(result)]
    return [sys.executable, *args] if getattr(sys, 'frozen', False) else [sys.executable, str(Path(__file__).with_name('server.py')), *args]

@dataclass
class Job:
    id: str
    directory: Path
    source: Path
    fingerprint: str
    filename: str = "source.pdf"
    state: str = 'queued'
    task: object = None

class PdfJobs:
    def __init__(self, timeout=300, command=worker_command):
        self.timeout = timeout
        self.command = command
        self.limit = 1
        self._condition = asyncio.Condition()
        self._running = set()
        self.states = {}  # Active states retained for the original status protocol.
        self.jobs = {}
        self.root = Path(tempfile.gettempdir()) / ('mad_jobs_' + uuid.uuid4().hex)

    def configure_root(self, directory):
        directory = Path(directory).resolve()
        if directory.parent != Path(tempfile.gettempdir()).resolve() or not directory.name.startswith('markalldown-session-'):
            raise ValueError('Invalid session directory')
        if self.jobs: raise ValueError('Cannot move active session')
        self.root = directory

    def status(self, job_id):
        job = self.jobs.get(job_id)
        if not job:
            if job_id in self.states: return {'state':self.states[job_id]}
            raise JobMissing()
        value = {'state':job.state, 'checkpoint':job.source.suffix.lower() == '.pdf'}
        try:
            progress = json.loads((job.directory / 'progress.json').read_text(encoding='utf-8'))
            value.update(progress)
        except (OSError, ValueError): pass
        return value

    async def convert(self, content, request, job_id, filename='source.pdf', concurrency=1):
        if job_id in self.jobs: raise PdfError('重复的转换任务标识')
        if len(self.jobs) >= 1000: raise PdfError('会话任务过多，请移除已完成任务后重试')
        self.root.mkdir(mode=0o700, parents=True, exist_ok=True)
        directory = Path(tempfile.mkdtemp(dir=self.root))
        suffix = ''.join(Path(filename).suffixes)[-32:]
        source = directory / ('source' + suffix)
        source.write_bytes(content)
        job = Job(job_id, directory, source, hashlib.sha256(content).hexdigest(), filename)
        self.jobs[job_id] = job
        return await self._start(job, request, concurrency)

    async def resume(self, job_id, request, concurrency=1):
        job = self.jobs.get(job_id)
        if not job: raise JobMissing()
        if job.state == 'done': return self._result(job)
        if job.task and not job.task.done(): raise PdfError('任务仍在运行，请等待暂缓完成')
        if not job.source.exists(): raise JobMissing()
        return await self._start(job, request, concurrency)

    async def _start(self, job, request, concurrency):
        self.limit = max(1, min(4, int(concurrency)))
        async with self._condition: self._condition.notify_all()
        job.state = self.states[job.id] = 'queued'
        task = job.task = asyncio.create_task(self._execute(job))
        try:
            while not task.done():
                if await request.is_disconnected():
                    await self.pause(job.id)
                    raise PdfDisconnected()
                await asyncio.sleep(.1)
            try:
                return await task
            except asyncio.CancelledError:
                raise PdfPaused() from None
        finally:
            if job.task is task:
                if not task.done(): await self.pause(job.id)
                self.states.pop(job.id, None)

    async def pause(self, job_id):
        job = self.jobs.get(job_id)
        if not job: raise JobMissing()
        if job.task and not job.task.done():
            job.state = 'pausing'
            job.task.cancel()
            try: await job.task
            except (asyncio.CancelledError, Exception): pass
            job.state = 'paused'
        return self.status(job_id)

    async def discard(self, job_id):
        if job_id not in self.jobs: return
        await self.pause(job_id)
        job = self.jobs.pop(job_id)
        shutil.rmtree(job.directory, ignore_errors=False)
        self.states.pop(job_id, None)

    async def close(self):
        for job_id in list(self.jobs): await self.discard(job_id)
        shutil.rmtree(self.root, ignore_errors=True)
        self._condition = asyncio.Condition()

    def _result(self, job):
        value = json.loads((job.directory / 'result.json').read_text(encoding='utf-8'))
        if 'error' in value: raise PdfError(value['error'])
        if 'archive' in value: return None, {'archive':value['archive']}
        return value['text'], value['report']

    async def _execute(self, job):
        acquired = False
        try:
            async with self._condition:
                await self._condition.wait_for(lambda: len(self._running) < self.limit)
                self._running.add(job.id); acquired = True
            job.state = self.states[job.id] = 'running'
            # CPU thread pools are bounded per process; total requested workers <= 4.
            threads = max(1, min(4, (os.cpu_count() or 2) // self.limit))
            environment = dict(os.environ, MAD_OCR_THREADS=str(threads), OMP_NUM_THREADS=str(threads), OPENBLAS_NUM_THREADS=str(threads), MKL_NUM_THREADS=str(threads))
            result = job.directory / 'result.json'
            result.unlink(missing_ok=True)
            process = subprocess.Popen(self.command(job.source, result), stdin=subprocess.DEVNULL, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, env=environment, creationflags=subprocess.CREATE_NO_WINDOW if os.name == 'nt' else 0)
            deadline = time.monotonic() + self.timeout
            try:
                while process.poll() is None:
                    if time.monotonic() >= deadline: raise PdfTimeout()
                    await asyncio.sleep(.1)
                if process.returncode != 0 or not result.is_file(): raise PdfError('转换进程异常退出，请重试')
                value = self._result(job)
                job.state = 'done'
                # Keep the final result for a completion/pause race, but remove source checkpoints.
                job.source.unlink(missing_ok=True)
                shutil.rmtree(job.directory / 'pages', ignore_errors=True)
                return value
            finally:
                if process.poll() is None:
                    process.terminate()
                    try: await asyncio.to_thread(process.wait, timeout=2)
                    except subprocess.TimeoutExpired:
                        process.kill(); await asyncio.to_thread(process.wait)
                else: process.wait()
        except asyncio.CancelledError:
            job.state = 'paused'
            raise
        except Exception:
            job.state = 'error'
            raise
        finally:
            self.states.pop(job.id, None)
            if acquired:
                async with self._condition:
                    self._running.discard(job.id); self._condition.notify_all()

pdf_jobs = PdfJobs()
