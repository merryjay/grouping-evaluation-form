const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

class RenderTarget {
    constructor() { this.html = ''; }
    set innerHTML(value) { this.html = value; }
    get innerHTML() { return this.html; }
    querySelectorAll() { return []; }
}

const resultsContent = new RenderTarget();
const classStats = new RenderTarget();
const dashboardContent = new RenderTarget();
const groups = {
    get: index => index === 0 ? { name: 'Group One', members: 'Alice' } : null,
    getMemberList: index => index === 0 ? ['Alice'] : [],
    size: () => 1
};
const context = {
    window: {},
    document: {
        getElementById: id => ({ resultsContent, classStats, dashboardContent }[id])
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
    'js/ui/ResultsPanel.js',
    'js/ui/DashboardPanel.js'
]) {
    vm.runInContext(fs.readFileSync(path.join(root, file), 'utf8'), context);
}

const EvaluationCollection = vm.runInContext('EvaluationCollection', context);
const ResultsPanel = vm.runInContext('ResultsPanel', context);
const DashboardPanel = vm.runInContext('DashboardPanel', context);
const evaluations = new EvaluationCollection(groups).fromJSON({
    'g:0:Alice': { scores: {}, totalRaw: 4, totalWeighted: 80, grade: 'A', date: '7/26/2026' },
    'g:99:Alice': { scores: {}, totalRaw: 5, totalWeighted: 100, grade: 'A+', date: '7/26/2026' },
    'm:0:InjectedMember:Alice': { scores: {}, totalRaw: 5, totalWeighted: 100, grade: 'A+', date: '7/26/2026' }
});
const rubric = { maxScore: 4, criteria: [], getScoreLabels: () => [] };
context.window.app = { rubric, groups, scoring: { getGrade: () => 'A' } };

assert.equal(evaluations.getAllEntries().length, 1);
assert.equal(evaluations.getAggregatedByGroup()[0].scoreCount, 1);
assert.equal(evaluations.getAggregatedByMember().length, 0);

const results = new ResultsPanel(null, groups, evaluations, null);
results.mode = 'member';
results.render();
assert.equal(resultsContent.html.includes('InjectedMember'), false);
assert.equal(resultsContent.html.includes('Group 100'), false);

const dashboard = new DashboardPanel({ evaluations, groups, rubric, scoring: { getGrade: () => 'A' } });
dashboard.render();
assert.equal(dashboardContent.html.includes('InjectedMember'), false);
assert.equal(dashboardContent.html.includes('Group 100'), false);
console.log('PASS: Member evaluations outside authoritative membership and group evaluations for absent groups do not affect dashboard or results aggregates.');
