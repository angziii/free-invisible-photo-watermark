#!/usr/bin/env python3
# coding=utf-8
"""
Comprehensive robustness benchmark for blind_watermark.
Tests various attacks and measures bit accuracy.
"""
import os
import sys
import tempfile
import numpy as np
import cv2

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))

from blind_watermark import WaterMark, att
from blind_watermark.bch_codec import BCHCodec


def bit_accuracy(original, extracted):
    if isinstance(original, np.ndarray):
        original = original.flatten()
    if isinstance(extracted, np.ndarray):
        extracted = extracted.flatten()
    original = [1 if b else 0 for b in original]
    extracted = [1 if b else 0 for b in extracted]
    correct = sum(o == e for o, e in zip(original, extracted))
    return correct / len(original) * 100


def create_test_images():
    images = {}
    rng = np.random.RandomState(42)

    img_random = rng.randint(0, 255, (512, 512, 3), dtype=np.uint8)
    images['random'] = img_random

    img_smooth = np.zeros((512, 512, 3), dtype=np.uint8)
    img_smooth[:, :] = [128, 100, 150]
    cv2.GaussianBlur(img_smooth, (51, 51), 0, dst=img_smooth)
    images['smooth'] = img_smooth

    img_textured = np.zeros((512, 512, 3), dtype=np.uint8)
    for i in range(0, 512, 20):
        cv2.line(img_textured, (0, i), (512, i), (200, 200, 200), 1)
    images['textured'] = img_textured

    img_low_contrast = rng.randint(110, 140, (512, 512, 3), dtype=np.uint8)
    images['low_contrast'] = img_low_contrast

    return images


def create_watermarks():
    wms = {}
    wms['8bit'] = np.array([1, 0, 1, 1, 0, 0, 1, 0], dtype=bool)
    wms['16bit'] = np.array([1, 0, 1, 1, 0, 0, 1, 0, 1, 1, 0, 1, 0, 0, 1, 1], dtype=bool)
    wms['32bit'] = np.array([1, 0, 1, 1, 0, 0, 1, 0, 1, 1, 0, 1, 0, 0, 1, 1,
                             0, 1, 0, 1, 1, 0, 1, 0, 0, 1, 1, 0, 1, 0, 1, 1], dtype=bool)
    return wms


def embed_and_extract(img, wm_bits, password_img=1, password_wm=1,
                      adaptive=False, jpeg_aware=False, use_ecc=False):
    wm_shape = (1, len(wm_bits))
    if use_ecc:
        ecc = BCHCodec()
        encoded_size = (len(wm_bits) + ecc.k - 1) // ecc.k * ecc.n
        wm_shape = (1, encoded_size)

    bwm = WaterMark(password_img=password_img, password_wm=password_wm,
                    adaptive=adaptive, jpeg_aware=jpeg_aware, use_ecc=use_ecc)
    bwm.read_img(img=img.copy())
    bwm.read_wm(wm_bits, mode='bit')
    embedded = bwm.embed()

    bwm2 = WaterMark(password_img=password_img, password_wm=password_wm,
                     adaptive=adaptive, jpeg_aware=jpeg_aware, use_ecc=use_ecc)
    extracted = bwm2.extract(embed_img=embedded, wm_shape=wm_shape, mode='bit')

    return embedded, extracted


def test_no_attack(images, wms):
    print("\n" + "=" * 70)
    print("1. NO ATTACK (baseline)")
    print("=" * 70)
    print(f"{'Image':<15} {'Watermark':<10} {'Accuracy':>10}")
    print("-" * 40)
    for img_name, img in images.items():
        for wm_name, wm_bits in wms.items():
            _, extracted = embed_and_extract(img, wm_bits)
            acc = bit_accuracy(wm_bits, extracted)
            print(f"{img_name:<15} {wm_name:<10} {acc:>9.1f}%")


