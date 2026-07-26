const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const values = new Map();
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
['EvaluationKey.js', 'FirebaseConfig.js', 'FirebaseService.js', 'StorageService.js'].forEach(file => {
    vm.runInContext(fs.readFileSync(path.join(servicesDir, file), 'utf8'), context);
});

async function runTests() {
    const StorageService = vm.runInContext('StorageService', context);
    vm.runInContext('window.FirebaseRuntimeConfig = { enabled: false };', context);
    const storage = new StorageService();
    const rubric = { activityName: 'Fallback rubric', criteria: [] };
    const groups = [{ name: 'Fallback group', members: 'Student' }];
    const evaluations = { 'g:0:Student': { scores: {}, totalRaw: 0, totalWeighted: 0, grade: 'F' } };
    const voters = [{ name: 'Student' }];

    await storage.init();
    storage.saveRubric(rubric);
    storage.saveGroups(groups);
    await storage.saveEvaluations(evaluations);
    storage.saveVoters(voters);

    assert.deepEqual(storage.loadRubric(), rubric);
    assert.deepEqual(storage.loadGroups(), groups);
    assert.deepEqual(storage.loadEvaluations(), evaluations);
    assert.deepEqual(storage.loadVoters(), voters);

    console.log('PASS: Storage service preserves all local fallback data when Firebase is unavailable.');
}

runTests().catch(error => {
    console.error(error);
    process.exit(1);
});
