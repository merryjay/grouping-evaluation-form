const { chromium } = require('playwright');
const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = 9876;
const ROOT = path.resolve(__dirname, '..');

function serve() {
    const mime = { '.html': 'text/html', '.js': 'application/javascript' };
    return http.createServer((req, res) => {
        let file = req.url === '/' ? '/index.html' : req.url;
        const p = path.join(ROOT, file);
        if (!fs.existsSync(p)) { res.writeHead(404); res.end(); return; }
        const ext = path.extname(p);
        res.writeHead(200, { 'Content-Type': mime[ext] || 'text/plain' });
        fs.createReadStream(p).pipe(res);
    }).listen(PORT);
}

async function run() {
    const server = serve();
    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();
    let passed = 0, failed = 0;

    function ok(n) { passed++; console.log(`  PASS: ${n}`); }
    function fail(n, m) { failed++; console.log(`  FAIL: ${n} -- ${m}`); }

    try {
        await page.goto(`http://localhost:${PORT}`, { waitUntil: 'networkidle', timeout: 15000 });
        await page.waitForTimeout(1000);

        const overlay = page.locator('#loginOverlay');

        // 1. Login overlay visible
        if (await overlay.isVisible()) ok('Login overlay visible');
        else fail('Login overlay visible', 'not visible');

        // 2. Teacher button -> password panel
        await page.click('#chooseTeacherBtn');
        await page.waitForTimeout(300);
        const pwDiv = page.locator('#loginTeacherPw');
        if (await pwDiv.isVisible()) ok('Teacher button shows password panel');
        else fail('Teacher button shows password panel', 'not visible');

        // 3. Wrong password -> error
        await page.fill('#teacherPasswordInput', 'wrongpw');
        await page.click('#teacherLoginBtn');
        await page.waitForTimeout(300);
        const pwErr = page.locator('#teacherLoginError');
        if (await pwErr.isVisible()) ok('Wrong password shows error');
        else fail('Wrong password shows error', 'not visible');

        // 4. Correct password via Enter key
        await page.fill('#teacherPasswordInput', 'VSU2026Admin!');
        await page.locator('#teacherPasswordInput').press('Enter');
        await page.waitForTimeout(500);
        if (!await overlay.isVisible()) ok('Teacher login hides overlay (Enter key)');
        else fail('Teacher login hides overlay', 'overlay still visible');

        // 5. Logout -> back to overlay
        await page.click('#logoutBtn');
        await page.waitForTimeout(300);
        if (await overlay.isVisible()) ok('Logout returns to overlay');
        else fail('Logout returns to overlay', 'not visible');

        // 6. Student login via click
        await page.click('#chooseStudentBtn');
        await page.waitForTimeout(300);
        await page.fill('#voterNameInput', 'TestUser');
        await page.click('#voterLoginBtn');
        await page.waitForTimeout(1000);
        if (!await overlay.isVisible()) ok('Student login works');
        else fail('Student login works', 'overlay still visible');

    } catch (e) {
        console.log(`  ERROR: ${e.message}`);
        failed++;
    }

    console.log(`\n=== E2E Results: ${passed} passed, ${failed} failed ===`);
    await browser.close();
    server.close();
    process.exit(failed > 0 ? 1 : 0);
}

run();