def test_jpeg_attack(images, wms):
    print("\n" + "=" * 70)
    print("2. JPEG COMPRESSION ATTACK")
    print("=" * 70)
    qualities = [95, 90, 80, 70, 60, 50, 40, 30]
    print(f"{'Quality':<10}", end="")
    for wm_name in wms:
        print(f" {wm_name:>10}", end="")
    print()
    print("-" * (10 + 12 * len(wms)))

    for quality in qualities:
        print(f"Q={quality:<7}", end="")
        for wm_name, wm_bits in wms.items():
            accuracies = []
            for img_name, img in images.items():
                embedded, _ = embed_and_extract(img, wm_bits)
                with tempfile.NamedTemporaryFile(suffix='.jpg', delete=False) as f:
                    cv2.imwrite(f.name, embedded, [cv2.IMWRITE_JPEG_QUALITY, quality])
                    jpeg_img = cv2.imread(f.name)
                    os.unlink(f.name)

                wm_shape = (1, len(wm_bits))
                bwm = WaterMark(password_img=1, password_wm=1)
                extracted = bwm.extract(embed_img=jpeg_img, wm_shape=wm_shape, mode='bit')
                acc = bit_accuracy(wm_bits, extracted)
                accuracies.append(acc)
            avg = np.mean(accuracies)
            print(f" {avg:>9.1f}%", end="")
        print()


def test_jpeg_attack_with_ecc(images, wms):
    print("\n" + "=" * 70)
    print("3. JPEG COMPRESSION + ECC")
    print("=" * 70)
    qualities = [95, 90, 80, 70, 60, 50, 40, 30]
    print(f"{'Quality':<10}", end="")
    for wm_name in wms:
        print(f" {wm_name:>10}", end="")
    print()
    print("-" * (10 + 12 * len(wms)))

    for quality in qualities:
        print(f"Q={quality:<7}", end="")
        for wm_name, wm_bits in wms.items():
            accuracies = []
            ecc = BCHCodec()
            encoded_size = (len(wm_bits) + ecc.k - 1) // ecc.k * ecc.n
            wm_shape = (1, encoded_size)

            for img_name, img in images.items():
                embedded, _ = embed_and_extract(img, wm_bits, use_ecc=True)
                with tempfile.NamedTemporaryFile(suffix='.jpg', delete=False) as f:
                    cv2.imwrite(f.name, embedded, [cv2.IMWRITE_JPEG_QUALITY, quality])
                    jpeg_img = cv2.imread(f.name)
                    os.unlink(f.name)

                bwm = WaterMark(password_img=1, password_wm=1, use_ecc=True)
                extracted = bwm.extract(embed_img=jpeg_img, wm_shape=wm_shape, mode='bit')
                acc = bit_accuracy(wm_bits, extracted)
                accuracies.append(acc)
            avg = np.mean(accuracies)
            print(f" {avg:>9.1f}%", end="")
        print()


def test_jpeg_attack_adaptive(images, wms):
    print("\n" + "=" * 70)
    print("4. JPEG COMPRESSION + ADAPTIVE d1/d2")
    print("=" * 70)
    qualities = [95, 90, 80, 70, 60, 50, 40, 30]
    print(f"{'Quality':<10}", end="")
    for wm_name in wms:
        print(f" {wm_name:>10}", end="")
    print()
    print("-" * (10 + 12 * len(wms)))

    for quality in qualities:
        print(f"Q={quality:<7}", end="")
        for wm_name, wm_bits in wms.items():
            accuracies = []
            for img_name, img in images.items():
                embedded, _ = embed_and_extract(img, wm_bits, adaptive=True)
                with tempfile.NamedTemporaryFile(suffix='.jpg', delete=False) as f:
                    cv2.imwrite(f.name, embedded, [cv2.IMWRITE_JPEG_QUALITY, quality])
                    jpeg_img = cv2.imread(f.name)
                    os.unlink(f.name)

                wm_shape = (1, len(wm_bits))
                bwm = WaterMark(password_img=1, password_wm=1, adaptive=True)
                extracted = bwm.extract(embed_img=jpeg_img, wm_shape=wm_shape, mode='bit')
                acc = bit_accuracy(wm_bits, extracted)
                accuracies.append(acc)
            avg = np.mean(accuracies)
            print(f" {avg:>9.1f}%", end="")
        print()


def test_rotation_attack(images, wms):
    print("\n" + "=" * 70)
    print("5. ROTATION ATTACK (no recovery)")
    print("=" * 70)
    angles = [1, 2, 3, 5, 10, 15, 30, 45]
    print(f"{'Angle':<10}", end="")
    for wm_name in wms:
        print(f" {wm_name:>10}", end="")
    print()
    print("-" * (10 + 12 * len(wms)))

    for angle in angles:
        print(f"{angle}°{'':<7}", end="")
        for wm_name, wm_bits in wms.items():
            accuracies = []
            for img_name, img in images.items():
                embedded, _ = embed_and_extract(img, wm_bits)
                rotated = att.rot_att(input_img=embedded, angle=angle)
                wm_shape = (1, len(wm_bits))
                bwm = WaterMark(password_img=1, password_wm=1)
                extracted = bwm.extract(embed_img=rotated, wm_shape=wm_shape, mode='bit')
                acc = bit_accuracy(wm_bits, extracted)
                accuracies.append(acc)
            avg = np.mean(accuracies)
            print(f" {avg:>9.1f}%", end="")
        print()


