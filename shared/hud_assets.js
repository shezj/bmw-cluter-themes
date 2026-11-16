'use strict';

/**
 * Validated, cached textures stored in the app's hud data pack.
 *
 * Texture JSON files contain build-time-compressed bytes as base64. Keeping
 * decoding here prevents render widgets from knowing about packaging details.
 */
const data = require('./hud_data');

const FORMATS = {
    etc2rgb: 8,
    etc2rgba: 16,
};
const cache = new Map();

function texture(name) {
    if (!/^[a-z0-9_-]+$/i.test(String(name))) throw new Error('bad texture name "' + name + '"');
    if (cache.has(name)) return cache.get(name);

    const source = data.json('assets/' + name + '.json');
    const blockBytes = FORMATS[source.format];
    const width = source.width;
    const height = source.height;
    if (!blockBytes || !(width > 0 && height > 0 && width <= 2048 && height <= 2048) || width % 4 || height % 4) {
        throw new Error('texture "' + name + '" has invalid ETC2 metadata');
    }

    const pixels = Buffer.from(source.data || '', 'base64');
    const expectedBytes = (width / 4) * (height / 4) * blockBytes;
    if (pixels.length !== expectedBytes) {
        throw new Error('texture "' + name + '" has ' + pixels.length + ' bytes, expected ' + expectedBytes);
    }

    const result = Object.freeze({ format: source.format, width, height, pixels });
    cache.set(name, result);
    return result;
}

module.exports = { texture };
