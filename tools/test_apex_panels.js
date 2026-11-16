'use strict';

// Run with: node tools/test_apex_panels.js (also compatible with the car's Node 8).
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const oilPanel = require('../shared/apex_oil_panel');
const coolantPanel = require('../shared/apex_coolant_panel');
const fuelGauge = require('../shared/apex_fuel_gauge');
const boostGauge = require('../shared/apex_boost_gauge');
const distanceRow = require('../shared/apex_distance_row');
const distances = require('../shared/vehicle_distances');
const values = require('../shared/apex_gauge_values');
const tachometer = require('../shared/apex_tachometer');
const visible = require('../shared/visible');
const budget = require('./shader_budget');
const app = require('./cluster_test_app');
const layout = require(path.join(app, 'hud/layouts/apex.json'));
const instrument = layout.widgets.filter((widget) => widget.type === 'apexdash')[0];

function testValues() {
    [[50, 0], [95, 0.45], [100, 0.5], [130, 0.8], [150, 1], [-20, 0], [200, 1]].forEach((sample) => {
        assert.strictEqual(values.oilFraction(sample[0]), sample[1]);
    });
    [[50, 0], [90, 0.5], [105, 0.6875], [130, 1], [-20, 0], [150, 1]].forEach((sample) => {
        assert.strictEqual(values.coolantFraction(sample[0]), sample[1]);
    });
    [undefined, null, NaN, Infinity, '95'].forEach((missing) => {
        assert.strictEqual(values.oilFraction(missing), -1);
        assert.strictEqual(values.coolantFraction(missing), -1);
        assert.strictEqual(values.fuelFraction(missing), -1);
        assert.strictEqual(values.boostFraction(missing), -1);
        assert.strictEqual(values.temperatureText(missing), '--°C');
    });
    assert.strictEqual(values.temperatureText(94.7), '95°C');
    assert.deepStrictEqual(values.references(values.OIL), [0.5, 0.5, 0.8]);
    assert.deepStrictEqual(values.references(values.COOLANT), [0.5, 0.6875, -1]);
}

function testTachometer() {
    assert.strictEqual(tachometer.position(0), 0);
    assert.strictEqual(tachometer.position(1), 1);
    let previousGap = 0;
    for (let index = 0; index < 8; index++) {
        const gap = tachometer.position((index + 1) / 8) - tachometer.position(index / 8);
        assert(gap > previousGap, 'each thousand must spread progressively further apart');
        previousGap = gap;
    }
    for (let tick = 0; tick <= 80; tick++) {
        const value = tick / 80;
        assert(Math.abs(tachometer.valueAt(tachometer.position(value)) - value) < 1e-9,
            'every 100-rpm tick must map back to its actual RPM');
    }
    const labels = tachometer.labelWidgets(instrument);
    assert.strictEqual(labels.length, 9);
    labels.forEach((label, index) => {
        const x = tachometer.geometry.start + (tachometer.geometry.end - tachometer.geometry.start) * tachometer.position(index / 8);
        assert(Math.abs(label.x + label.w / 2 - x) <= 0.5, 'numeral must centre below its mapped tick');
        assert.strictEqual(label.hotAtRpm, index * 1000, 'red label colour must still use actual RPM');
    });
    assert.deepStrictEqual(visible.check(labels, 'panel'), []);
}

function testBoost() {
    [[0, 0], [1.5, 0.5], [3, 1], [4, 1], [-0.2, 0]].forEach((sample) => {
        assert.strictEqual(values.boostFraction(sample[0]), sample[1]);
    });
    assert.strictEqual(values.boostMaximumText(false), '3');
    assert.strictEqual(values.boostMaximumText(true), '43.5');
    const left = boostGauge.placement(instrument), right = fuelGauge.placement(instrument);
    assert.strictEqual(left[0], 1920 - right[0]);
    assert.strictEqual(left[1], right[1]);
    const outside = left[0] - fuelGauge.curveX(1) - 38;
    assert(outside >= 3 && outside <= 6, 'boost must mirror the fuel track at the left edge');
    assert.deepStrictEqual(visible.check(boostGauge.labelWidgets(instrument), 'panel'), []);
    const icon = boostGauge.labelWidgets(instrument).find((widget) => widget.type === 'icon');
    assert.strictEqual(icon.icon, 'turbo');
}

function testFuel() {
    [[0, 0], [0.25, 0.25], [0.5, 0.5], [1, 1], [1.1, 1], [-1, -1]].forEach((sample) => {
        assert.strictEqual(values.fuelFraction(sample[0]), sample[1]);
    });
    const origin = fuelGauge.placement(instrument), track = fuelGauge.track;
    const outerEdge = origin[0] + fuelGauge.curveX(1) + 38;
    assert(1920 - outerEdge >= 3 && 1920 - outerEdge <= 6, 'fuel bracket must hug the right edge');
    assert.strictEqual(fuelGauge.curveX(0), fuelGauge.curveX(1), 'both fuel gauge ends must hug the same wall');
    assert.deepStrictEqual(visible.check(fuelGauge.labelWidgets(instrument), 'panel'), []);
    for (let index = 0; index <= 100; index++) {
        const fraction = index / 100;
        const x = origin[0] + fuelGauge.curveX(fraction);
        const y = origin[1] + track.top + (track.bottom - track.top) * fraction;
        assert(x > 1670, 'fuel gauge must remain outside the tach');
        assert(x + 40 < 1920 && y < 660, 'fuel gauge must stay inside the display');
        assert(y - visible.hoodY(x + 40) > 10, 'fuel gauge must clear the hood');
    }
}

