#!/usr/bin/env python3
# coding=utf-8
"""
StegaStamp R&D entrypoint.

This does not vendor Berkeley's research code into the production app. It gives
the backend experiment a stable command and explicit dependency checks so the
current DWT-DCT-SVD MVP can be compared against StegaStamp when a local checkout
and pretrained model are available.
"""

from __future__ import annotations

import argparse
from pathlib import Path


REQUIRED_FILES = [
    "encoder.py",
    "decoder.py",
]


def validate_stegastamp_checkout(root: Path, model: Path) -> list[str]:
    missing = []
    for relative in REQUIRED_FILES:
        if not (root / relative).exists():
            missing.append(str(root / relative))
    if not model.exists():
        missing.append(str(model))
    return missing


def main() -> int:
    parser = argparse.ArgumentParser(description="Validate and document the StegaStamp R&D experiment setup.")
    parser.add_argument("--stegastamp-root", type=Path, required=True, help="Local checkout of github.com/tancik/StegaStamp")
    parser.add_argument("--model", type=Path, required=True, help="Path to a pretrained StegaStamp model/checkpoint")
    args = parser.parse_args()

    missing = validate_stegastamp_checkout(args.stegastamp_root, args.model)
    if missing:
        print("StegaStamp R&D setup is incomplete.")
        print("Missing:")
        for path in missing:
            print(f"- {path}")
        print()
        print("Keep this separate from the MVP path until the model beats the current benchmark by >= 10%.")
        return 2

    print("StegaStamp R&D setup found.")
    print("Next step: wrap encoder/decoder inference and run it against experiments/results/watermark_storage_batch_detail.csv attacks.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
