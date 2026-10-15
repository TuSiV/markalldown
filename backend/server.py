import os
import asyncio
import sys
import json
import io

if sys.stdout is None:
    sys.stdout = io.TextIOWrapper(open(os.devnull, 'wb'), encoding='utf-8')
if sys.stderr is None:
    sys.stderr = io.TextIOWrapper(open(os.devnull, 'wb'), encoding='utf-8')

# Frozen and development subprocesses enter here before importing the HTTP server.
if len(sys.argv) == 4 and sys.argv[1] == "--pdf-worker":
    from pdf_jobs import worker_main
    worker_main(sys.argv[2], sys.argv[3])
    raise SystemExit(0)

import shutil
import tempfile
import argparse
import logging
import secrets
from pathlib import Path
from typing import List, Dict, Any, Optional
from dataclasses import asdict

import uvicorn
from fastapi import FastAPI, UploadFile, File, Form, HTTPException, Request, Depends, Header
from fastapi.responses import FileResponse, JSONResponse
from fastapi.middleware.cors import CORSMiddleware

from converter import converter, ConversionError
from pdf_jobs import pdf_jobs, PdfError, PdfTimeout, PdfDisconnected, PdfPaused, JobMissing
from compression import archive_handler, ArchiveError
from exporter import exporter, ExportOptions
from cache import result_cache, CacheError


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


from redaction_api import router as privacy_router
app.include_router(privacy_router, dependencies=[Depends(require_token)])


@app.on_event("shutdown")
async def shutdown():
    await pdf_jobs.close()
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


@app.get("/api/conversions/{job_id}")
async def conversion_status(job_id: str, _: None = Depends(require_token)):
    try: return pdf_jobs.status(job_id)
    except JobMissing: raise HTTPException(status_code=404, detail='job_missing')


@app.post("/api/conversions/{job_id}/pause")
async def pause_conversion(job_id: str, _: None = Depends(require_token)):
    try: return await pdf_jobs.pause(job_id)
    except JobMissing: raise HTTPException(status_code=404, detail='job_missing')


@app.post("/api/conversions/{job_id}/discard")
async def discard_conversion(job_id: str, _: None = Depends(require_token)):
    await pdf_jobs.discard(job_id)
    return {"success": True}


async def conversion_response(operation, filename, locale):
    try:
        markdown, report = await operation
        if 'archive' in report:
            files = []
            for item in report['archive']:
                if item['success']:
                    text = item['text']; name = item['filename']
                    files.append({'filename':name, 'success':True, 'cachePath':result_cache.write(name, text), 'preview':result_cache.preview_of(text), 'charCount':len(text), **item['report']})
                else: files.append({'filename':item['filename'], 'success':False, 'error':item['error']})
            return JSONResponse({'success':True, 'filename':filename, 'is_archive':True, 'files':files})
        cache_path = result_cache.write(filename, markdown)
        return JSONResponse({'success':True, 'filename':filename, 'cachePath':cache_path, 'preview':result_cache.preview_of(markdown), 'charCount':len(markdown), **report})
    except PdfPaused:
        raise HTTPException(status_code=409, detail='conversion_paused')
    except PdfTimeout:
        raise HTTPException(status_code=408, detail=tr('实际转换超过 5 分钟，任务已停止；可重试，PDF 将复用已完成页。', 'Processing exceeded 5 minutes. The worker was stopped; retry reuses completed PDF pages.', locale))
    except PdfDisconnected:
        raise HTTPException(status_code=499, detail='Conversion client disconnected')
    except JobMissing:
        raise HTTPException(status_code=404, detail='job_missing')
    except (ConversionError, PdfError, ArchiveError) as error:
        raise HTTPException(status_code=422, detail=str(error))
    except Exception:
        logger.exception('Conversion error')
        raise HTTPException(status_code=500, detail=tr('转换失败，请查看日志', 'Conversion failed, see logs', locale))


@app.post("/api/conversions/{job_id}/resume")
async def resume_conversion(job_id: str, request: Request, locale: str = Depends(request_locale), _: None = Depends(require_token)):
    job = pdf_jobs.jobs.get(job_id)
    if not job: raise HTTPException(status_code=404, detail='job_missing')
    data = await request.json()
    concurrency = data.get('concurrency', 1)
    if not isinstance(concurrency, int) or not 1 <= concurrency <= 4: raise HTTPException(status_code=400, detail='Invalid concurrency')
    return await conversion_response(pdf_jobs.resume(job_id, request, concurrency), job.filename, locale)


@app.post("/api/convert")
async def convert_file(request: Request, file: UploadFile = File(...), relativePath: str = Form(default=""), jobId: str = Form(default=""), concurrency: int = Form(default=1), locale: str = Depends(request_locale), _: None = Depends(require_token)):
    if not 1 <= concurrency <= 4: raise HTTPException(status_code=400, detail='Invalid concurrency')
    if jobId and (len(jobId) > 64 or not all(c.isascii() and (c.isalnum() or c == '-') for c in jobId)):
        raise HTTPException(status_code=400, detail='Invalid conversion job ID')
    content = await file.read()
    filename = relativePath or file.filename or 'unknown'
    job_id = jobId or secrets.token_hex(16)
    try:
        return await conversion_response(pdf_jobs.convert(content, request, job_id, filename, concurrency), filename, locale)
    finally:
        # Legacy clients do not retain a job token and cannot resume a checkpoint.
        if not jobId: await pdf_jobs.discard(job_id)


async def _convert_archive(content: bytes, filename: str) -> JSONResponse:
    work_dir = tempfile.mkdtemp(prefix="archive_", dir=temp_dir)
    safe_name = Path(filename).name or "archive.bin"
    archive_path = os.path.join(work_dir, safe_name)
    extract_dir = os.path.join(work_dir, "extracted")

    try:
        os.makedirs(extract_dir, exist_ok=True)
        with open(archive_path, 'wb') as f:
            f.write(content)

        extracted_files = await asyncio.to_thread(archive_handler.extract, archive_path, extract_dir)

        results = []
        for file_path in extracted_files:
            if os.path.isfile(file_path):
                rel_path = os.path.relpath(file_path, extract_dir)
                try:
                    markdown, report = await asyncio.to_thread(converter.convert_report, file_path)
                    cache_path = result_cache.write(rel_path, markdown)
                    results.append({
                        "filename": rel_path,
                        "cachePath": cache_path,
                        "preview": result_cache.preview_of(markdown),
                        "charCount": len(markdown),
                        "success": True,
                        **report,
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
            # 优先读磁盘缓存全文；content 仅作无缓存时的回退
            content = None
            cache_path = item.get("cachePath") or ""
            if cache_path:
                try:
                    content = result_cache.read(cache_path)
                except CacheError as e:
                    raise HTTPException(status_code=400, detail=str(e))
            if content is None:
                content = item.get("content") or ""
            resolved.append({
                "name": item.get("name") or "untitled",
                "relativePath": item.get("relativePath") or item.get("name") or "untitled",
                "content": content,
            })

        logger.info(f"Exporting {len(resolved)} files")
        result_path = exporter.export(resolved, export_path, options)

        if data.get("returnPath") is True:
            return JSONResponse({"success": True, "path": result_path})

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
    parser.add_argument("--session-dir", default="", help="Desktop-owned temporary session folder")
    parser.add_argument("--token", type=str, default="", help="API token for local clients")
    args = parser.parse_args()

    if args.session_dir:
        pdf_jobs.configure_root(args.session_dir)
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
