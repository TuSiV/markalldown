"""Session-local PDF page checkpoints. Only atomically committed pages are reused."""
import hashlib
import json
import math
import os
from pathlib import Path
import time


def atomic_json(path, value):
    path = Path(path)
    temporary = path.with_suffix(path.suffix + '.tmp')
    temporary.write_text(json.dumps(value, ensure_ascii=False), encoding='utf-8')
    os.replace(temporary, path)


def extract_page(document, index):
    from ocr import ocr_engine, PDF_MIN_TEXT_CHARS
    page = document[index]
    try:
        text_page = page.get_textpage()
        try:
            text = text_page.get_text_range().replace('\r\n', '\n').strip()
        finally:
            text_page.close()
        if len(text) >= PDF_MIN_TEXT_CHARS:
            return text, 'text'
        # Bound each render to 20 million pixels instead of scaling arbitrarily large pages.
        width, height = page.get_size()
        scale = min(2, math.sqrt(20_000_000 / max(1, width * height)))
        bitmap = page.render(scale=scale)
        try:
            import numpy as np
            image = bitmap.to_pil()
            try:
                recognized = ocr_engine.ocr_image_array(np.array(image)).strip()
            finally:
                image.close()
        finally:
            bitmap.close()
        if text and recognized and ''.join(text.split()) not in ''.join(recognized.split()):
            recognized = text + '\n\n<!-- OCR 补充 -->\n\n' + recognized
        return recognized or text or '*(本页未识别到文字)*', 'ocr'
    finally:
        page.close()


def page_digest(text, method):
    return hashlib.sha256((method + '\0' + text).encode()).hexdigest()


def convert_pdf(source, directory, extractor=None):
    import pypdfium2 as pdfium
    extractor = extractor or extract_page
    started = time.monotonic()
    directory = Path(directory); directory.mkdir(parents=True, exist_ok=True)
    pages_dir = directory / 'pages'; pages_dir.mkdir(exist_ok=True)
    with open(source, 'rb') as stream:
        source_hash = hashlib.file_digest(stream, 'sha256').hexdigest()
    document = pdfium.PdfDocument(source)
    try:
        total = len(document)
        identity = {'version':1, 'sourceHash':source_hash, 'total':total}
        metadata = directory / 'checkpoint.json'
        if metadata.exists() and json.loads(metadata.read_text(encoding='utf-8')) != identity:
            raise ValueError('PDF 与检查点不匹配，请重新导入文件')
        atomic_json(metadata, identity)
        saved = {}
        for index in range(total):
            try:
                item = json.loads((pages_dir / f'{index:06d}.json').read_text(encoding='utf-8'))
                if item['index'] == index and item['sourceHash'] == source_hash and item['method'] in ('text','ocr') and item['digest'] == page_digest(item['text'], item['method']):
                    saved[index] = item
            except (OSError, ValueError, KeyError, TypeError):
                pass  # An incomplete/corrupt page is recomputed, never silently reused.
        resumed = len(saved)
        def progress(current=None):
            atomic_json(directory / 'progress.json', {'completed':len(saved), 'total':total, 'current':current, 'resumed':resumed})
        progress()
        for index in range(total):
            if index in saved:
                continue
            progress(index + 1)
            text, method = extractor(document, index)
            item = {'index':index, 'sourceHash':source_hash, 'text':text, 'method':method, 'digest':page_digest(text, method)}
            atomic_json(pages_dir / f'{index:06d}.json', item)
            saved[index] = item
            progress()
        content = '\n\n---\n\n'.join(f'<!-- page {i + 1} -->\n\n{saved[i]["text"]}' for i in range(total))
        if not content.strip():
            raise ValueError('PDF 没有可转换的页面')
        used_ocr = any(item['method'] == 'ocr' for item in saved.values())
        return content, {'engine':'pdfium+rapidocr-checkpoint' if used_ocr else 'pdfium-pages', 'warnings':['PDF 按页提取；OCR 文字、金额及阅读顺序请对照原件检查。'] if used_ocr else [], 'elapsedMs':round((time.monotonic()-started)*1000), 'resumedPages':resumed, 'totalPages':total}
    finally:
        document.close()
