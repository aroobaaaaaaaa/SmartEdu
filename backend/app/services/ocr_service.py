# app/services/ocr_service.py
# This module extracts text from PDF files (Typed, Tesseract OCR, or TrOCR for handwriting)

import os
import time
import logging
import re
import cv2
import numpy as np
from PIL import Image
import pytesseract
import fitz  # PyMuPDF

logger = logging.getLogger("smartedu.ocr")

pytesseract.pytesseract.tesseract_cmd = r"C:\Program Files\Tesseract-OCR\tesseract.exe"

# ── Config (env-overridable) ──────────────────────────────────────────
TROCR_MODEL_NAME = os.getenv("TROCR_MODEL", "microsoft/trocr-base-handwritten")
HANDWRITING_CONF_THRESHOLD = float(os.getenv("OCR_HANDWRITING_THRESHOLD", "55"))
ABSOLUTE_FAIL_THRESHOLD = float(os.getenv("OCR_FAIL_THRESHOLD", "15"))
TROCR_MAX_LINES_PER_PAGE = int(os.getenv("TROCR_MAX_LINES_PER_PAGE", "80"))  # safety cap

# ── Lazy TrOCR singleton — loaded once per worker process, not per request ──
_trocr_processor = None
_trocr_model = None


def _get_trocr():
    """
    Loads TrOCR once and reuses it for the lifetime of the process.
    Loading the model per-request would add several seconds of dead
    weight to every single OCR call, which on CPU is the difference
    between a usable pipeline and an unusable one.
    """
    global _trocr_processor, _trocr_model
    if _trocr_model is None:
        import torch
        from transformers import TrOCRProcessor, VisionEncoderDecoderModel

        torch.set_num_threads(os.cpu_count() or 4)
        logger.info("Loading TrOCR model '%s' (first use only)...", TROCR_MODEL_NAME)
        _trocr_processor = TrOCRProcessor.from_pretrained(TROCR_MODEL_NAME)
        _trocr_model = VisionEncoderDecoderModel.from_pretrained(TROCR_MODEL_NAME)
        _trocr_model.eval()
    return _trocr_processor, _trocr_model


def preprocess_image_for_ocr(pil_image: Image.Image) -> Image.Image:
    """
    Cleans up a scanned page image before OCR. Helps13:  meaningfully with
    scanned PRINTED text; helps only marginally with true handwriting,
    since the core problem there isn't image noise — it's that Tesseract
    was never trained to recognize handwritten letterforms at all.
    """
    img = np.array(pil_image.convert("L"))  # grayscale

    # Denoise — removes scan artifacts/specks that confuse character matching
    img = cv2.fastNlMeansDenoising(img, h=10)

    # Adaptive thresholding — converts to clean black/white, robust to
    # uneven lighting across a scanned page
    img = cv2.adaptiveThreshold(
        img, 255, cv2.ADAPTIVE_THRESH_GAUSSIAN_C, cv2.THRESH_BINARY, 31, 15
    )

    return Image.fromarray(img)


def _extract_line_crops_from_tesseract(page_image: Image.Image, ocr_data: dict) -> list[Image.Image]:
    """
    Groups Tesseract's per-word boxes into per-line boxes, then crops
    those lines from the ORIGINAL page image (not the binarized one —
    TrOCR was trained on natural grayscale strokes, and adaptive
    thresholding strips texture cues it relies on).
    """
    lines: dict[tuple, list[int]] = {}
    n = len(ocr_data["text"])
    for i in range(n):
        if not ocr_data["text"][i].strip() or int(ocr_data["conf"][i]) <= 0:
            continue
        key = (ocr_data["block_num"][i], ocr_data["par_num"][i], ocr_data["line_num"][i])
        x, y, w, h = (ocr_data["left"][i], ocr_data["top"][i],
                      ocr_data["width"][i], ocr_data["height"][i])
        box = lines.setdefault(key, [x, y, x + w, y + h])
        box[0], box[1] = min(box[0], x), min(box[1], y)
        box[2], box[3] = max(box[2], x + w), max(box[3], y + h)

    ordered = sorted(lines.values(), key=lambda b: b[1])  # top-to-bottom
    W, H = page_image.size
    pad = 8
    crops = []
    for x1, y1, x2, y2 in ordered[:TROCR_MAX_LINES_PER_PAGE]:
        box = (max(0, x1 - pad), max(0, y1 - pad), min(W, x2 + pad), min(H, y2 + pad))
        if box[2] > box[0] and box[3] > box[1]:
            crops.append(page_image.crop(box))
    return crops


