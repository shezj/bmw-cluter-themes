#!/usr/bin/env python3
"""Store-only build entry: refuse the desktop bench SDK before producing an install bundle."""

import argparse
import json
import os
from pathlib import Path
import subprocess
import sys

ROOT = Path(__file__).resolve().parents[1]


def check_sdk(root):
    sdk = root / 'oap-sdk'
    if not (sdk / 'index.js').is_file() or not (sdk / 'package.json').is_file():
        raise ValueError('The Store must supply the SDK from a stock app on the head unit.')
    code = (sdk / 'index.js').read_text(encoding='utf-8')
    package = json.loads((sdk / 'package.json').read_text(encoding='utf-8'))
    if 'BENCH_STUB' in code or 'bench-stub' in package.get('version', '').lower():
        raise ValueError('Refusing the bench SDK stub. Build this source through MGU Store on the car.')


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('app')
    args = parser.parse_args()
    from validate_store_source import validate
    spec = validate(ROOT, allow_sdk=True)
    if args.app != spec['id']:
        raise ValueError('build id must match the Store app manifest')
    check_sdk(ROOT)
    subprocess.run([sys.executable, str(ROOT / 'kit/tools/build.py'), args.app], cwd=ROOT, check=True)
    if os.environ.get('MGU_SDK_DONOR') or Path('/etc/oap/someip/someip-interfaces.json').exists():
        manifest = ROOT / 'dist' / args.app / 'source' / 'manifest.json'
        subprocess.run(['node', str(ROOT / 'tools/check_someip.js'), str(manifest)], cwd=ROOT, check=True)
    else:
        print('SOMEIP CHECK: unavailable on desktop; firmware compatibility has NOT been checked.', flush=True)


if __name__ == '__main__':
    try:
        main()
    except (ValueError, FileNotFoundError) as error:
        sys.exit(str(error))
