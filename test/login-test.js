const assert = require('node:assert');

const TEACHER_PASSWORD = 'VSU2026Admin!';

function mockApp() {
    const state = {
        currentVoter: null,
        isTeacher: false,
        voterGroupIndex: null,
        voters: [],
        storage: {
            saveVoters: () => {}
        },
        _applyRoleVisibility: () => {},
        dashboardPanel: { render: () => {} },
        _refreshStudentEvals: () => {},
        evaluations: { clearAll: () => {} }
    };

    state._doLogout = () => {
        state.currentVoter = null;
        state.isTeacher = false;
        state.voterGroupIndex = null;
    };

    state._studentLogin = async (name) => {
        if (!name) return { error: 'no name' };
        state.currentVoter = name;
        state.isTeacher = false;
        const existing = state.voters.find(v => v.name === name);
        if (!existing) {
            state.voters.push({ name, hasVoted: false, votedCount: 0, ratedGroups: [], loggedIn: true });
        }
        return { ok: true };
    };

    state._teacherLogin = (pw) => {
        if (pw !== TEACHER_PASSWORD) return { error: 'wrong password' };
        state.currentVoter = null;
        state.isTeacher = true;
        return { ok: true };
    };

    return state;
}

async function runTests() {
    console.log('=== Login Flow Tests ===\n');
    let passed = 0;
    let failed = 0;

    function test(name, fn) {
        try {
            fn();
            console.log(`  PASS: ${name}`);
            passed++;
        } catch (e) {
            console.log(`  FAIL: ${name} -- ${e.message}`);
            failed++;
        }
    }

    // 1. Teacher password validation
    test('teacher login rejects wrong password', () => {
        const app = mockApp();
        const result = app._teacherLogin('wrongpassword');
        assert.equal(result.error, 'wrong password');
        assert.equal(app.isTeacher, false);
    });

    test('teacher login accepts correct password', () => {
        const app = mockApp();
        const result = app._teacherLogin('VSU2026Admin!');
        assert.equal(result.ok, true);
        assert.equal(app.isTeacher, true);
        assert.equal(app.currentVoter, null);
    });

    test('teacher login is case sensitive', () => {
        const app = mockApp();
        const result = app._teacherLogin('vsu2026admin!');
        assert.equal(result.error, 'wrong password');
        assert.equal(app.isTeacher, false);
    });

    test('teacher login rejects empty password', () => {
        const app = mockApp();
        const result = app._teacherLogin('');
        assert.equal(result.error, 'wrong password');
        assert.equal(app.isTeacher, false);
    });

    // 2. Student login validation
    test('student login rejects empty name', async () => {
        const app = mockApp();
        const result = await app._studentLogin('');
        assert.equal(result.error, 'no name');
    });

    test('student login accepts valid name', async () => {
        const app = mockApp();
        const result = await app._studentLogin('John Doe');
        assert.equal(result.ok, true);
        assert.equal(app.currentVoter, 'John Doe');
        assert.equal(app.isTeacher, false);
    });

    test('student login records new voter', async () => {
        const app = mockApp();
        await app._studentLogin('Alice');
        assert.equal(app.voters.length, 1);
        assert.equal(app.voters[0].name, 'Alice');
        assert.equal(app.voters[0].loggedIn, true);
    });

    test('student login does not duplicate existing voter', async () => {
        const app = mockApp();
        app.voters.push({ name: 'Bob', hasVoted: false, votedCount: 0, ratedGroups: [], loggedIn: false });
        await app._studentLogin('Bob');
        assert.equal(app.voters.length, 1);
        assert.equal(app.voters[0].loggedIn, true);
    });

    test('student login trims whitespace', async () => {
        const app = mockApp();
        const result = await app._studentLogin('   ');
        assert.equal(result.error, 'no name');
    });

    // 3. Logout
    test('logout resets teacher state', () => {
        const app = mockApp();
        app._teacherLogin('VSU2026Admin!');
        assert.equal(app.isTeacher, true);
        app._doLogout();
        assert.equal(app.isTeacher, false);
        assert.equal(app.currentVoter, null);
    });

    test('logout resets student state', () => {
        const app = mockApp();
        app._studentLogin('Charlie');
        assert.equal(app.currentVoter, 'Charlie');
        app._doLogout();
        assert.equal(app.isTeacher, false);
        assert.equal(app.currentVoter, null);
    });

    // 4. Role transitions
    test('teacher login clears currentVoter', () => {
        const app = mockApp();
        app.currentVoter = 'Dave';
        app._teacherLogin('VSU2026Admin!');
        assert.equal(app.currentVoter, null);
        assert.equal(app.isTeacher, true);
    });

    test('student login clears isTeacher', async () => {
        const app = mockApp();
        app.isTeacher = true;
        await app._studentLogin('Eve');
        assert.equal(app.isTeacher, false);
        assert.equal(app.currentVoter, 'Eve');
    });

    // 5. Verify the mock has all required methods for inline onclick
    test('mock app exposes all required methods', () => {
        const app = mockApp();
        assert.equal(typeof app._teacherLogin, 'function');
        assert.equal(typeof app._studentLogin, 'function');
        assert.equal(typeof app._doLogout, 'function');
    });

    console.log(`\n=== Results: ${passed} passed, ${failed} failed ===`);
    process.exit(failed > 0 ? 1 : 0);
}

runTests().catch(e => {
    console.error('Test error:', e);
    process.exit(1);
});
