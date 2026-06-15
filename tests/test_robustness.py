#!/usr/bin/env python3
# coding=utf-8
import os
import sys
import tempfile
import numpy as np
import cv2
import pytest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))

from blind_watermark import WaterMark, att
from blind_watermark.bch_codec import BCHCodec, pad_and_encode, decode_and_unpad
from blind_watermark.recover import estimate_rotation_angle


class TestBCHCodec:
    def test_encode_decode_no_errors(self):
        codec = BCHCodec()
        data = np.array([1, 0, 1, 1, 0, 0, 1, 0, 1, 1, 1, 0, 0, 0, 1, 1], dtype=bool)
        encoded = codec.encode(data)
        assert len(encoded) == 31
        decoded, errors = codec.decode(encoded)
        np.testing.assert_array_equal(decoded[:16], data)
        assert errors == 0

    def test_encode_decode_with_errors(self):
        codec = BCHCodec()
        data = np.array([1, 0, 1, 1, 0, 0, 1, 0, 1, 1, 1, 0, 0, 0, 1, 1], dtype=bool)
        encoded = codec.encode(data)
        corrupted = encoded.copy()
        corrupted[0] = not corrupted[0]
        corrupted[5] = not corrupted[5]
        corrupted[10] = not corrupted[10]
        decoded, errors = codec.decode(corrupted)
        np.testing.assert_array_equal(decoded[:16], data)
        assert errors == 3

    def test_pad_and_encode(self):
        codec = BCHCodec()
        data = np.array([1, 0, 1, 1, 0], dtype=bool)
        encoded, orig_size = pad_and_encode(data, codec)
        assert orig_size == 5
        assert len(encoded) % 31 == 0

    def test_decode_and_unpad(self):
        codec = BCHCodec()
        data = np.array([1, 0, 1, 1, 0], dtype=bool)
        encoded, orig_size = pad_and_encode(data, codec)
        decoded, errors = decode_and_unpad(encoded, orig_size, codec)
        np.testing.assert_array_equal(decoded, data)


class TestAdaptiveD1D2:
    def test_computation(self):
        from blind_watermark.bwm_core import WaterMarkCore
        core = WaterMarkCore()
        block = np.random.randn(4, 4).astype(np.float32) * 100
        d1, d2 = core._compute_block_d(block)
        assert d1 > 0
        assert d2 > 0

    def test_high_energy_block(self):
        from blind_watermark.bwm_core import WaterMarkCore
        core = WaterMarkCore()
        block = np.ones((4, 4), dtype=np.float32) * 500
        d1, d2 = core._compute_block_d(block)
        assert d1 > core.d1_base

    def test_low_energy_block(self):
        from blind_watermark.bwm_core import WaterMarkCore
        core = WaterMarkCore()
        block = np.ones((4, 4), dtype=np.float32) * 10
        d1, d2 = core._compute_block_d(block)
        assert d1 < core.d1_base


class TestJPEGMask:
    def test_mask_structure(self):
        from blind_watermark.bwm_core import WaterMarkCore
        core = WaterMarkCore(jpeg_aware=True)
        assert core._jpeg_mask.shape == (4, 4)
        assert core._jpeg_mask[0, 0] == 1
        assert core._jpeg_mask[3, 3] == 0
        assert core._jpeg_mask[2, 2] == 0
        assert core._jpeg_mask[1, 1] == 1


class TestWeightedAveraging:
    def test_weighted_vs_simple(self):
        from blind_watermark.bwm_core import WaterMarkCore
        core = WaterMarkCore()
        core.wm_size = 2
        block_bits = np.array([
            [0.9, 0.1],
            [0.8, 0.2],
            [0.1, 0.9],
        ])
        weighted = core.extract_avg(block_bits)
        simple = block_bits.mean(axis=0)
        assert not np.allclose(weighted, simple)


