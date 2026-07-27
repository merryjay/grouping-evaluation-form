const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const values = new Map();
let alerts = 0;
const context = {
    window: {},
    console: { warn: () => {} },
    confirm: () => true,
    alert: () => { alerts++; },
    document: {
        addEventListener: () => {},
        getElementById: () => null
    },
    localStorage: {
        getItem: key => values.has(key) ? values.get(key) : null,
        setItem: (key, value) => values.set(key, value),
        removeItem: key => values.delete(key)
    }
};
vm.createContext(context);
for (const file of [
    'js/services/EvaluationKey.js',
    'js/services/FirebaseConfig.js',
    'js/services/FirebaseService.js',
    'js/services/StorageService.js',
    'js/models/GroupCollection.js',
    'js/models/EvaluationCollection.js',
    'js/ui/GroupPanel.js',
    'js/ui/EvaluationPanel.js',
    'js/ui/GroupNavigator.js',
    'js/app.js'
]) {
    vm.runInContext(fs.readFileSync(path.join(root, file), 'utf8'), context);
}

const FirebaseService = vm.runInContext('FirebaseService', context);
const StorageService = vm.runInContext('StorageService', context);
const GroupCollection = vm.runInContext('GroupCollection', context);
const EvaluationCollection = vm.runInContext('EvaluationCollection', context);
const GroupPanel = vm.runInContext('GroupPanel', context);
const EvaluationPanel = vm.runInContext('EvaluationPanel', context);
const GroupNavigator = vm.runInContext('GroupNavigator', context);
const App = vm.runInContext('App', context);

function inContext(value) {
    return vm.runInContext(`(${JSON.stringify(value)})`, context);
}

function state() {
    return inContext({
        schemaVersion: 2,
        rosterInitialized: true,
        rosterRevision: 0,
        groups: [
            { name: 'G0', members: 'A0' },
            { name: 'G1', members: 'B1' },
            { name: 'G2', members: 'C2' },
            { name: 'G3', members: 'D3' }
        ],
        voters: [
            { name: 'A0', voterGroupIndex: 0, hasVoted: true, ratedGroups: [0, 1, 2] },
            { name: 'B1', voterGroupIndex: 1, hasVoted: true },
            { name: 'C2', voterGroupIndex: 2, loggedIn: true, ratedMembers: ['0:A0'] },
            { name: 'D3', voterGroupIndex: 3 },
            { name: 'Ghost', voterGroupIndex: 9 }
        ],
        evaluations: {
            'g:0:C2': { scores: { Quality: 4 }, totalRaw: 4, totalWeighted: 80, grade: 'A', date: '7/27/2026' },
            'm:0:A0:C2': { scores: { Quality: 5 }, totalRaw: 5, totalWeighted: 100, grade: 'A+', date: '7/27/2026' },
            'g:1:C2': { scores: { Quality: 1 }, totalRaw: 1, totalWeighted: 20, grade: 'F', date: '7/27/2026' },
            'm:1:B1:C2': { scores: { Quality: 1 }, totalRaw: 1, totalWeighted: 20, grade: 'F', date: '7/27/2026' },
            'g:2:A0': { scores: { Quality: 3 }, totalRaw: 3, totalWeighted: 60, grade: 'C', date: '7/27/2026' },
            'm:2:C2:A0': { scores: { Quality: 2 }, totalRaw: 2, totalWeighted: 40, grade: 'D', date: '7/27/2026' },
            'g:3:A0': { scores: { Quality: 4 }, totalRaw: 4, totalWeighted: 80, grade: 'A', date: '7/27/2026' }
        }
    });
}

