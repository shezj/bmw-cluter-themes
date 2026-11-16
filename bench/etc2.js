'use strict';

/** Decode the ETC1-compatible blocks emitted by tools/bake_etc2_texture.py.
 * The bench expands them for its 2D canvas; the car uploads the compressed
 * blocks directly to the GPU. */
const COLOR_MODIFIERS = [
    [2, 8, -2, -8], [5, 17, -5, -17], [9, 29, -9, -29], [13, 42, -13, -42],
    [18, 60, -18, -60], [24, 80, -24, -80], [33, 106, -33, -106], [47, 183, -47, -183],
];
const ALPHA_MODIFIERS = [
    [-3, -6, -9, -15, 2, 5, 8, 14], [-3, -7, -10, -13, 2, 6, 9, 12],
    [-2, -5, -8, -13, 1, 4, 7, 12], [-2, -4, -6, -13, 1, 3, 5, 12],
    [-3, -6, -8, -12, 2, 5, 7, 11], [-3, -7, -9, -11, 2, 6, 8, 10],
    [-4, -7, -8, -11, 3, 6, 7, 10], [-3, -5, -8, -11, 2, 4, 7, 10],
    [-2, -6, -8, -10, 1, 5, 7, 9], [-2, -5, -8, -10, 1, 4, 7, 9],
    [-2, -4, -8, -10, 1, 3, 7, 9], [-2, -5, -7, -10, 1, 4, 6, 9],
    [-3, -4, -7, -10, 2, 3, 6, 9], [-1, -2, -3, -10, 0, 1, 2, 9],
    [-4, -6, -8, -9, 3, 5, 7, 8], [-3, -5, -7, -9, 2, 4, 6, 8],
];

const clampByte = (value) => Math.max(0, Math.min(255, value));
const field = (value, shift, mask) => Number((value >> BigInt(shift)) & BigInt(mask));

function uint64(buffer, offset) {
    let value = 0n;
    for (let i = 0; i < 8; i++) value = (value << 8n) | BigInt(buffer[offset + i]);
    return value;
}

function colorPixels(block) {
    const differential = field(block, 33, 1);
    const flip = field(block, 32, 1);
    const first = [], second = [];
    for (let channel = 0; channel < 3; channel++) {
        if (differential) {
            const base = field(block, 59 - channel * 8, 31);
            let delta = field(block, 56 - channel * 8, 7);
            if (delta >= 4) delta -= 8;
            first.push((base << 3) | (base >> 2));
            const next = base + delta;
            if (next < 0 || next > 31) throw new Error('unsupported ETC2 colour mode');
            second.push((next << 3) | (next >> 2));
        } else {
            first.push(field(block, 60 - channel * 8, 15) * 17);
            second.push(field(block, 56 - channel * 8, 15) * 17);
        }
    }

    const tables = [field(block, 37, 7), field(block, 34, 7)];
    const pixels = [];
    for (let pixel = 0; pixel < 16; pixel++) {
        const x = Math.floor(pixel / 4), y = pixel % 4;
        const group = flip ? (y < 2 ? 0 : 1) : (x < 2 ? 0 : 1);
        const index = field(block, 16 + pixel, 1) * 2 + field(block, pixel, 1);
        const modifier = COLOR_MODIFIERS[tables[group]][index];
        pixels.push((group ? second : first).map((value) => clampByte(value + modifier)));
    }
    return pixels;
}

function alphaPixels(block) {
    const base = field(block, 56, 255);
    const multiplier = field(block, 52, 15);
    const table = field(block, 48, 15);
    const pixels = [];
    for (let pixel = 0; pixel < 16; pixel++) {
        const index = field(block, 45 - pixel * 3, 7);
        pixels.push(clampByte(base + ALPHA_MODIFIERS[table][index] * multiplier));
    }
    return pixels;
}

function decode(data, width, height, format) {
    if (format !== 'etc2rgb' && format !== 'etc2rgba') throw new Error('unsupported ETC2 format');
    if (width % 4 || height % 4) throw new Error('ETC2 dimensions must be multiples of four');
    const blockBytes = format === 'etc2rgba' ? 16 : 8;
    const expected = (width / 4) * (height / 4) * blockBytes;
    if (data.length !== expected) throw new Error('ETC2 data has the wrong size');

    const rgba = Buffer.alloc(width * height * 4);
    let offset = 0;
    for (let blockY = 0; blockY < height / 4; blockY++) {
        for (let blockX = 0; blockX < width / 4; blockX++, offset += blockBytes) {
            const alpha = format === 'etc2rgba' ? alphaPixels(uint64(data, offset)) : null;
            const colors = colorPixels(uint64(data, offset + (alpha ? 8 : 0)));
            for (let pixel = 0; pixel < 16; pixel++) {
                const x = blockX * 4 + Math.floor(pixel / 4);
                const y = blockY * 4 + pixel % 4;
                const out = (y * width + x) * 4;
                rgba[out] = colors[pixel][0];
                rgba[out + 1] = colors[pixel][1];
                rgba[out + 2] = colors[pixel][2];
                rgba[out + 3] = alpha ? alpha[pixel] : 255;
            }
        }
    }
    return rgba;
}

module.exports = { decode };
