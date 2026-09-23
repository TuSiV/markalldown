import os
import shutil
import zipfile
import tarfile
from pathlib import Path
from typing import List, Optional
import logging

logger = logging.getLogger(__name__)

class ArchiveHandler:
    SUPPORTED_EXTENSIONS = {
        '.zip': 'zip',
        '.rar': 'rar',
        '.7z': '7z',
        '.tar': 'tar',
        '.tar.gz': 'tar',
        '.tgz': 'tar',
        '.tar.bz2': 'tar',
        '.tbz2': 'tar',
        '.tar.xz': 'tar',
        '.txz': 'tar',
        '.gz': 'gzip',
        '.bz2': 'bzip2',
        '.xz': 'xz',
    }

    def is_archive(self, filename: str) -> bool:
        lower = filename.lower()
        for ext in self.SUPPORTED_EXTENSIONS:
            if lower.endswith(ext):
                return True
        return False

    def get_archive_type(self, filename: str) -> Optional[str]:
        lower = filename.lower()
        # Longest suffix first so .tar.gz wins over .gz
        for ext, archive_type in sorted(
            self.SUPPORTED_EXTENSIONS.items(), key=lambda kv: len(kv[0]), reverse=True
        ):
            if lower.endswith(ext):
                return archive_type
        return None

    def _safe_join(self, dest: str, member_name: str) -> str:
        dest_abs = os.path.abspath(dest)
        normalized = member_name.replace("\\", "/").lstrip("/")
        parts = [p for p in normalized.split("/") if p not in ("", ".", "..")]
        if not parts:
            raise ArchiveError(f"Unsafe path in archive: {member_name}")
        target = os.path.abspath(os.path.join(dest_abs, *parts))
        if target != dest_abs and not target.startswith(dest_abs + os.sep):
            raise ArchiveError(f"Unsafe path in archive: {member_name}")
        return target

    def extract(self, archive_path: str, dest_dir: str) -> List[str]:
        archive_type = self.get_archive_type(archive_path)

        if archive_type is None:
            raise ArchiveError(f"Unsupported archive type: {archive_path}")

        try:
            if archive_type == 'zip':
                return self._extract_zip(archive_path, dest_dir)
            elif archive_type == 'rar':
                return self._extract_rar(archive_path, dest_dir)
            elif archive_type == '7z':
                return self._extract_7z(archive_path, dest_dir)
            elif archive_type == 'tar':
                return self._extract_tar(archive_path, dest_dir)
            elif archive_type == 'gzip':
                return self._extract_gzip(archive_path, dest_dir)
            else:
                raise ArchiveError(f"Unsupported archive type: {archive_type}")
        except ArchiveError:
            raise
        except Exception as e:
            raise ArchiveError(f"Failed to extract {archive_path}: {str(e)}")

    def _extract_zip(self, path: str, dest: str) -> List[str]:
        extracted = []
        with zipfile.ZipFile(path, 'r') as zf:
            for member in zf.namelist():
                if member.endswith("/") or member.endswith("\\"):
                    continue
                target = self._safe_join(dest, member)
                os.makedirs(os.path.dirname(target), exist_ok=True)
                with zf.open(member) as src, open(target, 'wb') as out:
                    shutil.copyfileobj(src, out)
                extracted.append(target)
        return extracted

    def _extract_rar(self, path: str, dest: str) -> List[str]:
        try:
            import rarfile
            extracted = []
            with rarfile.RarFile(path) as rf:
                for member in rf.namelist():
                    if member.endswith("/"):
                        continue
                    target = self._safe_join(dest, member)
                    os.makedirs(os.path.dirname(target), exist_ok=True)
                    with rf.open(member) as src, open(target, 'wb') as out:
                        shutil.copyfileobj(src, out)
                    extracted.append(target)
            return extracted
        except ImportError:
            raise ArchiveError("RAR support requires rarfile package")

    def _extract_7z(self, path: str, dest: str) -> List[str]:
        try:
            import py7zr
            extracted = []
            with py7zr.SevenZipFile(path, 'r') as sz:
                names = sz.getnames()
                for name in names:
                    self._safe_join(dest, name)
                sz.extractall(dest)
                for name in names:
                    if name.endswith("/"):
                        continue
                    extracted.append(self._safe_join(dest, name))
            return [p for p in extracted if os.path.isfile(p)]
        except ImportError:
            raise ArchiveError("7z support requires py7zr package")

    def _extract_tar(self, path: str, dest: str) -> List[str]:
        extracted = []
        with tarfile.open(path) as tf:
            for member in tf.getmembers():
                if not member.isfile():
                    continue
                target = self._safe_join(dest, member.name)
                os.makedirs(os.path.dirname(target), exist_ok=True)
                src = tf.extractfile(member)
                if src is None:
                    continue
                with src, open(target, 'wb') as out:
                    shutil.copyfileobj(src, out)
                extracted.append(target)
        return extracted

    def _extract_gzip(self, path: str, dest: str) -> List[str]:
        import gzip
        output_name = Path(path).stem or "output"
        output_path = self._safe_join(dest, output_name)

        os.makedirs(os.path.dirname(output_path) or dest, exist_ok=True)
        with gzip.open(path, 'rb') as f_in:
            with open(output_path, 'wb') as f_out:
                f_out.write(f_in.read())

        return [output_path]

class ArchiveError(Exception):
    pass

archive_handler = ArchiveHandler()
