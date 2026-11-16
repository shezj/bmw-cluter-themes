#!/usr/bin/env python3
"""Prepare one opaque cluster texture as JSON containing ETC2 RGB blocks.

Run with Pillow and NumPy, for example:

    uv run --with pillow --with numpy python tools/bake_etc2_texture.py \
      input.png apps/cluster_themes/hud/assets/output.json --width 1920 --height 660

The encoder defaults to the sibling idrive-apps checkout used by this project.
The image is centre-cropped to fit; it is never stretched.
"""
import argparse
import base64
import hashlib
import importlib.util
import json
from pathlib import Path

import numpy as np
from PIL import Image, ImageOps


def load_encoder(path):
    spec = importlib.util.spec_from_file_location('etc2_encode', path)
    if not spec or not spec.loader:
        raise SystemExit('cannot load ETC2 encoder: %s' % path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def main():
    root = Path(__file__).resolve().parents[1]
    default_encoder = root.parent / 'idrive-apps/native/cluster-render/tools/etc2_test/etc2_encode.py'
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('input', type=Path)
    parser.add_argument('output', type=Path)
    parser.add_argument('--width', type=int, required=True)
    parser.add_argument('--height', type=int, required=True)
    parser.add_argument('--encoder', type=Path, default=default_encoder)
    args = parser.parse_args()

    if not (0 < args.width <= 2048 and 0 < args.height <= 2048):
        raise SystemExit('texture dimensions must be between 1 and 2048')
    if args.width % 4 or args.height % 4:
        raise SystemExit('ETC2 texture dimensions must be multiples of four')

    source_bytes = args.input.read_bytes()
    with Image.open(args.input) as source:
        fitted = ImageOps.fit(source.convert('RGBA'), (args.width, args.height), Image.Resampling.LANCZOS,
                              centering=(0.5, 0.5))
    rgba = np.asarray(fitted, dtype=np.uint8)
    encoded = load_encoder(args.encoder).encode(rgba, fmt='etc2rgb')
    payload = {
        'format': 'etc2rgb',
        'width': args.width,
        'height': args.height,
        'source': args.input.name,
        'sourceSha256': hashlib.sha256(source_bytes).hexdigest(),
        'fit': 'centre-crop',
        'data': base64.b64encode(encoded).decode('ascii'),
    }
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(payload, separators=(',', ':')) + '\n', encoding='utf-8')
    print('%s: %dx%d ETC2 RGB, %d bytes' % (args.output, args.width, args.height, len(encoded)))


if __name__ == '__main__':
    main()