class TestWaterMarkIntegration:
    def _create_test_image(self, size=(256, 256)):
        img = np.random.randint(0, 255, (size[0], size[1], 3), dtype=np.uint8)
        return img

    def test_embed_extract_basic(self):
        bwm = WaterMark(password_img=1, password_wm=1)
        img = self._create_test_image()
        bwm.read_img(img=img)
        bwm.read_wm([1, 0, 1, 1, 0, 0, 1, 0], mode='bit')
        embedded = bwm.embed()
        assert embedded is not None
        assert embedded.shape == img.shape

    def test_embed_extract_with_ecc(self):
        bwm = WaterMark(password_img=1, password_wm=1, use_ecc=True)
        img = self._create_test_image()
        bwm.read_img(img=img)
        bwm.read_wm([1, 0, 1, 1, 0, 0, 1, 0], mode='bit')
        embedded = bwm.embed()
        bwm2 = WaterMark(password_img=1, password_wm=1, use_ecc=True)
        wm = bwm2.extract(embed_img=embedded, wm_shape=(1, 8), mode='bit')
        assert wm is not None

    def test_embed_extract_adaptive(self):
        bwm = WaterMark(password_img=1, password_wm=1, adaptive=True)
        img = self._create_test_image()
        bwm.read_img(img=img)
        bwm.read_wm([1, 0, 1, 1, 0, 0, 1, 0], mode='bit')
        embedded = bwm.embed()
        bwm2 = WaterMark(password_img=1, password_wm=1, adaptive=True)
        wm = bwm2.extract(embed_img=embedded, wm_shape=(1, 8), mode='bit')
        assert wm is not None

    def test_embed_extract_jpeg_aware(self):
        bwm = WaterMark(password_img=1, password_wm=1, jpeg_aware=True)
        img = self._create_test_image()
        bwm.read_img(img=img)
        bwm.read_wm([1, 0, 1, 1, 0, 0, 1, 0], mode='bit')
        embedded = bwm.embed()
        bwm2 = WaterMark(password_img=1, password_wm=1, jpeg_aware=True)
        wm = bwm2.extract(embed_img=embedded, wm_shape=(1, 8), mode='bit')
        assert wm is not None

    def test_jpeg_attack_survival(self):
        bwm = WaterMark(password_img=1, password_wm=1, use_ecc=True)
        img = self._create_test_image()
        bwm.read_img(img=img)
        wm_bits = [1, 0, 1, 1, 0, 0, 1, 0]
        bwm.read_wm(wm_bits, mode='bit')
        embedded = bwm.embed()

        with tempfile.TemporaryDirectory() as tmpdir:
            jpeg_path = os.path.join(tmpdir, 'test.jpg')
            cv2.imwrite(jpeg_path, embedded, [cv2.IMWRITE_JPEG_QUALITY, 80])
            jpeg_img = cv2.imread(jpeg_path)

            bwm2 = WaterMark(password_img=1, password_wm=1, use_ecc=True)
            extracted = bwm2.extract(embed_img=jpeg_img, wm_shape=(1, 8), mode='bit')
            assert extracted is not None

    def test_rotation_recovery(self):
        img = np.zeros((512, 512, 3), dtype=np.uint8)
        cv2.rectangle(img, (50, 50), (460, 460), (255, 255, 255), -1)
        cv2.circle(img, (256, 256), 100, (0, 0, 255), -1)

        bwm = WaterMark(password_img=1, password_wm=1)
        bwm.read_img(img=img)
        wm_bits = [1, 0, 1, 1, 0, 0, 1, 0]
        bwm.read_wm(wm_bits, mode='bit')
        embedded = bwm.embed()

        rotated = att.rot_att(input_img=embedded, angle=5)

        bwm2 = WaterMark(password_img=1, password_wm=1)
        angle = estimate_rotation_angle(rotated, bwm2, angle_range=(-10, 10), steps=40, wm_size=8)
        assert abs(angle - (-5)) < 3


if __name__ == '__main__':
    pytest.main([__file__, '-v'])
