'use strict';

/** Shared native-pixel geometry and rendering for Apex's auxiliary instruments. */
function placement(widget, key, fallback) {
    const value = widget[key] || fallback;
    if (!Array.isArray(value) || value.length !== 2 || !value.every(Number.isFinite)) {
        throw new Error('Apex ' + key + ' must be a finite [x, y] origin in display pixels');
    }
    return value;
}

function labelWidgets(widget, origin, labels, prefix, mirrored) {
    const inherited = {};
    ['conn', 'themes', 'toggle'].forEach((key) => {
        if (widget[key] !== undefined) inherited[key] = widget[key];
    });
    return labels.map((label) => Object.assign({}, label, inherited, {
        id: widget.id + '_' + prefix + '_' + label.id,
        type: label.type || 'text',
        class: widget.class || 'content',
        z: (widget.z || 0) + 4,
        x: widget.x + origin[0] + (mirrored ? -label.x - label.w : label.x),
        y: widget.y + origin[1] + label.y,
        align: label.align || 'left',
    }));
}

function vector(point) { return 'vec' + point.length + '(' + point.map((n) => Number.isInteger(n) ? n.toFixed(1) : String(n)).join(', ') + ')'; }
function temperatureLabels(scale, model, marks) {
    const dx = scale.end[0] - scale.start[0], dy = scale.end[1] - scale.start[1];
    const length = Math.sqrt(dx * dx + dy * dy);
    return marks.map((value) => {
        const fraction = (value - model.range[0]) / (model.range[1] - model.range[0]);
        // Match the 17 px tick, then leave 10 px between tick and baked 33 px font cell.
        const x = scale.end[0] - dx * fraction + dy / length * 17;
        const y = scale.end[1] - dy * fraction - dx / length * 17;
        const high = model.maximum !== null ? value >= model.maximum : value > model.typical[1];
        return { id: 'mark_' + value, x: Math.round(x - 29), y: Math.round(y - 43), w: 58, h: 33,
            text: String(value), font: 'l_value', align: 'center',
            color: value === model.range[0] ? [48, 147, 255, 255] : high ?
                (model.maximum !== null ? 'hot' : [255, 184, 60, 255]) : 'fg' };
    });
}
function segment(start, end) { return 'panelSegmentDistance(point, ' + vector(start) + ', ' + vector(end) + ')'; }
function frameDistance(frame) {
    function tapered(index, taper) {
        return 'panelTaperedDistance(point, ' + vector(frame[index]) + ', ' + vector(frame[index + 1]) + ', ' + vector(taper) + ')';
    }
    return 'min(' + tapered(0, [1, 0]) + ', min(' + segment(frame[1], frame[2]) + ', ' + tapered(2, [0, 1]) + '))';
}

