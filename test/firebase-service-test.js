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

    console.log('PASS: Firebase service initializes public Firestore without Auth and distinguishes unavailable loaders from valid empty data.');
}

runTests().catch(error => {
    console.error(error);
    process.exit(1);
});
