'use strict';

const INTRO_MS = 650; // 500 ms rail sweep, followed by a 150 ms LED pulse.
const INTRO_KEYS = [[0, 0], [500, 1], [INTRO_MS, 2]];
// Four red pulses per second; the dim phase keeps the warning visibly red.
const LIMITER_KEYS = [[0, 1], [125, 0.15], [250, 1]];
const SETTLING_EPSILON = 0.001;
const gaugeValues = require('./apex_gauge_values');
const fuelGauge = require('./apex_fuel_gauge');
const GAUGES = {
    boost: { timeConstant: 55 },
    oil: { timeConstant: 220, high: gaugeValues.oilFraction(gaugeValues.OIL.maximum) },
    coolant: { timeConstant: 220, high: gaugeValues.coolantFraction(gaugeValues.COOLANT.typical[1]) },
    fuel: { timeConstant: 350, low: fuelGauge.track.reserve },
};

/** Play once per app session, only with a known stationary speed. */
class StartupMotion {
    constructor() { this.played = false; this.active = null; }

    update(client, ref, speed, now) {
        const known = Number.isFinite(speed);
        const moving = known && (speed > 1 || speed < 0);
        const active = this.active;
        if (active && (active.client !== client || active.ref !== ref || !known || moving || now - active.startedAt >= INTRO_MS)) {
            active.client.stop(active.ref, active.animation);
            active.client.uniform(active.ref, 'u_intro', [2]);
            this.active = null;
        }
        if (this.played || !known) return;
        this.played = true;
        // Starting while moving consumes the intro: stopping later must not replay it.
        if (moving) return;
        const animation = client.animate(ref, { property: 'uniform', name: 'u_intro', keys: INTRO_KEYS });
        if (animation) this.active = { client, ref, animation, startedAt: now };
    }
}

/** Renderer-side flashing: live RPM controls entry/exit, never smoothed RPM. */
class LimiterMotion {
    constructor(client, ref) { this.client = client; this.ref = ref; this.animation = null; }

    update(rpm, limit) {
        const limiting = Number.isFinite(rpm) && Number.isFinite(limit) && limit > 0 && rpm >= limit;
        if (limiting && !this.animation) {
            this.animation = this.client.animate(this.ref, {
                property: 'uniform', name: 'u_limiter', keys: LIMITER_KEYS, loop: true, interp: 'step',
            });
        } else if (!limiting && this.animation) {
            this.client.stop(this.ref, this.animation);
            this.animation = null;
            this.client.uniform(this.ref, 'u_limiter', [1]);
        }
    }
}

/** Cosmetic bar damping only: never changes the underlying signals or text. */
class GaugeMotion {
    constructor() { this.states = {}; }

    sample(name, target, now, force) {
        const model = GAUGES[name];
        if (!model) throw new Error('unknown Apex motion gauge ' + name);
        const previous = this.states[name];
        const missing = !Number.isFinite(target) || target < 0;
        const value = missing ? -1 : Math.min(1, target);
        const elapsed = previous ? now - previous.at : 0;
        // Missing/recovered data, warning-side values and resumed rendering snap.
        // Thresholds here are existing display regions, not new ECU safety limits.
        const urgent = !missing && ((model.high !== undefined && value >= model.high) ||
            (model.low !== undefined && value <= model.low));
        let shown = value;
        if (!force && previous && previous.value >= 0 && !missing && !urgent && elapsed > 0 && elapsed <= 250) {
            shown = previous.value + (value - previous.value) * (1 - Math.exp(-elapsed / model.timeConstant));
            if (Math.abs(shown - value) < SETTLING_EPSILON) shown = value;
        }
        this.states[name] = { value: shown, at: now };
        return shown;
    }
}

module.exports = { StartupMotion, LimiterMotion, GaugeMotion, INTRO_MS };
