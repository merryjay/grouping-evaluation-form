const { chromium } = require('playwright');

const URL = 'https://merryjay.github.io/grouping-evaluation-form/';

async function run() {
    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();
    let passed = 0;
    let failed = 0;

    function ok(name) { passed++; console.log(`  PASS: ${name}`); }
    function fail(name, msg) { failed++; console.log(`  FAIL: ${name} -- ${msg}`); }

    try {
        await page.goto(URL, { waitUntil: 'networkidle', timeout: 30000 });

        // 1. Initial state - login overlay visible
        const overlay = page.locator('#loginOverlay');
        const rolePicker = page.locator('#loginRolePicker');
        if (await overlay.isVisible() && await rolePicker.isVisible()) ok('Login overlay visible on load');
        else fail('Login overlay visible on load', 'overlay or role picker not visible');

        // 2. Teacher button -> shows password panel
        await page.click('#chooseTeacherBtn');
        await page.waitForTimeout(300);
        const teacherPwDiv = page.locator('#loginTeacherPw');
        if (await teacherPwDiv.isVisible()) ok('Teacher button shows password panel');
        else fail('Teacher button shows password panel', 'password panel not visible');

        // 3. Back button from teacher password -> returns to role picker
        await page.click('#backToRolePickerBtn2');
        await page.waitForTimeout(300);
        if (await rolePicker.isVisible()) ok('Back button returns to role picker from teacher pw');
        else fail('Back button returns to role picker from teacher pw', 'role picker not visible');

        // 4. Student button -> shows name input
        await page.click('#chooseStudentBtn');
        await page.waitForTimeout(300);
        const nameInputDiv = page.locator('#loginNameInput');
        if (await nameInputDiv.isVisible()) ok('Student button shows name input panel');
        else fail('Student button shows name input panel', 'name input not visible');

        // 5. Back button from student name -> returns to role picker
        await page.click('#backToRolePickerBtn');
        await page.waitForTimeout(300);
        if (await rolePicker.isVisible()) ok('Back button returns to role picker from student name');
        else fail('Back button returns to role picker from student name', 'role picker not visible');

        // 6. Go to teacher password again, type wrong pw, click Enter
        await page.click('#chooseTeacherBtn');
        await page.waitForTimeout(300);
        await page.fill('#teacherPasswordInput', 'wrongpw');
        await page.click('#teacherLoginBtn');
        await page.waitForTimeout(300);
        const errorEl = page.locator('#teacherLoginError');
        if (await errorEl.isVisible()) ok('Teacher Enter button shows error on wrong password');
        else fail('Teacher Enter button shows error on wrong password', 'error not visible');

        // 7. Type correct password, click Enter -> teacher logged in
        await page.fill('#teacherPasswordInput', 'VSU2026Admin!');
        await page.click('#teacherLoginBtn');
        await page.waitForTimeout(500);
        if (!await overlay.isVisible()) ok('Teacher Enter button logs in with correct password');
        else fail('Teacher Enter button logs in with correct password', 'overlay still visible');

        // 8. Logout
        const logoutBtn = page.locator('#logoutBtn');
        if (await logoutBtn.isVisible()) ok('Logout button visible after teacher login');
        else fail('Logout button visible after teacher login', 'not visible');
        await page.click('#logoutBtn');
        await page.waitForTimeout(300);
        if (await overlay.isVisible()) ok('Logout returns to login overlay');
        else fail('Logout returns to login overlay', 'overlay not visible');

        // 9. Student: enter name and press Enter key
        await page.click('#chooseStudentBtn');
        await page.waitForTimeout(300);
        await page.fill('#voterNameInput', '');
        await page.locator('#voterNameInput').press('Enter');
        await page.waitForTimeout(300);
        const studentError = page.locator('#loginError');
        if (await studentError.isVisible()) ok('Student Enter key shows error on empty name');
        else fail('Student Enter key shows error on empty name', 'error not visible');

        // 10. Student: type name, press Enter key -> logged in
        await page.fill('#voterNameInput', 'Test Student');
        await page.locator('#voterNameInput').press('Enter');
        await page.waitForTimeout(500);
        if (!await overlay.isVisible()) ok('Student Enter key logs in with valid name');
        else fail('Student Enter key logs in with valid name', 'overlay still visible');

        // 11. Logout as student
        await page.click('#logoutBtn');
        await page.waitForTimeout(300);
        if (await overlay.isVisible()) ok('Student logout works');
        else fail('Student logout works', 'overlay not visible');

    } catch (e) {
        console.log('  ERROR:', e.message);
        failed++;
    }

    console.log(`\n=== E2E Results: ${passed} passed, ${failed} failed ===`);
    await browser.close();
    process.exit(failed > 0 ? 1 : 0);
}

run();
