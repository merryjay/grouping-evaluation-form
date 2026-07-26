const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const values = new Map();
const context = {
    window: {},
    console: { warn: () => {} },
    document: { addEventListener: () => {}, getElementById: () => null },
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
    'js/models/EvaluationCollection.js',
    'js/app.js'
]) {
    vm.runInContext(fs.readFileSync(path.join(root, file), 'utf8'), context);
}

const EvaluationCollection = vm.runInContext('EvaluationCollection', context);
const StorageService = vm.runInContext('StorageService', context);
const FirebaseService = vm.runInContext('FirebaseService', context);
const App = vm.runInContext('App', context);
const groups = {
    get: index => [{ name: 'One', members: 'Alice\nBob' }, { name: 'Two', members: 'Carol' }][index] || null,
    getMemberList: index => index === 0 ? ['Alice', 'Bob'] : (index === 1 ? ['Carol'] : []),
    size: () => 2
};
const original = {
    'g:0:Alice': { scores: {}, totalRaw: 4, totalWeighted: 80, grade: 'A', date: '7/26/2026' },
    'g:1:Alice': { scores: {}, totalRaw: 4, totalWeighted: 80, grade: 'A', date: '7/26/2026' },
    'm:0:Bob:Alice': { scores: {}, totalRaw: 4, totalWeighted: 80, grade: 'A', date: '7/26/2026' },
    'm:1:Carol:Alice': { scores: {}, totalRaw: 4, totalWeighted: 80, grade: 'A', date: '7/26/2026' }
};

async function runTests() {
    const evaluations = new EvaluationCollection(groups).fromJSON(original);
    const legacyVoter = { name: 'Alice', hasVoted: true, votedCount: 99, ratedGroups: [0, 1], ratedMembers: ['0:Bob', '1:Carol'] };
    assert.equal(evaluations.hasGroupCompletion(0, legacyVoter.name), true);
    assert.equal(evaluations.hasMemberCompletion(0, 'Bob', legacyVoter.name), true);

    evaluations.deleteGroup(0);
    assert.equal(evaluations.hasGroupCompletion(0, 'Alice'), false, 'clearing group votes reopens that group');
    assert.equal(evaluations.hasMemberCompletion(0, 'Bob', 'Alice'), true, 'group clear preserves member scope');
    assert.equal(evaluations.hasGroupCompletion(1, 'Alice'), true, 'group clear preserves unrelated group scope');

    evaluations.deleteMember(0, 'Bob');
    assert.equal(evaluations.hasMemberCompletion(0, 'Bob', 'Alice'), false, 'clearing member votes reopens that member');
    assert.equal(evaluations.hasGroupCompletion(1, 'Alice'), true, 'member clear preserves unrelated group scope');
    assert.equal(evaluations.hasMemberCompletion(1, 'Carol', 'Alice'), true, 'member clear preserves unrelated member scope');
    assert.deepEqual(evaluations.getCompletionForVoter('Alice').groupIndexes, [1]);

    evaluations.clearAll();
    assert.equal(evaluations.hasGroupCompletion(1, 'Alice'), false, 'clear all reopens group ratings');
    assert.equal(evaluations.hasMemberCompletion(1, 'Carol', 'Alice'), false, 'clear all reopens member ratings');

    let savedVoters = null;
    const storage = new StorageService();
    storage.remote = { saveVoters: voters => { savedVoters = voters; } };
    const rosterApp = { storage, voters: [legacyVoter], evaluations };
    App.prototype._syncVoterRosterFromEvaluations.call(rosterApp, { persistRemote: true });
    assert.deepEqual(JSON.parse(values.get('pbVoters')), [{ name: 'Alice' }]);
    assert.deepEqual(rosterApp.voters, [{ name: 'Alice' }]);
    assert.deepEqual(storage._votersCache, [{ name: 'Alice' }]);
    assert.deepEqual(savedVoters, [{ name: 'Alice' }]);

    values.set('pbEvals', JSON.stringify(original));
    const enabledStorage = new StorageService();
    enabledStorage.remote = { runtimeConfig: { enabled: true }, init: async () => false };
    assert.equal(await enabledStorage.clearAllEvaluations(), false, 'configured Firebase clears require remote confirmation');
    assert.equal(values.get('pbEvals'), JSON.stringify(original));
    enabledStorage.remote.runtimeConfig.enabled = false;
    assert.equal(await enabledStorage.clearAllEvaluations(), true, 'explicitly disabled Firebase keeps local fallback');
    assert.equal(values.get('pbEvals'), '{}');

    const voterStorage = new StorageService();
    voterStorage._votersCache = [{ name: 'Stale', hasVoted: true }];
    voterStorage.remote = {
        init: async () => true,
        loadRubricResult: async () => ({ available: false, data: null }),
        loadGroupsResult: async () => ({ available: false, data: null }),
        loadEvaluationsResult: async () => ({ available: false, data: null }),
        loadVotersResult: async () => ({ available: true, data: [] })
    };
    await voterStorage.init();
    assert.equal(values.get('pbVoters'), '[]', 'an authoritative empty remote voter roster clears local stale data');
    assert.deepEqual(voterStorage._votersCache, []);
    voterStorage.replaceVoters([{ name: 'Bob', hasVoted: true }]);
    voterStorage.replaceVoters([]);
    assert.deepEqual(voterStorage.loadVoters(), [], 'replacements invalidate the voter cache');

    let evaluationListener;
    let subscribeCalls = 0;
    let renders = 0;
    const crossStorage = new StorageService();
    crossStorage.remote = {
        subscribeEvaluations: async listener => {
            subscribeCalls++;
            evaluationListener = listener;
            return () => {};
        }
    };
    const crossClient = {
        storage: crossStorage,
        voters: [{ name: 'Alice', hasVoted: true, ratedGroups: [0] }],
        groups,
        evaluations: new EvaluationCollection(groups).fromJSON(original),
        currentVoter: 'Alice',
        isTeacher: false,
        evaluationPanel: { buildGrid: () => { renders++; } }
    };
    await App.prototype._startEvaluationSync.call(crossClient);
    await App.prototype._startEvaluationSync.call(crossClient);
    assert.equal(subscribeCalls, 1, 'the student session owns one bounded listener');
    evaluationListener({ available: true, data: {} });
    assert.equal(crossClient.evaluations.size(), 0, 'remote clear replaces the shared collection');
    assert.equal(renders, 1, 'an active student panel rebuilds after a teacher clear');
    assert.deepEqual(crossClient.voters, [{ name: 'Alice' }]);

    const normalizedVoters = vm.runInContext(`FirebaseService.normalizeDocument({ voters: [{ name: 'Alice', hasVoted: true, ratedGroups: [0] }] }).voters`, context);
    assert.deepEqual(normalizedVoters, [{ name: 'Alice' }], 'remote voter normalization drops stale completion fields');
    console.log('PASS: Completion resets derive only from evaluations, clean voter caches, preserve unrelated scopes, and resync active students.');
}

runTests().catch(error => {
    console.error(error);
    process.exit(1);
});
