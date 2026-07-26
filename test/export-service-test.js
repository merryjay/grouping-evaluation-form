const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const context = {};
vm.createContext(context);
vm.runInContext(fs.readFileSync(path.resolve(__dirname, '..', 'js', 'services', 'ExportService.js'), 'utf8'), context);

const ExportService = vm.runInContext('ExportService', context);
const service = new ExportService(
    { getCriteriaNames: () => ['=criterion, "name"\nnext'] },
    { get: () => ({ name: '=Group, "Name"\nNext' }) },
    {
        getAggregatedByGroup: () => [{
            groupIndex: 0,
            scoreCount: '=votes',
            scores: { '=criterion, "name"\nnext': '@score' },
            totalRaw: '+1',
            totalWeighted: '-2',
            date: '\tdate'
        }],
        getAllEntries: () => [{
            groupIndex: 0,
            voter: '=voter',
            totalRaw: '+raw',
            totalWeighted: '-weighted',
            grade: '@grade'
        }]
    }
);

assert.equal(service._csvCell('plain'), '"\'plain"');
assert.equal(service._csvCell('a,"b"\nnext'), '"\'a,""b""\nnext"');
for (const value of ['=formula', '+formula', '-formula', '@formula', '\tformula', '\rformula', '\n=formula', ' \t=formula', '\u0001=formula']) {
    assert.equal(service._csvCell(value), `"'${value}"`);
}

const csv = service.exportAllCSV();
assert.match(csv, /"'=criterion, ""name""\nnext"/);
assert.match(csv, /"'=Group, ""Name""\nNext"/);
assert.match(csv, /"'=votes","'@score","'\+1","'-2%","'\tdate"/);
assert.match(csv, /"'=Group, ""Name""\nNext","'=voter","'\+raw","'-weighted%","'@grade"/);

console.log('PASS: CSV export quotes every cell, escapes quotes/newlines, and neutralizes spreadsheet formulas.');
