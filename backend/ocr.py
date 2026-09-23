import logging
from pathlib import Path
from typing import Optional

logger = logging.getLogger(__name__)

IMAGE_EXTENSIONS = {".jpg", ".jpeg", ".png", ".gif", ".bmp", ".tiff", ".tif", ".webp"}
PDF_EXTENSION = ".pdf"

# 少于此字符数视为“几乎没抽到文字”，对 PDF 触发 OCR
PDF_MIN_TEXT_CHARS = 20


class OcrError(Exception):
    pass


class OcrEngine:
    """中文优先 OCR（RapidOCR / PaddleOCR ONNX 模型）。"""

    def __init__(self):
        self._ocr = None

    @property
    def ocr(self):
        if self._ocr is None:
            try:
                from rapidocr_onnxruntime import RapidOCR
            except ImportError as e:
                raise OcrError(f"OCR 引擎未安装: {e}") from e
            self._ocr = RapidOCR()
        return self._ocr

    def ocr_image_file(self, image_path: str) -> str:
        try:
            result, _elapsed = self.ocr(image_path)
        except Exception as e:
            logger.exception("OCR image failed: %s", image_path)
            raise OcrError(f"OCR 识别失败: {e}") from e
        return self._format_result(result)

    def ocr_image_array(self, image) -> str:
        try:
            result, _elapsed = self.ocr(image)
        except Exception as e:
            logger.exception("OCR array failed")
            raise OcrError(f"OCR 识别失败: {e}") from e
        return self._format_result(result)

    def ocr_pdf_file(self, pdf_path: str) -> str:
        try:
            import pypdfium2 as pdfium
            import numpy as np
        except ImportError as e:
            raise OcrError(f"PDF 渲染组件未安装: {e}") from e

        try:
            doc = pdfium.PdfDocument(pdf_path)
        except Exception as e:
            raise OcrError(f"无法打开 PDF: {e}") from e

        pages = []
        try:
            for index in range(len(doc)):
                page = doc[index]
                # 2x 渲染，中文小字识别更稳
                bitmap = page.render(scale=2)
                pil = bitmap.to_pil()
                arr = np.array(pil)
                text = self.ocr_image_array(arr)
                pages.append(f"<!-- page {index + 1} -->\n\n{text}" if text else f"<!-- page {index + 1} -->\n\n*(本页未识别到文字)*")
                page.close()
                bitmap.close()
        finally:
            doc.close()

        return "\n\n---\n\n".join(pages)

    @staticmethod
    def _format_result(result) -> str:
        if not result:
            return ""
        lines = []
        for item in result:
            # RapidOCR: [box, text, score]
            if not item or len(item) < 2:
                continue
            text = str(item[1]).strip()
            if text:
                lines.append(text)
        return "\n\n".join(lines)


ocr_engine = OcrEngine()


def should_ocr_pdf(extracted_text: Optional[str]) -> bool:
    text = (extracted_text or "").strip()
    return len(text) < PDF_MIN_TEXT_CHARS
