#!/usr/bin/env python3
# coding=utf-8
"""
Minimal invisible-watermark platform server.

This server intentionally uses only Python's standard HTTP/SQLite libraries plus
the existing blind_watermark/OpenCV dependencies in this repository. It serves
the static web app and exposes the MVP platform API:

- POST /api/items
- POST /api/watermark/embed
- POST /api/watermark/decode
- GET  /r/<code>
"""

from __future__ import annotations

import argparse
import base64
import json
import secrets
import sqlite3
import time
import uuid
from dataclasses import dataclass
from http import HTTPStatus
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import unquote, urlparse

import cv2
import numpy as np

from blind_watermark import WaterMark, bw_notes
from blind_watermark.bch_codec import BCHCodec, decode_and_unpad
from blind_watermark.bwm_core import one_dim_kmeans


ROOT = Path(__file__).resolve().parent
DATA_DIR = ROOT / "platform_data"
DEFAULT_DB = DATA_DIR / "watermark_platform.sqlite3"

CODE_BITS = 64
BCH = BCHCodec()
ENCODED_CODE_BITS = ((CODE_BITS + BCH.k - 1) // BCH.k) * BCH.n
ALGORITHM = "dwt-dct-svd-bch"
ECC_LEVEL = "bch_31_16"
DEFAULT_PASSWORD_IMG = 1
DEFAULT_PASSWORD_WM = 1
DEFAULT_MIN_CONFIDENCE = 0.58

bw_notes.close()


class ApiError(Exception):
    def __init__(self, status: int, message: str):
        super().__init__(message)
        self.status = status
        self.message = message


@dataclass(frozen=True)
class DecodeCandidate:
    code: str
    confidence: float
    variant: str
    corrected_errors: int


class PlatformStore:
    def __init__(self, db_path: Path = DEFAULT_DB):
        self.db_path = Path(db_path)
        self.db_path.parent.mkdir(parents=True, exist_ok=True)
        self.init_db()

    def connect(self):
        conn = sqlite3.connect(self.db_path)
        conn.row_factory = sqlite3.Row
        return conn

    def init_db(self) -> None:
        with self.connect() as conn:
            conn.executescript(
                """
                CREATE TABLE IF NOT EXISTS watermark_items (
                    id TEXT PRIMARY KEY,
                    owner_id TEXT NOT NULL,
                    target_type TEXT NOT NULL,
                    target_url TEXT,
                    qr_payload TEXT,
                    title TEXT,
                    created_at INTEGER NOT NULL,
                    status TEXT NOT NULL
                );

                CREATE TABLE IF NOT EXISTS watermark_codes (
                    code_64 TEXT PRIMARY KEY,
                    item_id TEXT NOT NULL,
                    version TEXT NOT NULL,
                    algorithm TEXT NOT NULL,
                    ecc_level TEXT NOT NULL,
                    secret_seed TEXT NOT NULL,
                    created_at INTEGER NOT NULL,
                    FOREIGN KEY(item_id) REFERENCES watermark_items(id)
                );
                """
            )

    def create_item(self, data: dict, code_64: str | None = None) -> tuple[dict, dict]:
        target_type = str(data.get("target_type") or "url").strip()
        if target_type not in {"url", "qr", "text", "file"}:
            raise ApiError(HTTPStatus.BAD_REQUEST, "target_type must be url, qr, text, or file")

        target_url = clean_optional_text(data.get("target_url"))
        qr_payload = clean_optional_text(data.get("qr_payload"))
        title = clean_optional_text(data.get("title")) or "Untitled"
        owner_id = clean_optional_text(data.get("owner_id")) or "anonymous"
        status = clean_optional_text(data.get("status")) or "active"

        if target_type == "url" and not target_url:
            raise ApiError(HTTPStatus.BAD_REQUEST, "target_url is required for url items")
        if target_type in {"qr", "text"} and not qr_payload:
            raise ApiError(HTTPStatus.BAD_REQUEST, "qr_payload is required for qr/text items")

        item_id = str(uuid.uuid4())
        now = int(time.time())
        code_64 = normalize_code(code_64) if code_64 else self.generate_unique_code()

        with self.connect() as conn:
            conn.execute(
                """
                INSERT INTO watermark_items
                    (id, owner_id, target_type, target_url, qr_payload, title, created_at, status)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (item_id, owner_id, target_type, target_url, qr_payload, title, now, status),
            )
            conn.execute(
                """
                INSERT INTO watermark_codes
                    (code_64, item_id, version, algorithm, ecc_level, secret_seed, created_at)
                VALUES (?, ?, ?, ?, ?, ?, ?)
                """,
                (code_64, item_id, "mvp-1", ALGORITHM, ECC_LEVEL, "1:1", now),
            )

        item = self.get_item(item_id)
        code = self.get_code(code_64)
        return item, code

    def generate_unique_code(self) -> str:
        for _ in range(20):
            code = secrets.token_hex(8)
            if self.get_code(code) is None:
                return code
        raise ApiError(HTTPStatus.INTERNAL_SERVER_ERROR, "Could not generate a unique code")

    def get_item(self, item_id: str) -> dict | None:
        with self.connect() as conn:
            row = conn.execute("SELECT * FROM watermark_items WHERE id = ?", (item_id,)).fetchone()
        return row_to_dict(row)

    def get_code(self, code_64: str) -> dict | None:
        code_64 = normalize_code(code_64)
        with self.connect() as conn:
            row = conn.execute("SELECT * FROM watermark_codes WHERE code_64 = ?", (code_64,)).fetchone()
        return row_to_dict(row)

    def get_code_for_item(self, item_id: str) -> dict | None:
        with self.connect() as conn:
            row = conn.execute(
                "SELECT * FROM watermark_codes WHERE item_id = ? ORDER BY created_at DESC LIMIT 1",
                (item_id,),
            ).fetchone()
        return row_to_dict(row)

    def get_item_by_code(self, code_64: str) -> dict | None:
        code_64 = normalize_code(code_64)
        with self.connect() as conn:
            row = conn.execute(
                """
                SELECT i.*
                FROM watermark_items i
                JOIN watermark_codes c ON c.item_id = i.id
                WHERE c.code_64 = ? AND i.status = 'active'
                """,
                (code_64,),
            ).fetchone()
        return row_to_dict(row)


def row_to_dict(row: sqlite3.Row | None) -> dict | None:
    return dict(row) if row is not None else None


def clean_optional_text(value) -> str | None:
    if value is None:
        return None
    value = str(value).strip()
    return value or None


def normalize_code(code: str) -> str:
    code = str(code or "").strip().lower()
    if len(code) != 16 or any(ch not in "0123456789abcdef" for ch in code):
        raise ApiError(HTTPStatus.BAD_REQUEST, "code_64 must be 16 lowercase hex characters")
    return code


def hex_to_bits(code: str) -> np.ndarray:
    code = normalize_code(code)
    bits = []
    for ch in code:
        value = int(ch, 16)
        for shift in range(3, -1, -1):
            bits.append(bool((value >> shift) & 1))
    return np.asarray(bits, dtype=bool)


def bits_to_hex(bits) -> str:
    bits = list(bool(bit) for bit in bits)
    output = []
    for i in range(0, CODE_BITS, 4):
        value = 0
        for bit in bits[i : i + 4]:
            value = value * 2 + int(bit)
        output.append(format(value, "x"))
    return "".join(output)


def image_from_data_url(image_data: str) -> np.ndarray:
    if not image_data:
        raise ApiError(HTTPStatus.BAD_REQUEST, "image_data is required")
    payload = image_data.split(",", 1)[1] if "," in image_data and image_data.startswith("data:") else image_data
    try:
        raw = base64.b64decode(payload, validate=True)
    except Exception as exc:
        raise ApiError(HTTPStatus.BAD_REQUEST, "image_data must be base64 or a data URL") from exc
    arr = np.frombuffer(raw, dtype=np.uint8)
    img = cv2.imdecode(arr, cv2.IMREAD_COLOR)
    if img is None:
        raise ApiError(HTTPStatus.BAD_REQUEST, "image_data is not a readable image")
    return img


def image_to_data_url(img: np.ndarray, mime: str = "image/png", jpeg_quality: int = 94) -> str:
    if mime not in {"image/png", "image/jpeg", "image/webp"}:
        raise ApiError(HTTPStatus.BAD_REQUEST, "output_mime must be image/png, image/jpeg, or image/webp")
    ext = ".jpg" if mime == "image/jpeg" else ".webp" if mime == "image/webp" else ".png"
    params = []
    if mime == "image/jpeg":
        params = [cv2.IMWRITE_JPEG_QUALITY, int(jpeg_quality)]
    ok, encoded = cv2.imencode(ext, to_uint8(img), params)
    if not ok:
        raise ApiError(HTTPStatus.INTERNAL_SERVER_ERROR, "Could not encode output image")
    data = base64.b64encode(encoded.tobytes()).decode("ascii")
    return f"data:{mime};base64,{data}"


def to_uint8(img: np.ndarray) -> np.ndarray:
    return np.clip(img, 0, 255).astype(np.uint8)


def embed_code(img: np.ndarray, code_64: str, password_img: int = DEFAULT_PASSWORD_IMG, password_wm: int = DEFAULT_PASSWORD_WM) -> np.ndarray:
    bwm = WaterMark(password_img=password_img, password_wm=password_wm, use_ecc=True)
    bwm.read_img(img=to_uint8(img))
    bwm.read_wm(hex_to_bits(code_64), mode="bit")
    return to_uint8(bwm.embed())


def embed_direct_text(img: np.ndarray, text: str, password_img: int = DEFAULT_PASSWORD_IMG, password_wm: int = DEFAULT_PASSWORD_WM) -> tuple[np.ndarray, int]:
    if not text:
        raise ApiError(HTTPStatus.BAD_REQUEST, "direct_text is required")
    bwm = WaterMark(password_img=password_img, password_wm=password_wm)
    bwm.read_img(img=to_uint8(img))
    bwm.read_wm(text, mode="str")
    return to_uint8(bwm.embed()), int(bwm.wm_size)


def decode_code_candidates(
    img: np.ndarray,
    password_img: int = DEFAULT_PASSWORD_IMG,
    password_wm: int = DEFAULT_PASSWORD_WM,
) -> list[DecodeCandidate]:
    candidates: list[DecodeCandidate] = []
    for variant_name, variant_img in iter_decode_variants(img):
        try:
            candidate = decode_code_once(variant_img, variant_name, password_img, password_wm)
            candidates.append(candidate)
        except Exception:
            continue
    candidates.sort(key=lambda item: item.confidence, reverse=True)
    return candidates


def decode_code_once(img: np.ndarray, variant_name: str, password_img: int, password_wm: int) -> DecodeCandidate:
    extractor = WaterMark(password_img=password_img, password_wm=password_wm)
    scores = extractor.bwm_core.extract(img=to_uint8(img), wm_shape=(1, ENCODED_CODE_BITS))
    extractor.wm_size = ENCODED_CODE_BITS
    decrypted = extractor.extract_decrypt(np.asarray(scores, dtype=float).copy())

    if float(np.ptp(decrypted)) < 1e-9:
        encoded_bits = decrypted >= 0.5
    else:
        encoded_bits = one_dim_kmeans(decrypted)

    decoded_bits, corrected_errors = decode_and_unpad(encoded_bits, CODE_BITS, BCH)
    confidence = float(np.mean(np.abs(decrypted - 0.5) * 2.0))
    confidence = max(0.0, min(1.0, confidence))
    error_penalty = min(float(corrected_errors) * 0.01, 0.12)
    return DecodeCandidate(
        code=bits_to_hex(decoded_bits),
        confidence=round(max(0.0, confidence - error_penalty), 4),
        variant=variant_name,
        corrected_errors=int(corrected_errors),
    )


def iter_decode_variants(img: np.ndarray):
    base = to_uint8(img)
    h, w = base.shape[:2]
    yielded = set()

    def add(name: str, candidate: np.ndarray):
        key = (name, candidate.shape[0], candidate.shape[1])
        if key in yielded:
            return
        yielded.add(key)
        yield name, to_uint8(candidate)

    for item in add("identity", base):
        yield item

    for angle in (-2, -1, 1, 2):
        matrix = cv2.getRotationMatrix2D((w / 2, h / 2), angle, 1.0)
        for item in add(f"rotate_{angle:+d}", cv2.warpAffine(base, matrix, (w, h))):
            yield item

    for scale in (0.75, 0.9, 1.1, 1.25):
        resized = cv2.resize(base, (max(1, round(w * scale)), max(1, round(h * scale))), interpolation=cv2.INTER_LINEAR)
        restored = cv2.resize(resized, (w, h), interpolation=cv2.INTER_LINEAR)
        for item in add(f"scale_{scale:.2f}", restored):
            yield item

    for quality in (95, 85):
        ok, encoded = cv2.imencode(".jpg", base, [cv2.IMWRITE_JPEG_QUALITY, quality])
        if ok:
            decoded = cv2.imdecode(encoded, cv2.IMREAD_COLOR)
            for item in add(f"jpeg_q{quality}", decoded):
                yield item


def resolve_platform_code(store: PlatformStore, img: np.ndarray, min_confidence: float = DEFAULT_MIN_CONFIDENCE) -> dict:
    candidates = decode_code_candidates(img)
    best = candidates[0] if candidates else None
    for candidate in candidates:
        item = store.get_item_by_code(candidate.code)
        if item and candidate.confidence >= min_confidence:
            return {
                "status": "found",
                "code": candidate.code,
                "confidence": round(candidate.confidence * 100, 1),
                "variant": candidate.variant,
                "corrected_errors": candidate.corrected_errors,
                "item": item,
            }
    return {
        "status": "not_found",
        "code": best.code if best else None,
        "confidence": round(best.confidence * 100, 1) if best else 0,
        "variant": best.variant if best else None,
        "item": None,
    }


class PlatformRequestHandler(SimpleHTTPRequestHandler):
    server_version = "InvisibleWatermarkPlatform/0.1"

    def translate_path(self, path: str) -> str:
        parsed = urlparse(path)
        clean = unquote(parsed.path).lstrip("/")
        if clean == "":
            clean = "index.html"
        target = (self.server.static_root / clean).resolve()
        root = self.server.static_root.resolve()
        if root not in target.parents and target != root:
            return str(root / "index.html")
        return str(target)

    def end_headers(self):
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        super().end_headers()

    def do_OPTIONS(self):
        self.send_response(HTTPStatus.NO_CONTENT)
        self.end_headers()

    def do_GET(self):
        parsed = urlparse(self.path)
        if parsed.path.startswith("/api/"):
            self.send_json({"error": "Not found"}, HTTPStatus.NOT_FOUND)
            return
        if parsed.path.startswith("/r/"):
            self.handle_resolve(parsed.path.removeprefix("/r/"))
            return
        return super().do_GET()

    def do_POST(self):
        parsed = urlparse(self.path)
        try:
            if parsed.path == "/api/items":
                self.handle_create_item()
            elif parsed.path == "/api/watermark/embed":
                self.handle_embed()
            elif parsed.path == "/api/watermark/decode":
                self.handle_decode()
            else:
                self.send_json({"error": "Not found"}, HTTPStatus.NOT_FOUND)
        except ApiError as exc:
            self.send_json({"error": exc.message}, exc.status)
        except Exception as exc:
            self.send_json({"error": str(exc)}, HTTPStatus.INTERNAL_SERVER_ERROR)

    def read_json(self) -> dict:
        length = int(self.headers.get("Content-Length") or 0)
        if length <= 0:
            return {}
        raw = self.rfile.read(length)
        try:
            return json.loads(raw.decode("utf-8"))
        except json.JSONDecodeError as exc:
            raise ApiError(HTTPStatus.BAD_REQUEST, "Request body must be JSON") from exc

    def send_json(self, payload: dict, status: int = HTTPStatus.OK):
        data = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def handle_create_item(self):
        body = self.read_json()
        item, code = self.server.store.create_item(body)
        self.send_json({"item": item, "code": code, "resolve_url": f"/r/{code['code_64']}"}, HTTPStatus.CREATED)

    def handle_embed(self):
        body = self.read_json()
        img = image_from_data_url(body.get("image_data"))
        output_mime = body.get("output_mime") or "image/png"
        payload_mode = body.get("payload_mode") or "platform_id"

        if payload_mode == "direct_text":
            embedded, bit_length = embed_direct_text(img, clean_optional_text(body.get("direct_text")) or "")
            self.send_json(
                {
                    "payload_mode": "direct_text",
                    "bit_length": bit_length,
                    "algorithm": "dwt-dct-svd",
                    "robustness": "low",
                    "image_data": image_to_data_url(embedded, output_mime),
                }
            )
            return

        item_id = clean_optional_text(body.get("item_id"))
        if item_id:
            item = self.server.store.get_item(item_id)
            if not item:
                raise ApiError(HTTPStatus.NOT_FOUND, "item_id was not found")
            code = self.server.store.get_code_for_item(item_id)
            if not code:
                raise ApiError(HTTPStatus.NOT_FOUND, "No watermark code exists for item_id")
        else:
            item, code = self.server.store.create_item(body.get("item") or body)

        embedded = embed_code(img, code["code_64"])
        self.send_json(
            {
                "payload_mode": "platform_id",
                "code": code["code_64"],
                "code_bits": CODE_BITS,
                "encoded_bits": ENCODED_CODE_BITS,
                "algorithm": ALGORITHM,
                "ecc_level": ECC_LEVEL,
                "item": item,
                "resolve_url": f"/r/{code['code_64']}",
                "image_data": image_to_data_url(embedded, output_mime),
            }
        )

    def handle_decode(self):
        body = self.read_json()
        img = image_from_data_url(body.get("image_data"))
        payload_mode = body.get("payload_mode") or "platform_id"
        if payload_mode == "direct_text":
            bit_length = int(body.get("bit_length") or 0)
            if bit_length <= 0:
                raise ApiError(HTTPStatus.BAD_REQUEST, "bit_length is required for direct_text decode")
            bwm = WaterMark(password_img=DEFAULT_PASSWORD_IMG, password_wm=DEFAULT_PASSWORD_WM)
            text = bwm.extract(embed_img=img, wm_shape=(1, bit_length), mode="str")
            self.send_json({"payload_mode": "direct_text", "text": text})
            return

        min_confidence = float(body.get("min_confidence") or DEFAULT_MIN_CONFIDENCE)
        self.send_json(resolve_platform_code(self.server.store, img, min_confidence=min_confidence))

    def handle_resolve(self, code_path: str):
        code = code_path.split("/", 1)[0].lower()
        try:
            item = self.server.store.get_item_by_code(code)
        except ApiError:
            item = None
        if not item:
            self.send_error(HTTPStatus.NOT_FOUND, "Watermark code not found")
            return
        if item.get("target_url"):
            self.send_response(HTTPStatus.FOUND)
            self.send_header("Location", item["target_url"])
            self.end_headers()
            return

        title = html_escape(item.get("title") or "Watermark item")
        payload = html_escape(item.get("qr_payload") or "")
        html = f"""<!doctype html>
<html lang="en">
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>{title}</title>
<body style="font-family:system-ui;margin:32px;max-width:720px">
<h1>{title}</h1>
<pre style="white-space:pre-wrap;border:1px solid #ddd;padding:16px">{payload}</pre>
</body>
</html>"""
        data = html.encode("utf-8")
        self.send_response(HTTPStatus.OK)
        self.send_header("Content-Type", "text/html; charset=utf-8")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)


def html_escape(value: str) -> str:
    return (
        str(value)
        .replace("&", "&amp;")
        .replace("<", "&lt;")
        .replace(">", "&gt;")
        .replace('"', "&quot;")
    )


class PlatformHTTPServer(ThreadingHTTPServer):
    def __init__(self, server_address, handler_cls, store: PlatformStore, static_root: Path):
        super().__init__(server_address, handler_cls)
        self.store = store
        self.static_root = static_root


def main() -> int:
    parser = argparse.ArgumentParser(description="Run the invisible watermark platform MVP server.")
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", type=int, default=4175)
    parser.add_argument("--db", type=Path, default=DEFAULT_DB)
    parser.add_argument("--static-root", type=Path, default=ROOT)
    args = parser.parse_args()

    store = PlatformStore(args.db)
    server = PlatformHTTPServer((args.host, args.port), PlatformRequestHandler, store, args.static_root)
    print(f"Serving invisible watermark platform at http://{args.host}:{args.port}")
    print(f"SQLite database: {args.db}")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nStopping server")
    finally:
        server.server_close()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
