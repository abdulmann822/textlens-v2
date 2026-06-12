from fastapi import FastAPI, File, UploadFile, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
import uvicorn
import tempfile
import os
from pathlib import Path

from ocr_processor import OCRProcessor
from export_handler import ExportHandler

app = FastAPI(
    title="TextLens OCR API",
    version="2.0.0",
    description="High-accuracy OCR service"
)

# CORS — allow_credentials MUST be False when allow_origins=["*"]
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

processor = OCRProcessor()
exporter = ExportHandler()

UPLOAD_DIR = Path(tempfile.gettempdir()) / "ocr_uploads"
EXPORT_DIR = Path(tempfile.gettempdir()) / "ocr_exports"
UPLOAD_DIR.mkdir(exist_ok=True)
EXPORT_DIR.mkdir(exist_ok=True)

ALLOWED_TYPES = {
    "image/jpeg", "image/jpg", "image/png", "image/tiff",
    "image/bmp", "image/webp", "application/pdf"
}
MAX_FILE_SIZE = 50 * 1024 * 1024  # 50MB


@app.get("/")
async def root():
    return {"message": "TextLens OCR API v2.0 is running. Visit /docs for API docs."}


@app.get("/health")
async def health():
    return {"status": "ok", "message": "OCR service is running"}


@app.post("/api/ocr")
async def extract_text(file: UploadFile = File(...)):
    # Normalize content type (some browsers send image/jpg instead of image/jpeg)
    content_type = (file.content_type or "").lower().strip()
    if content_type == "image/jpg":
        content_type = "image/jpeg"

    if content_type not in ALLOWED_TYPES:
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported file type: {content_type}. Supported: JPEG, PNG, TIFF, BMP, WebP, PDF."
        )

    content = await file.read()
    if len(content) > MAX_FILE_SIZE:
        raise HTTPException(status_code=400, detail="File too large. Maximum 50MB allowed.")

    suffix = Path(file.filename or "upload").suffix.lower()
    if not suffix:
        # Guess suffix from content type
        ext_map = {
            "image/jpeg": ".jpg", "image/png": ".png",
            "image/tiff": ".tiff", "image/bmp": ".bmp",
            "image/webp": ".webp", "application/pdf": ".pdf"
        }
        suffix = ext_map.get(content_type, ".jpg")

    tmp_path = UPLOAD_DIR / f"upload_{os.urandom(8).hex()}{suffix}"

    try:
        with open(tmp_path, "wb") as f:
            f.write(content)

        is_pdf = content_type == "application/pdf" or suffix == ".pdf"

        if is_pdf:
            result = processor.process_pdf(str(tmp_path))
        else:
            result = processor.process_image(str(tmp_path))

        return JSONResponse(content=result)

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"OCR processing failed: {str(e)}")
    finally:
        try:
            if tmp_path.exists():
                tmp_path.unlink()
        except Exception:
            pass


@app.post("/api/export/{fmt}")
async def export_text(fmt: str, data: dict):
    if fmt not in ["txt", "pdf", "docx"]:
        raise HTTPException(status_code=400, detail="Invalid format. Use: txt, pdf, docx")

    text = data.get("text", "").strip()
    filename = data.get("filename", "extracted_text")

    if not text:
        raise HTTPException(status_code=400, detail="No text provided for export.")

    try:
        export_path = exporter.export(text, filename, fmt, str(EXPORT_DIR))
        media_types = {
            "txt": "text/plain",
            "pdf": "application/pdf",
            "docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
        }
        return FileResponse(
            path=export_path,
            filename=Path(export_path).name,
            media_type=media_types[fmt]
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Export failed: {str(e)}")


if __name__ == "__main__":
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
