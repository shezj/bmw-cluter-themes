#!/usr/bin/env python3
"""Read-only checks for the standalone Cluster Themes GitHub source."""

import argparse
import base64
import json
import os
from pathlib import Path
import re

THEMES = {'apex', 'gt3', 'm', 'mview', 'vector', 'sport', 'minimal', 'track', 'drag',
          'rally', 'retro80s', 'cruise', 'dyno', 'ribbon'}
ID = re.compile(r'[a-z0-9][a-z0-9_-]{0,63}')
VERSION = re.compile(r'(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)')


def read_json(path):
    return json.loads(path.read_text(encoding='utf-8'))


def require(condition, message):
    if not condition:
        raise ValueError(message)


def inside(root, name):
    path = (root / name).resolve()
    require(path != root and root in path.parents, 'path escapes source: ' + name)
    return path


def check_tree(root, allow_sdk):
    forbidden = {'.data', 'node_modules', '.venv', '__pycache__'}
    # Ignore Git internals and ignored local build/cache folders after a checkout.
    for folder, dirs, files in os.walk(root):
        dirs[:] = [name for name in dirs if name not in {'.git', 'dist', '__pycache__'}]
        for name in dirs + files:
            path = Path(folder) / name
            rel = path.relative_to(root)
            if allow_sdk and rel.parts[0] == 'oap-sdk':
                continue
            require(not path.is_symlink(), 'source contains a symbolic link: ' + str(rel))
            require(name not in forbidden and name != 'oap-sdk', 'private/runtime data in source: ' + str(rel))
            require(name != '.DS_Store' and not name.startswith('._'), 'local metadata in source: ' + str(rel))
            require(name != '.env' and not name.startswith('.env.') and not name.endswith(('.pem', '.key')),
                    'potential credentials in source: ' + str(rel))


def check_artwork(app):
    hud = app / 'hud'
    for file in hud.rglob('*.json'):
        read_json(file)
    background = read_json(hud / 'assets/apex_background.json')
    blocks = {'etc2rgb': 8, 'etc2rgba': 16}
    require(background.get('format') in blocks, 'unsupported Apex texture format')
    width, height = background['width'], background['height']
    require(0 < width <= 2048 and 0 < height <= 2048 and not width % 4 and not height % 4,
            'invalid Apex texture dimensions')
    pixels = base64.b64decode(background['data'], validate=True)
    require(len(pixels) == width // 4 * (height // 4) * blocks[background['format']], 'invalid Apex texture length')
    for name in THEMES:
        layout = read_json(hud / 'layouts' / (name + '.json'))
        require(isinstance(layout.get('widgets'), list), name + ': missing widgets')
        require((hud / 'previews' / (name + '.json')).is_file(), name + ': missing preview')
        for widget in layout['widgets']:
            for font in [widget.get('font')] + widget.get('fit', []):
                if font:
                    require((hud / 'fonts' / (font + '.json')).is_file(), name + ': missing font ' + font)


def validate(root, allow_sdk=False):
    root = Path(root).resolve()
    catalog = read_json(root / 'mgu-repo.json')
    require(catalog.get('schema') == 1 and len(catalog.get('components', [])) == 1,
            'source must publish exactly one complete Cluster Themes app')
    component = catalog['components'][0]
    app_id = component.get('id', '')
    require(bool(ID.fullmatch(app_id)) and app_id != 'cluster_themes', 'use a separate app id')
    require(component.get('kind') == 'app' and component.get('mguHmi') == ['ID7'], 'source must target iDrive 7')
    app = inside(root, component['path'])
    spec = read_json(app / 'app.json')
    require(spec.get('id') == app_id and app.name == app_id, 'folder, source and app ids must match')
    require(bool(VERSION.fullmatch(spec.get('version', ''))), 'invalid app version')
    require(component.get('requires') == spec.get('requires') == {'cluster-render': '0.5.9'},
            'declare the compatible cluster-render dependency')
    require(spec.get('mguHmi') == ['ID7'] and spec.get('config', {}).get('target') == 'panel', 'invalid cluster target')
    build = component.get('build', {})
    require(build == {'python': 'tools/build_store.py', 'args': ['{id}'], 'sdk': 'oap-sdk',
                      'output': 'dist/{id}@{version}.tgz'}, 'invalid Store build configuration')
    for name in ['LICENSE', 'kit/LICENSE', 'kit/tools/build.py', 'tools/build_store.py',
                 'tools/validate_store_source.py', 'README.md']:
        require(inside(root, name).is_file(), 'missing release file: ' + name)
    for name in spec['shared']:
        require(Path(name).name == name and name.endswith('.js'), 'invalid shared module: ' + name)
        require((root / 'shared' / name).is_file(), 'missing shared module: ' + name)
    settings = {setting['key']: setting for setting in spec['settings']}
    choices = {option[0] for option in settings['hudLayout']['options']}
    require(THEMES <= choices and 'off' in choices, 'a theme or OEM fallback is missing')
    require(settings['hudLayout']['default'] == 'off' and settings['byMode']['default'] is False,
            'first launch must retain the OEM cluster')
    require((app / 'NOTICE').is_file() and (app / 'main.js').is_file(), 'missing app entry or attribution')
    check_artwork(app)
    check_tree(root, allow_sdk)
    return spec


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('root', nargs='?', type=Path, default=Path(__file__).resolve().parents[1])
    args = parser.parse_args()
    spec = validate(args.root)
    print('%s %s: all %d themes, assets, modules, OEM fallback and SDK-free source passed.' %
          (spec['title'], spec['version'], len(THEMES)))


if __name__ == '__main__':
    main()
