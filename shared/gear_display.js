'use strict';

// A short renderer-side transition: no per-frame bitmap uploads or JS timers.
const DURATION_MS = 100;
const KEYS = [[0, 0], [30, 0.58], [60, 0.86], [DURATION_MS, 1]];

class GearDisplay {
    constructor(client, ref, atlas, size, color) {
        this.client = client;
        this.ref = ref;
        this.atlas = atlas;
        this.value = null;
        this.animation = 0;
        client.bind(ref, 'u_font', atlas.ref);
        client.uniform(ref, 'u_grid', [atlas.cols, atlas.rows]);
        client.uniform(ref, 'u_size', size);
        client.uniform(ref, 'u_cellSize', [atlas.cellW, atlas.cellH]);
        client.uniform(ref, 'u_pixel', [1 / size[0], 1 / size[1]]);
        client.uniform(ref, 'u_color', color);
        client.uniform(ref, 'u_phase', [1]);
    }

    code(value) { return this.atlas.chars.indexOf(value); }

    update(value, force) {
        if (!force && value === this.value) return;
        const previous = this.value;
        this.value = value;
        if (this.animation) this.client.stop(this.ref, this.animation);
        this.animation = 0;
        // P/R/N, missing data, initial display and reconnects snap immediately.
        // During rapid shifts the latest gear wins; transitions are never queued.
        const animate = !force && /^[1-8]$/.test(previous || '') && /^[1-8]$/.test(value);
        const direction = animate && Number(value) < Number(previous) ? -1 : 1;
        this.client.uniform(this.ref, 'u_gears', [this.code(animate ? previous : value), this.code(value), direction]);
        if (animate) this.animation = this.client.animate(this.ref, {
            property: 'uniform', name: 'u_phase', keys: KEYS,
        });
    }
}

const shader = `
precision highp float;
varying vec2 v_uv;
uniform sampler2D u_font;
uniform vec2 u_grid;
uniform vec2 u_size;
uniform vec2 u_cellSize;
uniform vec4 u_color;
uniform vec3 u_gears; // previous code, latest code, shift direction
uniform float u_phase;
uniform vec2 u_pixel;

float glyph(float code, vec2 point) {
    vec2 cell = (point * u_size - u_size * 0.5) / u_cellSize + 0.5;
    float inside = step(0.0, cell.x) * step(cell.x, 1.0) * step(0.0, cell.y) * step(cell.y, 1.0);
    vec2 origin = vec2(mod(max(code, 0.0), u_grid.x), floor(max(code, 0.0) / u_grid.x));
    return texture2D(u_font, (origin + clamp(cell, 0.0, 1.0)) / u_grid).r * inside * step(0.0, code);
}

void main() {
    float phase = clamp(u_phase, 0.0, 1.0);
    // Only a small fraction of the glyph height moves. The incoming gear is
    // dominant from frame one, rather than waiting for an outgoing full roll.
    float travel = 0.16 * u_cellSize.y / u_size.y * u_gears.z;
    float outgoing = glyph(u_gears.x, v_uv + vec2(0.0, travel * phase)) * (1.0 - phase) * 0.3;
    float incoming = glyph(u_gears.y, v_uv - vec2(0.0, travel * (1.0 - phase))) * (0.7 + 0.3 * phase);
    float ink = min(1.0, outgoing + incoming);
    float glow = 0.0;
    if (phase > 0.0 && phase < 1.0) {
        vec2 point = v_uv - vec2(0.0, travel * (1.0 - phase));
        vec2 dx = vec2(u_pixel.x, 0.0), dy = vec2(0.0, u_pixel.y);
        float nearInk = glyph(u_gears.y, point + dx * 2.0) + glyph(u_gears.y, point - dx * 2.0) +
                        glyph(u_gears.y, point + dy * 2.0) + glyph(u_gears.y, point - dy * 2.0);
        float farInk = glyph(u_gears.y, point + dx * 4.0) + glyph(u_gears.y, point - dx * 4.0) +
                       glyph(u_gears.y, point + dy * 4.0) + glyph(u_gears.y, point - dy * 4.0);
        glow = (nearInk * 0.16 + farInk * 0.09) * (4.0 * phase * (1.0 - phase)) * 0.6;
    }
    gl_FragColor = vec4(u_color.rgb, u_color.a * (ink + (1.0 - ink) * glow));
}
`;

module.exports = { GearDisplay, shader, DURATION_MS };
