const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.resolve(__dirname, '..', 'js', 'services', 'SafeHtml.js'), 'utf8');
const context = {};
vm.createContext(context);
vm.runInContext(source, context);

const SafeHtml = vm.runInContext('SafeHtml', context);
const hostile = '<img src=x onerror="globalThis.xssExecuted=true"> "quoted" & \'apostrophe\'';
const rendered = SafeHtml.escapeText(hostile);

assert.equal(
    rendered,
    '&lt;img src=x onerror=&quot;globalThis.xssExecuted=true&quot;&gt; &quot;quoted&quot; &amp; &#39;apostrophe&#39;'
);
assert.equal(rendered.includes('<img'), false);
assert.equal(rendered.includes('onerror='), true);
assert.equal(`<span>${rendered}</span>`.includes('<img'), false);

for (const file of [
    'js/app.js',
    'js/ui/DashboardPanel.js',
    'js/ui/ResultsPanel.js',
    'js/ui/EvaluationPanel.js',
    'js/ui/GroupPanel.js',
    'js/ui/SetupPanel.js'
]) {
    const panelSource = fs.readFileSync(path.resolve(__dirname, '..', file), 'utf8');
    assert.match(panelSource, /SafeHtml\.escapeText/);
}

console.log('PASS: Hostile tags and event-handler text are rendered as literal text, and every remote-data UI renderer uses the shared escape helper.');
