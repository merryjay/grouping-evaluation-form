const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const values = new Map([['pbEvals', JSON.stringify({ 'g:0:Alice': { totalRaw: 4 } })]]);
const context = {
    window: {},
    document: { addEventListener: () => {} },
    localStorage: {
        getItem: key => values.has(key) ? values.get(key) : null,
        setItem: (key, value) => values.set(key, value),
        removeItem: key => values.delete(key)
    },
    FirebaseService: class {}
};
vm.createContext(context);
vm.runInContext(fs.readFileSync(path.join(root, 'js/services/StorageService.js'), 'utf8'), context);
vm.runInContext(fs.readFileSync(path.join(root, 'js/services/EvaluationKey.js'), 'utf8'), context);
vm.runInContext(fs.readFileSync(path.join(root, 'js/models/EvaluationCollection.js'), 'utf8'), context);
vm.runInContext(fs.readFileSync(path.join(root, 'js/app.js'), 'utf8'), context);

const StorageService = vm.runInContext('StorageService', context);
const App = vm.runInContext('App', context);

async function runTests() {
    const unavailable = async () => ({ available: false, data: null });
    await StorageService.prototype.init.call({
        remote: {
            init: async () => true,
            loadRubricResult: unavailable,
            loadGroupsResult: unavailable,
            loadVotersResult: unavailable,
            loadEvaluationsResult: async () => ({ available: true, data: {} })
        }
    });
    assert.equal(values.get('pbEvals'), '{}');

    let localFromJson = null;
    let rendered = null;
    const app = {
        groups: { get: () => null, getMemberList: () => [] },
        storage: { remote: { loadEvaluationsResult: async () => ({ available: true, data: {} }) } },
        evaluations: { fromJSON: data => { localFromJson = data; } },
        resultsPanel: { showPasswordPrompt: fresh => { rendered = fresh; } },
        tabManager: null
    };
    await App.prototype._refreshResults.call(app);
    assert.deepEqual(localFromJson, {});
    assert.equal(rendered.size(), 0);
    assert.equal(values.get('pbEvals'), '{}');

    values.set('pbEvals', JSON.stringify({ 'g:0:Alice': { totalRaw: 4 } }));
    localFromJson = null;
    rendered = null;
    app.storage.remote.loadEvaluationsResult = unavailable;
    await App.prototype._refreshResults.call(app);
    assert.equal(localFromJson, null);
    assert.equal(rendered, null);
    assert.equal(values.get('pbEvals'), JSON.stringify({ 'g:0:Alice': { totalRaw: 4 } }));
    console.log('PASS: Empty remote reads clear stale evaluations while unavailable reads preserve local results.');
}

runTests().catch(error => {
    console.error(error);
    process.exit(1);
});
