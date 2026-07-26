const { chromium } = require('playwright');
const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = 9876;
const ROOT = path.resolve(__dirname, '..');

function serve() {
    const mime = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css' };
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

        // Check console for errors
        const errors = [];
        page.on('pageerror', e => errors.push(e.message));
        await page.waitForTimeout(500);

        if (errors.length > 0) {
            console.log(`  CONSOLE ERRORS: ${errors.join(', ')}`);
        }

        // 1. Login overlay visible
        const overlay = page.locator('#loginOverlay');
        const rolePicker = page.locator('#loginRolePicker');
        if (await overlay.isVisible()) ok('Login overlay visible');
        else fail('Login overlay visible', 'not visible');

        // 2. Click "I'm a Teacher"
        await page.click('#chooseTeacherBtn');
        await page.waitForTimeout(300);
        const teacherPwDiv = page.locator('#loginTeacherPw');
        if (await teacherPwDiv.isVisible()) ok('Teacher password panel visible after clicking teacher button');
        else fail('Teacher password panel appeared', 'not visible');

        // 3. Type wrong password, click Enter
        await page.fill('#teacherPasswordInput', 'wrongpw');
        await page.click('#teacherLoginBtn');
        await page.waitForTimeout(300);
        const pwError = page.locator('#teacherLoginError');
        if (await pwError.isVisible()) ok('Wrong password shows error message');
        else fail('Wrong password shows error', 'error not visible');

        // 4. Type correct password, press Enter key
        await page.fill('#teacherPasswordInput', 'VSU2026Admin!');
        await page.locator('#teacherPasswordInput').press('Enter');
        await page.waitForTimeout(500);
        if (!await overlay.isVisible()) ok('Teacher login hides overlay (Enter key)');
        else fail('Teacher login hides overlay (Enter key)', 'overlay still visible');

        // 5. Logout
        await page.click('#logoutBtn');
        await page.waitForTimeout(300);
        if (await overlay.isVisible()) ok('Logout returns to login overlay');
        else fail('Logout returns to login overlay', 'overlay not visible');

        // 6. Student login: click button
        await page.click('#chooseStudentBtn');
        await page.waitForTimeout(300);
        const nameInput = page.locator('#loginNameInput');
        if (await nameInput.isVisible()) ok('Student name panel visible');
        else fail('Student name panel visible', 'not visible');

        // 7. Student enter name, click Enter button
        await page.fill('#voterNameInput', 'TestUser');
        await page.click('#voterLoginBtn');
        await page.waitForTimeout(1000);
        if (!await overlay.isVisible()) ok('Student login hides overlay (click button)');
        else fail('Student login hides overlay (click button)', 'overlay still visible');

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
