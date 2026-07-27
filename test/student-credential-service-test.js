const assert = require('node:assert');
const crypto = require('node:crypto').webcrypto;
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const context = {
    window: {},
    crypto,
    TextEncoder,
    Uint8Array,
    Buffer,
    console: { warn: () => {} }
};
vm.createContext(context);
for (const file of ['js/services/EvaluationKey.js', 'js/services/StudentCredentialService.js', 'js/services/FirebaseService.js']) {
    vm.runInContext(fs.readFileSync(path.join(root, file), 'utf8'), context);
}

const StudentCredentialService = vm.runInContext('StudentCredentialService', context);
const FirebaseService = vm.runInContext('FirebaseService', context);
const inContext = value => vm.runInContext(`(${JSON.stringify(value)})`, context);

function mainState(groups = [{ name: 'One', members: 'Alice' }, { name: 'Two', members: 'Bob' }]) {
    return inContext({
        schemaVersion: 2,
        rosterInitialized: true,
        rosterRevision: 0,
        groups,
        voters: [],
        evaluations: {}
    });
}

function mockRemote(initialState) {
    const db = {};
    const stateRef = { type: 'state' };
    const accounts = new Map();
    let state = initialState;
    let serial = Promise.resolve();
    const snapshotFor = ref => ({
        exists: () => ref.type === 'state' ? !!state : accounts.has(ref.id),
        data: () => ref.type === 'state' ? state : accounts.get(ref.id)
    });
    const sdk = {
        getFirestore: () => db,
        doc: (receivedDb, ...parts) => {
            assert.equal(receivedDb, db);
            return parts.length === 2 ? stateRef : { type: 'account', id: parts[3] };
        },
        getDoc: async ref => snapshotFor(ref),
        serverTimestamp: () => 'timestamp',
        runTransaction: (receivedDb, update) => {
            assert.equal(receivedDb, db);
            const run = serial.then(() => update({
                get: async ref => snapshotFor(ref),
                set: (ref, data) => {
                    if (ref.type === 'state') state = inContext({ ...state, ...data });
                    else accounts.set(ref.id, data);
                }
            }));
            serial = run.catch(() => {});
            return run;
        }
    };
    return {
        accounts,
        get state() { return state; },
        setGroups(groups) { state = inContext({ ...state, groups }); },
        service: new FirebaseService({ enabled: true, firebaseConfig: { appId: 'credential-test' } }, async () => [
            { getApps: () => [], initializeApp: config => ({ options: config }) }, sdk
        ])
    };
}

async function runTests() {
    assert.deepEqual(StudentCredentialService.normalizeUsername('  A\u00a0lice  '), { display: 'A lice', key: 'a lice' });
    assert.equal(StudentCredentialService.normalizeUsername('Bad:Name'), null);
    const record = await StudentCredentialService.createRecord(' Alice ', 'correct horse battery staple');
    assert.ok(record);
    assert.equal(record.schemaVersion, 1);
    assert.equal(record.algorithm, 'PBKDF2-HMAC-SHA-256');
    assert.equal(record.iterations, 600000);
    assert.match(record.salt, /^[A-Za-z0-9_-]+$/);
    assert.match(record.verifier, /^[A-Za-z0-9_-]+$/);
    assert.doesNotMatch(JSON.stringify(record), /correct horse battery staple/);
    assert.equal(await StudentCredentialService.verify(record, 'correct horse battery staple'), true);
    assert.equal(await StudentCredentialService.verify(record, 'wrong password'), false);
    assert.equal(StudentCredentialService.validateRecord({ ...record, iterations: 1 }), null);
    assert.equal(StudentCredentialService.validateRecord({ ...record, salt: 'x' }), null);
    assert.equal(await StudentCredentialService.createRecord('Alice', 'password', null), null, 'no Web Crypto fails closed');

    const remote = mockRemote(mainState());
    assert.equal((await remote.service.prepareStudentLogin('  ALICE ')).status, 'unclaimed');
    const claim = await remote.service.claimStudentAccount('Alice', 'first password');
    assert.equal(claim.ok, true);
    assert.equal(claim.status, 'claimed');
    assert.equal(remote.accounts.size, 1);
    const account = [...remote.accounts.values()][0];
    assert.doesNotMatch(JSON.stringify(account), /first password/);
    assert.equal((await remote.service.prepareStudentLogin('alice')).status, 'claimed', 'second client sees remote claim');
    const aliceAuth = await remote.service.authenticateStudent('ALICE', 'first password');
    assert.equal(aliceAuth.membership && aliceAuth.membership.groupIndex, 0, JSON.stringify(aliceAuth));
    assert.equal((await remote.service.authenticateStudent('Alice', 'bad password')).error, 'wrong-password');
    const beforeWrongPassword = JSON.stringify(account);
    await remote.service.authenticateStudent('Alice', 'bad password');
    assert.equal(JSON.stringify(account), beforeWrongPassword, 'wrong passwords do not mutate account records');

    const [winner, loser] = await Promise.all([
        remote.service.claimStudentAccount('Bob', 'bob password'),
        remote.service.claimStudentAccount('BOB', 'different password')
    ]);
    assert.deepEqual([winner.status, loser.status].sort(), ['already-claimed', 'claimed'], JSON.stringify([winner, loser]));
    const bobAuth = await remote.service.authenticateStudent('Bob', 'bob password');
    const alternateBobAuth = await remote.service.authenticateStudent('Bob', 'different password');
    assert.equal(bobAuth.ok || alternateBobAuth.ok, true, 'exactly one submitted password becomes the verifier');
    assert.equal(bobAuth.ok && alternateBobAuth.ok, false);

    remote.setGroups([]);
    assert.equal((await remote.service.authenticateStudent('Alice', 'first password')).error, 'not-unique-roster-member', 'removed members cannot log in');
    remote.setGroups([{ name: 'One', members: 'Alice' }]);
    assert.equal((await remote.service.authenticateStudent('Alice', 'first password')).ok, true, 're-added members use their existing remote verifier');
    remote.setGroups([{ name: 'One', members: 'Alice' }, { name: 'Two', members: 'Ａｌｉｃｅ' }]);
    assert.equal((await remote.service.prepareStudentLogin('Alice')).error, 'not-unique-roster-member', 'normalized duplicate roster names are blocked');

    const unavailable = new FirebaseService({ enabled: true, firebaseConfig: { appId: 'unavailable' } }, async () => { throw new Error('offline'); });
    assert.equal((await unavailable.prepareStudentLogin('Alice')).ok, false);
    console.log('PASS: Student credentials use validated PBKDF2 verifiers, remote claims, unique normalized roster membership, and fail-closed authentication.');
}

runTests().catch(error => {
    console.error(error);
    process.exit(1);
});