def _extract_line_crops_by_projection(page_image: Image.Image) -> list[Image.Image]:
    """
    Fallback line splitter for when Tesseract detects zero word boxes
    at all (very faint handwriting / low contrast). Uses a horizontal
    ink-density projection instead of relying on Tesseract's layout
    analysis, so it works even when Tesseract sees nothing usable.
    """
    gray = np.array(page_image.convert("L"))
    ink = gray < 200
    row_density = ink.sum(axis=1)
    threshold = max(1, row_density.max() * 0.02)

    lines, in_line, start = [], False, 0
    for y, d in enumerate(row_density):
        if d > threshold and not in_line:
            in_line, start = True, y
        elif d <= threshold and in_line:
            in_line = False
            if y - start > 8:  # ignore noise slivers
                lines.append((start, y))
    if in_line:
        lines.append((start, len(row_density)))

    W = page_image.size[0]
    pad = 6
    return [
        page_image.crop((0, max(0, y1 - pad), W, min(page_image.size[1], y2 + pad)))
        for y1, y2 in lines[:TROCR_MAX_LINES_PER_PAGE]
    ]


def run_trocr_on_lines(line_crops: list[Image.Image]) -> tuple[str, float]:
    """
    Runs TrOCR on each line crop and returns (joined_text, avg_confidence_0_100).
    Confidence is a proxy derived from generation token probabilities.
    """
    import torch

    if not line_crops:
        return "", 0.0

    processor, model = _get_trocr()
    texts, confs = [], []

    for crop in line_crops:
        rgb = crop.convert("RGB")
        pixel_values = processor(images=rgb, return_tensors="pt").pixel_values
        with torch.no_grad():
            out = model.generate(
                pixel_values,
                max_length=128,
                no_repeat_ngram_size=3,
                repetition_penalty=1.2,
                output_scores=True,
                return_dict_in_generate=True,
            )
        text = processor.batch_decode(out.sequences, skip_special_tokens=True)[0].strip()
        
        # Clean up any runaway repetition loops (e.g. repeated digits/characters from notebook lines)
        text = re.sub(r"(.)\1{4,}", r"\1", text)
        text = re.sub(r"(\d{2,})\1{2,}", "", text).strip()
        if not text:
            continue

        # Proxy confidence: mean max-softmax-probability across generated tokens
        if out.scores:
            probs = [torch.softmax(s[0], dim=-1).max().item() for s in out.scores]
            confs.append((sum(probs) / len(probs)) * 100)
        texts.append(text)

    joined = "\n".join(texts)
    avg_conf = sum(confs) / len(confs) if confs else 0.0
    return joined, avg_conf


def _is_typed_text_page(page) -> bool:
    """
    Determines whether a PDF page contains a genuine, complete typed text layer
    vs a scanned image page with scanner app watermarks (e.g. CamScanner) or
    sparse OCR noise.
    """
    raw_text = page.get_text()
    if not raw_text or not raw_text.strip():
        return False

    images = page.get_images()
    # If the page has zero embedded raster images, it's a native digital PDF
    if not images:
        return True

    # If the page has raster images (scanned PDF), remove common mobile scanner watermarks/headers
    cleaned = re.sub(
        r"(?i)\b(camscanner|scanned by|scanned with|adobe scan|tapscanner|docscanner|genius scan|fastscanner|page\s+\d+)\b",
        "",
        raw_text,
    ).strip()

    # If remaining text has fewer than 100 characters or fewer than 20 words,
    # it is a scanned image page with watermarks or sparse text, NOT a typed document!
    words = cleaned.split()
    if len(cleaned) < 100 or len(words) < 20:
        return False

    return True


