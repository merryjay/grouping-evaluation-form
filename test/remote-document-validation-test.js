const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const context = { window: {}, console: { warn: () => {} } };
vm.createContext(context);
for (const file of [
    'js/services/EvaluationKey.js',
    'js/services/FirebaseService.js',
    'js/models/EvaluationCollection.js'
]) {
    vm.runInContext(fs.readFileSync(path.join(root, file), 'utf8'), context);
}

const FirebaseService = vm.runInContext('FirebaseService', context);
const EvaluationCollection = vm.runInContext('EvaluationCollection', context);
const EvaluationKey = vm.runInContext('EvaluationKey', context);
const remoteDocument = vm.runInContext(`({
    rubric: { activityName: 'Broken rubric', maxScore: Infinity, criteria: Array.from({ length: 10 }, (_, index) => ({ name: 'Criterion ' + (index + 1), weight: 10 })) },
    groups: [
        { name: 'Valid group', members: 'Alice' + String.fromCharCode(10) + 'Bob' + String.fromCharCode(10) + 'ValidVoter' + String.fromCharCode(10) + 'RealVoter' + String.fromCharCode(10) + 'RealMember' },
        { name: 'Invalid members', members: { not: 'a string' } }
    ],
    voters: [{ name: '__proto__' }, { name: { invalid: true } }],
    evaluations: {
        'g:0:ValidVoter': {
        type: 'member', groupIndex: 'attacker-controlled', voter: 'attacker',
            scores: { 'Criterion 1': 4 }, totalRaw: 4, totalWeighted: 80, grade: 'A', date: '7/26/2026'
        },
        'm:0:RealMember:RealVoter': {
            type: 'group', groupIndex: 99, voter: 'attacker', memberName: 'attacker',
            scores: { 'Criterion 1': 5 }, totalRaw: 5, totalWeighted: 100, grade: 'A+', date: '7/26/2026'
        },
        'm:0:InjectedMember:ValidVoter': { scores: {}, totalRaw: 0, totalWeighted: 0, grade: 'F', date: '7/26/2026' },
        'g:99:ValidVoter': { scores: {}, totalRaw: 0, totalWeighted: 0, grade: 'F', date: '7/26/2026' },
        'g:0:NullScores': { scores: null, totalRaw: 0, totalWeighted: 0, grade: 'F', date: '7/26/2026' },
        'g:01:LeadingZero': { scores: {}, totalRaw: 0, totalWeighted: 0, grade: 'F', date: '7/26/2026' },
        'm:0:Member:Voter:Extra': { scores: {}, totalRaw: 0, totalWeighted: 0, grade: 'F', date: '7/26/2026' }
    }
})`, context);

const normalized = FirebaseService.normalizeDocument(remoteDocument);
assert.equal(normalized.rubric, null);
assert.equal(normalized.groups.length, 1);
assert.match(normalized.groups[0].members, /^Alice\nBob\nValidVoter\nRealVoter\nRealMember$/);
assert.equal(normalized.voters.length, 0);
assert.deepEqual(Object.keys(normalized.evaluations), ['g:0:ValidVoter', 'm:0:RealMember:RealVoter']);
assert.equal(normalized.evaluations['g:0:ValidVoter'].groupIndex, undefined);

const legacyCaseDocument = vm.runInContext(`({
    groups: [{ name: 'Group 1', members: 'Alice' }],
    evaluations: { 'g:0:alice': { scores: {}, totalRaw: 0, totalWeighted: 0, grade: 'F', date: '7/26/2026' } }
})`, context);
assert.deepEqual(Object.keys(FirebaseService.normalizeDocument(legacyCaseDocument).evaluations), ['g:0:Alice']);
const ambiguousCaseDocument = vm.runInContext(`({
    groups: [{ name: 'Group 1', members: 'Alice' }, { name: 'Group 2', members: 'alice' }],
    evaluations: { 'g:0:alice': { scores: {}, totalRaw: 0, totalWeighted: 0, grade: 'F', date: '7/26/2026' } }
})`, context);
assert.equal(Object.keys(FirebaseService.normalizeDocument(ambiguousCaseDocument).evaluations).length, 0);

const collection = new EvaluationCollection().fromJSON(normalized.evaluations);
const [entry] = collection.getAllEntries();
assert.equal(entry.type, 'group');
assert.equal(entry.groupIndex, 0);
assert.equal(entry.voter, 'ValidVoter');
assert.equal(collection.getAggregatedByGroup()[0].groupIndex, 0);
const memberEntry = collection.getAllEntries().find(item => item.type === 'member');
assert.equal(memberEntry.groupIndex, 0);
assert.equal(memberEntry.memberName, 'RealMember');
assert.equal(memberEntry.voter, 'RealVoter');

const validKey = 'm:0:Member:Voter';
assert.deepEqual(EvaluationKey.parse(validKey), collection._parseKey(validKey));
assert.deepEqual(EvaluationKey.parse(validKey), FirebaseService.prototype._parseEvaluationKey.call({}, validKey));
assert.equal(FirebaseService._isPlainObject(remoteDocument), true);
assert.equal(FirebaseService._isPlainObject({}), false);
assert.equal(FirebaseService._isPlainObject(vm.runInContext('Object.create(null)', context)), true);
assert.equal(FirebaseService._isPlainObject(vm.runInContext('new (class Record {})()', context)), false);

const guardedGroupIndexes = vm.runInContext(`(() => {
    const values = Array.from({ length: 101 }, () => 0);
    Object.defineProperty(values, 100, { get: () => { throw new Error('uncapped traversal'); } });
    return values;
})()`, context);
const guardedMemberIds = vm.runInContext(`(() => {
    const values = Array.from({ length: 10001 }, () => 'Valid Member');
    Object.defineProperty(values, 10000, { get: () => { throw new Error('uncapped traversal'); } });
    return values;
})()`, context);
assert.equal(FirebaseService._normalizeGroupIndexes(guardedGroupIndexes).length, 1);
assert.equal(FirebaseService._normalizeStrings(guardedMemberIds, 10000).length, 10000);
for (const invalidKey of ['g:0:__proto__', 'g:0:constructor', 'g:01:Voter', 'g:0: voter', 'g:0:Voter:extra', 'm:0:Member:Voter:extra', 'g:100:Voter']) {
    assert.equal(EvaluationKey.parse(invalidKey), null);
    assert.equal(collection._parseKey(invalidKey), null);
}

console.log('PASS: Remote document normalization rejects malformed nested data and keeps evaluation identity canonical.');
