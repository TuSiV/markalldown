import os
import threading
import tempfile
import time
from pathlib import Path
from typing import Optional
from markitdown import MarkItDown
import anydoc

# Modern formats keep their established MarkItDown path until corpus testing
# justifies switching. No hosted OCR option is ever passed to anydoc.
ANYDOC_EXTENSIONS = {'.doc', '.ppt', '.pps', '.pot', '.rtf', '.odt', '.ods', '.odp', '.xlsb'}

from ocr import (
    ocr_engine,
    should_ocr_pdf,
    IMAGE_EXTENSIONS,
    PDF_EXTENSION,
    OcrError,
)

SUPPORTED_EXTENSIONS = {
    '.pdf', '.docx', '.pptx', '.xlsx', '.xls',
    '.html', '.htm', '.csv', '.json', '.xml',
    '.txt', '.md', '.rst', '.tsv',
    '.jpg', '.jpeg', '.png', '.gif', '.bmp', '.tiff', '.webp',
    '.wav', '.mp3', '.ogg', '.flac',
    '.zip', '.epub',
    '.ipynb',
}
SUPPORTED_EXTENSIONS |= ANYDOC_EXTENSIONS

UNSUPPORTED_EXTENSIONS = {
    '.pages': 'Apple Pages 格式暂不支持',
}

class Converter:
    def __init__(self):
        self._local = threading.local()
        self._slots = threading.BoundedSemaphore(4)
        self._pdf_lock = threading.Lock()

    @property
    def md(self) -> MarkItDown:
        if not hasattr(self._local, "md"):
            self._local.md = MarkItDown(enable_plugins=False)
        return self._local.md

    def check_format(self, filename: str) -> None:
        suffix = Path(filename).suffix.lower()

        if suffix in UNSUPPORTED_EXTENSIONS:
            raise ConversionError(UNSUPPORTED_EXTENSIONS[suffix])

        if suffix and suffix not in SUPPORTED_EXTENSIONS:
            raise ConversionError(f"不支持的文件格式: {suffix}")

    def convert_file(self, file_path: str) -> str:
        with self._slots:
            if Path(file_path).suffix.lower() == PDF_EXTENSION:
                with self._pdf_lock:
                    return self._convert_file(file_path)
            return self._convert_file(file_path)

    def convert_report(self, value, filename=None):
        """Keep metadata in the same executor thread as the conversion."""
        start = time.perf_counter()
        self._local.report = {"engine": "markitdown", "warnings": []}
        text = self.convert_bytes(value, filename) if filename else self.convert_file(value)
        if not text.strip():
            raise ConversionError('未提取到正文，请检查原文件')
        report = dict(self._local.report)
        report['elapsedMs'] = round((time.perf_counter() - start) * 1000, 2)
        return text, report

    def _convert_file(self, file_path: str) -> str:
        filename = Path(file_path).name
        self.check_format(filename)
        suffix = Path(file_path).suffix.lower()

        try:
            if suffix in ANYDOC_EXTENSIONS:
                self._local.report = {"engine": "anydoc", "warnings": [
                    "旧格式正文已提取；复杂表格、图片和嵌入对象请对照原件检查。桌面此路径未导出图片资源，可使用浏览器版资源打包。"
                ]}
                text = anydoc.to_markdown(file_path)
                if not text.strip():
                    raise ConversionError('转换未提取到正文，请检查原文件')
                return text
            if suffix in IMAGE_EXTENSIONS:
                return self._convert_image(file_path, filename)

            text = self.md.convert(file_path).text_content

            if suffix == PDF_EXTENSION and should_ocr_pdf(text):
                return self._convert_scanned_pdf(file_path, text)

            return text
        except (ConversionError, OcrError):
            raise
        except Exception as e:
            error_msg = str(e)
            raise ConversionError(f"转换失败: {error_msg}")

    def _convert_image(self, file_path: str, filename: str) -> str:
        self._local.report = {"engine": "rapidocr", "warnings": ["OCR 文字、金额及表格请对照原件检查。"]}
        try:
            ocr_text = ocr_engine.ocr_image_file(file_path)
        except OcrError as e:
            raise ConversionError(str(e))

        if ocr_text.strip():
            return f"<!-- OCR: {filename} -->\n\n{ocr_text}"

        # 无文字时至少保留可引用的图片
        return f"![{filename}]({filename})\n\n*(未识别到文字)*"

    def _convert_scanned_pdf(self, file_path: str, extracted: str) -> str:
        try:
            ocr_text = ocr_engine.ocr_pdf_file(file_path)
        except OcrError as e:
            if extracted and extracted.strip():
                self._local.report = {"engine": "markitdown", "warnings": ["扫描页 OCR 失败，当前只保留可提取的文字；请检查原件。"]}
                return extracted
            raise ConversionError(str(e))

        self._local.report = {"engine": "markitdown+rapidocr", "warnings": ["PDF 已补充 OCR，阅读顺序及重复内容请对照原件检查。"]}
        if extracted and extracted.strip():
            return f"{extracted}\n\n---\n\n<!-- OCR 补充 -->\n\n{ocr_text}"
        return ocr_text

    def convert_bytes(self, content: bytes, filename: str) -> str:
        self.check_format(filename)

        suffix = Path(filename).suffix
        with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as tmp:
            tmp.write(content)
            tmp_path = tmp.name

        try:
            return self.convert_file(tmp_path)
        finally:
            try:
                os.unlink(tmp_path)
            except Exception:
                pass

class ConversionError(Exception):
    pass

converter = Converter()
