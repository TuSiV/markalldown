import os
import re
import time
import uuid
import logging
from pathlib import Path
from typing import Optional

logger = logging.getLogger(__name__)

_SAFE_NAME = re.compile(r"[^A-Za-z0-9._-]+")


class CacheError(Exception):
    pass


class ResultCache:
    """转换结果磁盘缓存：写在本地隐藏目录，导出/预览时再读。"""

    def __init__(self, root: Optional[str] = None):
        base = Path(root) if root else (
            Path(os.environ.get("LOCALAPPDATA") or Path.home())
            / "com.markalldown.app"
            / "cache"
        )
        self.root = base
        self.root.mkdir(parents=True, exist_ok=True)
        os.chmod(self.root, 0o700)

    def _safe_name(self, filename: str) -> str:
        name = Path(filename.replace("\\", "/")).name or "untitled"
        name = _SAFE_NAME.sub("_", name)
        return name[:80] or "untitled"

    def write(self, filename: str, content: str) -> str:
        safe = self._safe_name(filename)
        if not safe.endswith(".md"):
            stem = Path(safe).stem or "untitled"
            safe = f"{stem}.md"
        unique = f"{uuid.uuid4().hex}.md"
        path = self.root / unique
        fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
        with os.fdopen(fd, "w", encoding="utf-8", newline="") as f:
            f.write(content)
        return str(path)

    def resolve(self, cache_path: str) -> Path:
        try:
            path = Path(cache_path).resolve()
        except Exception as e:
            raise CacheError(f"无效缓存路径: {e}") from e
        root = self.root.resolve()
        if path.parent != root and root not in path.parents:
            raise CacheError("缓存路径越界")
        if not path.is_file():
            raise CacheError("缓存文件不存在")
        return path

    def read(self, cache_path: str) -> str:
        try:
            return self.resolve(cache_path).read_text(encoding="utf-8")
        except CacheError:
            raise
        except Exception as e:
            raise CacheError(f"读取缓存失败: {e}") from e

    def clear(self) -> None:
        try:
            for item in self.root.glob("*"):
                try:
                    if item.is_file():
                        item.unlink()
                except Exception:
                    pass
        except Exception:
            logger.exception("Failed to clear cache")

    @staticmethod
    def preview_of(content: str, limit: int = 200) -> str:
        text = content.strip()
        if len(text) <= limit:
            return text
        return text[:limit] + "…"


result_cache = ResultCache()
