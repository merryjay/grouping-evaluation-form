const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const servicesDir = path.resolve(__dirname, '..', 'js', 'services');
const context = {
    window: {},
    console: { warn: () => {} }
};

vm.createContext(context);
vm.runInContext(fs.readFileSync(path.join(servicesDir, 'EvaluationKey.js'), 'utf8'), context);
vm.runInContext(fs.readFileSync(path.join(servicesDir, 'FirebaseConfig.js'), 'utf8'), context);
vm.runInContext(fs.readFileSync(path.join(servicesDir, 'FirebaseService.js'), 'utf8'), context);

async function runTests() {
    const FirebaseService = vm.runInContext('FirebaseService', context);
    const runtimeConfig = context.window.FirebaseRuntimeConfig;
    const app = { name: 'grouping-evaluation-form', options: {} };
    const db = {};
    const stateRef = {};
    let loaderCalls = 0;

    const service = new FirebaseService(runtimeConfig, async () => {
        loaderCalls++;
        return [
            {
                getApps: () => [],
                initializeApp: config => ({ ...app, options: config })
            },
            {
                getFirestore: receivedApp => {
                    assert.equal(receivedApp.options.projectId, 'studybuddy-59119');
                    return db;
                },
                doc: (receivedDb, collection, document) => {
                    assert.equal(receivedDb, db);
                    assert.equal(collection, 'groupingEvaluationForms');
                    assert.equal(document, 'default');
                    return stateRef;
                }
            }
        ];
    });

    assert.equal(runtimeConfig.enabled, true);
    assert.equal(await service.init(), true);
    assert.equal(await service.init(), true);
    assert.equal(loaderCalls, 1);

    const unavailable = new FirebaseService(runtimeConfig, async () => {
        throw new Error('Firebase SDK unavailable');
    });
    assert.equal(await unavailable.init(), false);
    assert.equal(await unavailable.loadRubric(), null);
    assert.equal(await unavailable.loadGroups(), null);
    const unavailableResult = await unavailable.loadEvaluationsResult();
    assert.equal(unavailableResult.available, false);
    assert.equal(unavailableResult.data, null);
    assert.equal(await unavailable.loadEvaluations(), null);
    assert.equal(await unavailable.loadVoters(), null);
    for (const loader of ['loadRubricResult', 'loadGroupsResult', 'loadVotersResult']) {
        const result = await unavailable[loader]();
        assert.equal(result.available, false);
        assert.equal(result.data, null);
    }
    assert.equal(await unavailable.saveRubric({ criteria: [] }), false);

    const readFailure = new FirebaseService(runtimeConfig, async () => [
        { getApps: () => [], initializeApp: config => ({ options: config }) },
        {
            getFirestore: () => db,
            doc: () => stateRef,
            getDoc: async () => { throw new Error('Firestore read denied'); }
        }
    ]);
    const readFailureResult = await readFailure.loadEvaluationsResult();
    assert.equal(readFailureResult.available, false);
    assert.equal(readFailureResult.data, null);

    const emptyDocument = new FirebaseService(runtimeConfig, async () => [
        { getApps: () => [], initializeApp: config => ({ options: config }) },
        {
            getFirestore: () => db,
            doc: () => stateRef,
            getDoc: async () => ({ exists: () => false })
        }
    ]);
    assert.equal((await emptyDocument.loadRubricResult()).available, true);
    assert.equal((await emptyDocument.loadRubricResult()).data, null);
    assert.deepEqual(await emptyDocument.loadGroups(), []);
    assert.deepEqual(await emptyDocument.loadVoters(), []);
    assert.equal(Object.keys((await emptyDocument.loadEvaluationsResult()).data).length, 0);

    const evaluationState = vm.runInContext(`({
        groups: [{ name: 'Group One', members: 'Alice\\nBob' }],
        evaluations: {
            'g:0:Alice': { scores: { Quality: 4 }, totalRaw: 4, totalWeighted: 80, grade: 'A', date: '7/26/2026' },
            'm:0:Bob:Alice': { scores: { Quality: 4 }, totalRaw: 4, totalWeighted: 80, grade: 'A', date: '7/26/2026' }
        }
    })`, context);
    const mutationSdk = {
        getFirestore: () => db,
        doc: () => stateRef,
        serverTimestamp: () => 'timestamp',
        getDoc: async () => ({ exists: () => true, data: () => evaluationState }),
        setDoc: async (ref, data) => { Object.assign(evaluationState, data); },
        runTransaction: async (receivedDb, update) => {
            assert.equal(receivedDb, db);
            await update({
                get: async () => ({ exists: () => true, data: () => evaluationState }),
                set: (ref, data) => { Object.assign(evaluationState, data); }
            });
        }
    };
    const mutationService = new FirebaseService(runtimeConfig, async () => [
        { getApps: () => [], initializeApp: config => ({ options: config }) },
        mutationSdk
    ]);
    assert.equal(await mutationService.deleteEvaluation(0), true);
    assert.equal(Object.keys(evaluationState.evaluations).length, 1);
    assert.equal(await mutationService.deleteMemberEvaluation(0, 'Bob'), true);
    assert.equal(Object.keys(evaluationState.evaluations).length, 0);
    assert.equal(await mutationService.clearAllEvaluations(), true);
    assert.equal(Object.keys(evaluationState.evaluations).length, 0);

    const failedMutation = new FirebaseService(runtimeConfig, async () => [
        { getApps: () => [], initializeApp: config => ({ options: config }) },
        {
            getFirestore: () => db,
            doc: () => stateRef,
            serverTimestamp: () => 'timestamp',
            setDoc: async () => { throw new Error('write denied'); },
            runTransaction: async () => { throw new Error('transaction denied'); }
        }
    ]);
    assert.equal(await failedMutation.deleteEvaluation(0), false);
    assert.equal(await failedMutation.deleteMemberEvaluation(0, 'Bob'), false);
    assert.equal(await failedMutation.clearAllEvaluations(), false);

    console.log('PASS: Firebase service initializes public Firestore, distinguishes unavailable loaders, and reports delete/clear mutation outcomes.');
}

runTests().catch(error => {
    console.error(error);
    process.exit(1);
});
