const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const values = new Map([['studentAccounts', JSON.stringify({ '__proto__': 'bad', constructor: 'bad', alice: 'good' })]]);
const context = {
    window: {},
    document: { addEventListener: () => {} },
    localStorage: {
        getItem: key => values.get(key) || null,
        setItem: (key, value) => values.set(key, value)
    },
    alert: () => {}
};
vm.createContext(context);
for (const file of ['js/services/EvaluationKey.js', 'js/models/EvaluationCollection.js', 'js/ui/GroupPanel.js', 'js/app.js']) {
    vm.runInContext(fs.readFileSync(path.join(root, file), 'utf8'), context);
}

const EvaluationKey = vm.runInContext('EvaluationKey', context);
const EvaluationCollection = vm.runInContext('EvaluationCollection', context);
const GroupPanel = vm.runInContext('GroupPanel', context);
const App = vm.runInContext('App', context);

for (const name of ['__proto__', 'constructor']) {
    assert.equal(EvaluationKey.isIdentity(name), false);
    assert.equal(EvaluationKey.parse(`g:0:${name}`), null);
}
assert.equal(EvaluationKey.isIdentity('Valid Member'), true);

const accounts = App.prototype._getStudentAccounts.call({});
assert.equal(typeof accounts.get, 'function');
assert.equal(accounts.has('__proto__'), false);
assert.equal(accounts.has('constructor'), false);
assert.equal(accounts.get('alice'), 'good');
assert.equal(App.prototype._hasStudentPassword.call({ _getStudentAccounts: App.prototype._getStudentAccounts }, '__proto__'), false);

const group = { name: 'Group 1', members: 'Valid Member' };
let saveCalls = 0;
const panel = {
    groups: {
        get: () => group,
        getMemberList: () => group.members.split('\n')
    },
    storage: { saveGroups: () => { saveCalls++; } }
};
for (const invalidName of ['Bad:Member', 'x'.repeat(121), '__proto__', 'constructor']) {
    GroupPanel.prototype._addMember.call(panel, 0, invalidName);
}
assert.equal(group.members, 'Valid Member');
assert.equal(saveCalls, 0);

const collection = new EvaluationCollection().fromJSON({ 'g:0:__proto__': { scores: {} }, 'g:0:Valid': { scores: {} } });
assert.equal(collection.getAllEntries().length, 1);
console.log('PASS: Reserved, colon, and overlong identities cannot enter account, membership, or evaluation-key paths.');
