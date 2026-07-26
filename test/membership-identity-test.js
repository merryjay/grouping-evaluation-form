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
const evaluations = {};
for (let index = 0; index < 101; index++) {
    evaluations[`g:${index % 9}:Voter${index}`] = { scores: {}, totalRaw: 0, totalWeighted: 0, grade: 'F', date: '7/26/2026' };
}

const groups = Array.from({ length: 9 }, (_, index) => ({ name: `Group ${index + 1}`, members: 'Authoritative Member' }));
const groupState = {
    groups: [],
    fromJSON(data) { this.groups = data.map(group => ({ ...group })); }
};
let persistedGroups = false;
const app = {
    storage: {
        loadRubric: () => null,
        loadGroups: () => groups,
        loadEvaluations: () => evaluations,
        saveGroups: () => { persistedGroups = true; }
    },
    rubric: { fromJSON: () => {} },
    groups: groupState,
    evaluations: new EvaluationCollection(),
    _ensureDefaultMembers: () => {}
};

App.prototype._loadData.call(app);

assert.equal(app.evaluations.size(), 101);
assert.equal(persistedGroups, false);
assert.deepEqual(groupState.groups, groups);
console.log('PASS: Evaluation voters do not reconstruct, inflate, or persist authoritative group memberships.');
