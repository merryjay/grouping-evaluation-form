const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const values = new Map([['pbEvals', JSON.stringify({ 'g:0:Local voter': { totalRaw: 4 } })]]);
const context = {
    window: {},
    console: { warn: () => {} },
    document: { addEventListener: () => {} },
    localStorage: {
        getItem: key => values.has(key) ? values.get(key) : null,
        setItem: (key, value) => values.set(key, value),
        removeItem: key => values.delete(key)
    }
};

const appSource = fs.readFileSync(path.resolve(__dirname, '..', 'js', 'app.js'), 'utf8');
assert.doesNotMatch(appSource, /remote\.loadEvaluations\(\)/);
assert.equal((appSource.match(/remote\.loadEvaluationsResult\(\)/g) || []).length, 4);

vm.createContext(context);
vm.runInContext(appSource, context);

async function runTests() {
    const App = vm.runInContext('App', context);
    let fromJsonCalled = false;
    let gridBuilt = false;
    const app = {
        storage: {
            remote: {
                loadEvaluationsResult: async () => ({ available: false, data: null })
            }
        },
        evaluations: {
            fromJSON: () => { fromJsonCalled = true; }
        },
        evaluationPanel: {
            buildGrid: () => { gridBuilt = true; }
        },
        tabManager: null
    };

    await App.prototype._refreshStudentEvals.call(app);

    assert.equal(fromJsonCalled, false);
    assert.equal(values.get('pbEvals'), JSON.stringify({ 'g:0:Local voter': { totalRaw: 4 } }));
    assert.equal(gridBuilt, true);
    console.log('PASS: A failed Firebase evaluation read leaves the existing local evaluations unchanged.');
}

runTests().catch(error => {
    console.error(error);
    process.exit(1);
});
