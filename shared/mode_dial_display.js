'use strict';

// Smooth renderer-owned arc sweep; face artwork changes once, never per frame.
const DURATION_MS = 180;
const KEYS = [[0, 0], [50, 0.6], [110, 0.9], [DURATION_MS, 1]];

function phaseAt(elapsed) {
    if (elapsed <= 0) return 0;
    for (let index = 1; index < KEYS.length; index++) {
        const a = KEYS[index - 1], b = KEYS[index];
        if (elapsed < b[0]) return a[1] + (b[1] - a[1]) * (elapsed - a[0]) / (b[0] - a[0]);
    }
    return 1;
}

class ModeDialDisplay {
    constructor(client, ref, options) {
        this.client = client;
        this.ref = ref;
        this.options = options;
        this.selected = -1;
        this.from = this.to = 0;
        this.startedAt = 0;
        this.animation = 0;
        client.bind(ref, 'u_face', options.asset);
        client.uniform(ref, 'u_size', options.size);
        const geometry = options.geometry;
        client.uniform(ref, 'u_marker', geometry.centre.concat([geometry.radius, geometry.halfAngle]));
        client.uniform(ref, 'u_dots', geometry.dots);
        client.uniform(ref, 'u_brightness', [options.brightness]);
        client.uniform(ref, 'u_phase', [1]);
    }

    angleAt(now) { return this.from + (this.to - this.from) * phaseAt(now - this.startedAt); }

    update(selected, now, force) {
        if (!Number.isInteger(selected) || selected < -1 || selected > 2) throw new Error('invalid mode dial selection');
        if (!force && selected === this.selected) return;
        const animate = !force && this.selected >= 0 && selected >= 0;
        const currentAngle = this.angleAt(now);
        if (this.animation) this.client.stop(this.ref, this.animation);
        this.animation = 0;
        this.selected = selected;
        this.to = selected < 0 ? 0 : this.options.geometry.angles[selected];
        this.from = animate ? currentAngle : this.to;
        this.startedAt = now;
        // New mode text is authoritative immediately; only its indicator travels.
        this.client.pixels(this.options.asset, null, this.options.paint(selected));
        this.client.uniform(this.ref, 'u_selection', [this.from, this.to, selected < 0 ? 0 : 1]);
        if (animate) this.animation = this.client.animate(this.ref, {
            property: 'uniform', name: 'u_phase', keys: KEYS,
        });
    }
}

const shader = `
precision highp float;
varying vec2 v_uv;
uniform sampler2D u_face;
uniform vec2 u_size;
uniform vec4 u_marker; // centre x/y, radius, half-angle in degrees
uniform vec3 u_selection; // from angle, target angle, visible
uniform float u_phase;
uniform float u_brightness;
uniform vec3 u_dots; // dotted arc radius, angular step in degrees, dot radius

vec4 over(vec4 base, vec3 colour, float alpha) {
    float opacity = alpha + base.a * (1.0 - alpha);
    return vec4((colour * alpha + base.rgb * base.a * (1.0 - alpha)) / max(opacity, 0.0001), opacity);
}

void main() {
    vec4 face = texture2D(u_face, v_uv);
    face.rgb *= u_brightness;
    vec2 delta = v_uv * u_size - u_marker.xy;
    float radius = length(delta);
    float angle = atan(delta.x, -delta.y);
    float phase = clamp(u_phase, 0.0, 1.0);
    float current = radians(mix(u_selection.x, u_selection.y, phase));
    float direction = sign(u_selection.y - u_selection.x);
    float behind = (current - angle) * direction;
    float trail = smoothstep(0.0, 0.04, behind) * (1.0 - smoothstep(0.12, 0.38, behind));
    float halo = exp(-pow((radius - u_marker.z) / 6.0, 2.0));
    float moving = (4.0 * phase * (1.0 - phase)) * u_selection.z;
    face = over(face, vec3(1.0, 0.12, 0.04) * u_brightness, trail * halo * moving * 0.35);
    // Illuminate only the existing dots around the travelling indicator.
    float dotStep = radians(u_dots.y);
    float dotAngle = floor(angle / dotStep + 0.5) * dotStep;
    vec2 dotCentre = vec2(sin(dotAngle), -cos(dotAngle)) * u_dots.x;
    float dotDistance = length(delta - dotCentre);
    float dotPulse = (1.0 - smoothstep(0.03, 0.18, abs(dotAngle - current))) * moving;
    float dotGlow = 1.0 - smoothstep(u_dots.z, u_dots.z + 3.5, dotDistance);
    face = over(face, vec3(1.0, 0.24, 0.06) * u_brightness, dotGlow * dotPulse * 0.48);
    float dotInk = clamp(0.5 - dotDistance + u_dots.z, 0.0, 1.0);
    face = over(face, vec3(1.0) * u_brightness, dotInk * dotPulse);
    float arcEnds = 1.0 - smoothstep(radians(u_marker.w) - 0.004, radians(u_marker.w) + 0.004, abs(angle - current));
    float stroke = clamp(2.0 - abs(radius - u_marker.z), 0.0, 1.0);
    face = over(face, vec3(0.96, 0.97, 1.0) * u_brightness, stroke * arcEnds * u_selection.z);
    gl_FragColor = face;
}
`;

module.exports = { ModeDialDisplay, shader, phaseAt, DURATION_MS };
