import os
import sys
import json
import shutil
import tempfile
import argparse
import logging
import io
import secrets
from pathlib import Path
from typing import List, Dict, Any, Optional
from dataclasses import asdict

import uvicorn
from fastapi import FastAPI, UploadFile, File, Form, HTTPException, Request, Depends, Header
from fastapi.responses import FileResponse, JSONResponse
from fastapi.middleware.cors import CORSMiddleware

from converter import converter, ConversionError
from compression import archive_handler, ArchiveError
from exporter import exporter, ExportOptions
from cache import result_cache, CacheError

if sys.stdout is None:
    sys.stdout = io.TextIOWrapper(open(os.devnull, 'wb'), encoding='utf-8')
if sys.stderr is None:
    sys.stderr = io.TextIOWrapper(open(os.devnull, 'wb'), encoding='utf-8')

log_dir = Path(os.environ.get("LOCALAPPDATA", os.path.expanduser("~"))) / "com.markalldown.app" / "logs"
log_dir.mkdir(parents=True, exist_ok=True)
log_file = log_dir / "server.log"

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    handlers=[logging.FileHandler(log_file, encoding='utf-8')]
)
logger = logging.getLogger(__name__)


def tr(zh: str, en: str, locale: str = "zh-CN") -> str:
    return en if (locale or "").lower().startswith("en") else zh


def request_locale(x_locale: Optional[str] = Header(default=None, alias="X-Locale")) -> str:
    return x_locale or "zh-CN"

# Always auth-protected; main() overrides with the token from the parent process.
API_TOKEN: str = secrets.token_urlsafe(32)

app = FastAPI(title="MarkAllDown Server")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://tauri.localhost", "http://localhost:1420", "http://localhost:5173", "tauri://localhost"],
    allow_credentials=False,
    allow_methods=["GET", "POST"],
    allow_headers=["Content-Type", "X-API-Token", "X-Locale"],
)

temp_dir = tempfile.mkdtemp(prefix="markitdown_")


def require_token(
    x_api_token: Optional[str] = Header(default=None, alias="X-API-Token"),
    locale: str = Depends(request_locale),
) -> None:
    if not x_api_token or not secrets.compare_digest(x_api_token, API_TOKEN):
        logger.warning("Auth failed: token missing or mismatch")
        raise HTTPException(status_code=401, detail=tr("未授权", "Unauthorized", locale))


@app.on_event("shutdown")
async def shutdown():
    try:
        shutil.rmtree(temp_dir, ignore_errors=True)
    except Exception:
        logger.exception("Failed to cleanup temp_dir")
    try:
        result_cache.clear()
    except Exception:
        logger.exception("Failed to clear result cache")


@app.get("/api/health")
async def health():
    return {"status": "ok"}


@app.get("/api/text")
async def read_cached_text(path: str, _: None = Depends(require_token)):
    try:
        content = result_cache.read(path)
        return JSONResponse({"success": True, "content": content})
    except CacheError as e:
        raise HTTPException(status_code=404, detail=str(e))


@app.post("/api/convert")
async def convert_file(
    file: UploadFile = File(...),
    relativePath: str = Form(default=""),
    locale: str = Depends(request_locale),
    _: None = Depends(require_token),
):
    try:
        content = await file.read()
        filename = relativePath if relativePath else (file.filename or "unknown")
        safe_name = Path(filename).name or file.filename or "unknown"

        if archive_handler.is_archive(safe_name):
            return await _convert_archive(content, safe_name)

        markdown = converter.convert_bytes(content, safe_name)
        cache_path = result_cache.write(safe_name, markdown)

        return JSONResponse({
            "success": True,
            "filename": filename,
            "cachePath": cache_path,
            "preview": result_cache.preview_of(markdown),
            "charCount": len(markdown),
        })

    except (ConversionError, ArchiveError) as e:
        raise HTTPException(status_code=422, detail=str(e))
    except Exception as e:
        logger.exception("Conversion error")
        raise HTTPException(status_code=500, detail=tr("转换失败，请查看日志", "Conversion failed, see logs", locale))


