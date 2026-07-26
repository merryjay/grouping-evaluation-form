const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const rules = fs.readFileSync(path.resolve(__dirname, '..', 'firestore.rules'), 'utf8');

assert.match(rules, /match \/groupingEvaluationForms\/\{document=\*\*\} \{\s*allow read, write: if true;/);
assert.doesNotMatch(rules, /match \/\{document=\*\*\} \{\s*allow read, write: if true;/);
assert.match(rules, /match \/users\/\{userId\} \{\s*allow read: if true;\s*allow write: if request\.auth != null && request\.auth\.uid == userId;/);
assert.match(rules, /match \/users\/\{userId\}\/sessions\/\{sessionId\} \{\s*allow read, write: if request\.auth != null && request\.auth\.uid == userId;/);
assert.match(rules, /match \/users\/\{userId\}\/sessions\/\{sessionId\}\/messages\/\{messageId\} \{\s*allow read, write: if request\.auth != null && request\.auth\.uid == userId;/);

console.log('PASS: Public Firestore access is scoped to groupingEvaluationForms and existing StudyBuddy rules remain restrictive.');
