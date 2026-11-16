'use strict';

const PANEL = require('./apex_panel').shader;
const OIL_PANEL = require('./apex_oil_panel').shader;
const COOLANT_PANEL = require('./apex_coolant_panel').shader;
const FUEL_GAUGE = require('./apex_fuel_gauge').shader;
const DISTANCE_ROW = require('./apex_distance_row').shader;
const TACH = require('./apex_tachometer');

/**
 * Supercar-style Apex instrument face.
 *
 * One effect samples the compressed graphite background and draws every
 * animated instrument above it: tachometer, shift LEDs and temperature scales. Gear and speed
 * stay in the layout's text system for clear typography and unit conversion.
 */
module.exports = `
#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif

varying vec2 v_uv;
uniform vec2 u_size;
uniform sampler2D u_background;
uniform float u_hasBackground;
uniform float u_rpm;        // smoothed rpm / scale maximum
uniform float u_progress;   // progressive shift-light brightness sweep
uniform float u_limit;      // animated cold-engine limit / configured redline
uniform vec3 u_shift;       // live rpm, green onset, red onset / scale maximum
uniform vec2 u_oilPanel;    // panel origin in native display pixels
uniform float u_oil;        // oil temperature / 50..150 C; -1 = unavailable
uniform vec2 u_coolantPanel; // mirrored left panel origin
uniform float u_coolant;   // coolant temperature / 50..130 C; -1 = unavailable
uniform vec2 u_fuelGauge;  // right-side fuel gauge origin
uniform float u_fuel;      // normalized fuel level; -1 = unavailable
uniform vec2 u_boostGauge; // mirrored left-side boost gauge origin
uniform float u_boost;     // gauge pressure / display span; -1 = unavailable
uniform vec2 u_distanceRow; // odometer/range rule and divider origin
uniform vec3 u_fg;
uniform vec3 u_hot;
uniform float u_intro;     // 0..1: rail sweep, 1..2: LED pulse, 2: inactive
uniform float u_limiter;   // renderer-driven LED brightness; 1 outside limiter

const vec3 LED_BLUE = vec3(0.015, 0.30, 1.0);
// Keep every lamp visibly on, with enough brightness headroom for the RPM sweep.
const float LED_BASE_BRIGHTNESS = 0.45;
const float TACH_CURVE_TOP = ${TACH.geometry.top.toFixed(1)};
const float TACH_CURVE_RISE = ${TACH.geometry.rise.toFixed(1)};
const float TACH_CURVE_POWER = ${TACH.geometry.power.toFixed(2)};

float coverage(float distanceToEdge) {
    return clamp(0.5 - distanceToEdge, 0.0, 1.0);
}

vec3 layer(vec3 base, vec3 colour, float opacity) {
    return mix(base, colour, clamp(opacity, 0.0, 1.0));
}

${PANEL}
${OIL_PANEL}
${COOLANT_PANEL}
${FUEL_GAUGE}
${DISTANCE_ROW}
${TACH.shader}

float tachY(float fraction) {
    float centred = abs(fraction * 2.0 - 1.0);
    // The G80 driver-monitoring module occupies the top-centre 400x110 px.
    // Keep the whole sweep below it instead of breaking the scale in two.
    return TACH_CURVE_TOP + TACH_CURVE_RISE * pow(centred, TACH_CURVE_POWER);
}

float tachSlope(float fraction, float span) {
    float centred = fraction * 2.0 - 1.0;
    return TACH_CURVE_RISE * TACH_CURVE_POWER * 2.0 / span *
           sign(centred) * pow(abs(centred), TACH_CURVE_POWER - 1.0);
}

// Coordinates across and down a graduation, anchored on the lower top rail.
// The downward axis is perpendicular to the curve at that graduation.
vec2 tachTickFrame(vec2 point, float rpmFraction, float start, float span) {
    float fraction = tachPosition(rpmFraction);
    vec2 anchor = vec2(start + fraction * span, tachY(fraction) - 11.0);
    vec2 tangent = normalize(vec2(1.0, tachSlope(fraction, span)));
    vec2 normal = vec2(-tangent.y, tangent.x);
    vec2 delta = point - anchor;
    return vec2(dot(delta, tangent), dot(delta, normal));
}

vec3 shiftLed(vec3 base, vec2 delta, float inside, vec3 tint, float active) {
    float radius = length(delta);
    float brightness = mix(LED_BASE_BRIGHTNESS, 1.0, active) * u_limiter;
    float glow = (1.0 - smoothstep(8.5, 24.0, radius)) * inside;
    float glowStrength = mix(0.16, 0.85, active) * u_limiter;
    base = clamp(base + tint * glow * glowStrength, 0.0, 1.0);

    // Upper and lower arcs leave a small opening at each side of the lamp.
    float arcEnds = smoothstep(2.0, 3.8, abs(delta.y));
    float arcs = coverage(abs(radius - 14.0) - 1.15) * arcEnds * inside;
    vec3 arcColour = mix(tint, vec3(1.0), 0.55) * brightness;
    base = layer(base, arcColour, arcs);

    // A flat emissive disc: uniform saturated colour with a softly lit edge.
    float centre = (1.0 - smoothstep(7.5, 9.0, radius)) * inside;
    return layer(base, tint * brightness, centre);
}

void main() {
    vec2 point = v_uv * u_size;
    vec3 colour = u_hasBackground > 0.5 ? texture2D(u_background, v_uv).rgb : vec3(0.0);

    // Curved 0-8 tachometer. The Lamborghini reference uses two closely
    // spaced upper rails, ticks dropping from the lower rail, numerals below
    // the major ticks, and a separate white lower arc.
    float tachStart = ${TACH.geometry.start.toFixed(1)};
    float tachEnd = ${TACH.geometry.end.toFixed(1)};
    float tachSpan = tachEnd - tachStart;
    float fraction = (point.x - tachStart) / tachSpan;
    float onTach = step(0.0, fraction) * step(fraction, 1.0);
    float curve = tachY(clamp(fraction, 0.0, 1.0));
    // Project towards the rail to select the nearest graduation, then draw
    // that tick in its exact local frame so its width stays constant as it tilts.
    float slope = tachSlope(clamp(fraction, 0.0, 1.0), tachSpan);
    float scaleFraction = fraction + slope * (point.y - (curve - 11.0)) / tachSpan;
    float scaleRpm = tachValueAt(scaleFraction);
    const float majorDivisions = 8.0;
    const float minorDivisions = majorDivisions * 10.0;
    float graduationIndex = clamp(floor(scaleRpm * minorDivisions + 0.5), 0.0, minorDivisions);
    float graduationFraction = graduationIndex / minorDivisions;
    vec2 tickFrame = tachTickFrame(point, graduationFraction, tachStart, tachSpan);
    float tickWithinThousand = mod(graduationIndex, 10.0);
    float major = 1.0 - step(0.5, tickWithinThousand);
    float halfway = 1.0 - step(0.5, abs(tickWithinThousand - 5.0));
    float onUpperTach = step(0.0, scaleFraction) * step(scaleFraction, 1.0);
    float warmBoundary = smoothstep(u_limit - 0.006, u_limit + 0.006, scaleRpm);
    vec3 scaleColour = mix(u_fg, u_hot, warmBoundary);
    float rpmFill = 1.0 - smoothstep(u_rpm - 0.004, u_rpm + 0.004, scaleRpm);
    float upperBand = step(curve - 20.0, point.y) * step(point.y, curve - 13.0) * onUpperTach;
    colour = layer(colour, scaleColour, upperBand * rpmFill);
    float upperRail = coverage(abs(point.y - (curve - 22.0)) - 1.8) * onUpperTach;
    float lowerRail = coverage(abs(point.y - (curve - 11.0)) - 1.8) * onUpperTach;
    colour = layer(colour, scaleColour, max(upperRail, lowerRail));
    // Decorative light only: do not alter RPM fill, the red limit or live values.
    float sweep = exp(-pow((fraction - u_intro) / 0.055, 2.0)) * step(u_intro, 1.0) * onTach;
    float railHalo = exp(-pow((point.y - curve + 16.5) / 9.0, 2.0));
    colour = clamp(colour + mix(vec3(0.02, 0.25, 1.0), u_hot, warmBoundary) * sweep * railHalo * 0.6, 0.0, 1.0);

    // Eight numbered thousands, ten 100-rpm divisions within each thousand,
    // and a slightly thicker intermediate tick at every 500 rpm.
    float bandTicks = coverage(abs(tickFrame.x) - 0.65) *
                      step(curve - 20.0, point.y) * step(point.y, curve - 13.0) * onUpperTach;
    colour = layer(colour, scaleColour, bandTicks * 0.9);

    vec2 rpmFrame = tachTickFrame(point, u_rpm, tachStart, tachSpan);
    float rpmBlade = coverage(abs(rpmFrame.x) - 1.5) *
                     step(curve - 22.0, point.y) * step(point.y, curve - 11.0) * onUpperTach;
    colour = layer(colour, scaleColour, rpmBlade);

    const float lowerRailOffset = 80.0;
    // Lengths in the local normal direction preserve the previous centre-face
    // geometry: fine and halfway tails stop before the arch, major ticks before labels.
    float tickBottom = mix(mix(68.0, 73.0, halfway), 31.0, major);
    // Fine ticks fade over most of their length. Halfway marks retain a
    // stronger stem; numbered marks stay crisp with only a 2 px softened tip.
    float fadeStart = mix(mix(17.0, 29.0, halfway), tickBottom - 2.0, major);
    float tickFade = 1.0 - smoothstep(fadeStart, tickBottom, tickFrame.y);
    // Numbered ticks cross both upper rails and form angled caps at 0 and 8.
    float tickTop = mix(3.0, -13.0, major);
    float tickMask = step(tickTop, tickFrame.y) * step(tickFrame.y, tickBottom) * tickFade;
    float tickWidth = mix(mix(0.65, 1.05, halfway), 1.25, major);
    float tickStroke = coverage(abs(tickFrame.x) - tickWidth) * tickMask;
    float tickFill = 1.0 - smoothstep(u_rpm - 0.004, u_rpm + 0.004, graduationFraction);
    vec3 tickColour = mix(u_fg, u_hot, smoothstep(u_limit - 0.006, u_limit + 0.006, graduationFraction));
    float idleOpacity = mix(mix(0.36, 0.6, halfway), 0.95, major);
    colour = layer(colour, tickColour, tickStroke * mix(idleOpacity, 1.0, tickFill));

    float splitIndex = min(majorDivisions - 1.0, floor(tachValueAt(fraction) * majorDivisions));
    float splitPosition = (tachPosition(splitIndex / majorDivisions) + tachPosition((splitIndex + 1.0) / majorDivisions)) * 0.5;
    float lowerSplitDistance = abs(fraction - splitPosition) * tachSpan;
    float lowerSplitMask = step(1.5, lowerSplitDistance);
    float innerRail = coverage(abs(point.y - (curve + lowerRailOffset)) - 1.7) * onTach * lowerSplitMask;
    colour = layer(colour, u_fg * 0.94, innerRail);

    // A slim blade makes the moving warm-up boundary readable even while it
    // sits between numbered graduations.
    vec2 limitFrame = tachTickFrame(point, u_limit, tachStart, tachSpan);
    // The moving limit marker also leaves the numeral clear when aligned
    // with a numbered graduation, rather than painting over its short tick.
    float limitIndex = u_limit * majorDivisions;
    float limitNumbered = 1.0 - step(0.01, abs(limitIndex - floor(limitIndex + 0.5)));
    float limitBottom = mix(65.0, 31.0, limitNumbered);
    float limitFadeStart = mix(17.0, limitBottom - 2.0, limitNumbered);
    float limitFade = 1.0 - smoothstep(limitFadeStart, limitBottom, limitFrame.y);
    float limitBlade = coverage(abs(limitFrame.x) - 1.6) *
                       step(-13.0, limitFrame.y) * step(limitFrame.y, limitBottom) * limitFade;
    colour = layer(colour, u_hot, limitBlade);

    // Ten split-arc lamps follow the tach. Colour marks approach, shift and
    // limit; illumination builds along the row as the shift point approaches.
    float ledSlot = (point.x - 730.0) / 51.0;
    float ledInside = step(-0.5, ledSlot) * step(ledSlot, 9.5);
    float ledIndex = floor(ledSlot + 0.5);
    float ledX = 730.0 + ledIndex * 51.0;
    // Follow the tach curve with a 50 px centre offset for ring clearance.
    float ledY = tachY((ledX - tachStart) / tachSpan) - 50.0;
    vec2 ledDelta = point - vec2(ledX, ledY);
    // A short 0.004-scale blend (32 rpm on this 8k face) softens colour changes.
    float green = smoothstep(u_shift.y - 0.004, u_shift.y, u_shift.x);
    float red = smoothstep(u_shift.z - 0.004, u_shift.z, u_shift.x);
    vec3 ledColour = mix(LED_BLUE, vec3(0.0, 1.0, 0.12), green);
    ledColour = mix(ledColour, vec3(1.0, 0.015, 0.025), red);
    // Each lamp brightens within its own slot above the always-on blue baseline.
    // The live shift cue overrides smoothed progress so the whole row is ready on time.
    float ledActive = max(smoothstep(ledIndex, ledIndex + 0.65, u_progress * 10.0), green);
    // Brightness pulses once; live green/red shift cues retain their colours.
    ledActive = max(ledActive, max(0.0, 1.0 - abs(u_intro - 1.5) * 2.0));
    colour = shiftLed(colour, ledDelta, ledInside, ledColour, ledActive);

    vec2 oilPoint = point - u_oilPanel;
    colour = drawApexOilPanel(colour, oilPoint, u_oil, u_fg, u_hot);
    vec2 coolantPoint = vec2(u_coolantPanel.x - point.x, point.y - u_coolantPanel.y);
    colour = drawApexCoolantPanel(colour, coolantPoint, u_coolant, u_fg, u_hot);
    // Select a side before drawing: no duplicate full-screen shader evaluation.
    bool leftSide = point.x < u_size.x * 0.5;
    vec2 sidePoint = leftSide ? vec2(u_boostGauge.x - point.x, point.y - u_boostGauge.y) : point - u_fuelGauge;
    colour = drawApexSideGauge(colour, sidePoint, leftSide ? u_boost : u_fuel, leftSide ? 0.0 : 1.0, u_fg, u_hot);
    colour = drawApexFuelIcon(colour, point - u_fuelGauge, u_fuel);
    colour = drawApexDistanceRow(colour, point - u_distanceRow, u_fg);
    gl_FragColor = vec4(colour, 1.0);
}
`;