def test_scaling_attack(images, wms):
    print("\n" + "=" * 70)
    print("6. SCALING ATTACK (no recovery)")
    print("=" * 70)
    scales = [0.25, 0.5, 0.75, 1.5, 2.0, 3.0]
    print(f"{'Scale':<10}", end="")
    for wm_name in wms:
        print(f" {wm_name:>10}", end="")
    print()
    print("-" * (10 + 12 * len(wms)))

    for scale in scales:
        print(f"{scale}x{'':<7}", end="")
        for wm_name, wm_bits in wms.items():
            accuracies = []
            for img_name, img in images.items():
                embedded, _ = embed_and_extract(img, wm_bits)
                h, w = embedded.shape[:2]
                resized = cv2.resize(embedded, (max(1, int(w * scale)), max(1, int(h * scale))))
                resized_back = cv2.resize(resized, (w, h))
                wm_shape = (1, len(wm_bits))
                bwm = WaterMark(password_img=1, password_wm=1)
                extracted = bwm.extract(embed_img=resized_back, wm_shape=wm_shape, mode='bit')
                acc = bit_accuracy(wm_bits, extracted)
                accuracies.append(acc)
            avg = np.mean(accuracies)
            print(f" {avg:>9.1f}%", end="")
        print()


def test_noise_attack(images, wms):
    print("\n" + "=" * 70)
    print("7. NOISE ATTACK")
    print("=" * 70)
    noise_configs = [
        ("Salt 1%", 0.01),
        ("Salt 3%", 0.03),
        ("Salt 5%", 0.05),
        ("Salt 10%", 0.10),
    ]
    print(f"{'Noise':<12}", end="")
    for wm_name in wms:
        print(f" {wm_name:>10}", end="")
    print()
    print("-" * (12 + 12 * len(wms)))

    for noise_name, ratio in noise_configs:
        print(f"{noise_name:<12}", end="")
        for wm_name, wm_bits in wms.items():
            accuracies = []
            for img_name, img in images.items():
                embedded, _ = embed_and_extract(img, wm_bits)
                noisy = att.salt_pepper_att(input_img=embedded, ratio=ratio)
                wm_shape = (1, len(wm_bits))
                bwm = WaterMark(password_img=1, password_wm=1)
                extracted = bwm.extract(embed_img=noisy, wm_shape=wm_shape, mode='bit')
                acc = bit_accuracy(wm_bits, extracted)
                accuracies.append(acc)
            avg = np.mean(accuracies)
            print(f" {avg:>9.1f}%", end="")
        print()


def test_brightness_attack(images, wms):
    print("\n" + "=" * 70)
    print("8. BRIGHTNESS ATTACK")
    print("=" * 70)
    ratios = [0.5, 0.7, 0.8, 0.9, 1.1, 1.2, 1.5, 2.0]
    print(f"{'Ratio':<10}", end="")
    for wm_name in wms:
        print(f" {wm_name:>10}", end="")
    print()
    print("-" * (10 + 12 * len(wms)))

    for ratio in ratios:
        print(f"{ratio}x{'':<7}", end="")
        for wm_name, wm_bits in wms.items():
            accuracies = []
            for img_name, img in images.items():
                embedded, _ = embed_and_extract(img, wm_bits)
                bright = att.bright_att(input_img=embedded, ratio=ratio)
                wm_shape = (1, len(wm_bits))
                bwm = WaterMark(password_img=1, password_wm=1)
                extracted = bwm.extract(embed_img=bright, wm_shape=wm_shape, mode='bit')
                acc = bit_accuracy(wm_bits, extracted)
                accuracies.append(acc)
            avg = np.mean(accuracies)
            print(f" {avg:>9.1f}%", end="")
        print()


