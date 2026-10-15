"""Real child processes prove timeout/disconnect cleanup and queue recovery."""
import asyncio
from pathlib import Path
import subprocess
import sys
import unittest
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'backend'))
from pdf_jobs import PdfJobs, PdfTimeout, PdfDisconnected


class Client:
    disconnected = False
    async def is_disconnected(self):
        return self.disconnected


class PdfProcessTests(unittest.IsolatedAsyncioTestCase):
    def jobs(self, timeout, delay):
        self.processes = []
        self.paths = []
        def command(source, result):
            self.paths.append(source.parent)
            # A synthetic child performs a long native-like operation or emits a result.
            script = ('import pathlib,time,json,sys; time.sleep(float(sys.argv[1])); '
                      'pathlib.Path(sys.argv[2]).write_text(json.dumps({"text":"# recovered", "report":{"engine":"fixture"}}))')
            return [sys.executable, '-c', script, str(delay(source.read_bytes())), str(result)]
        return PdfJobs(timeout=timeout, command=command)

    async def wait_running(self, jobs, job_id):
        for _ in range(100):
            if jobs.states.get(job_id) == 'running' and self.paths:
                return
            await asyncio.sleep(.01)
        self.fail('Worker did not start')

    async def test_timeout_reaps_process_and_next_pdf_succeeds(self):
        jobs = self.jobs(.6, lambda data: 60 if data == b'slow' else 0)
        from unittest.mock import patch
        original = subprocess.Popen
        def launch(*args, **kw):
            child = original(*args, **kw); self.processes.append(child); return child
        with patch('pdf_jobs.subprocess.Popen', side_effect=launch):
            slow = asyncio.create_task(jobs.convert(b'slow', Client(), 'slow'))
            await self.wait_running(jobs, 'slow')
            next_pdf = asyncio.create_task(jobs.convert(b'fast', Client(), 'next'))
            await asyncio.sleep(.05); self.assertEqual(jobs.states['next'], 'queued')
            with self.assertRaises(PdfTimeout): await slow
            self.assertIsNotNone(self.processes[0].poll(), 'Timed-out process must be dead before returning')
            self.assertEqual((await next_pdf)[0], '# recovered')
        self.assertFalse(jobs.states)
        self.assertTrue(all(not path.exists() for path in self.paths))

    async def test_waiting_time_does_not_consume_the_processing_deadline(self):
        jobs = self.jobs(1.5, lambda data: 1)
        tasks = [asyncio.create_task(jobs.convert(b'pdf', Client(), str(i))) for i in range(3)]
        results = await asyncio.gather(*tasks)
        self.assertEqual(len(results), 3)
        self.assertFalse(jobs.states)

    async def test_disconnected_running_client_releases_the_slot(self):
        jobs = self.jobs(30, lambda data: 60 if data == b'slow' else 0)
        client = Client(); request = asyncio.create_task(jobs.convert(b'slow', client, 'gone'))
        await self.wait_running(jobs, 'gone'); client.disconnected = True
        with self.assertRaises(PdfDisconnected): await request
        self.assertEqual((await jobs.convert(b'fast', Client(), 'next'))[0], '# recovered')
        self.assertTrue(all(not path.exists() for path in self.paths))

    async def test_disconnected_queued_client_never_launches_a_process(self):
        jobs = self.jobs(30, lambda data: 60)
        first_client = Client(); first = asyncio.create_task(jobs.convert(b'one', first_client, 'first'))
        await self.wait_running(jobs, 'first')
        second_client = Client(); second_client.disconnected = True
        with self.assertRaises(PdfDisconnected): await jobs.convert(b'two', second_client, 'second')
        self.assertEqual(len(self.paths), 1)
        first.cancel()
        with self.assertRaises(asyncio.CancelledError): await first
        self.assertFalse(jobs.states)
        self.assertTrue(all(not path.exists() for path in self.paths))

    async def test_crashed_worker_does_not_block_the_next_file(self):
        jobs = self.jobs(2, lambda data: 0)
        jobs.command = lambda *_: [sys.executable, '-c', 'raise SystemExit(2)']
        from pdf_jobs import PdfError
        with self.assertRaises(PdfError): await jobs.convert(b'pdf', Client(), 'bad')
        self.assertFalse(jobs.states)

class PdfFrozenEntryTests(unittest.TestCase):
    def test_frozen_worker_uses_bundled_executable_not_system_python(self):
        from unittest.mock import patch
        from pdf_jobs import worker_command
        with patch.object(sys, 'frozen', True, create=True), patch.object(sys, 'executable', '/bundled/sidecar'):
            self.assertEqual(worker_command('source.pdf', 'result.json'), ['/bundled/sidecar', '--pdf-worker', 'source.pdf', 'result.json'])

    def test_worker_entry_exits_before_starting_http_server_even_without_console(self):
        import runpy
        from types import SimpleNamespace
        from unittest.mock import Mock, patch
        worker = Mock()
        with patch.dict(sys.modules, {'pdf_jobs':SimpleNamespace(worker_main=worker)}), patch.object(sys, 'argv', ['sidecar','--pdf-worker','source.pdf','result.json']), patch.object(sys, 'stdout', None), patch.object(sys, 'stderr', None):
            with self.assertRaises(SystemExit) as exited:
                runpy.run_path(str(Path(__file__).resolve().parents[1] / 'backend' / 'server.py'), run_name='__main__')
            sys.stdout.close(); sys.stderr.close()
        self.assertEqual(exited.exception.code, 0)
        worker.assert_called_once_with('source.pdf', 'result.json')
