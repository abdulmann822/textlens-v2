import cv2
import numpy as np
from PIL import Image, ExifTags
import easyocr
import fitz  # PyMuPDF
import os
import tempfile
from pathlib import Path
from typing import List, Dict, Any
import time

# Global EasyOCR reader — loaded once to avoid reload on every request
_reader = None


def get_reader() -> easyocr.Reader:
    global _reader
    if _reader is None:
        print("[OCR] Loading EasyOCR model (first time only)...")
        _reader = easyocr.Reader(["en"], gpu=False, verbose=False)
        print("[OCR] EasyOCR model loaded.")
    return _reader


class ImagePreprocessor:
    """Preprocesses images to improve OCR accuracy."""

    def preprocess(self, image_path: str) -> np.ndarray:
        """Full preprocessing pipeline. Returns grayscale numpy array."""
        img = self._load_image(image_path)
        img = self._auto_orient(image_path, img)
        gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
        gray = self._denoise(gray)
        gray = self._deskew(gray)
        gray = self._enhance_contrast(gray)
        gray = self._sharpen(gray)
        gray = self._binarize(gray)
        return gray

    def _load_image(self, image_path: str) -> np.ndarray:
        """Load image with fallback to PIL for exotic formats."""
        img = cv2.imread(image_path)
        if img is None:
            pil_img = Image.open(image_path).convert("RGB")
            img = cv2.cvtColor(np.array(pil_img), cv2.COLOR_RGB2BGR)
        return img

    def _auto_orient(self, image_path: str, img: np.ndarray) -> np.ndarray:
        """Fix EXIF orientation (common on phone photos)."""
        try:
            pil_img = Image.open(image_path)
            exif_data = pil_img._getexif() if hasattr(pil_img, "_getexif") else None
            if exif_data:
                orientation = exif_data.get(274)  # 274 = Orientation tag
                rotations = {3: 180, 6: 270, 8: 90}
                if orientation in rotations:
                    h, w = img.shape[:2]
                    M = cv2.getRotationMatrix2D((w // 2, h // 2), rotations[orientation], 1.0)
                    img = cv2.warpAffine(img, M, (w, h), flags=cv2.INTER_CUBIC,
                                         borderMode=cv2.BORDER_REPLICATE)
        except Exception:
            pass
        return img

    def _denoise(self, gray: np.ndarray) -> np.ndarray:
        return cv2.fastNlMeansDenoising(gray, h=10, templateWindowSize=7, searchWindowSize=21)

    def _deskew(self, gray: np.ndarray) -> np.ndarray:
        try:
            edges = cv2.Canny(gray, 50, 150, apertureSize=3)
            lines = cv2.HoughLines(edges, 1, np.pi / 180, threshold=100)
            if lines is None or len(lines) < 5:
                return gray
            angles = []
            for line in lines[:50]:
                rho, theta = line[0]
                angle = (theta * 180 / np.pi) - 90
                if -45 <= angle <= 45:
                    angles.append(angle)
            if not angles:
                return gray
            median_angle = float(np.median(angles))
            if abs(median_angle) < 0.5:
                return gray
            h, w = gray.shape
            M = cv2.getRotationMatrix2D((w // 2, h // 2), median_angle, 1.0)
            return cv2.warpAffine(gray, M, (w, h), flags=cv2.INTER_CUBIC,
                                   borderMode=cv2.BORDER_REPLICATE)
        except Exception:
            return gray

    def _enhance_contrast(self, gray: np.ndarray) -> np.ndarray:
        clahe = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8, 8))
        return clahe.apply(gray)

    def _sharpen(self, gray: np.ndarray) -> np.ndarray:
        kernel = np.array([[-1, -1, -1],
                           [-1,  9, -1],
                           [-1, -1, -1]])
        return cv2.filter2D(gray, -1, kernel)

    def _binarize(self, gray: np.ndarray) -> np.ndarray:
        return cv2.adaptiveThreshold(
            gray, 255,
            cv2.ADAPTIVE_THRESH_GAUSSIAN_C,
            cv2.THRESH_BINARY, 11, 2
        )


class OCRProcessor:
    """Main OCR processor for images and PDFs."""

    def __init__(self):
        self.preprocessor = ImagePreprocessor()

    def _run_ocr(self, image_path: str) -> tuple[str, float]:
        """Run EasyOCR on a preprocessed image. Returns (text, confidence)."""
        reader = get_reader()
        results = reader.readtext(image_path, detail=1, paragraph=True)
        if not results:
            return "", 0.0
        lines = [r[1] for r in results]
        confidences = [r[2] for r in results]
        text = "\n".join(lines)
        avg_conf = float(np.mean(confidences)) if confidences else 0.0
        return text, avg_conf

    def _preprocess_to_temp(self, source_path: str) -> str:
        """Preprocess image and save to a temp PNG. Returns temp path."""
        processed = self.preprocessor.preprocess(source_path)
        tmp = tempfile.NamedTemporaryFile(suffix=".png", delete=False)
        tmp.close()
        cv2.imwrite(tmp.name, processed)
        return tmp.name

    def process_image(self, image_path: str) -> Dict[str, Any]:
        """Process a single image file."""
        start = time.time()
        tmp_path = None
        try:
            tmp_path = self._preprocess_to_temp(image_path)
            text, confidence = self._run_ocr(tmp_path)
        finally:
            if tmp_path and os.path.exists(tmp_path):
                os.unlink(tmp_path)

        pil_img = Image.open(image_path)
        width, height = pil_img.size

        return {
            "text": text,
            "word_count": len(text.split()) if text else 0,
            "char_count": len(text),
            "confidence": round(confidence * 100, 1),
            "pages": 1,
            "processing_time": round(time.time() - start, 2),
            "file_info": {
                "width": width,
                "height": height,
                "format": pil_img.format or "Unknown",
            }
        }

    def process_pdf(self, pdf_path: str) -> Dict[str, Any]:
        """Process a PDF — uses native text extraction where possible, OCR for scanned pages."""
        start = time.time()
        all_text = []
        all_confidences = []

        doc = fitz.open(pdf_path)
        total_pages = len(doc)

        for page_num, page in enumerate(doc):
            native_text = page.get_text("text").strip()

            if len(native_text) > 50:
                # Text-based PDF page — no OCR needed
                all_text.append(f"--- Page {page_num + 1} ---\n{native_text}")
                all_confidences.append(0.95)
            else:
                # Scanned page — render to image and OCR
                mat = fitz.Matrix(2.0, 2.0)
                pix = page.get_pixmap(matrix=mat)
                img_data = pix.tobytes("png")

                nparr = np.frombuffer(img_data, np.uint8)
                img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)

                raw_tmp = None
                proc_tmp = None
                try:
                    # Save raw page image
                    raw_tmp = tempfile.NamedTemporaryFile(suffix=".png", delete=False)
                    raw_tmp.close()
                    cv2.imwrite(raw_tmp.name, img)

                    # Preprocess
                    processed = self.preprocessor.preprocess(raw_tmp.name)
                    proc_tmp = tempfile.NamedTemporaryFile(suffix=".png", delete=False)
                    proc_tmp.close()
                    cv2.imwrite(proc_tmp.name, processed)

                    # OCR
                    page_text, conf = self._run_ocr(proc_tmp.name)
                    all_text.append(f"--- Page {page_num + 1} ---\n{page_text}")
                    all_confidences.append(conf)

                except Exception as e:
                    all_text.append(f"--- Page {page_num + 1} ---\n[Error reading page: {e}]")
                finally:
                    for p in [raw_tmp, proc_tmp]:
                        if p and os.path.exists(p.name):
                            try:
                                os.unlink(p.name)
                            except Exception:
                                pass

        doc.close()

        full_text = "\n\n".join(all_text)
        avg_confidence = float(np.mean(all_confidences)) if all_confidences else 0.95

        return {
            "text": full_text,
            "word_count": len(full_text.split()) if full_text else 0,
            "char_count": len(full_text),
            "confidence": round(avg_confidence * 100, 1),
            "pages": total_pages,
            "processing_time": round(time.time() - start, 2),
            "file_info": {
                "total_pages": total_pages,
                "format": "PDF",
            }
        }
