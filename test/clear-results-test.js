const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const values = new Map();
const alerts = [];
const renderTarget = { innerHTML: '', querySelectorAll: () => [] };
const context = {
    window: {},
    console: { warn: () => {} },
    document: {
        addEventListener: () => {},
        getElementById: () => renderTarget
    },
    localStorage: {
        getItem: key => values.has(key) ? values.get(key) : null,
        setItem: (key, value) => values.set(key, value),
        removeItem: key => values.delete(key)
    },
    confirm: () => true,
    alert: message => alerts.push(message)
};

vm.createContext(context);
for (const file of [
    'js/services/EvaluationKey.js',
    'js/services/FirebaseConfig.js',
    'js/services/FirebaseService.js',
    'js/services/StorageService.js',
    'js/models/EvaluationCollection.js',
    'js/ui/ResultsPanel.js',
    'js/app.js'
]) {
    vm.runInContext(fs.readFileSync(path.join(root, file), 'utf8'), context);
}

const StorageService = vm.runInContext('StorageService', context);
const EvaluationCollection = vm.runInContext('EvaluationCollection', context);
const ResultsPanel = vm.runInContext('ResultsPanel', context);
const App = vm.runInContext('App', context);
const groups = {
    get: index => index === 0 ? { name: 'Group One', members: 'Alice\nBob' } : null,
    getMemberList: index => index === 0 ? ['Alice', 'Bob'] : [],
    size: () => 1
};
const original = {
    'g:0:Alice': { scores: {}, totalRaw: 4, totalWeighted: 80, grade: 'A', date: '7/26/2026' },
    'm:0:Bob:Alice': { scores: {}, totalRaw: 4, totalWeighted: 80, grade: 'A', date: '7/26/2026' }
};

function newEvaluations() {
    return new EvaluationCollection(groups).fromJSON(original);
}

function panelWith(method, succeeds) {
    const evaluations = newEvaluations();
    const panel = new ResultsPanel(null, groups, evaluations, null);
    const calls = [];
    let renders = 0;
    panel.setStorage({
        [method]: async (...args) => {
            calls.push(args);
            return succeeds;
        }
    });
    panel.render = () => { renders++; };
    context.window.app = {
        mutationCount: 0,
        _markResultsMutation() { this.mutationCount++; }
    };
    return { panel, evaluations, calls, get renders() { return renders; } };
}

