'use strict';

const panels = require('./apex_panel');
const DEFAULT_PLACEMENT = [146, 286];
const LABELS = [
    { id: 'zero', x: 88, y: 302, w: 34, h: 33, text: '0', font: 'l_value', color: 'fg', align: 'center' },
    { id: 'value', x: -24, y: 302, w: 110, h: 33, text: '{{boost}}', font: 'l_label', color: 'fg',
        suffix: { text: '{{u:boostLc}}', font: 'l_distance_unit', gap: 2 }, align: 'center' },
    { id: 'turbo', type: 'icon', icon: 'turbo', x: 24, y: 242, w: 44, h: 44, color: 'fg' },
];

function placement(widget) { return panels.placement(widget, 'boostGauge', DEFAULT_PLACEMENT); }
function labelWidgets(widget) { return panels.labelWidgets(widget, placement(widget), LABELS, 'boost', true); }

module.exports = { placement, labelWidgets };
