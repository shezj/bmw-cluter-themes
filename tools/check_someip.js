'use strict';

// Run only the firmware's config/ACL generators. No proxies, services or car
// connections are created. The package itself is never changed by this check.
const fs = require('fs');
const generators = require('../kit/tools/oapgen/gen');
const DATABASE = '/etc/oap/someip/someip-interfaces.json';
const CERTIFICATION = 'de.bmw.infotainment.certification.Certification';
// MainApp allocates the real uid later. This is a representative OAP uid for
// syntax/config generation, not a reservation or an installed app identity.
const DIAGNOSTIC_UID = '12231';

function prepare(manifest, database) {
    if (!database.interfaces || Array.isArray(database.interfaces) ||
            typeof database.interfaces !== 'object') {
        throw new Error('Unrecognised firmware interface database structure');
    }
    const copy = JSON.parse(JSON.stringify(manifest).replace(/\$\{userId\}/g, DIAGNOSTIC_UID));
    copy.proxies = copy.proxies || {};
    copy.services = copy.services || {};
    copy.proxies[CERTIFICATION] = '*';
    const removed = [];
    ['proxies', 'services'].forEach(function (kind) {
        Object.keys(copy[kind]).forEach(function (id) {
            if (id !== CERTIFICATION && !Object.prototype.hasOwnProperty.call(database.interfaces, id)) {
                delete copy[kind][id];
                removed.push(kind + ': ' + id);
            }
        });
    });
    return { manifest: copy, removed: removed };
}

function errorLines(error) {
    // Retain multiline causes: Store's normal install summary keeps only line 1.
    return String(error && error.stack || error).split(/\r?\n/);
}

function check(database, manifest, implementations, log) {
    const prepared = prepare(manifest, database);
    prepared.removed.forEach(function (id) { log('Store compatibility filter: ' + id); });
    let failed = false;
    implementations.forEach(function (generator) {
        try {
            generator.generate(database, prepared.manifest);
            log(generator.name + ': PASS');
        } catch (error) {
            failed = true;
            log(generator.name + ': FAIL (complete manifest)');
            errorLines(error).forEach(log);
            // Name every declaration that fails independently. Cross-interface
            // failures may exist too, so the complete failure remains decisive.
            ['proxies', 'services'].forEach(function (kind) {
                Object.keys(prepared.manifest[kind]).forEach(function (id) {
                    const single = { proxies: {}, services: {} };
                    single[kind][id] = prepared.manifest[kind][id];
                    try { generator.generate(database, single); }
                    catch (individual) {
                        log('Declaration failed: ' + kind + ' / ' + id);
                        errorLines(individual).forEach(log);
                    }
                });
            });
        }
    });
    return !failed;
}

function main(manifestPath) {
    const log = function (line) { console.log('SOMEIP CHECK: ' + line); };
    if (!manifestPath) throw new Error('Expected path to generated manifest.json');
    log('Read-only config generation; diagnostic uid ' + DIAGNOSTIC_UID + ', not the final install uid');
    const database = JSON.parse(fs.readFileSync(DATABASE, 'utf8'));
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    const implementations = ['IFConfigGenerator', 'AclGenerator'].map(function (name) {
        const implementation = generators.load(name);
        return { name: name, generate: function (db, config) { return implementation.generate(db, config); } };
    });
    if (!check(database, manifest, implementations, log)) {
        throw new Error('Firmware rejected the signal manifest. Install stopped; see SOMEIP CHECK lines above.');
    }
    log('PASS. This checks config generation only; actual installation and live values still need the car.');
}

if (require.main === module) {
    try { main(process.argv[2]); }
    catch (error) {
        errorLines(error).forEach(function (line) { console.error('SOMEIP CHECK: ' + line); });
        process.exitCode = 1;
    }
}

module.exports = { check, prepare };
