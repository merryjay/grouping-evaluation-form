const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const pages = ['index.html', 'rubric-evaluation.html'].map(file => ({
    file,
    html: fs.readFileSync(path.join(root, file), 'utf8')
}));
const css = fs.readFileSync(path.join(root, 'css', 'workspace.css'), 'utf8');

for (const { file, html } of pages) {
    assert.match(html, /<meta name="viewport" content="width=device-width, initial-scale=1.0">/, `${file} permits browser zoom`);
    assert.doesNotMatch(html, /maximum-scale|user-scalable=no/, `${file} restricts zoom`);
    assert.match(html, /role="tablist"/, `${file} has semantic tab navigation`);
    assert.match(html, /role="tabpanel"/, `${file} has semantic tab panels`);
    assert.match(html, /id="appStatus"[^>]*role="status"[^>]*aria-live="polite"/, `${file} has an app status region`);
    assert.match(html, /id="loginOverlay"[^>]*role="dialog"[^>]*aria-modal="true"/, `${file} has a modal login dialog`);
    assert.match(html, /id="studentAccountState"[^>]*aria-live="polite"/, `${file} exposes account-flow status`);
    assert.match(html, /autocomplete="new-password"/, `${file} supports new-password flow`);
    assert.match(html, /autocomplete="current-password"/, `${file} supports current-password flow`);
    assert.match(html, /css\/workspace\.css\?v=20260727-workspace-ui/, `${file} loads the shared workspace stylesheet`);
    assert.doesNotMatch(html, /onclick\s*=/i, `${file} adds no inline click handler`);
    for (const match of html.matchAll(/<(?:script|link)[^>]+(?:src|href)="([^"]+)"/g)) {
        const asset = match[1].split('?')[0];
        if (!asset.startsWith('http') && !asset.startsWith('data:')) assert.ok(fs.existsSync(path.join(root, asset)), `${file} references existing ${asset}`);
    }
}

const pageIds = pages.map(({ html }) => [...html.matchAll(/\bid="([^"]+)"/g)].map(match => match[1]).sort());
assert.deepEqual(pageIds[0], pageIds[1], 'entry pages preserve the same ID contract');

assert.match(css, /body\s*\{[\s\S]*?overflow-x:\s*hidden;/, 'page prevents body horizontal overflow');
assert.match(css, /\.table-scroll\s*\{[\s\S]*?overflow-x:\s*auto;/, 'tables have contained horizontal scroll wrappers');
assert.match(css, /@media \(max-width: 767px\)/, 'mobile breakpoint is defined');
assert.match(css, /@media \(prefers-reduced-motion: reduce\)/, 'reduced-motion preference is respected');
assert.match(css, /min-height:\s*44px/, 'touch targets use a 44px minimum');
assert.match(css, /--space-1:\s*8px/, 'workspace uses an 8px base spacing token');
assert.match(css, /--space-2:\s*16px/, 'workspace uses a 16px spacing token');
assert.match(css, /--space-3:\s*24px/, 'workspace uses a 24px spacing token');
assert.match(css, /--brand:\s*#1e4d9b/i, 'workspace uses the considered cobalt brand token');
assert.match(css, /--radius-sm:\s*8px/, 'workspace uses small 8px corners');
assert.match(css, /--radius-md:\s*12px/, 'workspace uses 12px control corners');
assert.match(css, /--radius-pill:\s*999px/, 'workspace uses pill radii only where appropriate');
assert.doesNotMatch(css, /#3d4bad/i, 'workspace no longer uses the default-looking indigo');

const evaluation = fs.readFileSync(path.join(root, 'js', 'ui', 'EvaluationPanel.js'), 'utf8');
const results = fs.readFileSync(path.join(root, 'js', 'ui', 'ResultsPanel.js'), 'utf8');
const groups = fs.readFileSync(path.join(root, 'js', 'ui', 'GroupPanel.js'), 'utf8');
assert.match(evaluation, /aria-pressed/, 'score choices expose selected state');
assert.match(evaluation, /evaluation-progress/, 'evaluation progress is rendered');
assert.match(evaluation, /Your selections are still here/, 'save failures retain user context');
assert.match(results, /Clear group votes/, 'group clear action is precise');
assert.match(results, /Clear individual votes/, 'individual clear action is precise');
assert.match(results, /aria-expanded/, 'statistics disclosures expose state');
assert.match(groups, /Delete group .* all evaluations for this group/, 'group deletion confirmation names its evaluation scope');

console.log('PASS: workspace UI retains selectors while adding responsive, accessible shell, account, status, and precise clear-action contracts.');
