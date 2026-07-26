const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const context = {
    window: {},
    document: { addEventListener: () => {} },
    localStorage: { getItem: () => null, setItem: () => {} }
};
vm.createContext(context);
for (const file of ['js/services/EvaluationKey.js', 'js/models/EvaluationCollection.js', 'js/app.js']) {
    vm.runInContext(fs.readFileSync(path.join(root, file), 'utf8'), context);
}

const App = vm.runInContext('App', context);
const EvaluationCollection = vm.runInContext('EvaluationCollection', context);
const groups = {
    size: () => 1,
    get: index => index === 0 ? ({ name: 'Group One', members: 'Alice' }) : null,
    getMemberList: index => index === 0 ? ['Alice'] : []
};
const app = { groups };
const alice = App.prototype._resolveStudentMembership.call(app, 'Alice');
const lowerAlice = App.prototype._resolveStudentMembership.call(app, 'alice');
assert.deepEqual(alice, { name: 'Alice', groupIndex: 0 });
assert.deepEqual(lowerAlice, alice);

const evaluations = new EvaluationCollection(groups);
assert.equal(evaluations.saveGroup(99, {}, 4, 80, 'A', alice.name), false);
assert.equal(evaluations.size(), 0);
assert.equal(evaluations.saveGroup(0, {}, 4, 80, 'A', alice.name), true);
assert.equal(evaluations.saveGroup(0, {}, 5, 100, 'A+', lowerAlice.name), true);
assert.equal(evaluations.size(), 1);
assert.equal(evaluations.getGroupEval(0, 'Alice').totalRaw, 5);
evaluations.deleteGroup(0, lowerAlice.name);
assert.equal(evaluations.size(), 0);
console.log('PASS: Case-insensitive student input resolves to one canonical identity for evaluation updates and deletion.');
