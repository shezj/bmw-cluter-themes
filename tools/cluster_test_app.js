'use strict';

// Tests run against the development app or a separately named Store export.
const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..', 'apps');
const candidates = fs.readdirSync(root).filter((name) => {
    const file = path.join(root, name, 'app.json');
    if (!fs.existsSync(file)) return false;
    const spec = JSON.parse(fs.readFileSync(file, 'utf8'));
    return spec.config && spec.config.target === 'panel';
});
const id = process.env.CLUSTER_APP_ID || (candidates.includes('cluster_themes') ? 'cluster_themes' : candidates[0]);
if (!id || !candidates.includes(id)) throw new Error('Set CLUSTER_APP_ID to a cluster app in apps/');
module.exports = path.join(root, id);