def extract_text_from_pdf(file_path: str) -> dict:
    """
    Returns:
    {
        "text": str,
        "method": "typed" | "ocr",             # backward-compatible coarse value
        "confidence": float | None,
        "low_confidence": bool,
        "ocr_engine_used": str | None,          # "tesseract" | "trocr" | "tesseract+trocr" | "tesseract_fallback"
        "extraction_status": str,                # "typed" | "ocr_ok" | "ocr_low_confidence" | "ocr_failed" | "no_text"
        "processing_time": float,                # seconds
    }
    """
    TESSERACT_CONFIG = "--oem 1 --psm 6"
    start = time.perf_counter()

    doc = fitz.open(file_path)
    full_text_parts = []
    used_ocr = False
    page_confidences = []
    engines_used = set()

    for page in doc:
        if _is_typed_text_page(page):
            full_text_parts.append(page.get_text())
            continue

        used_ocr = True
        pix = page.get_pixmap(dpi=300)
        raw_img = Image.frombytes("RGB", [pix.width, pix.height], pix.samples)
        clean_img = preprocess_image_for_ocr(raw_img)

        ocr_data = pytesseract.image_to_data(
            clean_img, config=TESSERACT_CONFIG, output_type=pytesseract.Output.DICT
        )
        page_words, tess_confs = [], []
        for i, word in enumerate(ocr_data["text"]):
            conf = int(ocr_data["conf"][i])
            if word.strip() and conf > 0:
                page_words.append(word)
                tess_confs.append(conf)

        tess_text = " ".join(page_words)
        tess_avg_conf = sum(tess_confs) / len(tess_confs) if tess_confs else 0.0

        if tess_avg_conf >= HANDWRITING_CONF_THRESHOLD:
            # Clean printed scan — Tesseract is reliable, don't bother with TrOCR
            full_text_parts.append(tess_text)
            page_confidences.append(tess_avg_conf)
            engines_used.add("tesseract")
            continue

        # Low Tesseract confidence → likely handwriting or poor scan → escalate to TrOCR
        try:
            if tess_confs:
                line_crops = _extract_line_crops_from_tesseract(raw_img, ocr_data)
            else:
                line_crops = _extract_line_crops_by_projection(raw_img)

            trocr_text, trocr_conf = run_trocr_on_lines(line_crops)

            if trocr_text.strip():
                full_text_parts.append(trocr_text)
                page_confidences.append(trocr_conf)
                engines_used.add("trocr")
            else:
                # TrOCR produced nothing usable — fall back to whatever Tesseract had
                full_text_parts.append(tess_text)
                page_confidences.append(tess_avg_conf)
                engines_used.add("tesseract_fallback")

        except Exception as exc:
            logger.warning("TrOCR failed on a page, falling back to Tesseract: %s", exc)
            full_text_parts.append(tess_text)
            page_confidences.append(tess_avg_conf)
            engines_used.add("tesseract_fallback")

    doc.close()

    full_text = "\n\n".join(full_text_parts).strip()
    avg_confidence = sum(page_confidences) / len(page_confidences) if page_confidences else None

    if not used_ocr:
        method, status, engine = "typed", "typed", None
    elif not full_text:
        method, status, engine = "ocr", "no_text", "+".join(sorted(engines_used)) or None
    elif avg_confidence is not None and avg_confidence < ABSOLUTE_FAIL_THRESHOLD:
        method, status, engine = "ocr", "ocr_failed", "+".join(sorted(engines_used))
    elif avg_confidence is not None and avg_confidence < HANDWRITING_CONF_THRESHOLD:
        method, status, engine = "ocr", "ocr_low_confidence", "+".join(sorted(engines_used))
    else:
        method, status, engine = "ocr", "ocr_ok", "+".join(sorted(engines_used))

    return {
        "text": full_text,
        "method": method,
        "confidence": avg_confidence,
        "low_confidence": status in ("ocr_low_confidence", "ocr_failed", "no_text"),
        "ocr_engine_used": engine,
        "extraction_status": status,
        "processing_time": round(time.perf_counter() - start, 2),
    }


def chunk_text(text: str, chunk_size: int = 800, overlap: int = 150) -> list[str]:
    """
    Sentence-aware chunking instead of blind character slicing.
    """
    if not text.strip():
        return []

    sentences = re.split(r'(?<=[.!?])\s+', text.strip())

    chunks = []
    current_chunk = []
    current_length = 0

    for sentence in sentences:
        sentence_len = len(sentence)

        if current_length + sentence_len > chunk_size and current_chunk:
            chunks.append(" ".join(current_chunk))

            overlap_sentences = []
            overlap_len = 0
            for s in reversed(current_chunk):
                if overlap_len + len(s) > overlap:
                    break
                overlap_sentences.insert(0, s)
                overlap_len += len(s)

            current_chunk = overlap_sentences
            current_length = overlap_len

        current_chunk.append(sentence)
        current_length += sentence_len

    if current_chunk:
        chunks.append(" ".join(current_chunk))

    return chunks