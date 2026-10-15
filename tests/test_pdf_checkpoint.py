import io
import json
from pathlib import Path
import sys
import tempfile
import unittest
from unittest.mock import patch
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'backend'))
from reportlab.pdfgen.canvas import Canvas
from pdf_checkpoint import convert_pdf, extract_page

class PageCheckpointTests(unittest.TestCase):
    def source(self, root, count=4, blank_last=False):
        source = Path(root) / 'source.pdf'; canvas = Canvas(str(source))
        for i in range(count):
            if not (blank_last and i == count-1): canvas.drawString(50, 800, f'Contract page {i+1}: amount 125000.50 contact 13800138000')
            canvas.showPage()
        canvas.save(); return source

    def test_resume_reuses_committed_pages_and_matches_uninterrupted_output(self):
        with tempfile.TemporaryDirectory() as root:
            source = self.source(root); checkpoint = Path(root) / 'checkpoint'; calls = []
            def interrupted(document, index):
                calls.append(index)
                if index == 2: raise RuntimeError('Interrupted during page')
                return extract_page(document, index)
            with self.assertRaises(RuntimeError): convert_pdf(source, checkpoint, interrupted)
            self.assertEqual(len(list((checkpoint/'pages').glob('*.json'))), 2)
            calls.clear()
            def resumed(document, index): calls.append(index); return extract_page(document, index)
            content, report = convert_pdf(source, checkpoint, resumed)
            self.assertEqual(calls, [2,3]); self.assertEqual(report['resumedPages'], 2)
            self.assertEqual(content, convert_pdf(source, Path(root)/'baseline')[0])
            self.assertEqual(json.loads((checkpoint/'progress.json').read_text())['completed'], 4)

    def test_mixed_pdf_extracts_text_and_ocr_per_page_and_reuses_both(self):
        with tempfile.TemporaryDirectory() as root:
            source = self.source(root, 2, blank_last=True); checkpoint = Path(root)/'checkpoint'
            with patch('ocr.ocr_engine.ocr_image_array', return_value='Scanned contract 13800138000') as recognize:
                content, report = convert_pdf(source, checkpoint)
                self.assertEqual(recognize.call_count, 1); self.assertIn('Scanned contract', content)
                self.assertIn('Contract page 1', content); self.assertEqual(report['totalPages'], 2)
            with patch('pdf_checkpoint.extract_page', side_effect=AssertionError('Cached pages must not be extracted')):
                self.assertEqual(convert_pdf(source, checkpoint)[0], content)

    def test_corrupt_page_is_recomputed_and_different_source_is_rejected(self):
        with tempfile.TemporaryDirectory() as root:
            source = self.source(root, 2); checkpoint = Path(root)/'checkpoint'
            original = convert_pdf(source, checkpoint)[0]
            page = checkpoint/'pages'/'000000.json'; value=json.loads(page.read_text());value['text']='tampered';page.write_text(json.dumps(value))
            calls=[]
            def extract(document,index): calls.append(index);return extract_page(document,index)
            self.assertEqual(convert_pdf(source,checkpoint,extract)[0],original);self.assertEqual(calls,[0])
            source.write_bytes(source.read_bytes()+b'\nchanged')
            with self.assertRaisesRegex(ValueError,'不匹配'): convert_pdf(source,checkpoint)

    def test_short_extractable_text_is_not_overwritten_by_conflicting_ocr(self):
        with tempfile.TemporaryDirectory() as root:
            source=Path(root)/'short.pdf'; canvas=Canvas(str(source)); canvas.drawString(40,800,'Amount 1250');canvas.save()
            with patch('ocr.ocr_engine.ocr_image_array',return_value='Amount 1750'):
                text,_=convert_pdf(source,Path(root)/'checkpoint')
            self.assertIn('Amount 1250',text)
            self.assertIn('<!-- OCR 补充 -->',text)
