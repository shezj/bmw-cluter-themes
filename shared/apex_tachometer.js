'use strict';

const panels = require('./apex_panel');
const GEOMETRY = { start: 250, end: 1670, top: 190, rise: 95, power: 1.72 };
// A progressive scale expands the upper RPM ranges without moving the ends.
// The linear term keeps the first 100-rpm ticks readable rather than bunching
// them at zero; 0–1k occupies 115 px, while 5–6k occupies 204 px.
const LINEAR_WEIGHT = 0.6;
const CURVED_WEIGHT = 1 - LINEAR_WEIGHT;
const DIVISIONS = 8;
const LABEL = { width: 82, height: 40, offsetY: 26 };

function position(value) { return LINEAR_WEIGHT * value + CURVED_WEIGHT * value * value; }
function valueAt(position) {
    const bounded = Math.max(0, Math.min(1, position));
    return (Math.sqrt(LINEAR_WEIGHT * LINEAR_WEIGHT + 4 * CURVED_WEIGHT * bounded) - LINEAR_WEIGHT) / (2 * CURVED_WEIGHT);
}
function curve(position) {
    return GEOMETRY.top + GEOMETRY.rise * Math.pow(Math.abs(position * 2 - 1), GEOMETRY.power);
}
function labelWidgets(widget) {
    const span = GEOMETRY.end - GEOMETRY.start;
    const labels = [];
    for (let index = 0; index <= DIVISIONS; index++) {
        const fraction = position(index / DIVISIONS);
        labels.push({ id: String(index),
            x: Math.round(GEOMETRY.start + span * fraction - LABEL.width / 2),
            y: Math.round(curve(fraction) + LABEL.offsetY), w: LABEL.width, h: LABEL.height,
            text: String(index), font: 'l_scale', color: 'fg', align: 'center',
            hotAtRpm: index * (widget.rpmMax || 8000) / DIVISIONS });
    }
    // One shared mapping owns labels and shader ticks: no hand-tuned copies.
    return panels.labelWidgets(widget, [0, 0], labels, 'tach', false);
}

const shader = `
float tachPosition(float value) {
    return ${LINEAR_WEIGHT.toFixed(2)} * value + ${CURVED_WEIGHT.toFixed(2)} * value * value;
}
float tachValueAt(float position) {
    return (sqrt(${(LINEAR_WEIGHT * LINEAR_WEIGHT).toFixed(2)} + ${(4 * CURVED_WEIGHT).toFixed(2)} * clamp(position, 0.0, 1.0)) - ${LINEAR_WEIGHT.toFixed(2)}) / ${(2 * CURVED_WEIGHT).toFixed(2)};
}
`;

module.exports = { geometry: GEOMETRY, position, valueAt, curve, labelWidgets, shader };
