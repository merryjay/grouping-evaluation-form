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

        // 1. Login overlay visible
        const overlay = page.locator('#loginOverlay');
        if (await overlay.isVisible()) ok('Login overlay visible');
        else fail('Login overlay visible', 'not visible');

        // 2. Click role buttons, then try Login without selecting role
        await page.click('#loginBtn');
        await page.waitForTimeout(300);
        const errorEl = page.locator('#loginError');
        if (await errorEl.isVisible()) {
            const text = await errorEl.textContent();
            if (text.includes('select a role')) ok('Shows error when no role selected');
            else fail('Shows error when no role selected', 'wrong text: ' + text);
        } else fail('Shows error when no role selected', 'error not visible');

        // 3. Select Student role, try Login with empty name
        await page.click('#roleStudentBtn');
        await page.waitForTimeout(200);
        await page.click('#loginBtn');
        await page.waitForTimeout(300);
        if (await errorEl.isVisible()) {
            const text = await errorEl.textContent();
            if (text.includes('enter your name')) ok('Shows error when student name empty');
            else fail('Shows error when student name empty', 'wrong text: ' + text);
        } else fail('Shows error when student name empty', 'error not visible');

        // 4. Type student name, click Login
        await page.fill('#loginInput', 'TestStudent');
        await page.click('#loginBtn');
        await page.waitForTimeout(1000);
        if (!await overlay.isVisible()) ok('Student login hides overlay (click Login)');
        else fail('Student login hides overlay', 'overlay still visible');

        // 5. Logout
        await page.click('#logoutBtn');
        await page.waitForTimeout(300);
        if (await overlay.isVisible()) ok('Logout returns to login overlay');
        else fail('Logout returns', 'overlay not visible');

        // 6. Select Teacher, wrong password
        await page.click('#roleTeacherBtn');
        await page.waitForTimeout(200);
        await page.fill('#loginInput', 'wrongpw');
        await page.click('#loginBtn');
        await page.waitForTimeout(300);
        if (await errorEl.isVisible()) {
            const text = await errorEl.textContent();
            if (text.includes('Incorrect password')) ok('Shows error on wrong teacher password');
            else fail('Shows error on wrong teacher password', 'wrong text: ' + text);
        } else fail('Shows error on wrong teacher password', 'error not visible');

        // 7. Correct teacher password, press Enter key
        await page.fill('#loginInput', 'VSU2026Admin!');
        await page.locator('#loginInput').press('Enter');
        await page.waitForTimeout(500);
        if (!await overlay.isVisible()) ok('Teacher login hides overlay (Enter key)');
        else fail('Teacher login hides overlay', 'overlay still visible');

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
