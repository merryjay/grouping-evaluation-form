const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const values = new Map([['studentAccounts', JSON.stringify([['Alice', 'plaintext-password']])]]);
const context = {
    window: {},
    document: { addEventListener: () => {} },
    localStorage: {
        getItem: key => values.has(key) ? values.get(key) : null,
        setItem: (key, value) => values.set(key, value),
        removeItem: key => values.delete(key)
    }
};
vm.createContext(context);
vm.runInContext(fs.readFileSync(path.join(root, 'js/services/EvaluationKey.js'), 'utf8'), context);
const source = fs.readFileSync(path.join(root, 'js/app.js'), 'utf8');
vm.runInContext(source, context);
const App = vm.runInContext('App', context);

App.prototype._removeLegacyStudentAccounts.call({});
assert.equal(values.has('studentAccounts'), false, 'legacy plaintext is removed even when no migration is attempted');
assert.doesNotMatch(source, /_getStudentAccounts|_saveStudentPassword|_checkStudentPassword/);
assert.match(source, /removeItem\('studentAccounts'\)/);
console.log('PASS: Legacy plaintext student account storage is discarded and cannot remain an authentication source.');
