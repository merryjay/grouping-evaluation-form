const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const localWrites = [];
const groupButton = { disabled: false, textContent: 'Submit Vote' };
const memberButton = { disabled: false, textContent: 'Submit Rating' };
const context = {
    window: { app: { currentVoter: 'Valid Voter', isTeacher: false, voterGroupIndex: null } },
    document: {
        querySelector: () => groupButton,
        getElementById: () => null
    },
    localStorage: { setItem: (...args) => localWrites.push(args) },
    alert: () => {}
};
vm.createContext(context);
vm.runInContext(fs.readFileSync(path.join(root, 'js/ui/EvaluationPanel.js'), 'utf8'), context);

const EvaluationPanel = vm.runInContext('EvaluationPanel', context);
const panel = Object.create(EvaluationPanel.prototype);
panel.el = { grid: { querySelector: () => null } };
panel.rubric = { criteria: [] };
panel.scoring = { calculate: () => ({ totalRaw: 0, totalWeighted: 0, grade: 'F' }) };
panel.buildGrid = () => { throw new Error('failed saves must not rebuild as submitted'); };

async function runTests() {
    let localGroupSave = false;
    panel.storage = { remote: { saveEvaluation: async () => false } };
    panel.evaluations = { saveGroup: () => { localGroupSave = true; return true; } };
    await panel._saveEvaluation(0);
    assert.equal(localGroupSave, false);
    assert.equal(groupButton.textContent, 'Submit Vote');
    assert.equal(groupButton.disabled, false);

    panel.storage = { remote: { saveEvaluation: async () => true } };
    panel.evaluations = { saveGroup: () => false };
    await panel._saveEvaluation(0);
    assert.equal(groupButton.textContent, 'Submit Vote');
    assert.equal(groupButton.disabled, false);

    let localMemberSave = false;
    const form = { querySelector: selector => selector === '.save-member-btn' ? memberButton : null };
    panel.storage = { remote: { saveMemberEvaluation: async () => false } };
    panel.evaluations = { saveMember: () => { localMemberSave = true; return true; } };
    await panel._saveMemberEvaluation(0, 'Valid Member', form);
    assert.equal(localMemberSave, false);
    assert.equal(memberButton.textContent, 'Submit Rating');
    assert.equal(memberButton.disabled, false);
    assert.equal(localWrites.length, 0);
    console.log('PASS: Failed Firebase or collection saves never mark group/member evaluations as submitted.');
}

runTests().catch(error => {
    console.error(error);
    process.exit(1);
});
