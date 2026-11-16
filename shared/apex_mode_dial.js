'use strict';

const zlib = require('zlib');
const WIDTH = 420, HEIGHT = 160;
let states = null, marker = null;

/** Existing drive-mode reader resolves M Setup's engine mode on supported M cars. */
function selection(mode, variant, engineReading) {
    // Prefer the actual M Setup engine setting over a generic FES drive mode.
    // Undefined means not supplied; null means explicitly unavailable.
    if (engineReading !== undefined) {
        if (!engineReading) return -1;
        mode = engineReading.mode;
        variant = engineReading.variant;
    }
    if (mode === 'comfort' && !variant) return 0; // Efficient in the G80's terminology.
    if (mode === 'sport' && !variant) return 1;
    if (mode === 'sport' && variant === 'plus') return 2;
    return -1;
}

function paint(selected) {
    if (!Number.isInteger(selected) || selected < -1 || selected > 2) throw new Error('invalid Apex mode selection');
    if (!states) {
        const source = require('./hud_data').json('assets/apex_mode_dial.json');
        if (source.width !== WIDTH || source.height !== HEIGHT || !Array.isArray(source.states) || source.states.length !== 4) {
            throw new Error('invalid Apex mode dial artwork');
        }
        const geometry = source.marker;
        if (!geometry || !Array.isArray(geometry.centre) || geometry.centre.length !== 2 ||
            !geometry.centre.every(Number.isFinite) || !Array.isArray(geometry.angles) ||
            geometry.angles.length !== 3 || !geometry.angles.every(Number.isFinite) ||
            !Array.isArray(geometry.dots) || geometry.dots.length !== 3 || !geometry.dots.every((value) => Number.isFinite(value) && value > 0) ||
            !(geometry.radius > 0) || !Number.isFinite(geometry.radius) ||
            !(geometry.halfAngle > 0) || !Number.isFinite(geometry.halfAngle)) throw new Error('invalid Apex mode marker geometry');
        const decoded = source.states.map((encoded) => {
            const pixels = zlib.inflateSync(Buffer.from(encoded, 'base64'));
            if (pixels.length !== WIDTH * HEIGHT * 4) throw new Error('invalid Apex mode dial pixel count');
            return pixels;
        });
        states = decoded;
        marker = geometry;
    }
    return states[selected + 1];
}

function geometry() { if (!states) paint(-1); return marker; }

module.exports = { selection, paint, geometry, width: WIDTH, height: HEIGHT };
