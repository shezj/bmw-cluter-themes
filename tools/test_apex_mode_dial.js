'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const app = require('./cluster_test_app');
const data = JSON.parse(fs.readFileSync(path.join(app, 'hud/assets/apex_mode_dial.json'), 'utf8'));
const sandbox = {
    Buffer, module: { exports: {} },
    require(name) { return name === './hud_data' ? { json: () => data } : require(name); },
};
vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../shared/apex_mode_dial.js'), 'utf8'), sandbox);
const dial = sandbox.module.exports;

[[null, null, -1], ['comfort', null, 0], ['sport', null, 1], ['sport', 'plus', 2],
    ['sport', 'individual', -1], ['eco', null, -1], ['comfort', 'plus', -1]].forEach((sample) => {
    assert.strictEqual(dial.selection(sample[0], sample[1]), sample[2]);
});
const unknown = dial.paint(-1);
assert.strictEqual(dial.selection('sport', 'plus', { mode: 'comfort', variant: null }), 0,
    'actual M engine setting must take priority over generic FES mode');
assert.strictEqual(dial.selection('sport', 'plus', null), -1,
    'an explicitly unavailable M engine signal must not be replaced by an assumed mode');
[-1, 0, 1, 2].forEach((selected) => {
    const pixels = dial.paint(selected);
    assert.strictEqual(pixels.length, dial.width * dial.height * 4);
    assert.strictEqual(pixels, dial.paint(selected), 'mode artwork must be cached, not repainted per tick');
    if (selected >= 0) assert(!pixels.equals(unknown), 'each selected label must differ from the unknown face');
});
[undefined, null, NaN, 0.5, -2, 3].forEach((invalid) => assert.throws(() => dial.paint(invalid)));
assert.strictEqual(dial.geometry().radius, data.marker.radius);
assert.strictEqual(dial.geometry().angles.join(','), '-46,0,46');
const layout = require(path.join(app, 'hud/layouts/apex.json'));
const widget = layout.widgets.find((item) => item.type === 'modeDial');
assert(widget, 'Apex must include the mode dial');
assert.strictEqual(widget.w, dial.width);
assert.strictEqual(widget.h, dial.height);
assert.strictEqual(widget.y + widget.h, 660, 'mode dial must stop above the existing status strip');
assert.deepStrictEqual(require('../shared/visible').check([widget], 'panel'), []);
console.log('Apex mode dial: Comfort / Sport / Sport Plus, unknown state, marker geometry, artwork cache and bottom-edge placement passed.');
