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
    assert.match(html, /Student passwords are stored only in this browser\. The teacher passcode is embedded in this static app as a client-side UI convenience\. Neither protects shared Firestore data or establishes ownership\./);
    assert.match(html, /Enter the client-side teacher passcode to view the dashboard\./);
    assert.doesNotMatch(html, /browser-local teacher password/);
    assert.doesNotMatch(html, /vsu-building\.png/);
    assert.ok(html.indexOf('js/services/EvaluationKey.js') < html.indexOf('js/models/EvaluationCollection.js'));
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

console.log('PASS: Both entry pages share the same password UI and public-data warning; Hosting excludes Firestore rules and Netlify configuration.');
