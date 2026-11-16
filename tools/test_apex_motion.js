'use strict';

const assert = require('assert');
const { StartupMotion, LimiterMotion, GaugeMotion, INTRO_MS } = require('../shared/apex_motion');
const playback = require('../bench/animations');

function testStartup() {
    const running = new Map();
    let nextId = 1;
    const client = {
        animate(ref, options) { const id = nextId++; running.set(id, options); return id; },
        stop(ref, id) { running.delete(id); },
        uniform(ref, name, value) { assert.deepStrictEqual([name, value], ['u_intro', [2]]); },
    };
    const intro = new StartupMotion();
    intro.update(client, 1, null, 0);
    assert.strictEqual(running.size, 0, 'unknown speed must not start a decorative sweep');
    intro.update(client, 1, 0, 100);
    assert.strictEqual(running.size, 1);
    const options = running.get(intro.active.animation);
    const frames = playback.parse(options.keys.map((key) => key[0] + ':' + key[1]).join(' '));
    const animation = { frames, startedAt: 0, interp: 'linear' };
    assert.strictEqual(frames[frames.length - 1].time, INTRO_MS);
    assert.deepStrictEqual(playback.sample(animation, 500), [1]);
    assert.deepStrictEqual(playback.sample(animation, INTRO_MS), [2], 'intro must finish inactive');
    intro.update(client, 1, 20, 150);
    assert.strictEqual(running.size, 0, 'motion must immediately cancel a running intro');
    intro.update(client, 2, 0, 200);
    assert.strictEqual(running.size, 0, 'theme rebuild or stopping later must not replay the intro');
    const movingStart = new StartupMotion();
    movingStart.update(client, 3, 80, 0);
    movingStart.update(client, 3, 0, 100);
    assert.strictEqual(running.size, 0, 'starting while moving must suppress the intro for this session');
    const completion = new StartupMotion();
    completion.update(client, 4, 0, 0);
    completion.update(client, 4, 0, INTRO_MS);
    assert.strictEqual(running.size, 0, 'completed intro must release its cached animation');
    const lostSpeed = new StartupMotion();
    lostSpeed.update(client, 5, 0, 0);
    lostSpeed.update(client, 5, null, 50);
    assert.strictEqual(running.size, 0, 'loss of speed data must cancel an active intro');
}

function testLimiter() {
    const running = new Map(), uniforms = [];
    let nextId = 1, starts = 0;
    const client = {
        animate(ref, options) { starts++; const id = nextId++; running.set(id, options); return id; },
        stop(ref, id) { running.delete(id); },
        uniform(ref, name, value) { uniforms.push({ ref, name, value }); },
    };
    const lights = new LimiterMotion(client, 7);
    lights.update(7199, 7200);
    assert.strictEqual(starts, 0, 'blue/green approach must not flash');
    lights.update(7200, 7200);
    lights.update(7400, 7200);
    assert.strictEqual(starts, 1, 'sustained limiter must not restart the pulse every update');
    const options = running.get(lights.animation);
    assert.strictEqual(options.name, 'u_limiter');
    assert.strictEqual(options.loop, true);
    const frames = playback.parse(options.keys.map((key) => key[0] + ':' + key[1]).join(' '));
    const animation = { frames, startedAt: 0, interp: options.interp, loop: options.loop };
    [[0, 1], [124, 1], [125, 0.15], [249, 0.15], [250, 1], [1125, 0.15]].forEach(([time, expected]) => {
        assert.deepStrictEqual(playback.sample(animation, time), [expected], 'four bright/dim pulses per second');
    });
    lights.update(7100, 7200);
    assert.strictEqual(running.size, 0, 'dropping below the limit must stop flashing immediately');
    assert.deepStrictEqual(uniforms.pop(), { ref: 7, name: 'u_limiter', value: [1] });
    lights.update(4500, 4500);
    assert.strictEqual(running.size, 1, 'warm-up limit must work without a fixed high-RPM threshold');
    lights.update(4500, 5000);
    assert.strictEqual(running.size, 0, 'rising warm-up limit must release the warning');
    [[null, 7200], [NaN, 7200], [7500, null], [7500, 0]].forEach(([rpm, limit]) => {
        lights.update(7500, 7200);
        lights.update(rpm, limit);
        assert.strictEqual(running.size, 0, 'unknown RPM or limit must cancel stale flashing');
    });
}

function testGauges() {
    const motion = new GaugeMotion();
    assert.strictEqual(motion.sample('boost', 0.2, 0, true), 0.2);
    const rising = motion.sample('boost', 0.8, 50);
    assert(rising > 0.2 && rising < 0.8, 'normal boost changes should be damped');
    let previous = rising;
    for (let now = 100; now <= 500; now += 50) {
        const next = motion.sample('boost', 0.8, now);
        assert(next >= previous && next <= 0.8, 'damping must not overshoot');
        previous = next;
    }
    assert.strictEqual(previous, 0.8, 'gauge must settle exactly');
    [null, NaN, -1].forEach((invalid, index) => assert.strictEqual(motion.sample('boost', invalid, 550 + index * 50), -1));
    assert.strictEqual(motion.sample('boost', 0.6, 750), 0.6, 'signal recovery must not animate from invented zero');
    assert.strictEqual(motion.sample('boost', 0.1, 1200), 0.1, 'long rendering gap must snap to current data');
    [['oil', 0.4, 0.8], ['coolant', 0.5, 0.7], ['fuel', 0.7, 0.2]].forEach(([name, normal, urgent]) => {
        motion.sample(name, normal, 0, true);
        assert.strictEqual(motion.sample(name, urgent, 50), urgent, name + ' warning-side value must be immediate');
    });
    const fast = new GaugeMotion(), slow = new GaugeMotion();
    fast.sample('oil', 0.2, 0, true); slow.sample('oil', 0.2, 0, true);
    let fastValue, slowValue;
    for (let now = 10; now <= 200; now += 10) fastValue = fast.sample('oil', 0.6, now);
    for (let now = 50; now <= 200; now += 50) slowValue = slow.sample('oil', 0.6, now);
    assert(Math.abs(fastValue - slowValue) < 1e-9, 'damping must not depend on frame rate');
    assert.throws(() => motion.sample('unknown', 0.5, 0));
}

testStartup();
testLimiter();
testGauges();
console.log('Apex motion: stationary-only startup, limiter flash playback/cancellation, gauge damping and missing/warning data passed.');