async def _convert_archive(content: bytes, filename: str) -> JSONResponse:
    work_dir = tempfile.mkdtemp(prefix="archive_", dir=temp_dir)
    safe_name = Path(filename).name or "archive.bin"
    archive_path = os.path.join(work_dir, safe_name)
    extract_dir = os.path.join(work_dir, "extracted")

    try:
        os.makedirs(extract_dir, exist_ok=True)
        with open(archive_path, 'wb') as f:
            f.write(content)

        extracted_files = archive_handler.extract(archive_path, extract_dir)

        results = []
        for file_path in extracted_files:
            if os.path.isfile(file_path):
                rel_path = os.path.relpath(file_path, extract_dir)
                try:
                    markdown = converter.convert_file(file_path)
                    cache_path = result_cache.write(rel_path, markdown)
                    results.append({
                        "filename": rel_path,
                        "cachePath": cache_path,
                        "preview": result_cache.preview_of(markdown),
                        "charCount": len(markdown),
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
            shutil.rmtree(work_dir, ignore_errors=True)
        except Exception:
            logger.exception("Failed to cleanup archive work dir")


@app.post("/api/export")
async def export_files(request: Request, locale: str = Depends(request_locale), _: None = Depends(require_token)):
    try:
        data = await request.json()
        files = data.get("files", [])
        if not isinstance(files, list):
            raise HTTPException(status_code=400, detail=tr("files 必须是数组", "files must be an array", locale))
        if len(files) > 5000:
            raise HTTPException(status_code=400, detail=tr("文件数量过多", "Too many files", locale))

        options_data = data.get("options", {})

        export_path = options_data.get("exportPath", "")

        if not export_path:
            raise HTTPException(status_code=400, detail=tr("请指定导出路径", "Export path is required", locale))

        export_path = os.path.abspath(export_path)
        if not os.path.exists(export_path):
            try:
                os.makedirs(export_path, exist_ok=True)
            except Exception as e:
                raise HTTPException(status_code=400, detail=tr(f"无法创建导出目录: {e}", f"Cannot create export folder: {e}", locale))

        options = ExportOptions(
            format=options_data.get("format", "individual"),
            preserve_names=options_data.get("preserveNames", True),
            structure=options_data.get("structure", "flat")
        )

        resolved = []
        for item in files:
            if not isinstance(item, dict):
                raise HTTPException(status_code=400, detail=tr("files 条目格式错误", "Invalid file entry", locale))
            content = item.get("content")
            if content is None or content == "":
                cache_path = item.get("cachePath") or ""
                if cache_path:
                    try:
                        content = result_cache.read(cache_path)
                    except CacheError as e:
                        raise HTTPException(status_code=400, detail=str(e))
                else:
                    content = ""
            resolved.append({
                "name": item.get("name") or "untitled",
                "relativePath": item.get("relativePath") or item.get("name") or "untitled",
                "content": content,
            })

        logger.info(f"Exporting {len(resolved)} files to {export_path}")
        result_path = exporter.export(resolved, export_path, options)

        if options.format == "zip" and os.path.isfile(result_path):
            return FileResponse(
                result_path,
                media_type="application/zip",
                filename="markitdown-export.zip"
            )

        return JSONResponse({
            "success": True,
            "path": result_path,
            "message": f"成功导出 {len(resolved)} 个文件"
        })

    except HTTPException:
        raise
    except Exception as e:
        logger.exception("Export error")
        raise HTTPException(status_code=500, detail=tr("导出失败，请查看日志", "Export failed, see logs", locale))


def main():
    global API_TOKEN
    parser = argparse.ArgumentParser(description="MarkAllDown Server")
    parser.add_argument("--port", type=int, default=18765, help="Port to listen on")
    parser.add_argument("--host", type=str, default="127.0.0.1", help="Host to bind to")
    parser.add_argument("--token", type=str, default="", help="API token for local clients")
    args = parser.parse_args()

    if args.token:
        API_TOKEN = args.token
    logger.info(f"Starting MarkAllDown server on {args.host}:{args.port}")
    uvicorn.run(
        app,
        host=args.host,
        port=args.port,
        log_level="warning",
        access_log=False
    )


if __name__ == "__main__":
    main()
