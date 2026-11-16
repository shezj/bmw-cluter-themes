'use strict';

const panels = require('./apex_panel');
const gauges = require('./apex_gauge_values');
const DEFAULT_PLACEMENT = [570, 0];
// Mirrors the oil enclosure. The outer shoulder is lower because the measured
// cluster hood reaches 273 px on the left, versus 240 px on the right.
const FRAME = [[26, 30], [88, 111], [458, 304], [556, 268]];
const SCALE = { start: [105, 100], end: [440, 275] };
const LABELS = panels.temperatureLabels(SCALE, gauges.COOLANT, [50, 90, 105, 130]).concat([
    { id: 'value', x: 390, y: 178, w: 70, h: 30, text: '{{coolantCelsius}}', font: 'l_label', color: 'fg', align: 'center' },
]);

function placement(widget) { return panels.placement(widget, 'coolantPanel', DEFAULT_PLACEMENT); }
function labelWidgets(widget) { return panels.labelWidgets(widget, placement(widget), LABELS, 'coolant', true); }

const shader = `
float panelCoolantIcon(vec2 point) {
    float stem = panelSegmentDistance(point, vec2(0.0, 0.0), vec2(0.0, 18.0));
    float bulb = abs(length(point - vec2(0.0, 22.0)) - 4.0);
    float marks = min(panelSegmentDistance(point, vec2(0.0, 5.0), vec2(6.0, 5.0)),
                     panelSegmentDistance(point, vec2(0.0, 12.0), vec2(6.0, 12.0)));
    float waveY = 32.0 + sin(point.x * 0.45) * 1.8;
    float waves = min(abs(point.y - waveY), abs(point.y - waveY - 6.0));
    waves = max(waves, abs(point.x) - 16.0);
    return min(min(stem, bulb), min(marks, waves));
}

vec3 drawApexCoolantPanel(vec3 base, vec2 point, float value, vec3 fg, vec3 hot) {
    float rail = ${panels.segment(SCALE.start, SCALE.end)};
    base = panelBacking(base, rail);
    base = drawPanelFrame(base, ${panels.frameDistance(FRAME)}, fg, hot);
    // Eight intervals across 50..130 Celsius: one tick every 10 degrees.
    base = drawPanelScale(base, point, ${panels.vector(SCALE.start)}, ${panels.vector(SCALE.end)}, value, 8.0,
                          ${panels.vector(gauges.references(gauges.COOLANT))}, fg, hot);
    float icon = panelCoolantIcon(point - vec2(355.0, 155.0));
    return layer(base, fg, coverage(icon - 1.2));
}
`;

module.exports = { shader, placement, labelWidgets, frame: FRAME, scale: SCALE };
