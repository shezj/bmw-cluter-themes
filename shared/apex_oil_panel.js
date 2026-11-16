'use strict';

/**
 * One local coordinate system for the oil panel's outline, scales and labels.
 * The two tips leave about 14 px to the measured cluster hood, including the glow.
 * Geometry and baked fonts use native display pixels; placement moves every part.
 */
const panels = require('./apex_panel');
const gauges = require('./apex_gauge_values');

const DEFAULT_PLACEMENT = [1350, 0];
const FRAME = [[26, 30], [88, 111], [458, 260], [556, 224]];
const SCALE = { start: [105, 99], end: [440, 235] };
const LABELS = panels.temperatureLabels(SCALE, gauges.OIL, [50, 100, 130, 150]).concat([
    { id: 'value', x: 385, y: 141, w: 58, h: 30, text: '{{oilCelsius}}', font: 'l_label', color: 'fg' },
]);


function placement(widget) { return panels.placement(widget, 'oilPanel', DEFAULT_PLACEMENT); }
function labelWidgets(widget) { return panels.labelWidgets(widget, placement(widget), LABELS, 'oil', false); }
const vector = panels.vector, segment = panels.segment;

const shader = `
vec3 drawApexOilPanel(vec3 base, vec2 point, float value, vec3 fg, vec3 hot) {
    float rail = ${segment(SCALE.start, SCALE.end)};
    // A feathered contrast scrim quiets the honeycomb behind the instruments,
    // without introducing a visible rectangular card or covering the tach.
    base = panelBacking(base, rail);

    float frame = ${panels.frameDistance(FRAME)};
    base = drawPanelFrame(base, frame, fg, hot);
    base = drawPanelScale(base, point, ${vector(SCALE.start)}, ${vector(SCALE.end)}, value, 10.0,
                          ${vector(gauges.references(gauges.OIL))}, fg, hot);

    float icon = panelOilIcon(point - vec2(333.0, 110.0));
    return layer(base, fg, coverage(icon - 1.4));
}
`;

module.exports = { shader, placement, labelWidgets, frame: FRAME, scale: SCALE };