async function runTests() {
    const middle = FirebaseService.deleteGroupState(state(), 1, true, inContext({ name: 'G1', members: 'B1' }));
    assert.equal(middle.ok, true);
    assert.deepEqual(middle.state.groups.map(group => group.name), ['G0', 'G2', 'G3']);
    assert.deepEqual(Object.keys(middle.state.evaluations).sort(), [
        'g:0:C2', 'g:1:A0', 'g:2:A0', 'm:0:A0:C2', 'm:1:C2:A0'
    ]);
    assert.equal(middle.state.evaluations['g:1:A0'].totalRaw, 3, 'shifted group vote keeps its score');
    assert.equal(middle.state.evaluations['m:1:C2:A0'].totalRaw, 2, 'shifted member vote keeps its identity and score');
    assert.equal(middle.state.evaluations['g:1:C2'], undefined, 'target group records are removed');
    assert.deepEqual(JSON.parse(JSON.stringify(middle.state.voters)), [
        { name: 'A0', voterGroupIndex: 0 },
        { name: 'C2', loggedIn: true, voterGroupIndex: 1 },
        { name: 'D3', voterGroupIndex: 2 }
    ], 'removed/ambiguous voters and legacy completion metadata are cleaned');

    for (const index of [0, 3]) {
        const source = state();
        const expected = { name: source.groups[index].name, members: source.groups[index].members };
        const result = FirebaseService.deleteGroupState(source, index, true, expected);
        assert.equal(result.ok, true, `delete index ${index}`);
        assert.equal(result.state.groups.length, 3);
        assert.equal(Object.keys(result.state.evaluations).length < Object.keys(source.evaluations).length, true);
    }

    const malformed = state();
    malformed.evaluations['g:2:a0'] = malformed.evaluations['g:2:A0'];
    assert.deepEqual(
        FirebaseService.deleteGroupState(malformed, 1, true),
        { ok: false, success: false, error: 'invalid-evaluations' },
        'invalid/colliding canonical records reject the whole mutation'
    );
    const first = FirebaseService.deleteGroupState(state(), 0, true, { name: 'G0', members: 'A0' });
    assert.equal(first.ok, true);
    const staleDelete = FirebaseService.deleteGroupState(first.state, 1, true, { name: 'G1', members: 'B1' });
    assert.equal(staleDelete.error, 'stale-group-index', 'a retried stale positional delete cannot delete the shifted group');

    let remoteState = state();
    const db = {};
    const ref = {};
    const service = new FirebaseService({ enabled: true, firebaseConfig: { appId: 'test' } }, async () => [
        { getApps: () => [], initializeApp: config => ({ options: config }) },
        {
            getFirestore: () => db,
            doc: () => ref,
            serverTimestamp: () => 'timestamp',
            runTransaction: async (receivedDb, update) => {
                assert.equal(receivedDb, db);
                await update({
                    get: async () => ({ exists: () => true, data: () => remoteState }),
                    set: (receivedRef, data) => { assert.equal(receivedRef, ref); Object.assign(remoteState, data); }
                });
            }
        }
    ]);
    const remoteDelete = await service.deleteGroup(1, { name: 'G1', members: 'B1' });
    assert.equal(remoteDelete.ok, true);
    assert.deepEqual(JSON.parse(JSON.stringify(remoteState.groups.map(group => group.name))), ['G0', 'G2', 'G3']);
    assert.deepEqual(JSON.parse(JSON.stringify(remoteState.evaluations)), JSON.parse(JSON.stringify(remoteDelete.state.evaluations)));

    values.clear();
    values.set('pbGroups', JSON.stringify(state().groups));
    values.set('pbEvals', JSON.stringify(state().evaluations));
    values.set('pbVoters', JSON.stringify(state().voters));
    const storage = new StorageService();
    storage.remote = { runtimeConfig: { enabled: true }, init: async () => false };
    const beforeFailure = new Map(values);
    const failedDelete = await storage.deleteGroup(1, { name: 'G1', members: 'B1' });
    assert.equal(failedDelete.ok, false);
    assert.deepEqual([...values.entries()], [...beforeFailure.entries()], 'configured but unavailable Firebase leaves every local cache untouched');

    const localStorageService = new StorageService();
    localStorageService.remote = { runtimeConfig: { enabled: false } };
    const localDelete = await localStorageService.deleteGroup(1, { name: 'G1', members: 'B1' });
    assert.equal(localDelete.ok, true);
    assert.equal(JSON.parse(values.get('pbGroups')).length, 3, 'only explicitly disabled Firebase uses local fallback');
    assert.equal(JSON.parse(values.get('pbEvals'))['g:1:A0'].totalRaw, 3);

    const seedState = inContext({
        schemaVersion: middle.state.schemaVersion,
        rosterInitialized: middle.state.rosterInitialized,
        rosterRevision: middle.state.rosterRevision,
        groups: middle.state.groups,
        evaluations: middle.state.evaluations,
        voters: middle.state.voters
    });
    let seedWrites = 0;
    const seedService = new FirebaseService({ enabled: true, firebaseConfig: { appId: 'seed' } }, async () => [
        { getApps: () => [], initializeApp: config => ({ options: config }) },
        {
            getFirestore: () => db,
            doc: () => ref,
            serverTimestamp: () => 'timestamp',
            runTransaction: async (receivedDb, update) => update({
                get: async () => ({ exists: () => true, data: () => seedState }),
                set: () => { seedWrites++; }
            })
        }
    ]);
    const seedResult = await seedService.seedGroupsIfUninitialized(inContext([{ name: 'Default', members: 'Default Member' }]));
    assert.equal(seedResult.seeded, false);
    assert.equal(seedWrites, 0, 'reload does not recreate a deliberately changed/deleted roster');

    let newInstallationState = null;
    const newInstallationService = new FirebaseService({ enabled: true, firebaseConfig: { appId: 'new-installation' } }, async () => [
        { getApps: () => [], initializeApp: config => ({ options: config }) },
        {
            getFirestore: () => db,
            doc: () => ref,
            serverTimestamp: () => 'timestamp',
            runTransaction: async (receivedDb, update) => update({
                get: async () => ({ exists: () => false, data: () => ({}) }),
                set: (receivedRef, data) => { newInstallationState = data; }
            })
        }
    ]);
    const newInstallationSeed = await newInstallationService.seedGroupsIfUninitialized(inContext([{ name: 'Default', members: 'Default Member' }]));
    assert.equal(newInstallationSeed.seeded, true);
    assert.deepEqual(JSON.parse(JSON.stringify(newInstallationState.groups)), [{ name: 'Default', members: 'Default Member' }]);

    let stateListener;
    const listenerService = new FirebaseService({ enabled: true, firebaseConfig: { appId: 'listener' } }, async () => [
        { getApps: () => [], initializeApp: config => ({ options: config }) },
        {
            getFirestore: () => db,
            doc: () => ref,
            onSnapshot: (receivedRef, next) => { stateListener = next; return () => {}; }
        }
    ]);
    let receivedSnapshot;
    await listenerService.subscribeState(snapshot => { receivedSnapshot = snapshot; });
    stateListener({ exists: () => true, data: () => middle.state });
    assert.deepEqual(JSON.parse(JSON.stringify(receivedSnapshot.data.groups)), JSON.parse(JSON.stringify(middle.state.groups)));
    assert.deepEqual(JSON.parse(JSON.stringify(receivedSnapshot.data.evaluations)), JSON.parse(JSON.stringify(middle.state.evaluations)));
    assert.deepEqual(JSON.parse(JSON.stringify(receivedSnapshot.data.voters)), [
        { name: 'A0' }, { name: 'C2', loggedIn: true }, { name: 'D3' }
    ]);

    function client(name) {
        const groups = new GroupCollection();
        const evaluations = new EvaluationCollection(groups);
        const app = {
            storage: {
                applyRemoteState: stateToApply => {
                    values.set(`client-${name}-groups`, JSON.stringify(stateToApply.groups));
                    values.set(`client-${name}-evals`, JSON.stringify(stateToApply.evaluations));
                    return stateToApply;
                },
                loadVoters: () => middle.state.voters
            },
            groups,
            evaluations,
            voters: [],
            currentVoter: name,
            voterGroupIndex: 99,
            isTeacher: false,
            _stateVersion: 0,
            _resolveStudentMembership: App.prototype._resolveStudentMembership,
            _endInvalidStudentSession: App.prototype._endInvalidStudentSession,
            groupPanel: { resetState: () => {}, buildList: () => {} },
            evaluationPanel: { resetState: () => {}, buildGrid: () => {} },
            groupNavigator: { resetState: () => {} },
            dashboardPanel: { render: () => {} },
            resultsPanel: { showPasswordPrompt: () => {} },
            _renderVoters: () => {},
            _showRolePicker: () => {}
        };
        return app;
    }
    const retainedClient = client('A0');
    const removedClient = client('B1');
    assert.equal(App.prototype._applyFullState.call(retainedClient, receivedSnapshot), true);
    assert.equal(App.prototype._applyFullState.call(removedClient, receivedSnapshot), true);
    assert.deepEqual(retainedClient.groups.toJSON(), removedClient.groups.toJSON(), 'all subscribers apply the same atomic groups snapshot');
    assert.deepEqual(retainedClient.evaluations.toJSON(), removedClient.evaluations.toJSON(), 'all subscribers apply the same atomic evaluations snapshot');
    assert.equal(retainedClient.voterGroupIndex, 0);
    assert.equal(removedClient.currentVoter, null, 'a deleted student session is ended before it can submit against a shifted group');

    const staleSave = await service.saveEvaluation(1, { Quality: 4 }, 4, 80, 'A', 'A0', { name: 'G1', members: 'B1' });
    assert.equal(staleSave, false, 'an old evaluation panel cannot save to a shifted positional group');

    let releaseDelete;
    let deleteCalls = 0;
    const deferred = new Promise(resolve => { releaseDelete = resolve; });
    const panelGroups = { getAll: () => [{ name: 'G0', members: 'A0' }, { name: 'G1', members: 'B1' }] };
    const panel = {
        groups: panelGroups,
        storage: { deleteGroup: async () => { deleteCalls++; return deferred; } },
        _deleting: false,
        _mutating: false,
        _rosterRevision: () => 0,
        _applyRosterResult: GroupPanel.prototype._applyRosterResult
    };
    const one = GroupPanel.prototype._removeGroup.call(panel, 0);
    const two = GroupPanel.prototype._removeGroup.call(panel, 0);
    assert.equal(deleteCalls, 1, 'duplicate clicks share one remote mutation');
    releaseDelete({ ok: false, success: false, error: 'transaction-failed' });
    assert.equal(await one, false);
    assert.equal(await two, false);
    assert.equal(alerts > 0, true, 'a failed UI delete reports an error without mutating the local collection');

    const panelState = new EvaluationPanel({}, { get: () => null }, {}, {}, {});
    panelState.selectedGroupIndex = 4;
    panelState.resetState();
    const navigator = new GroupNavigator({}, {});
    navigator.currentGroupIndex = 4;
    navigator.resetState();
    assert.equal(panelState.selectedGroupIndex, null);
    assert.equal(navigator.currentGroupIndex, null);

    console.log('PASS: Group deletion is transactional, rekeys evaluations, synchronizes clients, and leaves failed mutations local-state-safe.');
}

runTests().catch(error => {
    console.error(error);
    process.exit(1);
});
