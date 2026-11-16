'use strict';

const panels = require('./apex_panel');
const DEFAULT_PLACEMENT = [1365, 520];
const WIDTH = 320;
const UNIT = { text: '{{u:distLc}}', font: 'l_distance_unit', gap: 1 };
const LABELS = [
    // 8 digits at 15 px + 1 px gap + the 25 px "km" suffix = 146 px.
    { id: 'odometer', x: 7, y: 12, w: 146, h: 27, text: '{{odometer}}', font: 'l_distance_value', suffix: UNIT, color: 'fg' },
    { id: 'pump', type: 'icon', icon: 'fuel', x: 174, y: 13, w: 23, h: 25, color: 'fg' },
    { id: 'range', x: 202, y: 12, w: 118, h: 27, text: '{{range}}', font: 'l_distance_value', suffix: UNIT, color: 'fg' },
];

function placement(widget) { return panels.placement(widget, 'distanceRow', DEFAULT_PLACEMENT); }
function labelWidgets(widget) { return panels.labelWidgets(widget, placement(widget), LABELS, 'distance', false); }

const shader = `
vec3 drawApexDistanceRow(vec3 base, vec2 point, vec3 fg) {
    float rule = panelSegmentDistance(point, vec2(0.0), vec2(${WIDTH.toFixed(1)}, 0.0));
    float separator = panelSegmentDistance(point, vec2(160.0, 14.0), vec2(160.0, 36.0));
    return layer(base, fg, max(coverage(rule - 1.0), coverage(separator - 0.75)));
}
`;

module.exports = { shader, placement, labelWidgets, width: WIDTH };
