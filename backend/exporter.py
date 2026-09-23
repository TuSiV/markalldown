import os
import zipfile
from pathlib import Path
from typing import List, Dict
from dataclasses import dataclass
import logging

logger = logging.getLogger(__name__)

@dataclass
class ExportOptions:
    format: str = "individual"  # individual, combined, zip
    preserve_names: bool = True
    structure: str = "flat"  # flat, preserve

class Exporter:
    def export(
        self,
        files: List[Dict[str, str]],
        output_dir: str,
        options: ExportOptions
    ) -> str:
        os.makedirs(output_dir, exist_ok=True)

        if options.format == "zip":
            return self._export_zip(files, output_dir, options)
        elif options.format == "combined":
            return self._export_combined(files, output_dir, options)
        else:
            return self._export_individual(files, output_dir, options)

    def _get_file_path(self, file_data: Dict[str, str]) -> str:
        return file_data.get("relativePath") or file_data.get("name") or "untitled"

    def _safe_rel_parts(self, file_path: str) -> List[str]:
        normalized = file_path.replace("\\", "/")
        return [p for p in normalized.split("/") if p not in ("", ".", "..")]

    def _dest_path(self, output_dir: str, file_path: str, md_name: str, preserve_structure: bool) -> str:
        output_dir_abs = os.path.abspath(output_dir)
        parts = self._safe_rel_parts(file_path)
        if not parts:
            raise ValueError(f"Invalid file path: {file_path}")

        if preserve_structure and len(parts) > 1:
            rel_dir = parts[:-1]
            target = os.path.abspath(os.path.join(output_dir_abs, *rel_dir, md_name))
        else:
            target = os.path.abspath(os.path.join(output_dir_abs, md_name))

        if target != output_dir_abs and not target.startswith(output_dir_abs + os.sep):
            raise ValueError(f"Path escapes output directory: {file_path}")
        return target

    def _export_individual(
        self,
        files: List[Dict[str, str]],
        output_dir: str,
        options: ExportOptions
    ) -> str:
        for file_data in files:
            file_path = self._get_file_path(file_data)
            content = file_data["content"]

            md_name = self._get_md_name(file_path, options.preserve_names)
            dest_path = self._dest_path(output_dir, file_path, md_name, options.structure == "preserve")
            dest_path = self._handle_collision(dest_path)

            os.makedirs(os.path.dirname(dest_path), exist_ok=True)

            with open(dest_path, 'w', encoding='utf-8') as f:
                f.write(content)

        return output_dir

    def _export_combined(
        self,
        files: List[Dict[str, str]],
        output_dir: str,
        options: ExportOptions
    ) -> str:
        combined_content = []

        for file_data in files:
            file_path = self._get_file_path(file_data)
            content = file_data["content"]

            combined_content.append(f"# {file_path}\n\n{content}\n\n---\n")

        output_path = os.path.join(output_dir, "combined.md")
        output_path = self._handle_collision(output_path)

        with open(output_path, 'w', encoding='utf-8') as f:
            f.write("\n".join(combined_content))

        return output_path

    def _export_zip(
        self,
        files: List[Dict[str, str]],
        output_dir: str,
        options: ExportOptions
    ) -> str:
        zip_path = os.path.join(output_dir, "markitdown-export.zip")
        zip_path = self._handle_collision(zip_path)

        with zipfile.ZipFile(zip_path, 'w', zipfile.ZIP_DEFLATED) as zf:
            for file_data in files:
                file_path = self._get_file_path(file_data)
                content = file_data["content"]

                md_name = self._get_md_name(file_path, options.preserve_names)
                parts = self._safe_rel_parts(file_path)

                if options.structure == "preserve" and len(parts) > 1:
                    arcname = "/".join(parts[:-1] + [md_name])
                else:
                    arcname = md_name

                zf.writestr(arcname, content)

        return zip_path

    def _get_md_name(self, original_path: str, preserve: bool) -> str:
        name = Path(original_path.replace("\\", "/")).name or "untitled"
        if preserve:
            stem = Path(name).stem or name
            return f"{stem}.md"
        return f"{name}.md"

    def _handle_collision(self, path: str) -> str:
        if not os.path.exists(path):
            return path

        base, ext = os.path.splitext(path)
        counter = 1
        while os.path.exists(f"{base}_{counter}{ext}"):
            counter += 1

        return f"{base}_{counter}{ext}"

exporter = Exporter()
