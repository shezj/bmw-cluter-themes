'use strict';

const assert = require('assert');
const { ModeDialDisplay, phaseAt, shader, DURATION_MS } = require('../shared/mode_dial_display');
const playback = require('../bench/animations');
const calls = [], uniforms = {}, running = new Map();
let nextId = 1;
const client = {
    bind() {},
    uniform(ref, name, values) { uniforms[name] = values; calls.push(name); },
    pixels(ref, rect, pixels) { calls.push('face ' + pixels.toString()); },
    animate(ref, options) { const id = nextId++; running.set(id, options); calls.push('animate'); return id; },
    stop(ref, id) { running.delete(id); calls.push('stop'); },
};
const display = new ModeDialDisplay(client, 1, {
    asset: 2, size: [420, 160], brightness: 0.6,
    geometry: { centre: [210, 210], radius: 140, halfAngle: 12, angles: [-46, 0, 46], dots: [126, 5, 1.8] },
    paint: (selected) => Buffer.from(String(selected)),
});
assert.deepStrictEqual(uniforms.u_brightness, [0.6], 'shader must dim the face and animated marker together');
assert.deepStrictEqual(uniforms.u_dots, [126, 5, 1.8], 'moving dot highlight must match the baked dotted arc');
display.update(0, 0, true);
assert.deepStrictEqual(uniforms.u_selection, [-46, -46, 1]);
assert.strictEqual(running.size, 0, 'initial selection must be immediate');
const idleWrites = calls.length;
for (let time = 0; time < 1000; time += 50) display.update(0, time);
assert.strictEqual(calls.length, idleWrites, 'idle dial must send no uniform or pixel updates');
display.update(2, 1000);
assert.deepStrictEqual(uniforms.u_selection, [-46, 46, 1]);
const options = running.get(display.animation);
const frames = playback.parse(options.keys.map((key) => key[0] + ':' + key[1]).join(' '));
assert.strictEqual(frames[frames.length - 1].time, DURATION_MS);
for (let time = 0; time <= DURATION_MS; time++) {
    assert(Math.abs(phaseAt(time) - playback.sample({ frames, startedAt: 0, interp: 'linear' }, time)[0]) < 1e-9,
        'interrupted sweep must agree with renderer keyframes');
}
const inFlight = display.angleAt(1050);
display.update(1, 1050);
assert(Math.abs(uniforms.u_selection[0] - inFlight) < 1e-9, 'interruption must start at the visible angle');
assert.strictEqual(uniforms.u_selection[1], 0);
assert.strictEqual(running.size, 1, 'latest mode must replace, not queue, the previous sweep');
display.update(-1, 1060);
assert.strictEqual(uniforms.u_selection[2], 0, 'unknown mode must hide the indicator immediately');
assert.strictEqual(running.size, 0);
display.update(2, 1100);
assert.deepStrictEqual(uniforms.u_selection, [46, 46, 1], 'recovery from unknown must snap to the valid mode');
display.update(0, 1200); display.update(1, 1210, true);
assert.strictEqual(running.size, 0, 'forced refresh must cancel animation');
assert.deepStrictEqual(uniforms.u_selection, [0, 0, 1]);
assert.strictEqual(require('./shader_budget').layer(shader, 420, 160, 'panel').level, 'ok');
console.log('Mode dial transition: 180 ms renderer sweep, continuous interruption, immediate label/unknown state, night dimming, no idle writes and shader budget passed.');