def test_crop_attack(images, wms):
    print("\n" + "=" * 70)
    print("9. CROP ATTACK (with recovery)")
    print("=" * 70)
    crops = [
        ("Crop 10%", 0.1),
        ("Crop 20%", 0.2),
        ("Crop 30%", 0.3),
        ("Crop 50%", 0.5),
    ]
    print(f"{'Crop':<12}", end="")
    for wm_name in wms:
        print(f" {wm_name:>10}", end="")
    print()
    print("-" * (12 + 12 * len(wms)))

    for crop_name, ratio in crops:
        print(f"{crop_name:<12}", end="")
        for wm_name, wm_bits in wms.items():
            accuracies = []
            for img_name, img in images.items():
                embedded, _ = embed_and_extract(img, wm_bits)
                h, w = embedded.shape[:2]
                x1, y1 = int(w * ratio / 2), int(h * ratio / 2)
                x2, y2 = int(w * (1 - ratio / 2)), int(h * (1 - ratio / 2))
                cropped = embedded[y1:y2, x1:x2]
                resized = cv2.resize(cropped, (w, h))
                wm_shape = (1, len(wm_bits))
                bwm = WaterMark(password_img=1, password_wm=1)
                extracted = bwm.extract(embed_img=resized, wm_shape=wm_shape, mode='bit')
                acc = bit_accuracy(wm_bits, extracted)
                accuracies.append(acc)
            avg = np.mean(accuracies)
            print(f" {avg:>9.1f}%", end="")
        print()


def test_shelter_attack(images, wms):
    print("\n" + "=" * 70)
    print("10. SHELTER/OCCLUSION ATTACK")
    print("=" * 70)
    configs = [
        ("10% x1", 0.1, 1),
        ("10% x3", 0.1, 3),
        ("20% x1", 0.2, 1),
        ("20% x3", 0.2, 3),
    ]
    print(f"{'Config':<12}", end="")
    for wm_name in wms:
        print(f" {wm_name:>10}", end="")
    print()
    print("-" * (12 + 12 * len(wms)))

    for config_name, ratio, n in configs:
        print(f"{config_name:<12}", end="")
        for wm_name, wm_bits in wms.items():
            accuracies = []
            for img_name, img in images.items():
                embedded, _ = embed_and_extract(img, wm_bits)
                sheltered = att.shelter_att(input_img=embedded, ratio=ratio, n=n)
                wm_shape = (1, len(wm_bits))
                bwm = WaterMark(password_img=1, password_wm=1)
                extracted = bwm.extract(embed_img=sheltered, wm_shape=wm_shape, mode='bit')
                acc = bit_accuracy(wm_bits, extracted)
                accuracies.append(acc)
            avg = np.mean(accuracies)
            print(f" {avg:>9.1f}%", end="")
        print()


def test_combined_attack(images, wms):
    print("\n" + "=" * 70)
    print("11. COMBINED ATTACKS")
    print("=" * 70)
    configs = [
        "JPEG Q70 + Brightness 0.9",
        "JPEG Q70 + Salt 3%",
        "JPEG Q50 + Resize 0.75x",
        "JPEG Q70 + Crop 20%",
        "Brightness 0.8 + Salt 3%",
    ]
    print(f"{'Attack':<30}", end="")
    for wm_name in wms:
        print(f" {wm_name:>10}", end="")
    print()
    print("-" * (30 + 12 * len(wms)))

    for config_name in configs:
        print(f"{config_name:<30}", end="")
        for wm_name, wm_bits in wms.items():
            accuracies = []
            for img_name, img in images.items():
                embedded, _ = embed_and_extract(img, wm_bits)
                attacked = embedded.copy()

                if "JPEG" in config_name:
                    q = int(config_name.split("Q")[1].split()[0])
                    with tempfile.NamedTemporaryFile(suffix='.jpg', delete=False) as f:
                        cv2.imwrite(f.name, attacked, [cv2.IMWRITE_JPEG_QUALITY, q])
                        attacked = cv2.imread(f.name)
                        os.unlink(f.name)

                if "Brightness" in config_name:
                    ratio = float(config_name.split("Brightness ")[1].split()[0])
                    attacked = att.bright_att(input_img=attacked, ratio=ratio)

                if "Salt" in config_name:
                    ratio = float(config_name.split("Salt ")[1].split("%")[0]) / 100
                    attacked = att.salt_pepper_att(input_img=attacked, ratio=ratio)

                if "Resize" in config_name:
                    scale = float(config_name.split("Resize ")[1].split("x")[0])
                    h, w = attacked.shape[:2]
                    attacked = cv2.resize(attacked, (max(1, int(w * scale)), max(1, int(h * scale))))
                    attacked = cv2.resize(attacked, (w, h))

                if "Crop" in config_name:
                    ratio = float(config_name.split("Crop ")[1].split("%")[0]) / 100
                    h, w = attacked.shape[:2]
                    x1, y1 = int(w * ratio / 2), int(h * ratio / 2)
                    x2, y2 = int(w * (1 - ratio / 2)), int(h * (1 - ratio / 2))
                    attacked = attacked[y1:y2, x1:x2]
                    attacked = cv2.resize(attacked, (w, h))

                wm_shape = (1, len(wm_bits))
                bwm = WaterMark(password_img=1, password_wm=1)
                extracted = bwm.extract(embed_img=attacked, wm_shape=wm_shape, mode='bit')
                acc = bit_accuracy(wm_bits, extracted)
                accuracies.append(acc)
            avg = np.mean(accuracies)
            print(f" {avg:>9.1f}%", end="")
        print()


