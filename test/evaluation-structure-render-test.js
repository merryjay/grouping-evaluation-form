const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

class RenderTarget {
    constructor() {
        this.html = '';
    }

    set innerHTML(value) {
        this.html = value;
    }

    get innerHTML() {
        return this.html;
    }

    querySelectorAll() {
        return [];
    }
}

const resultsContent = new RenderTarget();
const classStats = new RenderTarget();
const context = {
    window: { app: { rubric: { criteria: [] } } },
    document: {
        getElementById: id => id === 'resultsContent' ? resultsContent : classStats
    },
    localStorage: { setItem: () => {} },
    confirm: () => false
};
const root = path.resolve(__dirname, '..');

vm.createContext(context);
for (const file of [
    'js/services/EvaluationKey.js',
    'js/services/SafeHtml.js',
    'js/models/EvaluationCollection.js',
    'js/ui/ResultsPanel.js'
]) {
    vm.runInContext(fs.readFileSync(path.join(root, file), 'utf8'), context);
}

const EvaluationCollection = vm.runInContext('EvaluationCollection', context);
const ResultsPanel = vm.runInContext('ResultsPanel', context);
const hostileGroupIndex = '0\"><img src=x onerror="globalThis.xssExecuted=true">';
const evaluations = new EvaluationCollection().fromJSON({
    'g:0:Trusted voter': {
        type: 'member',
        groupIndex: hostileGroupIndex,
        voter: 'Attacker',
        memberName: 'Injected member',
        scores: {},
        totalRaw: 4,
        totalWeighted: 100
    }
});

const [entry] = evaluations.getAllEntries();
assert.equal(entry.type, 'group');
assert.equal(entry.groupIndex, 0);
assert.equal(entry.voter, 'Trusted voter');

const panel = new ResultsPanel(
    null,
    { get: index => index === 0 ? { name: 'Group One' } : null, size: () => 1 },
    evaluations,
    null
);
panel.render();

assert.equal(resultsContent.html.includes(hostileGroupIndex), false);
assert.equal(resultsContent.html.includes('<img src=x'), false);
assert.match(resultsContent.html, /data-result-index="0"/);
assert.doesNotMatch(resultsContent.html, /data-group=/);

console.log('PASS: A hostile Firestore groupIndex cannot override key-derived identity or create executable ResultsPanel markup.');