async function runTests() {
    const storage = new StorageService();
    values.set('pbEvals', JSON.stringify(original));
    storage.remote = { init: async () => true, saveEvaluations: async () => false };
    assert.equal(await storage.saveEvaluations({}), false);
    assert.equal(values.get('pbEvals'), JSON.stringify(original));

    storage.remote = { init: async () => false, saveEvaluations: async () => { throw new Error('unavailable remote must not be called'); } };
    assert.equal(await storage.saveEvaluations({ fallback: true }), true);
    assert.equal(values.get('pbEvals'), JSON.stringify({ fallback: true }));

    values.set('pbEvals', JSON.stringify(original));
    storage.remote = { init: async () => true, clearAllEvaluations: async () => false };
    assert.equal(await storage.clearAllEvaluations(), false);
    assert.equal(values.get('pbEvals'), JSON.stringify(original));
    storage.remote.clearAllEvaluations = async () => true;
    assert.equal(await storage.clearAllEvaluations(), true);
    assert.equal(values.get('pbEvals'), '{}');

    values.set('pbEvals', JSON.stringify(original));
    storage.remote = { init: async () => true, deleteEvaluation: async () => false };
    assert.equal(await storage.deleteGroupEvaluations(0, { groupCleared: true }), false);
    assert.equal(values.get('pbEvals'), JSON.stringify(original));
    storage.remote.deleteEvaluation = async () => true;
    assert.equal(await storage.deleteGroupEvaluations(0, { groupCleared: true }), true);
    assert.equal(values.get('pbEvals'), JSON.stringify({ groupCleared: true }));

    storage.remote = { init: async () => true, deleteMemberEvaluation: async () => false };
    assert.equal(await storage.deleteMemberEvaluations(0, 'Bob', { memberCleared: true }), false);
    assert.equal(values.get('pbEvals'), JSON.stringify({ groupCleared: true }));
    storage.remote.deleteMemberEvaluation = async () => true;
    assert.equal(await storage.deleteMemberEvaluations(0, 'Bob', { memberCleared: true }), true);
    assert.equal(values.get('pbEvals'), JSON.stringify({ memberCleared: true }));

    let test = panelWith('deleteGroupEvaluations', false);
    await test.panel._deleteEvaluation(0);
    assert.equal(test.evaluations.size(), 2);
    assert.equal(test.renders, 0);
    assert.equal(alerts.pop(), 'Could not clear results. Please try again.');
    test = panelWith('deleteGroupEvaluations', true);
    await test.panel._deleteEvaluation(0);
    assert.equal(test.evaluations.size(), 1);
    assert.equal(test.calls.length, 1);
    assert.equal(test.renders, 1);
    assert.equal(context.window.app.mutationCount, 1);

    test = panelWith('deleteMemberEvaluations', false);
    await test.panel._deleteMemberEvaluation(0, 'Bob');
    assert.equal(test.evaluations.size(), 2);
    assert.equal(test.renders, 0);
    assert.equal(alerts.pop(), 'Could not clear results. Please try again.');
    test = panelWith('deleteMemberEvaluations', true);
    await test.panel._deleteMemberEvaluation(0, 'Bob');
    assert.equal(test.evaluations.size(), 1);
    assert.equal(test.calls.length, 1);
    assert.equal(test.renders, 1);
    assert.equal(context.window.app.mutationCount, 1);

    test = panelWith('clearAllEvaluations', false);
    await test.panel.clearAll();
    assert.equal(test.evaluations.size(), 2);
    assert.equal(test.renders, 0);
    assert.equal(alerts.pop(), 'Could not clear results. Please try again.');
    test = panelWith('clearAllEvaluations', true);
    await test.panel.clearAll();
    assert.equal(test.evaluations.size(), 0);
    assert.equal(test.calls.length, 1);
    assert.equal(test.renders, 1);
    assert.equal(context.window.app.mutationCount, 1);

    let resolveStale;
    let applied = null;
    let rendered = false;
    const app = {
        _resultsVersion: 0,
        groups,
        storage: { remote: { loadEvaluationsResult: () => new Promise(resolve => { resolveStale = resolve; }) } },
        evaluations: { fromJSON: data => { applied = data; } },
        resultsPanel: { showPasswordPrompt: () => { rendered = true; } },
        tabManager: null
    };
    const refresh = App.prototype._refreshResults.call(app);
    App.prototype._markResultsMutation.call(app);
    resolveStale({ available: true, data: original });
    await refresh;
    assert.equal(applied, null);
    assert.equal(rendered, false);

    app.storage.remote.loadEvaluationsResult = async () => ({ available: true, data: {} });
    await App.prototype._refreshResults.call(app);
    assert.deepEqual(applied, {});
    assert.equal(rendered, true);

    const listeners = {};
    const buttons = ['addCriteriaBtn', 'saveRubricBtn', 'clearAllBtn', 'exportAllBtn'].reduce((result, id) => {
        result[id] = { addEventListener: (event, handler) => { listeners[id] = { event, handler }; } };
        return result;
    }, {});
    context.document.getElementById = id => buttons[id] || renderTarget;
    const retainedResults = { count: 2 };
    App.prototype._setupGlobalListeners.call({
        setupPanel: { addCriteria: () => {}, saveRubric: () => {} },
        resultsPanel: {
            clearAll: async () => {
                assert.equal(retainedResults.count, 2);
                throw new Error('stale StorageService');
            },
            exportCSV: () => {}
        },
        _refreshResults: () => {}
    });
    assert.equal(listeners.clearAllBtn.event, 'click');
    assert.equal(listeners.clearAllBtn.handler(), undefined);
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(retainedResults.count, 2);
    assert.equal(alerts.pop(), 'Could not clear results. Please try again.');

    console.log('PASS: Clear actions wait for persistence, retain results on failure, and ignore pre-clear refreshes.');
}

runTests().catch(error => {
    console.error(error);
    process.exit(1);
});
