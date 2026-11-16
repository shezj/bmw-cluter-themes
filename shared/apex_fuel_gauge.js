'use strict';

const panels = require('./apex_panel');
const DEFAULT_PLACEMENT = [1774, 286];
// Equal endpoint insets follow the display wall; a shallow inward bow keeps
// the reference's curved character without pulling the top away from the edge.
const TRACK = { top: 45, bottom: 290, edgeX: 103, bow: 24, reserve: 0.25 };
const LABELS = [
    { id: 'full', x: 77, y: 0, w: 58, h: 33, text: '100', font: 'l_value', color: 'fg', align: 'center' },
    { id: 'empty', x: 88, y: 302, w: 34, h: 33, text: '0', font: 'l_value', color: 'hot', align: 'center' },
    { id: 'percent', x: 8, y: 302, w: 70, h: 30, text: '{{fuelPct}}%', font: 'l_label', color: 'fg', align: 'center' },
];

function placement(widget) { return panels.placement(widget, 'fuelGauge', DEFAULT_PLACEMENT); }
function labelWidgets(widget) { return panels.labelWidgets(widget, placement(widget), LABELS, 'fuel', false); }
function curveX(fraction) { return TRACK.edgeX - TRACK.bow * fraction * (1 - fraction); }

const shader = `
float fuelCurveX(float fraction) {
    return ${TRACK.edgeX.toFixed(1)} - ${TRACK.bow.toFixed(1)} * fraction * (1.0 - fraction);
}

float fuelBoxDistance(vec2 point, vec2 centre, vec2 halfSize) {
    vec2 edge = abs(point - centre) - halfSize;
    return length(max(edge, 0.0)) + min(max(edge.x, edge.y), 0.0);
}

float fuelPumpIcon(vec2 point) {
    float body = abs(fuelBoxDistance(point, vec2(12.0, 20.0), vec2(12.0, 20.0)));
    float window = abs(fuelBoxDistance(point, vec2(12.0, 10.0), vec2(8.0, 6.0)));
    float base = panelSegmentDistance(point, vec2(-3.0, 42.0), vec2(27.0, 42.0));
    float nozzle = min(panelSegmentDistance(point, vec2(25.0, 4.0), vec2(34.0, 13.0)),
                       panelSegmentDistance(point, vec2(30.0, 9.0), vec2(30.0, 18.0)));
    float hose = min(panelSegmentDistance(point, vec2(34.0, 13.0), vec2(37.0, 19.0)),
                     panelSegmentDistance(point, vec2(37.0, 19.0), vec2(37.0, 34.0)));
    hose = min(hose, panelSegmentDistance(point, vec2(37.0, 34.0), vec2(32.0, 38.0)));
    hose = min(hose, panelSegmentDistance(point, vec2(32.0, 38.0), vec2(26.0, 34.0)));
    return min(min(body, window), min(base, min(nozzle, hose)));
}

// Fuel and mirrored boost share one track calculation per fragment. Only fuel
// has a reserve bracket: a display maximum is not a boost warning threshold.
vec3 drawApexSideGauge(vec3 base, vec2 point, float value, float isFuel, vec3 fg, vec3 hot) {
    const float top = ${TRACK.top.toFixed(1)};
    const float span = ${(TRACK.bottom - TRACK.top).toFixed(1)};
    const float reserve = ${TRACK.reserve};
    float fraction = clamp((point.y - top) / span, 0.0, 1.0);
    float x = fuelCurveX(fraction);
    float slope = ${TRACK.bow.toFixed(1)} * (2.0 * fraction - 1.0) / span;
    float across = (point.x - x) / sqrt(1.0 + slope * slope);
    float within = step(top, point.y) * step(point.y, top + span);
    float reserveZone = step(1.0 - reserve, fraction) * isFuel;
    float available = step(0.0, value);
    vec3 scaleTint = mix(fg, hot, reserveZone);

    // Feathered contrast backing, following the same curve as the track.
    float backing = exp(-across * across / 1400.0) * within;
    base *= 1.0 - backing * 0.65;
    float rail = coverage(abs(across) - 1.7) * within;
    float tickIndex = floor(fraction * 4.0 + 0.5);
    float tickFraction = tickIndex / 4.0;
    vec2 tickFoot = vec2(fuelCurveX(tickFraction), top + span * tickFraction);
    float ticks = coverage(panelSegmentDistance(point, tickFoot, tickFoot + vec2(38.0, 0.0)) - 1.7);
    vec3 tickTint = mix(fg, hot, step(1.0 - reserve, tickFraction) * isFuel);
    base = layer(base, scaleTint, rail * mix(0.3, 1.0, available));
    base = layer(base, tickTint, ticks * mix(0.3, 1.0, available));

    // The reserve bracket is fixed; the actual level always fills from 0 upward.
    float reserveEdge = coverage(abs(across - 34.0) - 1.7) * within * reserveZone;
    base = layer(base, hot, reserveEdge * mix(0.3, 1.0, available));
    // Antialiased curved sides, not hard binary edges. Each horizontal tick
    // has its own clearance so the level fills one compartment at a time.
    float sides = min(coverage(8.0 - across), coverage(across - 26.0));
    float levelTop = top + span * (1.0 - clamp(value, 0.0, 1.0));
    float height = min(coverage(levelTop - point.y), coverage(point.y - top - span));
    float tickClearance = coverage(3.5 - abs(point.y - tickFoot.y));
    float fill = min(sides, min(height, tickClearance)) * available * step(0.001, value);
    base = layer(base, scaleTint, fill);

    return base;
}

vec3 drawApexFuelIcon(vec3 base, vec2 point, float value) {
    float available = step(0.0, value);
    // Shrink around the original icon's centre to preserve its alignment.
    const float iconScale = 0.88;
    vec2 iconPoint = (point - vec2(47.0, 264.0)) / iconScale + vec2(17.0, 21.0);
    float icon = coverage((fuelPumpIcon(iconPoint) - 1.5) * iconScale);

    // An 8x12 px filled triangle points to the filler side, with clear space
    // between the smaller pump symbol and the gauge's curved rail.
    vec2 arrowPoint = point - vec2(72.0, 264.0);
    vec2 arrowSize = vec2(8.0, 6.0);
    vec2 arrowNormal = normalize(arrowSize.yx);
    float arrowEdge = max(-arrowPoint.x,
        dot(vec2(arrowPoint.x, abs(arrowPoint.y)), arrowNormal) - arrowSize.x * arrowNormal.x);
    float arrow = coverage(arrowEdge);
    return layer(base, vec3(1.0, 0.92, 0.02), max(icon, arrow) * mix(0.25, 1.0, available));
}
`;

module.exports = { shader, placement, labelWidgets, curveX, track: TRACK };
