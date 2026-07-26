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
const validScores = vm.runInContext('Object.create(null)', context);
const rawState = vm.runInContext(`(() => {
    const groups = Array.from({ length: 100 }, (_, groupIndex) => ({
        name: 'Group ' + (groupIndex + 1),
        members: Array.from({ length: 100 }, (_, memberIndex) => 'Voter' + (groupIndex * 100 + memberIndex)).join('\\n')
    }));
    const evaluations = Object.create(null);
    for (let index = 0; index < 5000; index++) {
        evaluations['g:0:Voter' + index] = { scores: {}, totalRaw: 0, totalWeighted: 0, grade: 'F', date: '7/26/2026' };
    }
    return { groups, evaluations };
})()`, context);

let writes = 0;
let writtenEvaluations = null;
const transaction = {
    get: async () => ({ exists: () => true, data: () => rawState }),
    set: (_ref, data) => {
        writes++;
        writtenEvaluations = data.evaluations;
    }
};
const service = new FirebaseService({ enabled: true, firebaseConfig: { appId: 'test' } }, async () => []);
service.ready = true;
service._initializationAttempted = true;
service._db = {};
service._stateRef = {};
service._sdk = {
    runTransaction: async (_db, callback) => callback(transaction),
    serverTimestamp: () => 'timestamp'
};

async function runTests() {
    assert.equal(await service.saveEvaluation(1, validScores, 0, 0, 'F', 'Voter4999'), false);
    assert.equal(writes, 0);

    assert.equal(await service.saveEvaluation(0, validScores, 5, 100, 'A+', 'Voter4999'), true);
    assert.equal(writes, 1);
    assert.equal(Object.keys(writtenEvaluations).length, 5000);
    assert.equal(writtenEvaluations['g:0:Voter4999'].totalRaw, 5);
    console.log('PASS: Evaluation capacity rejects new keys at 5,000 while allowing deterministic replacements.');
}

runTests().catch(error => {
    console.error(error);
    process.exit(1);
});
