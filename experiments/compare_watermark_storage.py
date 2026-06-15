#!/usr/bin/env python3
# coding=utf-8
"""
Compare original Python text storage with the browser-style 64-bit ID storage.

Default run:
- 10 reproducible images covering photo, smooth, low-contrast, text, geometry,
  texture, noise, and dark scenes.
- 3 payload batches.
- 20 attacks per image/payload group.

That yields 30 image/payload groups and 600 attack rows.
"""

from __future__ import annotations

import argparse
import csv
import hashlib
import importlib
import math
import subprocess
import sys
import tempfile
from dataclasses import dataclass
from pathlib import Path
from typing import Callable, Iterable

import cv2
import numpy as np


REPO_ROOT = Path(__file__).resolve().parents[1]
DEFAULT_OUT_DIR = REPO_ROOT / "experiments" / "results"
DEFAULT_IMAGE_SIZE = 384

DEFAULT_PAYLOADS = [
    ("readme_zh", "@guofei9987 \u5f00\u6e90\u4e07\u5c81\uff01"),
    ("ascii_sentence", "blind watermark robustness batch test"),
    ("mixed_order", "order-2026-06-15 user-42 CNY-123.45"),
]


@dataclass(frozen=True)
class TestImage:
    key: str
    label: str
    category: str
    image: np.ndarray


@dataclass(frozen=True)
class Payload:
    key: str
    text: str


@dataclass(frozen=True)
class PayloadStrategy:
    key: str
    label: str
    read_mode: str
    content: object
    expected_bits: np.ndarray


@dataclass(frozen=True)
class Experiment:
    name: str
    category: str
    description: str
    attack: Callable[[np.ndarray], np.ndarray]


def to_uint8(img: np.ndarray) -> np.ndarray:
    return np.clip(img, 0, 255).astype(np.uint8)


def normalize_image(img: np.ndarray, size: int) -> np.ndarray:
    if img is None:
        raise RuntimeError("Image is not readable")
    if img.ndim == 2:
        img = cv2.cvtColor(img, cv2.COLOR_GRAY2BGR)
    if img.shape[2] == 4:
        img = img[:, :, :3]

    h, w = img.shape[:2]
    side = min(h, w)
    y1 = (h - side) // 2
    x1 = (w - side) // 2
    cropped = img[y1 : y1 + side, x1 : x1 + side]
    return cv2.resize(cropped, (size, size), interpolation=cv2.INTER_AREA)


def load_local_image(path: Path, key: str, label: str, category: str, size: int) -> TestImage:
    img = cv2.imread(str(path), cv2.IMREAD_COLOR)
    if img is None:
        raise RuntimeError(f"Image is not readable: {path}")
    return TestImage(key=key, label=label, category=category, image=normalize_image(img, size))


def generate_gradient(size: int) -> np.ndarray:
    x = np.linspace(0, 1, size, dtype=np.float32)
    y = np.linspace(0, 1, size, dtype=np.float32)
    xv, yv = np.meshgrid(x, y)
    b = 255 * xv
    g = 255 * yv
    r = 255 * (1 - xv * yv)
    return to_uint8(np.dstack([b, g, r]))


def generate_low_contrast(size: int) -> np.ndarray:
    rng = np.random.RandomState(11)
    base = rng.normal(128, 5, (size, size, 3))
    img = cv2.GaussianBlur(base.astype(np.float32), (19, 19), 0)
    return to_uint8(img)


def generate_high_texture(size: int) -> np.ndarray:
    rng = np.random.RandomState(12)
    img = rng.randint(0, 256, (size, size, 3), dtype=np.uint8)
    for step in range(0, size, 12):
        color = (step * 5 % 255, 255 - step * 3 % 255, step * 7 % 255)
        cv2.line(img, (0, step), (size - 1, step), color, 1)
        cv2.line(img, (step, 0), (step, size - 1), color, 1)
    return cv2.GaussianBlur(img, (3, 3), 0)


