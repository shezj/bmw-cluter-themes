"""Locate the cluster app in a development checkout or single-app Store source."""

import json
from pathlib import Path


def cluster_app(root=None):
    root = Path(root) if root is not None else Path(__file__).resolve().parents[1]
    candidates = []
    for manifest in sorted((root / 'apps').glob('*/app.json')):
        spec = json.loads(manifest.read_text(encoding='utf-8'))
        if spec.get('config', {}).get('target') == 'panel':
            candidates.append(manifest.parent)
    original = root / 'apps/cluster_themes'
    if original in candidates:
        return original
    if len(candidates) == 1:
        return candidates[0]
    raise ValueError('expected one cluster app; specify the source app explicitly')