const shader = `
float panelSegmentDistance(vec2 point, vec2 start, vec2 end) {
    vec2 line = end - start;
    float along = clamp(dot(point - start, line) / max(dot(line, line), 0.0001), 0.0, 1.0);
    return length(point - start - line * along);
}

// Narrow both core and halo over the last 24 px, ending in a sharp point.
float panelTaperedDistance(vec2 point, vec2 start, vec2 end, vec2 taper) {
    vec2 line = end - start;
    float span = length(line);
    float along = clamp(dot(point - start, line) / span, 0.0, span);
    float width = mix(1.0, clamp(along / 24.0, 0.0, 1.0), taper.x) *
                  mix(1.0, clamp((span - along) / 24.0, 0.0, 1.0), taper.y);
    return length(point - start - line * along / span) / max(width, 0.02);
}

// A single consistent 1.4 px stroke, not stretched or layered icon glyphs.
float panelOilIcon(vec2 point) {
    float body = min(panelSegmentDistance(point, vec2(7.0, 11.0), vec2(29.0, 11.0)),
                     panelSegmentDistance(point, vec2(7.0, 11.0), vec2(12.0, 23.0)));
    body = min(body, panelSegmentDistance(point, vec2(12.0, 23.0), vec2(32.0, 23.0)));
    float spout = min(panelSegmentDistance(point, vec2(29.0, 11.0), vec2(44.0, 6.0)),
                      panelSegmentDistance(point, vec2(44.0, 6.0), vec2(38.0, 23.0)));
    spout = min(spout, panelSegmentDistance(point, vec2(38.0, 23.0), vec2(32.0, 23.0)));
    float handle = min(panelSegmentDistance(point, vec2(9.0, 16.0), vec2(3.0, 5.0)),
                       panelSegmentDistance(point, vec2(3.0, 5.0), vec2(13.0, 5.0)));
    float cap = min(panelSegmentDistance(point, vec2(18.0, 11.0), vec2(18.0, 5.0)),
                    panelSegmentDistance(point, vec2(12.0, 5.0), vec2(24.0, 5.0)));
    float drop = length(point - vec2(43.0, 28.0)) - 1.0;
    return min(min(body, spout), min(min(handle, cap), drop));
}

vec3 panelTemperatureTint(float value, vec3 references, vec3 fg, vec3 hot) {
    vec3 cold = vec3(0.19, 0.58, 1.0);
    vec3 elevated = vec3(1.0, 0.72, 0.24);
    vec3 tint = mix(cold, fg, smoothstep(0.0, references.x, value));
    // Coolant amber means above the documented typical band, not an OEM alarm.
    float highEnd = references.z < 0.0 ? 1.0 : references.z;
    return mix(tint, references.z < 0.0 ? elevated : hot, smoothstep(references.y, highEnd, value));
}

vec3 drawPanelScale(vec3 base, vec2 point, vec2 start, vec2 end, float value, float divisions, vec3 references, vec3 fg, vec3 hot) {
    vec2 tangent = normalize(end - start);
    vec2 up = vec2(tangent.y, -tangent.x);
    float fraction = clamp(dot(point - start, tangent) / length(end - start), 0.0, 1.0);
    float tickIndex = floor(fraction * divisions + 0.5);
    vec2 foot = mix(start, end, tickIndex / divisions);
    float ticks = panelSegmentDistance(point, foot, foot + up * 17.0);
    float rail = panelSegmentDistance(point, start, end);
    float available = step(0.0, value);
    base = layer(base, fg, coverage(ticks - 1.2) * mix(0.35, 0.8, available));
    vec3 guide = panelTemperatureTint(1.0 - fraction, references, fg, hot);
    base = layer(base, guide, coverage(rail - 4.0) * mix(0.12, 0.3, available));

    // Low is at the right: the solid bar grows leftwards towards the maximum.
    // Fill and track use the exact same rail, so they cannot drift out of alignment.
    float fillStart = 1.0 - clamp(value, 0.0, 1.0);
    float filled = smoothstep(fillStart - 0.002, fillStart + 0.002, fraction) *
                   step(0.001, value) * available;
    vec3 liveTint = panelTemperatureTint(clamp(value, 0.0, 1.0), references, fg, hot);
    base = layer(base, liveTint, coverage(rail - 3.5) * filled);
    // A fixed reference bracket marks BMW's typical point/band within the track.
    vec2 typicalLow = mix(end, start, references.x);
    vec2 typicalHigh = mix(end, start, references.y);
    float referenceEnds = min(panelSegmentDistance(point, typicalLow - up * 6.5, typicalLow + up * 6.5),
                              panelSegmentDistance(point, typicalHigh - up * 6.5, typicalHigh + up * 6.5));
    float referenceBand = panelSegmentDistance(point, typicalLow - up * 6.5, typicalHigh - up * 6.5);
    float bandMask = step(0.001, references.y - references.x);
    return layer(base, fg, max(coverage(referenceEnds - 1.0), coverage(referenceBand - 0.8) * bandMask) * mix(0.2, 0.9, available));
}

vec3 drawPanelFrame(vec3 base, float distanceToFrame, vec3 fg, vec3 hot) {
    // A restrained halo and a crisp white core keep the enclosure readable.
    float halo = exp(-distanceToFrame * distanceToFrame / 64.0) * 0.55;
    base = clamp(base + hot * halo, 0.0, 1.0);
    base = layer(base, hot, coverage(distanceToFrame - 3.3));
    return layer(base, mix(fg, vec3(1.0, 0.9, 0.87), 0.15), coverage(distanceToFrame - 1.5));
}

vec3 panelBacking(vec3 base, float distanceToRail) {
    return base * (1.0 - exp(-distanceToRail * distanceToRail / 1600.0) * 0.65);
}
`;

module.exports = { shader, placement, labelWidgets, temperatureLabels, vector, segment, frameDistance };
