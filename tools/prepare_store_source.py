#!/usr/bin/env python3
"""Export a standalone, SDK-free GitHub source without changing the development app."""

import argparse
import json
from pathlib import Path
import re
import shutil
import tempfile

from cluster_source import cluster_app

ROOT = Path(__file__).resolve().parents[1]
APP_ID = 'shez_cluster_themes'
TITLE = 'Shez Cluster Themes'
VERSION = '0.1.0'
RENDERER_MINIMUM = '0.5.9'  # Includes ETC2 RGB assets and uniform animation playback.
COPY_FOLDERS = ('shared', 'kit', 'bench', 'tools', 'docs')
COPY_FILES = ('LICENSE', 'CHANGELOG.md')


def ignore_local_files(folder, names):
    """Only development source and committed/generated artwork belong in this export."""
    ignored = {'.git', '.data', '.DS_Store', '__pycache__', 'node_modules', 'oap-sdk', 'dist', '.venv', '.cache', '.claude'}
    return [name for name in names if name in ignored or name.startswith('._') or
            name == '.env' or name.startswith('.env.') or name.endswith(('.log', '.pyc', '.pem', '.key')) or
            (Path(folder) / name).is_symlink()]


def write_json(file, value):
    file.write_text(json.dumps(value, indent=2, ensure_ascii=False) + '\n', encoding='utf-8')


def store_manifest():
    return {'schema': 1, 'components': [{
        'id': APP_ID, 'kind': 'app', 'path': 'apps/' + APP_ID, 'manifest': 'app.json',
        'mguHmi': ['ID7'], 'requires': {'cluster-render': RENDERER_MINIMUM},
        'build': {'python': 'tools/build_store.py', 'args': ['{id}'], 'sdk': 'oap-sdk',
                  'output': 'dist/{id}@{version}.tgz'},
    }]}


def prepare_app(source, target):
    shutil.copytree(source, target, ignore=ignore_local_files)
    spec = json.loads((target / 'app.json').read_text(encoding='utf-8'))
    spec.update(id=APP_ID, title=TITLE, version=VERSION, vendor='shez', loggingId='SHZC')
    spec['mguHmi'] = ['ID7']
    spec['requires'] = {'cluster-render': RENDERER_MINIMUM}
    for screen in spec['screens']:
        if screen.get('name') == 'MAIN':
            screen['title'] = TITLE
    for setting in spec['settings']:
        if setting['key'] == 'hudLayout':
            setting['default'] = 'off'
        elif setting['key'] == 'byMode':
            setting['default'] = False
    write_json(target / 'app.json', spec)


def export_source(output, source_app='cluster_themes'):
    if not re.fullmatch(r'[a-z0-9][a-z0-9_-]{0,63}', source_app):
        raise ValueError('invalid source app id')
    source = ROOT / 'apps' / source_app
    if not (source / 'app.json').is_file():
        raise ValueError('no source app at ' + str(source))
    output = Path(output).resolve()
    archive = output.with_name(output.name + '-source.zip')
    if output.exists() or archive.exists():
        raise FileExistsError('refusing to replace an existing export or archive: ' + str(output))
    output.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(prefix='store-source-', dir=output.parent) as temporary:
        stage = Path(temporary) / output.name
        stage.mkdir()
        for folder in COPY_FOLDERS:
            shutil.copytree(ROOT / folder, stage / folder, ignore=ignore_local_files)
        for name in COPY_FILES:
            shutil.copy2(ROOT / name, stage / name)
        prepare_app(source, stage / 'apps' / APP_ID)
        write_json(stage / 'mgu-repo.json', store_manifest())
        shutil.copy2(ROOT / 'release/store/README.md', stage / 'README.md')
        shutil.copy2(ROOT / 'release/store/gitignore', stage / '.gitignore')
        workflow = stage / '.github/workflows/check.yml'
        workflow.parent.mkdir(parents=True)
        shutil.copy2(ROOT / 'release/store/check.yml', workflow)
        templates = stage / 'release/store'
        shutil.copytree(ROOT / 'release/store', templates)
        # Validate before publishing any output; failed checks leave no partial export.
        from validate_store_source import validate
        validate(stage)
        stage.rename(output)
    shutil.make_archive(str(archive.with_suffix('')), 'zip', root_dir=output.parent, base_dir=output.name)
    return output, archive


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output', type=Path, required=True)
    parser.add_argument('--app', default=cluster_app(ROOT).name)
    args = parser.parse_args()
    output, archive = export_source(args.output, args.app)
    print('Store source: ' + str(output))
    print('Source archive (not an install bundle): ' + str(archive))


if __name__ == '__main__':
    main()
