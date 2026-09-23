import os
import tempfile
from pathlib import Path
from typing import Optional
from markitdown import MarkItDown

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

UNSUPPORTED_EXTENSIONS = {
    '.doc': '旧版 Word 格式(.doc)不支持，请转换为 .docx 格式后重试',
    '.ppt': '旧版 PowerPoint 格式(.ppt)不支持，请转换为 .pptx 格式后重试',
    '.rtf': 'RTF 格式暂不支持',
    '.odt': 'OpenDocument 格式暂不支持',
    '.pages': 'Apple Pages 格式暂不支持',
}

class Converter:
    def __init__(self):
        self._md: Optional[MarkItDown] = None

    @property
    def md(self) -> MarkItDown:
        if self._md is None:
            self._md = MarkItDown(enable_plugins=False)
        return self._md

    def check_format(self, filename: str) -> None:
        suffix = Path(filename).suffix.lower()

        if suffix in UNSUPPORTED_EXTENSIONS:
            raise ConversionError(UNSUPPORTED_EXTENSIONS[suffix])

        if suffix and suffix not in SUPPORTED_EXTENSIONS:
            raise ConversionError(f"不支持的文件格式: {suffix}")

    def convert_file(self, file_path: str) -> str:
        filename = Path(file_path).name
        self.check_format(filename)
        suffix = Path(file_path).suffix.lower()

        try:
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
            if "doc" in error_msg.lower() or "word" in error_msg.lower():
                raise ConversionError("转换失败: 该文件可能是旧版 .doc 格式，请转换为 .docx 后重试")
            raise ConversionError(f"转换失败: {error_msg}")

    def _convert_image(self, file_path: str, filename: str) -> str:
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
                return extracted
            raise ConversionError(str(e))

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
