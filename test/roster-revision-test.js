const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const context = { window: {}, console: { warn: () => {} } };
vm.createContext(context);
for (const file of ['js/services/EvaluationKey.js', 'js/services/FirebaseService.js']) {
    vm.runInContext(fs.readFileSync(path.join(root, file), 'utf8'), context);
}
const FirebaseService = vm.runInContext('FirebaseService', context);
const inContext = value => vm.runInContext(`(${JSON.stringify(value)})`, context);
const transform = source => vm.runInContext(source, context);

function initialized(groups = [{ name: 'One', members: 'Alice' }, { name: 'Two', members: 'Bob' }], revision = 4) {
    return inContext({ schemaVersion: 2, rosterInitialized: true, rosterRevision: revision, groups, voters: [], evaluations: {} });
}

async function runTests() {
    const initial = initialized();
    const added = FirebaseService.mutateRosterState(initial, 4, transform('groups => [...groups, { name: "Three", members: "Carol" }]'));
    assert.equal(added.ok, true);
    assert.equal(added.state.rosterRevision, 5);
    assert.equal(added.state.rosterInitialized, true);
    assert.equal(added.state.schemaVersion, 2);
    assert.equal(added.state.groups.length, 3);

    const staleAdd = FirebaseService.mutateRosterState(added.state, 4, transform('groups => [...groups, { name: "Stale", members: "" }]'));
    assert.equal(staleAdd.error, 'stale-roster-revision');
    assert.deepEqual(JSON.parse(JSON.stringify(staleAdd.state.groups)), JSON.parse(JSON.stringify(added.state.groups)));

    const renamed = FirebaseService.mutateRosterState(added.state, 5, transform(`groups => {
        groups[0] = { name: 'Renamed', members: 'Alice' };
        return groups;
    }`));
    const memberAdded = FirebaseService.mutateRosterState(renamed.state, 6, transform(`groups => {
        groups[1] = { name: 'Two', members: 'Bob\\nDana' };
        return groups;
    }`));
    const memberRemoved = FirebaseService.mutateRosterState(memberAdded.state, 7, transform(`groups => {
        groups[1] = { name: 'Two', members: 'Bob' };
        return groups;
    }`));
    assert.equal(memberRemoved.state.rosterRevision, 8, 'rename/add/remove each increment revision once');

    const ambiguous = FirebaseService.mutateRosterState(initial, 4, transform(`groups => {
        groups[1] = { name: 'Two', members: 'Ａｌｉｃｅ' };
        return groups;
    }`));
    assert.equal(ambiguous.error, 'ambiguous-roster-members');

    const finalDelete = FirebaseService.deleteGroupState(
        initialized([{ name: 'Only', members: 'Alice' }], 9),
        0,
        true,
        { name: 'Only', members: 'Alice' },
        9,
        true
    );
    assert.equal(finalDelete.ok, true);
    assert.deepEqual(JSON.parse(JSON.stringify(finalDelete.state.groups)), []);
    assert.equal(finalDelete.state.rosterRevision, 10);
    const reloadState = FirebaseService._strictRosterState(finalDelete.state, true);
    assert.ok(reloadState, 'empty initialized rosters remain valid on reload');

    const markerMissingGroups = inContext({ schemaVersion: 2, rosterInitialized: true, rosterRevision: 10, evaluations: {}, voters: [] });
    assert.equal(FirebaseService._strictRosterState(markerMissingGroups, true), null, 'initialized marker with missing groups fails closed');

    const db = {};
    const ref = {};
    let source = initialized([{ name: 'Legacy', members: 'Alice' }], 0);
    delete source.schemaVersion;
    delete source.rosterInitialized;
    delete source.rosterRevision;
    let writes = 0;
    const service = new FirebaseService({ enabled: true, firebaseConfig: { appId: 'seed-test' } }, async () => [
        { getApps: () => [], initializeApp: config => ({ options: config }) },
        {
            getFirestore: () => db,
            doc: () => ref,
            serverTimestamp: () => 'timestamp',
            runTransaction: async (receivedDb, update) => update({
                get: async () => ({ exists: () => true, data: () => source }),
                set: (receivedRef, data) => { writes++; source = inContext({ ...source, ...data }); }
            })
        }
    ]);
    const legacy = await service.seedGroupsIfUninitialized(inContext([{ name: 'Default', members: 'Default Member' }]));
    assert.equal(legacy.ok, true);
    assert.equal(legacy.seeded, false);
    assert.equal(writes, 1, 'legacy explicit groups receive only durable marker metadata');
    assert.deepEqual(JSON.parse(JSON.stringify(source.groups)), [{ name: 'Legacy', members: 'Alice' }]);
    assert.equal(source.rosterInitialized, true);

    let noWrite = 0;
    const malformedMarkerService = new FirebaseService({ enabled: true, firebaseConfig: { appId: 'bad-marker' } }, async () => [
        { getApps: () => [], initializeApp: config => ({ options: config }) },
        {
            getFirestore: () => db,
            doc: () => ref,
            serverTimestamp: () => 'timestamp',
            runTransaction: async (receivedDb, update) => update({
                get: async () => ({ exists: () => true, data: () => markerMissingGroups }),
                set: () => { noWrite++; }
            })
        }
    ]);
    assert.equal((await malformedMarkerService.seedGroupsIfUninitialized(inContext([{ name: 'Default', members: 'Default Member' }]))).ok, false);
    assert.equal(noWrite, 0);

    let emptyWrites = 0;
    const emptyRoster = initialized([], 12);
    const emptyRosterService = new FirebaseService({ enabled: true, firebaseConfig: { appId: 'empty-roster' } }, async () => [
        { getApps: () => [], initializeApp: config => ({ options: config }) },
        {
            getFirestore: () => db,
            doc: () => ref,
            serverTimestamp: () => 'timestamp',
            runTransaction: async (receivedDb, update) => update({
                get: async () => ({ exists: () => true, data: () => emptyRoster }),
                set: () => { emptyWrites++; }
            })
        }
    ]);
    const retainedEmpty = await emptyRosterService.seedGroupsIfUninitialized(inContext([{ name: 'Default', members: 'Default Member' }]));
    assert.equal(retainedEmpty.seeded, false);
    assert.deepEqual(JSON.parse(JSON.stringify(retainedEmpty.state.groups)), []);
    assert.equal(emptyWrites, 0, 'initialized empty rosters are never reseeded');
    console.log('PASS: Roster schema initialization, revisions, final deletion, stale rejection, and fail-closed marker behavior are deterministic.');
}

runTests().catch(error => {
    console.error(error);
    process.exit(1);
});
