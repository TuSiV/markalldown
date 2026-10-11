"""Synthetic scanned PDF, long text and real local AI HTTP protocol acceptance."""
import io
import json
from pathlib import Path
import sys
import tempfile
import threading
import unittest
from http.server import BaseHTTPRequestHandler, HTTPServer
sys.path.insert(0, str(Path(__file__).resolve().parents[1]/'backend'))
from PIL import Image, ImageDraw, ImageFont
from reportlab.pdfgen.canvas import Canvas
from reportlab.lib.utils import ImageReader
from converter import converter
from redaction import redact_markdown, encrypt_mapping, restore_markdown
from redaction_api import _call_ai

class ExtendedAcceptanceTests(unittest.TestCase):
    def test_scanned_pdf_ocr_and_recovery(self):
        image=Image.new('RGB',(1600,700),'white')
        draw=ImageDraw.Draw(image)
        fonts=['/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf','C:/Windows/Fonts/arial.ttf','/System/Library/Fonts/Supplemental/Arial.ttf']
        font=next((ImageFont.truetype(f,64) for f in fonts if Path(f).exists()), ImageFont.load_default(size=64))
        draw.text((80,150),'Phone 13800138000',font=font,fill='black')
        draw.text((80,300),'abc@example.com',font=font,fill='black')
        with tempfile.TemporaryDirectory() as folder:
            pdf=Path(folder)/'scanned.pdf'
            c=Canvas(str(pdf),pagesize=(800,350));c.drawImage(ImageReader(image),0,0,width=800,height=350);c.save()
            content=converter.convert_file(str(pdf))
            self.assertIn('13800138000',content)
            masked,mapping,_=redact_markdown(content,{})
            self.assertNotIn('13800138000',masked)
            self.assertEqual(restore_markdown(masked,[encrypt_mapping(mapping,'secure test passphrase')],'secure test passphrase')[0],content)
    def test_long_document_with_markdown_structures(self):
        source=('# Long contract\n\n| Contact | Email |\n| --- | --- |\n| 13800138000 | abc@example.com |\n\n'
                '```text\nPhone: 13800138000\n```\n\n[Contact](mailto:abc@example.com)\n\n')*1000
        masked,mapping,stats=redact_markdown(source,{})
        self.assertNotIn('13800138000',masked)
        self.assertNotIn('abc@example.com',masked)
        self.assertEqual(masked.count('```'),source.count('```'))
        self.assertEqual(masked.count('|'),source.count('|'))
        self.assertEqual(restore_markdown(masked,[encrypt_mapping(mapping,'secure long doc password')],'secure long doc password')[0],source)
    def test_real_loopback_ai_protocol_filters_untrusted_results(self):
        received=[]
        class Handler(BaseHTTPRequestHandler):
            def log_message(self,*args):pass
            def do_POST(self):
                body=json.loads(self.rfile.read(int(self.headers['Content-Length'])))
                received.append((self.path,body))
                answer=json.dumps({'suggestions':[{'text':'Synthetic person','category':'person'}, {'text':'Invented unavailable person','category':'person'}, {'text':'Synthetic person','category':'person'}, {'text':'【MAD_fake】','category':'other'}]})
                raw=json.dumps({'choices':[{'message':{'content':answer}}]}).encode()
                self.send_response(200);self.send_header('Content-Type','application/json');self.send_header('Content-Length',str(len(raw)));self.end_headers();self.wfile.write(raw)
        server=HTTPServer(('127.0.0.1',0),Handler)
        thread=threading.Thread(target=server.serve_forever,daemon=True);thread.start()
        try:
            text='Synthetic person 【MAD_safe_PHONE_0001】'
            result=_call_ai(f'http://127.0.0.1:{server.server_port}/v1/chat/completions','synthetic-model','synthetic-key',text)
            self.assertEqual(result,[{'text':'Synthetic person','category':'person'}])
            self.assertEqual(received[0][1]['messages'][1]['content'],text)
        finally:server.shutdown();server.server_close();thread.join()