function testDistances() {
    [undefined, null, NaN, Infinity, -1, '228', distances.INVALID_ODOMETER_KM].forEach((invalid) => {
        assert.strictEqual(distances.odometerKm(invalid), null);
        assert.strictEqual(distances.formatOdometer(invalid, false), '------');
    });
    assert.strictEqual(distances.formatOdometer(0, false), '000000');
    assert.strictEqual(distances.formatOdometer(228, false), '000228');
    assert.strictEqual(distances.formatOdometer(228, true), '000141');
    assert.strictEqual(distances.formatOdometer(1000000, false), '1000000');
    assert.strictEqual(distances.formatOdometer(16777214, false), '16777214');
    const origin = distanceRow.placement(instrument);
    assert(origin[0] > 1144 && origin[0] + distanceRow.width < 1800,
        'distance row must sit between the speed readout and fuel icon');
    assert.deepStrictEqual(visible.check(distanceRow.labelWidgets(instrument), 'panel'), []);
}

function testPlacement(panel, key, prefix) {
    const original = panel.labelWidgets(instrument);
    const copy = Object.assign({}, instrument, { id: 'copy', conn: 2, toggle: 'auxiliary', themes: ['apex'] });
    const origin = panel.placement(instrument);
    copy[key] = [origin[0] - 100, origin[1] + 20];
    const moved = panel.labelWidgets(copy);
    original.forEach((label, index) => {
        assert.strictEqual(moved[index].x, label.x - 100);
        assert.strictEqual(moved[index].y, label.y + 20);
        assert.strictEqual(moved[index].conn, 2);
        assert.strictEqual(moved[index].toggle, 'auxiliary');
        assert.deepStrictEqual(moved[index].themes, ['apex']);
        assert(moved[index].id.indexOf('copy_' + prefix + '_') === 0);
    });
    [[0], [0, Infinity], [0, 0, 0], 'invalid'].forEach((bad) => {
        const widget = {}; widget[key] = bad;
        assert.throws(() => panel.placement(widget), /finite \[x, y\]/);
    });
}

function testVisibility(panel, mirrored) {
    const labels = panel.labelWidgets(instrument);
    assert.deepStrictEqual(visible.check(labels, 'panel'), []);
    labels.forEach((label, index) => labels.slice(index + 1).forEach((other) => {
        const overlap = label.x < other.x + other.w && label.x + label.w > other.x &&
                        label.y < other.y + other.h && label.y + label.h > other.y;
        assert(!overlap, label.id + ' overlaps ' + other.id);
    }));
    const origin = panel.placement(instrument);
    [panel.frame[0], panel.frame[panel.frame.length - 1]].forEach((tip) => {
        const x = origin[0] + (mirrored ? -tip[0] : tip[0]), y = origin[1] + tip[1];
        const gap = y - visible.hoodY(x);
        assert(gap >= 10 && gap <= 16, 'outline tip must stay close to, but inside, the hood');
        assert(x < 1920 && y < 660);
    });
}

function testTypography(panel) {
    panel.labelWidgets(instrument).forEach((label) => {
        if (label.type !== 'text') return;
        const samples = /Celsius/.test(label.text) ? ['--°C', '-20°C', '95°C', '150°C'] :
            /fuelPct/.test(label.text) ? ['--%', '0%', '100%'] :
            label.text === '{{odometer}}' ? ['------', '000228', '16777214'] :
            label.text === '{{range}}' ? ['--', '99', '4094'] :
            label.text === '{{boostGaugeMax}}' ? ['3', '43.5'] :
            label.text === '{{boost}}' ? ['--', '0.00', '3.00', '43.5'] :
            label.text === '{{u:distLc}}' ? ['mi', 'km'] : [label.text];
        const suffixSamples = label.suffix ? (label.suffix.text === '{{u:distLc}}' ? ['mi', 'km'] : ['psi', 'bar']) : [''];
        const suffixFont = label.suffix && JSON.parse(fs.readFileSync(path.join(app,
            'hud/fonts', label.suffix.font + '.json'), 'utf8'));
        const suffixWidth = Math.max.apply(null, suffixSamples.map((text) => text.split('').reduce((width, ch) => width + suffixFont.glyphs[ch].advance, 0)));
        const fonts = [label.font].concat(label.fit || []).map((name) => {
            const fontPath = path.join(app, 'hud/fonts', name + '.json');
            return JSON.parse(fs.readFileSync(fontPath, 'utf8'));
        });
        samples.forEach((text) => {
            const fits = fonts.some((font) => {
                if (font.cellHeight > label.h || !text.split('').every((character) => font.glyphs[character])) return false;
                return text.split('').reduce((width, character) => width + font.glyphs[character].advance, 0) +
                    suffixWidth + (label.suffix ? label.suffix.gap : 0) <= label.w;
            });
            assert(fits, label.id + ': text does not fit: ' + text);
        });
    });
}

testValues();
testPlacement(oilPanel, 'oilPanel', 'oil');
testPlacement(coolantPanel, 'coolantPanel', 'coolant');
testPlacement(fuelGauge, 'fuelGauge', 'fuel');
testPlacement(boostGauge, 'boostGauge', 'boost');
testPlacement(distanceRow, 'distanceRow', 'distance');
testVisibility(oilPanel, false);
testVisibility(coolantPanel, true);
testTypography(oilPanel);
testTypography(coolantPanel);
testTypography(fuelGauge);
testTypography(boostGauge);
testTypography(distanceRow);
testTypography(tachometer);
testTachometer();
testFuel();
testBoost();
testDistances();
assert.strictEqual(budget.layer(require('../shared/apex_shader'), 1920, 660, 'panel').level, 'ok');
console.log('Apex instruments: progressive tach mapping, temperature references, fuel and boost levels, missing data, placement, visibility, typography and shader budget passed.');
