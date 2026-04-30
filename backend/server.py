import os
import sys
import json
import shutil
import tempfile
import argparse
import logging
import io
from pathlib import Path
from typing import List, Dict, Any
from dataclasses import asdict

import uvicorn
from fastapi import FastAPI, UploadFile, File, Form, HTTPException, Request
from fastapi.responses import FileResponse, JSONResponse
from fastapi.middleware.cors import CORSMiddleware

from converter import converter, ConversionError
from compression import archive_handler, ArchiveError
from exporter import exporter, ExportOptions

if sys.stdout is None:
    sys.stdout = io.TextIOWrapper(open(os.devnull, 'wb'), encoding='utf-8')
if sys.stderr is None:
    sys.stderr = io.TextIOWrapper(open(os.devnull, 'wb'), encoding='utf-8')

log_dir = Path(os.environ.get("LOCALAPPDATA", os.path.expanduser("~"))) / "com.markitdown.app" / "logs"
log_dir.mkdir(parents=True, exist_ok=True)
log_file = log_dir / "server.log"

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    handlers=[logging.FileHandler(log_file, encoding='utf-8')]
)
logger = logging.getLogger(__name__)

app = FastAPI(title="MarkItDown Server")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

temp_dir = tempfile.mkdtemp(prefix="markitdown_")

@app.on_event("shutdown")
async def shutdown():
    try:
        shutil.rmtree(temp_dir, ignore_errors=True)
    except:
        pass

@app.get("/api/health")
async def health():
    return {"status": "ok"}

@app.post("/api/convert")
async def convert_file(
    file: UploadFile = File(...),
    relativePath: str = Form(default="")
):
    try:
        content = await file.read()
        filename = relativePath if relativePath else file.filename
        
        if archive_handler.is_archive(file.filename):
            return await _convert_archive(content, file.filename)
        
        markdown = converter.convert_bytes(content, file.filename)
        
        return JSONResponse({
            "success": True,
            "filename": filename,
            "markdown": markdown
        })
        
    except ConversionError as e:
        raise HTTPException(status_code=422, detail=str(e))
    except Exception as e:
        logger.exception("Conversion error")
        raise HTTPException(status_code=500, detail=str(e))

async def _convert_archive(content: bytes, filename: str) -> JSONResponse:
    archive_path = os.path.join(temp_dir, filename)
    
    try:
        with open(archive_path, 'wb') as f:
            f.write(content)
        
        extract_dir = os.path.join(temp_dir, filename + "_extracted")
        os.makedirs(extract_dir, exist_ok=True)
        
        extracted_files = archive_handler.extract(archive_path, extract_dir)
        
        results = []
        for file_path in extracted_files:
            if os.path.isfile(file_path):
                rel_path = os.path.relpath(file_path, extract_dir)
                try:
                    markdown = converter.convert_file(file_path)
                    results.append({
                        "filename": rel_path,
                        "markdown": markdown,
                        "success": True
                    })
                except ConversionError as e:
                    results.append({
                        "filename": rel_path,
                        "error": str(e),
                        "success": False
                    })
        
        return JSONResponse({
            "success": True,
            "filename": filename,
            "is_archive": True,
            "files": results
        })
        
    finally:
        try:
            if os.path.exists(extract_dir):
                shutil.rmtree(extract_dir, ignore_errors=True)
            if os.path.exists(archive_path):
                os.remove(archive_path)
        except:
            pass

@app.post("/api/export")
async def export_files(request: Request):
    try:
        data = await request.json()
        files = data.get("files", [])
        options_data = data.get("options", {})
        
        export_path = options_data.get("exportPath", "")
        
        if not export_path:
            raise HTTPException(status_code=400, detail="请指定导出路径")
        
        if not os.path.exists(export_path):
            try:
                os.makedirs(export_path, exist_ok=True)
            except Exception as e:
                raise HTTPException(status_code=400, detail=f"无法创建导出目录: {e}")
        
        options = ExportOptions(
            format=options_data.get("format", "individual"),
            preserve_names=options_data.get("preserveNames", True),
            structure=options_data.get("structure", "flat")
        )
        
        logger.info(f"Exporting {len(files)} files to {export_path}")
        result_path = exporter.export(files, export_path, options)
        
        if options.format == "zip" and os.path.isfile(result_path):
            return FileResponse(
                result_path,
                media_type="application/zip",
                filename="markitdown-export.zip"
            )
        
        return JSONResponse({
            "success": True,
            "path": result_path,
            "message": f"成功导出 {len(files)} 个文件"
        })
        
    except HTTPException:
        raise
    except Exception as e:
        logger.exception("Export error")
        raise HTTPException(status_code=500, detail=str(e))

def main():
    parser = argparse.ArgumentParser(description="MarkItDown Server")
    parser.add_argument("--port", type=int, default=18765, help="Port to listen on")
    parser.add_argument("--host", type=str, default="127.0.0.1", help="Host to bind to")
    args = parser.parse_args()
    
    logger.info(f"Starting MarkItDown server on {args.host}:{args.port}")
    uvicorn.run(
        app,
        host=args.host,
        port=args.port,
        log_level="warning",
        access_log=False
    )

if __name__ == "__main__":
    main()
