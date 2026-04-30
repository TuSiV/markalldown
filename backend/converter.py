import os
import tempfile
from pathlib import Path
from typing import Optional
from markitdown import MarkItDown

SUPPORTED_EXTENSIONS = {
    '.pdf', '.docx', '.pptx', '.xlsx', '.xls',
    '.html', '.htm', '.csv', '.json', '.xml',
    '.txt', '.md', '.rst', '.tsv',
    '.jpg', '.jpeg', '.png', '.gif', '.bmp', '.tiff',
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
        
        try:
            result = self.md.convert(file_path)
            return result.text_content
        except ConversionError:
            raise
        except Exception as e:
            error_msg = str(e)
            if "doc" in error_msg.lower() or "word" in error_msg.lower():
                raise ConversionError(f"转换失败: 该文件可能是旧版 .doc 格式，请转换为 .docx 后重试")
            raise ConversionError(f"转换失败: {error_msg}")
    
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
            except:
                pass

class ConversionError(Exception):
    pass

converter = Converter()