def generate_text_page(size: int) -> np.ndarray:
    img = np.full((size, size, 3), 246, dtype=np.uint8)
    for y in range(38, size - 20, 32):
        cv2.line(img, (32, y + 8), (size - 32, y + 8), (210, 210, 210), 1)
        cv2.putText(img, "Blind watermark test 0123456789", (34, y), cv2.FONT_HERSHEY_SIMPLEX, 0.48, (35, 35, 35), 1)
    cv2.rectangle(img, (24, 24), (size - 24, size - 24), (170, 170, 170), 1)
    return img


def generate_geometric(size: int) -> np.ndarray:
    img = np.full((size, size, 3), (28, 30, 34), dtype=np.uint8)
    cv2.rectangle(img, (30, 40), (size // 2, size // 2), (220, 70, 70), -1)
    cv2.circle(img, (size * 2 // 3, size // 3), size // 6, (70, 190, 230), -1)
    cv2.line(img, (30, size - 60), (size - 30, 60), (235, 235, 120), 8)
    pts = np.array([[size // 3, size - 40], [size - 40, size - 80], [size // 2, size // 2]], np.int32)
    cv2.fillPoly(img, [pts], (110, 230, 130))
    return img


def generate_noise_photo(size: int) -> np.ndarray:
    rng = np.random.RandomState(13)
    img = np.zeros((size, size, 3), dtype=np.float32)
    for _ in range(85):
        center = rng.randint(0, size, 2)
        radius = rng.randint(size // 25, size // 7)
        color = rng.randint(30, 240, 3).tolist()
        cv2.circle(img, tuple(center), int(radius), color, -1)
    img = cv2.GaussianBlur(img, (17, 17), 0)
    noise = rng.normal(0, 9, img.shape)
    return to_uint8(img + noise)


def generate_dark_scene(size: int) -> np.ndarray:
    img = np.zeros((size, size, 3), dtype=np.float32)
    for y in range(size):
        img[y, :, :] = 12 + 45 * (y / size)
    cv2.circle(img, (size // 2, size // 2), size // 5, (40, 80, 130), -1)
    cv2.circle(img, (size * 3 // 4, size // 4), size // 11, (180, 160, 120), -1)
    return to_uint8(cv2.GaussianBlur(img, (11, 11), 0))


def generate_flat_smooth(size: int) -> np.ndarray:
    img = np.full((size, size, 3), (162, 134, 126), dtype=np.uint8)
    cv2.circle(img, (size // 3, size // 3), size // 4, (174, 154, 148), -1)
    cv2.rectangle(img, (size // 2, size // 2), (size - 20, size - 30), (118, 142, 166), -1)
    return cv2.GaussianBlur(img, (41, 41), 0)


def generate_checker(size: int) -> np.ndarray:
    img = np.zeros((size, size, 3), dtype=np.uint8)
    tile = max(8, size // 24)
    for y in range(0, size, tile):
        for x in range(0, size, tile):
            value = 235 if (x // tile + y // tile) % 2 == 0 else 35
            img[y : y + tile, x : x + tile] = (value, value, value)
    return img


def build_test_images(size: int) -> list[TestImage]:
    return [
        load_local_image(REPO_ROOT / "examples" / "pic" / "Lena_512x512.jpg", "lena_photo", "Lena photo", "photo", size),
        load_local_image(REPO_ROOT / "examples" / "pic" / "ori_img.jpeg", "ori_photo", "Original sample photo", "photo", size),
        TestImage("gradient", "Color gradient", "smooth", generate_gradient(size)),
        TestImage("low_contrast", "Low contrast", "low_contrast", generate_low_contrast(size)),
        TestImage("high_texture", "High texture", "texture", generate_high_texture(size)),
        TestImage("text_page", "Text document", "text", generate_text_page(size)),
        TestImage("geometric", "Geometric shapes", "graphic", generate_geometric(size)),
        TestImage("noise_photo", "Noisy synthetic photo", "photo_like", generate_noise_photo(size)),
        TestImage("dark_scene", "Dark low-light scene", "dark", generate_dark_scene(size)),
        TestImage("checker", "High-contrast checker", "graphic", generate_checker(size)),
    ]


def write_contact_sheet(images: list[TestImage], path: Path) -> None:
    tile = 180
    label_h = 32
    cols = 5
    rows = math.ceil(len(images) / cols)
    sheet = np.full((rows * (tile + label_h), cols * tile, 3), 250, dtype=np.uint8)
    for i, test_image in enumerate(images):
        row = i // cols
        col = i % cols
        x = col * tile
        y = row * (tile + label_h)
        thumb = cv2.resize(test_image.image, (tile, tile), interpolation=cv2.INTER_AREA)
        sheet[y : y + tile, x : x + tile] = thumb
        cv2.putText(sheet, test_image.key, (x + 6, y + tile + 22), cv2.FONT_HERSHEY_SIMPLEX, 0.45, (30, 30, 30), 1)
    cv2.imwrite(str(path), sheet)


def load_original_watermark(repo_root: Path, git_ref: str):
    temp_dir = tempfile.TemporaryDirectory(prefix="original_blind_watermark_")
    package_dir = Path(temp_dir.name) / "original_blind_watermark"
    package_dir.mkdir(parents=True, exist_ok=True)

    paths_raw = subprocess.check_output(
        ["git", "ls-tree", "-r", "--name-only", git_ref, "blind_watermark"],
        cwd=repo_root,
        text=True,
    )
    package_files = [path for path in paths_raw.splitlines() if path.endswith(".py")]
    if not package_files:
        raise RuntimeError(f"No Python files found at {git_ref}:blind_watermark")

    for source in package_files:
        relative = Path(source).relative_to("blind_watermark")
        target = package_dir / relative
        target.parent.mkdir(parents=True, exist_ok=True)
        data = subprocess.check_output(["git", "show", f"{git_ref}:{source}"], cwd=repo_root)
        target.write_bytes(data)

    sys.path.insert(0, temp_dir.name)
    module = importlib.import_module("original_blind_watermark")
    if hasattr(module, "bw_notes"):
        module.bw_notes.close()
    return temp_dir, module.WaterMark


def original_python_text_bits(text: str) -> np.ndarray:
    hex_payload = text.encode("utf-8").hex()
    if not hex_payload:
        return np.array([], dtype=bool)
    binary = bin(int(hex_payload, base=16))[2:]
    return np.array([char == "1" for char in binary], dtype=bool)


def id64_bits(text: str) -> np.ndarray:
    digest = hashlib.sha256(text.encode("utf-8")).digest()[:8]
    bits = []
    for byte in digest:
        for shift in range(7, -1, -1):
            bits.append(bool((byte >> shift) & 1))
    return np.array(bits, dtype=bool)


def bits_to_hex(bits: Iterable[bool]) -> str:
    bit_list = list(bits)
    output = []
    for i in range(0, len(bit_list), 4):
        value = 0
        for bit in bit_list[i : i + 4]:
            value = value * 2 + int(bool(bit))
        output.append(format(value, "x"))
    return "".join(output)


def jpeg_attack(quality: int) -> Callable[[np.ndarray], np.ndarray]:
    def attack(img: np.ndarray) -> np.ndarray:
        ok, encoded = cv2.imencode(".jpg", to_uint8(img), [cv2.IMWRITE_JPEG_QUALITY, quality])
        if not ok:
            raise RuntimeError(f"JPEG encode failed at quality={quality}")
        return cv2.imdecode(encoded, cv2.IMREAD_COLOR)

    return attack


def blur_attack(kernel: int) -> Callable[[np.ndarray], np.ndarray]:
    def attack(img: np.ndarray) -> np.ndarray:
        return cv2.GaussianBlur(to_uint8(img), (kernel, kernel), 0)

    return attack


def rotate_attack(angle: float) -> Callable[[np.ndarray], np.ndarray]:
    def attack(img: np.ndarray) -> np.ndarray:
        base = to_uint8(img)
        h, w = base.shape[:2]
        matrix = cv2.getRotationMatrix2D((w / 2, h / 2), angle, 1.0)
        return cv2.warpAffine(base, matrix, (w, h))

    return attack


def scale_restore_attack(scale: float) -> Callable[[np.ndarray], np.ndarray]:
    def attack(img: np.ndarray) -> np.ndarray:
        base = to_uint8(img)
        h, w = base.shape[:2]
        target = (max(1, round(w * scale)), max(1, round(h * scale)))
        interp = cv2.INTER_AREA if scale < 1 else cv2.INTER_CUBIC
        resized = cv2.resize(base, target, interpolation=interp)
        return cv2.resize(resized, (w, h), interpolation=cv2.INTER_LINEAR)

    return attack


def crop_center_restore_attack(crop_ratio: float) -> Callable[[np.ndarray], np.ndarray]:
    def attack(img: np.ndarray) -> np.ndarray:
        base = to_uint8(img)
        h, w = base.shape[:2]
        margin_x = round(w * crop_ratio / 2)
        margin_y = round(h * crop_ratio / 2)
        cropped = base[margin_y : h - margin_y, margin_x : w - margin_x]
        return cv2.resize(cropped, (w, h), interpolation=cv2.INTER_LINEAR)

    return attack


def build_experiments() -> list[Experiment]:
    return [
        Experiment("jpeg_q95", "compression_blur", "JPEG quality 95", jpeg_attack(95)),
        Experiment("jpeg_q85", "compression_blur", "JPEG quality 85", jpeg_attack(85)),
        Experiment("jpeg_q75", "compression_blur", "JPEG quality 75", jpeg_attack(75)),
        Experiment("jpeg_q60", "compression_blur", "JPEG quality 60", jpeg_attack(60)),
        Experiment("jpeg_q45", "compression_blur", "JPEG quality 45", jpeg_attack(45)),
        Experiment("gaussian_blur_k3", "compression_blur", "Gaussian blur 3x3", blur_attack(3)),
        Experiment("gaussian_blur_k5", "compression_blur", "Gaussian blur 5x5", blur_attack(5)),
        Experiment("gaussian_blur_k9", "compression_blur", "Gaussian blur 9x9", blur_attack(9)),
        Experiment("rotate_neg10", "rotation", "Rotate -10 degrees", rotate_attack(-10)),
        Experiment("rotate_neg5", "rotation", "Rotate -5 degrees", rotate_attack(-5)),
        Experiment("rotate_neg2", "rotation", "Rotate -2 degrees", rotate_attack(-2)),
        Experiment("rotate_pos2", "rotation", "Rotate +2 degrees", rotate_attack(2)),
        Experiment("rotate_pos5", "rotation", "Rotate +5 degrees", rotate_attack(5)),
        Experiment("rotate_pos10", "rotation", "Rotate +10 degrees", rotate_attack(10)),
        Experiment("scale_down_50_restore", "scale_crop", "Scale 50%, restore to original size", scale_restore_attack(0.50)),
        Experiment("scale_down_75_restore", "scale_crop", "Scale 75%, restore to original size", scale_restore_attack(0.75)),
        Experiment("scale_up_125_restore", "scale_crop", "Scale 125%, restore to original size", scale_restore_attack(1.25)),
        Experiment("scale_up_150_restore", "scale_crop", "Scale 150%, restore to original size", scale_restore_attack(1.50)),
        Experiment("crop_center_10_restore", "scale_crop", "Center crop 10%, restore to original size", crop_center_restore_attack(0.10)),
        Experiment("crop_center_25_restore", "scale_crop", "Center crop 25%, restore to original size", crop_center_restore_attack(0.25)),
    ]


def build_payload_strategies(payload: Payload) -> tuple[PayloadStrategy, PayloadStrategy, str]:
    text_bits = original_python_text_bits(payload.text)
    id_bits = id64_bits(payload.text)
    if text_bits.size == 0:
        raise RuntimeError("Watermark text must not be empty")
    return (
        PayloadStrategy(
            key="python_original_text",
            label="Original Python stores raw text bits",
            read_mode="str",
            content=payload.text,
            expected_bits=text_bits,
        ),
        PayloadStrategy(
            key="stored_id_64",
            label="Browser-style SHA-256 64-bit ID",
            read_mode="bit",
            content=id_bits,
            expected_bits=id_bits,
        ),
        bits_to_hex(id_bits),
    )


def embed_payload(WaterMark, image: np.ndarray, strategy: PayloadStrategy, password_img: int, password_wm: int) -> np.ndarray:
    bwm = WaterMark(password_img=password_img, password_wm=password_wm)
    bwm.read_img(img=image.copy())
    bwm.read_wm(strategy.content, mode=strategy.read_mode)
    return to_uint8(bwm.embed())


def extract_bits(WaterMark, image: np.ndarray, bit_count: int, password_img: int, password_wm: int) -> np.ndarray:
    bwm = WaterMark(password_img=password_img, password_wm=password_wm)
    extracted = bwm.extract(embed_img=to_uint8(image), wm_shape=(1, bit_count), mode="bit")
    return np.asarray(extracted, dtype=bool).flatten()


def compare_bits(expected: np.ndarray, extracted: np.ndarray) -> tuple[float, int, bool]:
    expected = np.asarray(expected, dtype=bool).flatten()
    extracted = np.asarray(extracted, dtype=bool).flatten()
    common = min(expected.size, extracted.size)
    mismatches = int(np.count_nonzero(expected[:common] != extracted[:common]))
    mismatches += abs(expected.size - extracted.size)
    accuracy = 100.0 * (expected.size - mismatches) / max(expected.size, 1)
    return accuracy, mismatches, mismatches == 0


def psnr(reference: np.ndarray, attacked: np.ndarray) -> float:
    ref = to_uint8(reference).astype(np.float64)
    atk = to_uint8(attacked).astype(np.float64)
    mse = float(np.mean((ref - atk) ** 2))
    if mse <= 1e-12:
        return math.inf
    return 10.0 * math.log10((255.0**2) / mse)


def winner(text_accuracy: float, id_accuracy: float) -> str:
    if abs(text_accuracy - id_accuracy) < 1e-9:
        return "tie"
    return "stored_id_64" if id_accuracy > text_accuracy else "python_original_text"


def run_benchmark(args: argparse.Namespace) -> tuple[list[dict[str, object]], dict[str, object], list[TestImage], list[Payload]]:
    images = build_test_images(args.image_size)
    payloads = [Payload(key, text) for key, text in DEFAULT_PAYLOADS]
    experiments = build_experiments()
    issued_id_hexes = {payload.key: bits_to_hex(id64_bits(payload.text)) for payload in payloads}
    issued_id_set = set(issued_id_hexes.values())

    original_temp, WaterMark = load_original_watermark(REPO_ROOT, args.git_ref)
    rows: list[dict[str, object]] = []
    try:
        group_index = 0
        for test_image in images:
            for payload in payloads:
                group_index += 1
                text_strategy, id_strategy, id_hex = build_payload_strategies(payload)
                strategies = [text_strategy, id_strategy]
                embedded = {
                    strategy.key: embed_payload(WaterMark, test_image.image, strategy, args.password_img, args.password_wm)
                    for strategy in strategies
                }

                for experiment_index, experiment in enumerate(experiments, start=1):
                    row: dict[str, object] = {
                        "group_index": group_index,
                        "image_key": test_image.key,
                        "image_label": test_image.label,
                        "image_category": test_image.category,
                        "payload_key": payload.key,
                        "payload_text": payload.text,
                        "stored_id_64_hex": id_hex,
                        "experiment_index": experiment_index,
                        "experiment": experiment.name,
                        "attack_category": experiment.category,
                        "attack": experiment.description,
                    }

                    psnr_values = []
                    for strategy in strategies:
                        attacked = experiment.attack(embedded[strategy.key])
                        psnr_values.append(psnr(embedded[strategy.key], attacked))
                        extracted = extract_bits(
                            WaterMark,
                            attacked,
                            strategy.expected_bits.size,
                            args.password_img,
                            args.password_wm,
                        )
                        accuracy, bit_errors, exact = compare_bits(strategy.expected_bits, extracted)
                        row[f"{strategy.key}_bits"] = int(strategy.expected_bits.size)
                        row[f"{strategy.key}_accuracy"] = round(accuracy, 2)
                        row[f"{strategy.key}_bit_errors"] = bit_errors
                        row[f"{strategy.key}_exact"] = exact
                        row[f"{strategy.key}_exact_success"] = exact
                        row[f"{strategy.key}_confidence"] = round(accuracy / 100, 4)
                        if strategy.key == "stored_id_64":
                            decoded_hex = bits_to_hex(extracted)
                            row["stored_id_64_decoded_hex"] = decoded_hex
                            row["stored_id_64_false_positive"] = decoded_hex != id_hex and decoded_hex in issued_id_set

                    row["attacked_psnr_db"] = round(float(np.mean(psnr_values)), 2)
                    row["winner"] = winner(
                        float(row["python_original_text_accuracy"]),
                        float(row["stored_id_64_accuracy"]),
                    )
                    rows.append(row)
    finally:
        original_temp.cleanup()

    metadata = {
        "image_size": args.image_size,
        "image_count": len(images),
        "payload_count": len(payloads),
        "group_count": len(images) * len(payloads),
        "attack_count": len(experiments),
        "row_count": len(rows),
        "password_img": args.password_img,
        "password_wm": args.password_wm,
        "git_ref": args.git_ref,
    }
    return rows, metadata, images, payloads


def aggregate(rows: list[dict[str, object]], group_keys: list[str]) -> list[dict[str, object]]:
    buckets: dict[tuple[object, ...], list[dict[str, object]]] = {}
    for row in rows:
        key = tuple(row[group_key] for group_key in group_keys)
        buckets.setdefault(key, []).append(row)

    out = []
    for key, bucket in sorted(buckets.items(), key=lambda item: item[0]):
        text_acc = np.array([float(row["python_original_text_accuracy"]) for row in bucket], dtype=float)
        id_acc = np.array([float(row["stored_id_64_accuracy"]) for row in bucket], dtype=float)
        record = {group_key: value for group_key, value in zip(group_keys, key)}
        record.update(
            {
                "rows": len(bucket),
                "python_original_text_avg_accuracy": round(float(text_acc.mean()), 2),
                "stored_id_64_avg_accuracy": round(float(id_acc.mean()), 2),
                "python_original_text_exact": sum(bool(row["python_original_text_exact"]) for row in bucket),
                "stored_id_64_exact": sum(bool(row["stored_id_64_exact"]) for row in bucket),
                "python_original_text_exact_success_rate": round(100 * sum(bool(row["python_original_text_exact_success"]) for row in bucket) / len(bucket), 2),
                "stored_id_64_exact_success_rate": round(100 * sum(bool(row["stored_id_64_exact_success"]) for row in bucket) / len(bucket), 2),
                "stored_id_64_false_positive_rate": round(100 * sum(bool(row.get("stored_id_64_false_positive")) for row in bucket) / len(bucket), 2),
                "stored_id_64_avg_confidence": round(float(np.array([float(row["stored_id_64_confidence"]) for row in bucket], dtype=float).mean()), 4),
                "python_original_text_wins": sum(row["winner"] == "python_original_text" for row in bucket),
                "stored_id_64_wins": sum(row["winner"] == "stored_id_64" for row in bucket),
                "ties": sum(row["winner"] == "tie" for row in bucket),
            }
        )
        record["winner"] = winner(
            float(record["python_original_text_avg_accuracy"]),
            float(record["stored_id_64_avg_accuracy"]),
        )
        out.append(record)
    return out


def summarize(rows: list[dict[str, object]]) -> dict[str, object]:
    return aggregate(rows, [])[0]


def write_csv(rows: list[dict[str, object]], path: Path) -> None:
    if not rows:
        raise RuntimeError(f"No rows to write: {path}")
    fieldnames = list(rows[0].keys())
    with path.open("w", encoding="utf-8", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(rows)


def markdown_table(rows: list[dict[str, object]], columns: list[tuple[str, str]], limit: int | None = None) -> list[str]:
    selected = rows if limit is None else rows[:limit]
    lines = [
        "| " + " | ".join(title for title, _ in columns) + " |",
        "| " + " | ".join("---" for _ in columns) + " |",
    ]
    for row in selected:
        lines.append("| " + " | ".join(str(row[key]) for _, key in columns) + " |")
    return lines


def write_markdown(
    rows: list[dict[str, object]],
    metadata: dict[str, object],
    overall: dict[str, object],
    by_group: list[dict[str, object]],
    by_image: list[dict[str, object]],
    by_payload: list[dict[str, object]],
    by_attack_category: list[dict[str, object]],
    by_attack: list[dict[str, object]],
    path: Path,
) -> None:
    worst_attacks = sorted(by_attack, key=lambda row: row["stored_id_64_avg_accuracy"])[:8]
    lines = [
        "# Batch Watermark Storage Robustness Benchmark",
        "",
        "This run compares original Python raw-text storage with browser-style 64-bit ID storage.",
        "",
        "## Setup",
        "",
        f"- Images: `{metadata['image_count']}` at `{metadata['image_size']}x{metadata['image_size']}`",
        f"- Payload batches: `{metadata['payload_count']}`",
        f"- Image/payload groups: `{metadata['group_count']}`",
        f"- Attacks per group: `{metadata['attack_count']}`",
        f"- Detail rows: `{metadata['row_count']}`",
        f"- Passwords: image=`{metadata['password_img']}`, watermark=`{metadata['password_wm']}`",
        f"- Original Python source ref: `{metadata['git_ref']}`",
        "",
        "## Overall",
        "",
        f"- Original Python text average accuracy: `{overall['python_original_text_avg_accuracy']}%`",
        f"- Stored 64-bit ID average accuracy: `{overall['stored_id_64_avg_accuracy']}%`",
        f"- Stored 64-bit ID exact success rate: `{overall['stored_id_64_exact_success_rate']}%`",
        f"- Stored 64-bit ID false positive rate: `{overall['stored_id_64_false_positive_rate']}%`",
        f"- Exact matches: original text `{overall['python_original_text_exact']}`, stored ID `{overall['stored_id_64_exact']}`",
        f"- Wins: original text `{overall['python_original_text_wins']}`, stored ID `{overall['stored_id_64_wins']}`, ties `{overall['ties']}`",
        "",
        "## By Attack Category",
        "",
    ]
    lines.extend(
        markdown_table(
            by_attack_category,
            [
                ("Category", "attack_category"),
                ("Rows", "rows"),
                ("Text Avg", "python_original_text_avg_accuracy"),
                ("ID Avg", "stored_id_64_avg_accuracy"),
                ("ID Exact %", "stored_id_64_exact_success_rate"),
                ("ID False + %", "stored_id_64_false_positive_rate"),
                ("Winner", "winner"),
            ],
        )
    )
    lines.extend(["", "## By Payload", ""])
    lines.extend(
        markdown_table(
            by_payload,
            [
                ("Payload", "payload_key"),
                ("Rows", "rows"),
                ("Text Avg", "python_original_text_avg_accuracy"),
                ("ID Avg", "stored_id_64_avg_accuracy"),
                ("ID Exact %", "stored_id_64_exact_success_rate"),
                ("Winner", "winner"),
            ],
        )
    )
    lines.extend(["", "## By Image", ""])
    lines.extend(
        markdown_table(
            by_image,
            [
                ("Image", "image_key"),
                ("Rows", "rows"),
                ("Text Avg", "python_original_text_avg_accuracy"),
                ("ID Avg", "stored_id_64_avg_accuracy"),
                ("ID Exact %", "stored_id_64_exact_success_rate"),
                ("Winner", "winner"),
            ],
        )
    )
    lines.extend(["", "## 30 Image/Payload Groups", ""])
    lines.extend(
        markdown_table(
            by_group,
            [
                ("Image", "image_key"),
                ("Payload", "payload_key"),
                ("Rows", "rows"),
                ("Text Avg", "python_original_text_avg_accuracy"),
                ("ID Avg", "stored_id_64_avg_accuracy"),
                ("ID Exact %", "stored_id_64_exact_success_rate"),
                ("Winner", "winner"),
            ],
        )
    )
    lines.extend(["", "## Worst Stored-ID Attacks", ""])
    lines.extend(
        markdown_table(
            worst_attacks,
            [
                ("Attack", "experiment"),
                ("Category", "attack_category"),
                ("Text Avg", "python_original_text_avg_accuracy"),
                ("ID Avg", "stored_id_64_avg_accuracy"),
                ("ID Exact %", "stored_id_64_exact_success_rate"),
                ("Winner", "winner"),
            ],
        )
    )
    lines.append("")
    path.write_text("\n".join(lines), encoding="utf-8")


def print_summary(metadata: dict[str, object], overall: dict[str, object], by_attack_category: list[dict[str, object]]) -> None:
    print("Batch watermark storage robustness benchmark")
    print(
        f"{metadata['image_count']} images x {metadata['payload_count']} payloads = "
        f"{metadata['group_count']} groups; {metadata['row_count']} attack rows"
    )
    print(
        "Average accuracy: "
        f"original text={overall['python_original_text_avg_accuracy']}%, "
        f"stored_id_64={overall['stored_id_64_avg_accuracy']}%"
    )
    print(
        "Stored ID product metrics: "
        f"exact_success={overall['stored_id_64_exact_success_rate']}%, "
        f"false_positive={overall['stored_id_64_false_positive_rate']}%"
    )
    print(
        "Exact matches: "
        f"original text={overall['python_original_text_exact']}, "
        f"stored_id_64={overall['stored_id_64_exact']}"
    )
    print(
        "Wins: "
        f"original text={overall['python_original_text_wins']}, "
        f"stored_id_64={overall['stored_id_64_wins']}, "
        f"ties={overall['ties']}"
    )
    print()
    for row in by_attack_category:
        print(
            f"{row['attack_category']:<18} "
            f"text={row['python_original_text_avg_accuracy']:>6.2f}% "
            f"id={row['stored_id_64_avg_accuracy']:>6.2f}% "
            f"winner={row['winner']}"
        )


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--image-size", type=int, default=DEFAULT_IMAGE_SIZE, help="Square size used for every test image")
    parser.add_argument("--password-img", type=int, default=1, help="Image password")
    parser.add_argument("--password-wm", type=int, default=1, help="Watermark password")
    parser.add_argument("--git-ref", default="HEAD", help="Git ref used as the original Python implementation")
    parser.add_argument("--out-dir", type=Path, default=DEFAULT_OUT_DIR, help="Directory for CSV and Markdown results")
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    args.out_dir.mkdir(parents=True, exist_ok=True)

    rows, metadata, images, _payloads = run_benchmark(args)
    overall = summarize(rows)
    by_group = aggregate(rows, ["image_key", "payload_key"])
    by_image = aggregate(rows, ["image_key"])
    by_payload = aggregate(rows, ["payload_key"])
    by_attack_category = aggregate(rows, ["attack_category"])
    by_attack = aggregate(rows, ["attack_category", "experiment"])

    detail_path = args.out_dir / "watermark_storage_batch_detail.csv"
    by_group_path = args.out_dir / "watermark_storage_batch_by_group.csv"
    by_image_path = args.out_dir / "watermark_storage_batch_by_image.csv"
    by_payload_path = args.out_dir / "watermark_storage_batch_by_payload.csv"
    by_attack_path = args.out_dir / "watermark_storage_batch_by_attack.csv"
    md_path = args.out_dir / "watermark_storage_batch.md"
    contact_sheet_path = args.out_dir / "watermark_storage_batch_contact_sheet.jpg"

    write_csv(rows, detail_path)
    write_csv(by_group, by_group_path)
    write_csv(by_image, by_image_path)
    write_csv(by_payload, by_payload_path)
    write_csv(by_attack, by_attack_path)
    write_markdown(rows, metadata, overall, by_group, by_image, by_payload, by_attack_category, by_attack, md_path)
    write_contact_sheet(images, contact_sheet_path)

    print_summary(metadata, overall, by_attack_category)
    print()
    print(f"Wrote detail CSV: {detail_path}")
    print(f"Wrote group CSV: {by_group_path}")
    print(f"Wrote image CSV: {by_image_path}")
    print(f"Wrote payload CSV: {by_payload_path}")
    print(f"Wrote attack CSV: {by_attack_path}")
    print(f"Wrote Markdown: {md_path}")
    print(f"Wrote contact sheet: {contact_sheet_path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
