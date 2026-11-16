'use strict';

const assert = require('assert');
const { GearDisplay, shader, DURATION_MS } = require('../shared/gear_display');
const animations = require('../bench/animations');
const budget = require('./shader_budget');
const calls = [], uniforms = {}, running = new Map();
let nextAnimation = 1;
const client = {
    bind() {},
    uniform(ref, name, values) { uniforms[name] = values; calls.push(name); },
    animate(ref, options) {
        const id = nextAnimation++;
        running.set(id, options);
        calls.push('animate');
        return id;
    },
    stop(ref, id) { running.delete(id); calls.push('stop'); },
};
const atlas = { ref: 2, chars: '0123456789PRN-', cols: 7, rows: 2, cellW: 300, cellH: 194 };
const display = new GearDisplay(client, 1, atlas, [488, 194], [1, 0.2, 0, 1]);
assert.deepStrictEqual(uniforms.u_pixel, [1 / 488, 1 / 194], 'shift glow sampling must use native pixels');
const codes = (from, to, direction) => [atlas.chars.indexOf(from), atlas.chars.indexOf(to), direction];

display.update('2', true);
assert.deepStrictEqual(uniforms.u_gears, codes('2', '2', 1));
assert.strictEqual(running.size, 0, 'initial gear must be immediate');
const unchanged = calls.length;
display.update('2');
assert.strictEqual(calls.length, unchanged, 'unchanged gear must send nothing');
display.update('3');
assert.deepStrictEqual(uniforms.u_gears, codes('2', '3', 1));
assert.strictEqual(running.size, 1);
const upshift = running.get(display.animation);
const frames = animations.parse(upshift.keys.map((key) => key[0] + ':' + key[1]).join(' '));
const animation = { frames, startedAt: 1000, loop: false, interp: 'linear' };
assert.strictEqual(frames[frames.length - 1].time, DURATION_MS);
assert(DURATION_MS <= 120, 'transition must remain fast');
assert.deepStrictEqual(animations.sample(animation, 1000), [0]);
assert.deepStrictEqual(animations.sample(animation, 1030), [0.58]);
assert.deepStrictEqual(animations.sample(animation, 1100), [1]);
assert.deepStrictEqual(animations.sample(animation, 1300), [1], 'animation must hold its final gear');
assert(animations.active(animation, 1099));
assert(!animations.active(animation, 1100));
display.update('4');
assert.deepStrictEqual(uniforms.u_gears, codes('3', '4', 1));
assert.strictEqual(running.size, 1, 'rapid shifts must replace the previous animation, not queue');
display.update('2');
assert.deepStrictEqual(uniforms.u_gears, codes('4', '2', -1));
['P', 'R', 'N', '-', ''].forEach((value) => {
    display.update(value);
    assert.strictEqual(running.size, 0, 'selector / unavailable values must snap immediately');
    assert.deepStrictEqual(uniforms.u_gears, codes(value, value, 1));
});
display.update('3'); display.update('4'); display.update('5', true);
assert.strictEqual(running.size, 0, 'forced refresh must cancel any transition');
assert.deepStrictEqual(uniforms.u_gears, codes('5', '5', 1));
['', '0:NaN', '0:0 0:1', '20:1 10:2', '0:1,2'].forEach((keys) => assert.throws(() => animations.parse(keys)));
const step = { frames: animations.parse('0:0 100:1'), startedAt: 0, interp: 'step', loop: true };
assert.deepStrictEqual(animations.sample(step, 75), [0]);
assert.deepStrictEqual(animations.sample(step, 125), [0]);
assert.strictEqual(budget.layer(shader, 488, 194, 'panel').level, 'ok');
console.log('Gear display: immediate current gear, 100 ms animation, up/down shifts, interruption, selector states, no idle writes and shader budget passed.');
