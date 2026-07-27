const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const pages = ['index.html', 'rubric-evaluation.html'].map(file => ({
    file,
    html: fs.readFileSync(path.join(root, file), 'utf8')
}));

for (const { file, html } of pages) {
    for (const id of ['studentPwArea', 'studentPassword', 'studentConfirmPw', 'studentPwError']) {
        assert.match(html, new RegExp(`id="${id}"`), `${file} is missing ${id}`);
    }
    assert.match(html, /Student password verifiers are stored in public Firestore so passwords work across devices\. This is a functional gate only: public rules do not provide ownership or authorization\. The teacher passcode is embedded in this static client JavaScript and provides no security boundary\./);
    assert.match(html, /Enter the client-side teacher passcode to view the dashboard\./);
    assert.doesNotMatch(html, /browser-local teacher password/);
    assert.doesNotMatch(html, /vsu-building\.png/);
    assert.ok(html.indexOf('js/services/EvaluationKey.js') < html.indexOf('js/models/EvaluationCollection.js'));
    assert.ok(html.indexOf('js/services/StudentCredentialService.js') < html.indexOf('js/services/FirebaseService.js'));
    assert.ok(html.indexOf('js/services/SafeHtml.js') > html.indexOf('js/services/FirebaseService.js'));
    assert.ok(html.indexOf('js/services/SafeHtml.js') < html.indexOf('js/ui/DashboardPanel.js'));
}

const loginSections = pages.map(({ html }) => html
    .slice(html.indexOf('<div id="loginOverlay"'), html.indexOf('<div class="container">'))
    .replace(/\r\n/g, '\n'));
assert.equal(loginSections[0], loginSections[1]);

const firebaseConfig = JSON.parse(fs.readFileSync(path.join(root, 'firebase.json'), 'utf8'));
assert.ok(firebaseConfig.hosting.ignore.includes('firestore.rules'));
assert.ok(firebaseConfig.hosting.ignore.includes('netlify.toml'));

const cacheControl = 'no-cache, max-age=0, must-revalidate';
for (const entryPage of ['/', '/index.html', '/rubric-evaluation.html', '/student.html', '/teacher.html']) {
    const rule = firebaseConfig.hosting.headers.find(header => header.source === entryPage);
    assert.ok(rule, `${entryPage} is missing a Hosting header rule`);
    assert.deepEqual(rule.headers, [{ key: 'Cache-Control', value: cacheControl }]);
}

const scriptSources = pages.map(({ html }) => [...html.matchAll(/<script\s+src="([^"]+)"/g)].map(match => match[1]));
assert.equal(scriptSources[0].length, 20);
assert.deepEqual(scriptSources[0], scriptSources[1]);
for (const source of scriptSources[0]) {
    assert.match(source, /^js\/.+\?v=20260727-workspace-ui$/);
}

console.log('PASS: Both entry pages share the same password UI, coherent versioned scripts, and no-cache Hosting headers; Hosting excludes Firestore rules and Netlify configuration.');
