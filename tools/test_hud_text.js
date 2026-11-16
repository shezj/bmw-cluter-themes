'use strict';

// Test the real text rasterizer with shipped fonts, without a head-unit SDK.
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const app = require('./cluster_test_app');
const fontDir = path.join(app, 'hud');
const sandbox = {
    Buffer, console, module: { exports: {} },
    require(name) {
        assert.strictEqual(name, './hud_data');
        return { json: (file) => JSON.parse(fs.readFileSync(path.join(fontDir, file), 'utf8')) };
    },
};
vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../shared/hud_text.js'), 'utf8'), sandbox);
const raster = sandbox.module.exports;
const width = 146, height = 40;
const options = { font: 'l_distance_value', color: [255, 255, 255, 255] };

function testSuffix(value, unit, align) {
    const suffix = { text: unit, font: 'l_distance_unit', gap: 1 };
    const total = raster.measure(value, options.font) + suffix.gap + raster.measure(unit, suffix.font);
    assert(total <= width, value + unit + ' must fit without truncation');
    const x = align === 'right' ? width - total : align === 'center' ? Math.round((width - total) / 2) : 0;
    const base = raster.drawText(width, height, value, Object.assign({}, options, { x }));
    const tail = raster.drawText(width, height, unit, Object.assign({}, options, {
        font: suffix.font, x: x + raster.measure(value, options.font) + suffix.gap,
        offsetY: raster.loadFont(options.font).metrics.baseline - raster.loadFont(suffix.font).metrics.baseline,
    }));
    const actual = raster.drawText(width, height, value, Object.assign({}, options, { align, suffix }));
    for (let pixel = 0; pixel < width * height; pixel++) {
        const alpha = pixel * 4 + 3;
        assert.strictEqual(actual[alpha], Math.max(base[alpha], tail[alpha]), 'suffix must follow the value on its baseline');
        if (pixel >= width * 27) assert.strictEqual(actual[alpha], 0, 'distance text must not clip below its 27 px box');
    }
}

['99', '193', '4094', '000228', '16777214', '------'].forEach((value) => {
    ['mi', 'km'].forEach((unit) => ['left', 'center', 'right'].forEach((align) => testSuffix(value, unit, align)));
});
const hidden = raster.drawText(width, height, '', Object.assign({}, options, {
    suffix: { text: 'mi', font: 'l_distance_unit', gap: 1 },
}));
assert(hidden.every((byte) => byte === 0), 'a hidden value must hide its suffix too');
['fuel', 'turbo'].forEach((name) => {
    const icon = require('../shared/icons').paintIcon(name, 44, 44, options.color);
    assert(icon.some((byte, index) => index % 4 === 3 && byte > 0), name + ' icon must render');
});

function testGearGlyphs() {
    const layout = require(path.join(app, 'hud/layouts/apex.json'));
    const gear = layout.widgets.find((widget) => widget.id === 'gear');
    const font = raster.loadFont(gear.font);
    const padding = (gear.h - font.metrics.cellHeight) / 2;
    assert(padding >= 4, 'gear canvas must leave room for the glow without clipping');
    assert.strictEqual(gear.y + padding, 298, 'glow padding must not move the visible gear');
    const advances = '0123456789'.split('').map((digit) => font.metrics.glyphs[digit].advance);
    assert(advances.every((advance) => advance === advances[0]), 'italic digits must remain tabular');
    Object.keys(font.metrics.glyphs).forEach((character) => {
        const glyph = font.metrics.glyphs[character];
        const x = Math.round((gear.w - glyph.advance) / 2) + glyph.ox;
        assert(x >= 0 && x + glyph.w <= gear.w, 'italic ' + character + ' must fit including its overhang');
        const pixels = raster.drawText(gear.w, gear.h, character, {
            font: gear.font, color: options.color, align: gear.align,
        });
        assert(pixels.some((byte, index) => index % 4 === 3 && byte > 0), 'gear ' + character + ' must render');
    });
}

function testSpeedReadouts() {
    const widgets = require(path.join(app, 'hud/layouts/apex.json')).widgets;
    ['speed', 'speed_secondary'].forEach((id) => {
        const value = widgets.find((widget) => widget.id === id);
        const unit = widgets.find((widget) => widget.id === id + '_unit');
        assert.strictEqual(value.align, 'center');
        assert.strictEqual(unit.align, 'center');
        assert.strictEqual(value.x + value.w / 2, unit.x + unit.w / 2,
            id + ' must share a centre with its unit at every speed');
        const font = raster.loadFont(value.font);
        assert(font.metrics.cellHeight <= value.h);
        ['0', '1', '61', '98', '100', '330', '999', '--'].forEach((text) => {
            assert(raster.measure(text, value.font) <= value.w, id + ': ' + text + ' must fit');
        });
        const advances = '0123456789'.split('').map((digit) => font.metrics.glyphs[digit].advance);
        assert(advances.every((advance) => advance === advances[0]), 'speed digits must stay tabular');
    });
}

testGearGlyphs();
testSpeedReadouts();
console.log('HUD text: inline units, baseline alignment, dynamic widths, clipping, hidden text, gauge icons, gear glyphs and centred speeds passed.');
