import os
import shutil
import zipfile
from pathlib import Path
from typing import List, Dict, Any
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
        return file_data.get("relativePath", file_data["name"])
    
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
            
            if options.structure == "preserve" and "/" in file_path:
                rel_dir = os.path.dirname(file_path)
                dest_dir = os.path.join(output_dir, rel_dir)
                os.makedirs(dest_dir, exist_ok=True)
                dest_path = os.path.join(dest_dir, md_name)
            elif options.structure == "preserve" and "\\" in file_path:
                rel_dir = os.path.dirname(file_path)
                dest_dir = os.path.join(output_dir, rel_dir)
                os.makedirs(dest_dir, exist_ok=True)
                dest_path = os.path.join(dest_dir, md_name)
            else:
                dest_path = os.path.join(output_dir, md_name)
            
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
                
                if options.structure == "preserve" and ("/" in file_path or "\\" in file_path):
                    arcname = os.path.join(os.path.dirname(file_path), md_name)
                else:
                    arcname = md_name
                
                zf.writestr(arcname, content)
        
        return zip_path
    
    def _get_md_name(self, original_path: str, preserve: bool) -> str:
        if preserve:
            stem = Path(original_path).stem
            return f"{stem}.md"
        else:
            return f"{original_path}.md"
    
    def _handle_collision(self, path: str) -> str:
        if not os.path.exists(path):
            return path
        
        base, ext = os.path.splitext(path)
        counter = 1
        while os.path.exists(f"{base}_{counter}{ext}"):
            counter += 1
        
        return f"{base}_{counter}{ext}"

exporter = Exporter()
