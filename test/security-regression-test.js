const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const pages = ['index.html', 'rubric-evaluation.html'].map(file => fs.readFileSync(path.join(root, file), 'utf8'));
const appSource = fs.readFileSync(path.join(root, 'js', 'app.js'), 'utf8');

for (const html of pages) {
    for (const id of ['chooseStudentBtn', 'chooseTeacherBtn', 'backToRolePickerBtn', 'backToRolePickerBtn2', 'teacherLoginBtn', 'logoutBtn', 'voterLoginBtn']) {
        const tag = html.match(new RegExp(`<[^>]+id="${id}"[^>]*>`));
        assert.ok(tag, `missing ${id}`);
        assert.doesNotMatch(tag[0], /\son(?:click|change|keydown)=/i, `${id} must use app.js only`);
    }
}
for (const id of ['chooseStudentBtn', 'chooseTeacherBtn', 'backToRolePickerBtn', 'backToRolePickerBtn2', 'voterLoginBtn', 'teacherLoginBtn', 'logoutBtn']) {
    const listener = id === 'logoutBtn'
        ? /logoutBtn\.addEventListener/g
        : new RegExp(`el\\('${id}'\\)\\.addEventListener`, 'g');
    assert.equal((appSource.match(listener) || []).length, 1, `${id} has exactly one app listener`);
}

const context = {
    window: {},
    console: { warn: () => {} },
    TextEncoder,
    Uint8Array,
    document: { getElementById: () => null, addEventListener: () => {} },
    localStorage: { getItem: () => null, setItem: () => {}, removeItem: () => {} }
};
vm.createContext(context);
for (const file of ['js/services/EvaluationKey.js', 'js/services/StudentCredentialService.js', 'js/services/FirebaseService.js', 'js/app.js']) {
    vm.runInContext(fs.readFileSync(path.join(root, file), 'utf8'), context);
}
const EvaluationKey = vm.runInContext('EvaluationKey', context);
const StudentCredentialService = vm.runInContext('StudentCredentialService', context);
const FirebaseService = vm.runInContext('FirebaseService', context);
const App = vm.runInContext('App', context);
const inContext = value => vm.runInContext(`(${JSON.stringify(value)})`, context);

for (const value of ['Alice\u200B', 'Alice\u202E', 'Alice\u0085', 'Alice\u2066']) {
    assert.equal(EvaluationKey.isIdentity(value), false, `reject control/format identity ${JSON.stringify(value)}`);
    assert.equal(StudentCredentialService.normalizeUsername(value), null);
}
assert.equal(EvaluationKey.isIdentity('José María'), true, 'ordinary Unicode letters/spaces remain valid');
assert.deepEqual(StudentCredentialService.normalizeUsername('  José   María  '), { display: 'José María', key: 'josé maría' });

const before = inContext({
    schemaVersion: 2,
    rosterInitialized: true,
    rosterRevision: 5,
    groups: [{ name: 'First', members: 'Alice' }, { name: 'Second', members: 'Bob' }],
    voters: [],
    evaluations: { 'g:1:Bob': { scores: {}, totalRaw: 0, totalWeighted: 0, grade: 'F', date: '7/27/2026' } }
});
const afterEarlierDelete = FirebaseService.deleteGroupState(before, 0, true, { name: 'First', members: 'Alice' }, 5, true);
assert.equal(afterEarlierDelete.ok, true);
const staleClear = FirebaseService.deleteEvaluationsState(
    afterEarlierDelete.state,
    1,
    { name: 'Second', members: 'Bob' },
    5,
    () => true,
    true
);
assert.equal(staleClear.error, 'stale-roster-revision');
assert.ok(staleClear.state.evaluations['g:0:Bob'], 'a stale positional clear cannot delete the shifted group evaluation');

function delayedFinishCase(invalidate) {
    let resolveEvaluations;
    const membership = { name: 'Alice', groupIndex: 0 };
    const app = {
        _studentLoginOperation: 1,
        _studentLoginState: 'verifying',
        rosterRevision: 5,
        _stateVersion: 2,
        currentVoter: null,
        isTeacher: false,
        voterGroupIndex: null,
        voters: [],
        evaluations: { fromJSON: () => {} },
        evaluationPanel: { buildGrid: () => {} },
        storage: {
            remote: {
                loadEvaluationsResult: () => new Promise(resolve => { resolveEvaluations = resolve; }),
                prepareStudentLogin: async () => ({ ok: true, status: 'claimed', membership, rosterRevision: 5 })
            },
            replaceVoters: voters => voters
        },
        _resolveStudentMembership: () => membership,
        _isCurrentStudentLogin: App.prototype._isCurrentStudentLogin,
        _clearStudentPasswordFields: () => {},
        _applyRoleVisibility: () => {}
    };
    const pending = App.prototype._finishStudentLogin.call(app, membership, 1, { rosterRevision: 5, stateVersion: 2 });
    invalidate(app);
    resolveEvaluations({ available: true, data: {} });
    return pending.then(() => app);
}

(async () => {
    for (const invalidate of [
        app => App.prototype._invalidateStudentLogin.call(app), // logout/back/role change
        app => { app._studentLoginOperation++; app.isTeacher = true; }, // teacher selection
        app => { app._resolveStudentMembership = () => null; } // remote roster removal/full-state sync
    ]) {
        const app = await delayedFinishCase(invalidate);
        assert.equal(app.currentVoter, null, 'a delayed student login cannot resurrect a session');
    }
    console.log('PASS: Login handlers are single-path, identity controls are rejected, stale evaluation clears are guarded, and delayed logins cannot resurrect sessions.');
})().catch(error => {
    console.error(error);
    process.exit(1);
});