def test_ecc_vs_no_ecc(images):
    print("\n" + "=" * 70)
    print("12. ECC EFFECTIVENESS (JPEG Q50)")
    print("=" * 70)
    wm_bits = np.array([1, 0, 1, 1, 0, 0, 1, 0, 1, 1, 0, 1, 0, 0, 1, 1], dtype=bool)
    ecc = BCHCodec()
    encoded_size = (len(wm_bits) + ecc.k - 1) // ecc.k * ecc.n

    print(f"{'Mode':<20} {'Random':>10} {'Smooth':>10} {'Textured':>10} {'LowCon':>10}")
    print("-" * 65)

    for mode_name, use_ecc, adaptive in [
        ("No ECC", False, False),
        ("With ECC", True, False),
        ("Adaptive", False, True),
        ("ECC+Adaptive", True, True),
    ]:
        print(f"{mode_name:<20}", end="")
        for img_name in ['random', 'smooth', 'textured', 'low_contrast']:
            img = images[img_name]
            accuracies = []

            wm_shape = (1, encoded_size) if use_ecc else (1, len(wm_bits))
            embedded, _ = embed_and_extract(img, wm_bits, adaptive=adaptive, use_ecc=use_ecc)

            with tempfile.NamedTemporaryFile(suffix='.jpg', delete=False) as f:
                cv2.imwrite(f.name, embedded, [cv2.IMWRITE_JPEG_QUALITY, 50])
                jpeg_img = cv2.imread(f.name)
                os.unlink(f.name)

            bwm = WaterMark(password_img=1, password_wm=1, use_ecc=use_ecc, adaptive=adaptive)
            extracted = bwm.extract(embed_img=jpeg_img, wm_shape=wm_shape, mode='bit')
            acc = bit_accuracy(wm_bits, extracted)
            print(f" {acc:>9.1f}%", end="")
        print()


def test_imperceptibility(images, wms):
    print("\n" + "=" * 70)
    print("13. IMPERCEPTIBILITY (PSNR / SSIM)")
    print("=" * 70)
    print(f"{'Mode':<20} {'Random':>12} {'Smooth':>12} {'Textured':>12} {'LowCon':>12}")
    print("-" * 70)

    for mode_name, adaptive, jpeg_aware in [
        ("Baseline", False, False),
        ("Adaptive", True, False),
        ("JPEG-aware", False, True),
        ("Adaptive+JPEG", True, True),
    ]:
        print(f"{mode_name:<20}", end="")
        for img_name in ['random', 'smooth', 'textured', 'low_contrast']:
            img = images[img_name]
            wm_bits = wms['16bit']
            embedded, _ = embed_and_extract(img, wm_bits, adaptive=adaptive, jpeg_aware=jpeg_aware)

            mse = np.mean((img.astype(float) - embedded.astype(float)) ** 2)
            psnr = 10 * np.log10(255.0 ** 2 / max(mse, 1e-10))
            print(f" {psnr:>11.2f}dB", end="")
        print()


if __name__ == '__main__':
    print("=" * 70)
    print("BLIND WATERMARK ROBUSTNESS BENCHMARK")
    print("=" * 70)

    images = create_test_images()
    wms = create_watermarks()

    print(f"\nTest images: {list(images.keys())}")
    print(f"Watermarks: {list(wms.keys())}")

    test_no_attack(images, wms)
    test_jpeg_attack(images, wms)
    test_jpeg_attack_with_ecc(images, wms)
    test_jpeg_attack_adaptive(images, wms)
    test_rotation_attack(images, wms)
    test_scaling_attack(images, wms)
    test_noise_attack(images, wms)
    test_brightness_attack(images, wms)
    test_crop_attack(images, wms)
    test_shelter_attack(images, wms)
    test_combined_attack(images, wms)
    test_ecc_vs_no_ecc(images)
    test_imperceptibility(images, wms)

    print("\n" + "=" * 70)
    print("BENCHMARK COMPLETE")
    print("=" * 70)
