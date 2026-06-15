#!/usr/bin/env python3
# coding=utf-8
import os
import sys

import cv2
import numpy as np

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from platform_server import (
    PlatformStore,
    decode_code_candidates,
    embed_code,
    hex_to_bits,
    image_from_data_url,
    image_to_data_url,
    resolve_platform_code,
)


def make_image(size=256):
    img = np.zeros((size, size, 3), dtype=np.uint8)
    for y in range(size):
        img[y, :, 0] = y % 255
        img[y, :, 1] = np.arange(size, dtype=np.uint8)
        img[y, :, 2] = 180
    cv2.circle(img, (size // 2, size // 2), size // 5, (30, 220, 120), -1)
    return img


def test_hex_to_bits_roundtrip_shape():
    bits = hex_to_bits("0123456789abcdef")
    assert bits.shape == (64,)
    assert bits.dtype == np.bool_


def test_image_data_url_roundtrip():
    img = make_image(128)
    data_url = image_to_data_url(img)
    decoded = image_from_data_url(data_url)
    assert decoded.shape == img.shape


def test_store_create_item_and_lookup(tmp_path):
    store = PlatformStore(tmp_path / "platform.sqlite3")
    item, code = store.create_item(
        {
            "target_type": "url",
            "target_url": "https://example.com/share",
            "title": "Example",
        },
        code_64="0123456789abcdef",
    )
    assert item["target_url"] == "https://example.com/share"
    assert code["item_id"] == item["id"]
    assert store.get_item_by_code("0123456789abcdef")["id"] == item["id"]


def test_embed_and_resolve_platform_code(tmp_path):
    store = PlatformStore(tmp_path / "platform.sqlite3")
    item, _ = store.create_item(
        {
            "target_type": "url",
            "target_url": "https://example.com/product",
            "title": "Product",
        },
        code_64="0123456789abcdef",
    )
    embedded = embed_code(make_image(), "0123456789abcdef")
    result = resolve_platform_code(store, embedded, min_confidence=0.2)
    assert result["status"] == "found"
    assert result["code"] == "0123456789abcdef"
    assert result["item"]["id"] == item["id"]


def test_decode_unknown_code_is_not_found(tmp_path):
    store = PlatformStore(tmp_path / "platform.sqlite3")
    embedded = embed_code(make_image(), "fedcba9876543210")
    candidates = decode_code_candidates(embedded)
    assert candidates
    result = resolve_platform_code(store, embedded, min_confidence=0.2)
    assert result["status"] == "not_found"
    assert result["item"] is None
