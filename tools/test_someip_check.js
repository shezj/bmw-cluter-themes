'use strict';
const assert = require('assert');
const checker = require('./check_someip');
const certification = 'de.bmw.infotainment.certification.Certification';
const database = { interfaces: { Vehicle: {}, [certification]: {} } };
const original = { proxies: { Vehicle: { instances: ['${userId}'], attributes: { missing: 'rs' } }, Unknown: '*' }, services: {} };
const snapshot = JSON.stringify(original);
const prepared = checker.prepare(original, database);
assert.strictEqual(prepared.manifest.proxies[certification], '*');
assert.deepStrictEqual(prepared.removed, ['proxies: Unknown']);
assert.deepStrictEqual(prepared.manifest.proxies.Vehicle.instances, ['12231']);
assert.strictEqual(JSON.stringify(original), snapshot, 'Do not alter the package manifest');

const lines = [];
let aclChecked = false;
const passed = checker.check(database, original, [
    { name: 'IFConfigGenerator', generate: function (db, manifest) {
        if (manifest.proxies.Vehicle) throw new Error('configuration failed\nUnknown attribute: missing');
    } },
    { name: 'AclGenerator', generate: function () { aclChecked = true; } }
], function (line) { lines.push(line); });
assert.strictEqual(passed, false);
assert(aclChecked, 'An interface failure must not prevent ACL diagnostics');
assert(lines.some(function (line) { return line.indexOf('Unknown attribute: missing') >= 0; }), 'Keep the cause after the first newline');
assert(lines.includes('Declaration failed: proxies / Vehicle'));
assert(checker.check(database, { proxies: {}, services: {} }, [
    { name: 'fixture', generate: function () {} }
], function () {}));
assert.throws(function () { checker.prepare(original, { interfaces: [] }); }, /Unrecognised/);
console.log('SOME/IP diagnostics: filtering, non-mutation, multiline causes and independent checks passed.');
