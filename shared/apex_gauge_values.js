'use strict';

/**
 * S58 references: BMW M, "BMW M3 & M4 Explained", cooling system, 13 Jan 2021.
 * https://www.bmw-m.com/en/topics/magazine-article-pool/bmw-m3-m4-cooling-system.html
 * Oil around 100 C; approximate maximum 130 C. Coolant normally 90..105 C.
 * Scale endpoints and colour interpolation are UI choices, not ECU thresholds.
 * No coolant overheat threshold is asserted: above-typical coolant is amber.
 */
const OIL = { range: [50, 150], typical: [100, 100], maximum: 130 };
const COOLANT = { range: [50, 130], typical: [90, 105], maximum: null };
// Gauge pressure above atmosphere. This display span is not an engine limit.
const BOOST = { range: [0, 3] };
const PSI_PER_BAR = 14.5038;

function fraction(value, range) {
    if (!Number.isFinite(value)) return -1;
    return Math.max(0, Math.min(1, (value - range[0]) / (range[1] - range[0])));
}

function oilFraction(value) { return fraction(value, OIL.range); }
function coolantFraction(value) { return fraction(value, COOLANT.range); }
function fuelFraction(value) { return Number.isFinite(value) && value >= 0 ? fraction(value, [0, 1]) : -1; }
function boostFraction(value) { return fraction(value, BOOST.range); }
function boostMaximumText(miles) { return miles ? (BOOST.range[1] * PSI_PER_BAR).toFixed(1) : String(BOOST.range[1]); }
function references(model) {
    return model.typical.map((value) => fraction(value, model.range))
        .concat(model.maximum === null ? -1 : fraction(model.maximum, model.range));
}
function temperatureText(value) { return (Number.isFinite(value) ? Math.round(value) : '--') + '°C'; }

module.exports = { OIL, COOLANT, BOOST, oilFraction, coolantFraction, fuelFraction, boostFraction, boostMaximumText, references, temperatureText };
