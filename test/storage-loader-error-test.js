const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const values = new Map([
    ['pbRubric', JSON.stringify({ activityName: 'Local rubric' })],
    ['pbGroups', JSON.stringify([{ name: 'Local group', members: 'Student' }])],
    ['pbEvals', JSON.stringify({ 'g:0:Student': { scores: {}, totalRaw: 0 } })],
    ['pbVoters', JSON.stringify([{ name: 'Student' }])]
]);
const context = {
    window: {},
    console: { warn: () => {} },
    localStorage: {
        getItem: key => values.has(key) ? values.get(key) : null,
        setItem: (key, value) => values.set(key, value),
        removeItem: key => values.delete(key)
    }
};
const servicesDir = path.resolve(__dirname, '..', 'js', 'services');

vm.createContext(context);
for (const file of ['EvaluationKey.js', 'FirebaseConfig.js', 'FirebaseService.js', 'StorageService.js']) {
    vm.runInContext(fs.readFileSync(path.join(servicesDir, file), 'utf8'), context);
}

async function runTests() {
    const StorageService = vm.runInContext('StorageService', context);
    const storage = new StorageService();
    const unavailable = async () => ({ available: false, data: null });
    storage.remote = {
        init: async () => false,
        loadRubricResult: unavailable,
        loadGroupsResult: unavailable,
        loadEvaluationsResult: unavailable,
        loadVotersResult: unavailable
    };

    await storage.init();

    assert.equal(values.get('pbRubric'), JSON.stringify({ activityName: 'Local rubric' }));
    assert.equal(values.get('pbGroups'), JSON.stringify([{ name: 'Local group', members: 'Student' }]));
    assert.equal(values.get('pbEvals'), JSON.stringify({ 'g:0:Student': { scores: {}, totalRaw: 0 } }));
    assert.equal(values.get('pbVoters'), JSON.stringify([{ name: 'Student' }]));
    console.log('PASS: Unavailable rubric, group, voter, and evaluation loaders preserve local storage.');
}

runTests().catch(error => {
    console.error(error);
    process.exit(1);
});
