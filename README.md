# TextLens OCR v2

Extract text from images and PDFs using EasyOCR + FastAPI + Next.js.

---

## Requirements

| Tool    | Version  | Download |
|---------|----------|----------|
| Python  | 3.9+     | https://python.org |
| Node.js | 18+      | https://nodejs.org |

---

## Run on Windows

### Backend (Terminal 1)

```
cd textlens-v2\backend
start.bat
```

Or manually:
```
cd textlens-v2\backend
python -m venv venv
venv\Scripts\activate
pip install -r requirements.txt
python main.py
```

Backend runs at: http://localhost:8000  
Health check: http://localhost:8000/health  
API docs: http://localhost:8000/docs  

> First run downloads the EasyOCR model (~500 MB). This is one-time only.

---

### Frontend (Terminal 2)

```
cd textlens-v2\frontend
start.bat
```

Or manually:
```
cd textlens-v2\frontend
npm install
npm run dev
```

Frontend runs at: http://localhost:3000

---

## Both must run at the same time

Open **two separate terminal windows** — one for backend, one for frontend.

When both are running, open http://localhost:3000 and the header will show **"API Online"** in green.

---

## Supported file types

- Images: JPG, JPEG, PNG, TIFF, BMP, WebP
- Documents: PDF (text-based and scanned)
- Max size: 50 MB

## Export formats

- TXT — plain text
- PDF — formatted document
- DOCX — Microsoft Word
