'use strict';

const MILES_PER_KILOMETRE = 0.621371;
// Read-only KombiIF.statusRangeTankStatus.mileageKilometre mapping documented in
// cauliflowermossgrape/idrive7-apps, apps/live_data/signals.js (odo, 24-bit sentinel).
const INVALID_ODOMETER_KM = 0xFFFFFF;

function odometerKm(value) {
    return Number.isFinite(value) && value >= 0 && value < INVALID_ODOMETER_KM ? value : null;
}

function formatOdometer(value, miles) {
    const valid = odometerKm(value);
    if (valid === null) return '------';
    // Never round the total upwards or truncate higher-mileage vehicles.
    const whole = Math.floor(valid * (miles ? MILES_PER_KILOMETRE : 1));
    return String(whole).padStart(6, '0');
}

module.exports = { odometerKm, formatOdometer, INVALID_ODOMETER_KM };
