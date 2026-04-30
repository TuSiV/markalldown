import os
import tempfile
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
        for ext, archive_type in self.SUPPORTED_EXTENSIONS.items():
            if lower.endswith(ext):
                return archive_type
        return None
    
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
                if member.startswith('/') or '..' in member:
                    continue
                zf.extract(member, dest)
                extracted.append(os.path.join(dest, member))
        return extracted
    
    def _extract_rar(self, path: str, dest: str) -> List[str]:
        try:
            import rarfile
            extracted = []
            with rarfile.RarFile(path) as rf:
                for member in rf.namelist():
                    if member.startswith('/') or '..' in member:
                        continue
                    rf.extract(member, dest)
                    extracted.append(os.path.join(dest, member))
            return extracted
        except ImportError:
            raise ArchiveError("RAR support requires rarfile package")
    
    def _extract_7z(self, path: str, dest: str) -> List[str]:
        try:
            import py7zr
            extracted = []
            with py7zr.SevenZipFile(path, 'r') as sz:
                sz.extractall(dest)
                for name in sz.getnames():
                    extracted.append(os.path.join(dest, name))
            return extracted
        except ImportError:
            raise ArchiveError("7z support requires py7zr package")
    
    def _extract_tar(self, path: str, dest: str) -> List[str]:
        extracted = []
        with tarfile.open(path) as tf:
            for member in tf.getmembers():
                if member.name.startswith('/') or '..' in member.name:
                    continue
                tf.extract(member, dest, filter='data')
                extracted.append(os.path.join(dest, member.name))
        return extracted
    
    def _extract_gzip(self, path: str, dest: str) -> List[str]:
        import gzip
        output_name = Path(path).stem
        output_path = os.path.join(dest, output_name)
        
        with gzip.open(path, 'rb') as f_in:
            with open(output_path, 'wb') as f_out:
                f_out.write(f_in.read())
        
        return [output_path]

class ArchiveError(Exception):
    pass

archive_handler = ArchiveHandler()
