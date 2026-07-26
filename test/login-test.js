const assert = require('node:assert');

const TEACHER_PASSWORD = 'VSU2026Admin!';

function mockApp() {
    const state = {
        currentVoter: null,
        isTeacher: false,
        voterGroupIndex: null,
        _selectedRole: null,
        voters: [],
        storage: {
            saveVoters: () => {}
        },
        _applyRoleVisibility: () => {},
        dashboardPanel: { render: () => {} },
        evaluationPanel: { buildGrid: () => {} },
        evaluations: { clearAll: () => {} }
    };

    state._resetLogin = () => {
        state._selectedRole = null;
        state.currentVoter = null;
        state.isTeacher = false;
    };

    state._selectRole = (role) => {
        state._selectedRole = role;
    };

    state._doLogin = async () => {
        if (!state._selectedRole) return { error: 'no role' };

        const value = 'test-value';
        if (!value) {
            return { error: state._selectedRole === 'student' ? 'no name' : 'no password' };
        }

        if (state._selectedRole === 'teacher') {
            if (value !== TEACHER_PASSWORD) return { error: 'wrong password' };
            state.isTeacher = true;
            state.currentVoter = null;
            return { ok: true };
        } else {
            state.currentVoter = value;
            state.isTeacher = false;
            const existing = state.voters.find(v => v.name === value);
            if (!existing) {
                state.voters.push({ name: value, hasVoted: false, votedCount: 0, ratedGroups: [], loggedIn: true });
            }
            return { ok: true };
        }
    };

    state._doLoginWithValue = async (value) => {
        if (!state._selectedRole) return { error: 'no role' };
        if (!value) {
            return { error: state._selectedRole === 'student' ? 'no name' : 'no password' };
        }
        if (state._selectedRole === 'teacher') {
            if (value !== TEACHER_PASSWORD) return { error: 'wrong password' };
            state.isTeacher = true;
            state.currentVoter = null;
            return { ok: true };
        } else {
            state.currentVoter = value;
            state.isTeacher = false;
            const existing = state.voters.find(v => v.name === value);
            if (!existing) {
                state.voters.push({ name: value, hasVoted: false, votedCount: 0, ratedGroups: [], loggedIn: true });
            }
            return { ok: true };
        }
    };

    return state;
}

async function runTests() {
    console.log('=== Unified Login Flow Tests ===\n');
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

    // 1. Role selection
    test('no role selected gives error', async () => {
        const app = mockApp();
        const result = await app._doLogin();
        assert.equal(result.error, 'no role');
        assert.equal(app.isTeacher, false);
    });

    test('selecting student role works', () => {
        const app = mockApp();
        app._selectRole('student');
        assert.equal(app._selectedRole, 'student');
    });

    test('selecting teacher role works', () => {
        const app = mockApp();
        app._selectRole('teacher');
        assert.equal(app._selectedRole, 'teacher');
    });

    // 2. Teacher login
    test('teacher login rejects wrong password', async () => {
        const app = mockApp();
        app._selectRole('teacher');
        const result = await app._doLoginWithValue('wrongpassword');
        assert.equal(result.error, 'wrong password');
        assert.equal(app.isTeacher, false);
    });

    test('teacher login accepts correct password', async () => {
        const app = mockApp();
        app._selectRole('teacher');
        const result = await app._doLoginWithValue('VSU2026Admin!');
        assert.equal(result.ok, true);
        assert.equal(app.isTeacher, true);
        assert.equal(app.currentVoter, null);
    });

    test('teacher login is case sensitive', async () => {
        const app = mockApp();
        app._selectRole('teacher');
        const result = await app._doLoginWithValue('vsu2026admin!');
        assert.equal(result.error, 'wrong password');
    });

    test('teacher login rejects empty password', async () => {
        const app = mockApp();
        app._selectRole('teacher');
        const result = await app._doLoginWithValue('');
        assert.equal(result.error, 'no password');
    });

    // 3. Student login
    test('student login rejects empty name', async () => {
        const app = mockApp();
        app._selectRole('student');
        const result = await app._doLoginWithValue('');
        assert.equal(result.error, 'no name');
    });

    test('student login accepts valid name', async () => {
        const app = mockApp();
        app._selectRole('student');
        const result = await app._doLoginWithValue('John Doe');
        assert.equal(result.ok, true);
        assert.equal(app.currentVoter, 'John Doe');
        assert.equal(app.isTeacher, false);
    });

    test('student login records new voter', async () => {
        const app = mockApp();
        app._selectRole('student');
        await app._doLoginWithValue('Alice');
        assert.equal(app.voters.length, 1);
        assert.equal(app.voters[0].name, 'Alice');
    });

    test('student login does not duplicate existing voter', async () => {
        const app = mockApp();
        app._selectRole('student');
        app.voters.push({ name: 'Bob', hasVoted: false, votedCount: 0, ratedGroups: [], loggedIn: false });
        await app._doLoginWithValue('Bob');
        assert.equal(app.voters.length, 1);
        assert.equal(app.voters[0].loggedIn, true);
    });

    // 4. Logout
    test('logout resets teacher state', () => {
        const app = mockApp();
        app._selectRole('teacher');
        app._doLoginWithValue('VSU2026Admin!');
        assert.equal(app.isTeacher, true);
        app._resetLogin();
        assert.equal(app.isTeacher, false);
        assert.equal(app._selectedRole, null);
    });

    test('logout resets student state', () => {
        const app = mockApp();
        app._selectRole('student');
        app._doLoginWithValue('Charlie');
        assert.equal(app.currentVoter, 'Charlie');
        app._resetLogin();
        assert.equal(app.isTeacher, false);
        assert.equal(app.currentVoter, null);
        assert.equal(app._selectedRole, null);
    });

    // 5. Role transitions
    test('teacher login clears currentVoter', async () => {
        const app = mockApp();
        app.currentVoter = 'Dave';
        app._selectRole('teacher');
        await app._doLoginWithValue('VSU2026Admin!');
        assert.equal(app.currentVoter, null);
        assert.equal(app.isTeacher, true);
    });

    test('student login clears isTeacher', async () => {
        const app = mockApp();
        app.isTeacher = true;
        app._selectRole('student');
        await app._doLoginWithValue('Eve');
        assert.equal(app.isTeacher, false);
        assert.equal(app.currentVoter, 'Eve');
    });

    // 6. Reject login with no role selected first
    test('login blocks if no role selected - teacher flow', async () => {
        const app = mockApp();
        const result = await app._doLoginWithValue('VSU2026Admin!');
        assert.equal(result.error, 'no role');
        assert.equal(app.isTeacher, false);
    });

    test('login blocks if no role selected - student flow', async () => {
        const app = mockApp();
        const result = await app._doLoginWithValue('John');
        assert.equal(result.error, 'no role');
        assert.equal(app.isTeacher, false);
    });

    console.log(`\n=== Results: ${passed} passed, ${failed} failed ===`);
    process.exit(failed > 0 ? 1 : 0);
}

runTests().catch(e => {
    console.error('Test error:', e);
    process.exit(1);
});
