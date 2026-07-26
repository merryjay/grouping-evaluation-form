
class App {
    constructor() {
        this.storage = new StorageService();
        this.auth = new AuthService('VSU2026');
        this.rubric = new RubricConfig();
        this.groups = new GroupCollection();
        this.evaluations = new EvaluationCollection(this.groups);
        this.tabManager = new TabManager();
        this.scoring = new ScoringService(this.rubric);
        this.evaluationPanel = new EvaluationPanel(this.rubric, this.groups, this.evaluations, this.scoring, this.storage);
        this.groupNavigator = new GroupNavigator(this.tabManager, this.evaluationPanel);
        this.exportService = new ExportService(this.rubric, this.groups, this.evaluations);
        this.setupPanel = new SetupPanel(this.auth, this.rubric, this.storage, this.tabManager);
        this.groupPanel = new GroupPanel(this.groups, this.storage);
        this.resultsPanel = new ResultsPanel(this.auth, this.groups, this.evaluations, this.exportService);
        this.resultsPanel.setStorage(this.storage);
        this.dashboardPanel = new DashboardPanel(this);

        localStorage.removeItem('rubricLoggedInUser');
        this.currentVoter = null;
        this.voters = this.storage.loadVoters();
        this.isTeacher = false;
        this.voterGroupIndex = null;
        this._studentLoginName = null;

        window.app = this;

        this._doLogout = () => {};
        this._studentLogin = async () => {};
        this._teacherLogin = () => {};
        this._showRolePicker = () => {};
        this._showNameInput = () => {};
        this._showTeacherPw = () => {};

        const a = window.app;
        a._showRolePicker = () => {
            const rp = document.getElementById('loginRolePicker');
            const ni = document.getElementById('loginNameInput');
            const tp = document.getElementById('loginTeacherPw');
            if (rp) rp.style.display = 'block';
            if (ni) ni.style.display = 'none';
            if (tp) tp.style.display = 'none';
        };
        a._showNameInput = () => {
            this._studentLoginName = null;
            const rp = document.getElementById('loginRolePicker');
            const ni = document.getElementById('loginNameInput');
            const tp = document.getElementById('loginTeacherPw');
            if (rp) rp.style.display = 'none';
            if (ni) ni.style.display = 'block';
            if (tp) tp.style.display = 'none';
            const err = document.getElementById('loginError');
            if (err) { err.style.display = 'none'; err.textContent = 'Please enter your name.'; }
            const pwErr = document.getElementById('studentPwError');
            if (pwErr) pwErr.style.display = 'none';
            const pwArea = document.getElementById('studentPwArea');
            if (pwArea) pwArea.style.display = 'none';
            const pwInput = document.getElementById('studentPassword');
            if (pwInput) { pwInput.value = ''; pwInput.placeholder = 'Password'; }
            const confirmInput = document.getElementById('studentConfirmPw');
            if (confirmInput) { confirmInput.style.display = 'none'; confirmInput.value = ''; }
            const btn = document.getElementById('voterLoginBtn');
            if (btn) btn.textContent = 'Enter';
            const inp = document.getElementById('voterNameInput');
            if (inp) { inp.value = ''; inp.focus(); }
        };
        a._showTeacherPw = () => {
            const rp = document.getElementById('loginRolePicker');
            const ni = document.getElementById('loginNameInput');
            const tp = document.getElementById('loginTeacherPw');
            if (rp) rp.style.display = 'none';
            if (ni) ni.style.display = 'none';
            if (tp) tp.style.display = 'block';
            const inp = document.getElementById('teacherPasswordInput');
            if (inp) inp.focus();
        };
        a._doLogout = () => {
            this._studentLoginName = null;
            const wasVoter = this.currentVoter;
            localStorage.removeItem('rubricLoggedInUser');
            localStorage.removeItem('rubricDeviceName');
            this.currentVoter = null;
            this.isTeacher = false;
            this.voterGroupIndex = null;
            if (wasVoter) {
                const v = this.voters.find(x => x.name.toLowerCase() === wasVoter.toLowerCase());
                if (v) { v.loggedIn = false; this.storage.saveVoters(this.voters); }
            }
            this.evaluations.clearAll();
            const lb = document.getElementById('logoutBtn');
            if (lb) lb.style.display = 'none';
            const ni = document.getElementById('voterNameInput');
            if (ni) ni.value = '';
            const pi = document.getElementById('teacherPasswordInput');
            if (pi) pi.value = '';
            const le = document.getElementById('loginError');
            if (le) le.style.display = 'none';
            const te = document.getElementById('teacherLoginError');
            if (te) te.style.display = 'none';
            const ol = document.getElementById('loginOverlay');
            if (ol) ol.style.display = 'flex';
            a._showRolePicker();
        };
        a._studentLogin = async () => {
            const nameInput = document.getElementById('voterNameInput');
            const name = nameInput ? nameInput.value.trim() : '';
            const err = document.getElementById('loginError');
            const pwErr = document.getElementById('studentPwError');
            const pwInput = document.getElementById('studentPassword');
            const confirmInput = document.getElementById('studentConfirmPw');
            const pwArea = document.getElementById('studentPwArea');
            const btn = document.getElementById('voterLoginBtn');

            if (!this._studentLoginName) {
                if (!name) {
                    if (err) { err.textContent = 'Please enter your name.'; err.style.display = 'block'; }
                    return;
                }
                const membership = this._resolveStudentMembership(name);
                if (!membership) {
                    if (err) {
                        err.textContent = 'Registration failed. Your name is not listed as an official member. Please contact the administrator.';
                        err.style.display = 'block';
                    }
                    return;
                }
                if (err) err.style.display = 'none';
                this._studentLoginName = membership.name;
                if (pwArea) pwArea.style.display = 'flex';
                if (this._hasStudentPassword(membership.name)) {
                    if (confirmInput) confirmInput.style.display = 'none';
                    if (pwInput) { pwInput.value = ''; pwInput.placeholder = 'Enter your password'; pwInput.focus(); }
                    if (btn) btn.textContent = 'Log In';
                } else {
                    if (confirmInput) { confirmInput.style.display = 'block'; confirmInput.value = ''; }
                    if (pwInput) { pwInput.value = ''; pwInput.placeholder = 'Create a password'; pwInput.focus(); }
                    if (btn) btn.textContent = 'Register';
                }
                return;
            }

            const password = pwInput ? pwInput.value : '';
            if (!password) {
                if (pwErr) { pwErr.textContent = 'Please enter a password.'; pwErr.style.display = 'block'; }
                return;
            }
            if (this._hasStudentPassword(this._studentLoginName)) {
                if (!this._checkStudentPassword(this._studentLoginName, password)) {
                    if (pwErr) { pwErr.textContent = 'Incorrect password. Please try again.'; pwErr.style.display = 'block'; }
                    return;
                }
            } else {
                const confirm = confirmInput ? confirmInput.value : '';
                if (password !== confirm) {
                    if (pwErr) { pwErr.textContent = 'Passwords do not match. Please try again.'; pwErr.style.display = 'block'; }
                    return;
                }
                this._saveStudentPassword(this._studentLoginName, password);
            }
            if (pwErr) pwErr.style.display = 'none';

            const loginName = this._studentLoginName;
            this._studentLoginName = null;

            try {
                const remoteEvals = await this.storage.remote.loadEvaluationsResult();
                if (remoteEvals.available) {
                    localStorage.setItem('pbEvals', JSON.stringify(remoteEvals.data));
                    this.evaluations.fromJSON(remoteEvals.data);
                }
            } catch (e) {}
            this.currentVoter = loginName;
            this.isTeacher = false;
            this.voterGroupIndex = this._findVoterGroupIndex(loginName);
            const existing = this.voters.find(v => v.name.toLowerCase() === loginName.toLowerCase());
            if (!existing) {
                this.voters.push({ name: loginName, hasVoted: false, votedCount: 0, ratedGroups: [], loggedIn: true });
            } else {
                existing.loggedIn = true;
            }
            this.storage.saveVoters(this.voters);
            const ol = document.getElementById('loginOverlay');
            if (ol) ol.style.display = 'none';
            const lb = document.getElementById('logoutBtn');
            if (lb) lb.style.display = '';
            this._applyRoleVisibility();
            this.evaluationPanel.buildGrid();
        };
        a._teacherLogin = () => {
            const pwInput = document.getElementById('teacherPasswordInput');
            const pw = pwInput ? pwInput.value : '';
            const err = document.getElementById('teacherLoginError');
            if (pw !== 'VSU2026Admin!') { if (err) err.style.display = 'block'; return; }
            if (err) err.style.display = 'none';
            this.currentVoter = null;
            this.isTeacher = true;
            localStorage.setItem('rubricLoggedInUser', JSON.stringify({ type: 'teacher' }));
            const ol = document.getElementById('loginOverlay');
            if (ol) ol.style.display = 'none';
            const lb = document.getElementById('logoutBtn');
            if (lb) lb.style.display = '';
            this._applyRoleVisibility();
            this.dashboardPanel.render();
        };
    }

    async init() {
        try {
            await this.storage.init();
        } catch (e) { console.warn('storage init failed', e); }
        try { this._loadData(); } catch (e) { console.warn('loadData failed', e); }
        try { this.voters = this.storage.loadVoters(); } catch (e) { console.warn('loadVoters failed', e); }
        try { this.setupPanel.loadRubricIntoUI(); } catch (e) { console.warn('loadRubricIntoUI failed', e); }
        try { this.groupPanel.buildList(); } catch (e) { console.warn('buildList failed', e); }
        this._setupLogin();
        try { this._setupTabListeners(); } catch (e) { console.warn('tab listeners failed', e); }
        try { this._setupGlobalListeners(); } catch (e) { console.warn('global listeners failed', e); }

        try {
            if (this.evaluations.size() > 0) {
                this.evaluationPanel.buildGrid();
            }
        } catch (e) { console.warn('buildGrid failed', e); }

        try {
            const an = document.getElementById('activityName');
            if (an) this.rubric.activityName = an.value;
        } catch (e) {}
    }

    _setupLogin() {
        const logoutBtn = document.getElementById('logoutBtn');
        if (logoutBtn) logoutBtn.addEventListener('click', () => this._doLogout());
        try {
            const el = (id) => document.getElementById(id);
            if (el('chooseStudentBtn')) el('chooseStudentBtn').addEventListener('click', () => window.app._showNameInput());
            if (el('chooseTeacherBtn')) el('chooseTeacherBtn').addEventListener('click', () => window.app._showTeacherPw());
            if (el('backToRolePickerBtn')) el('backToRolePickerBtn').addEventListener('click', () => window.app._showRolePicker());
            if (el('backToRolePickerBtn2')) el('backToRolePickerBtn2').addEventListener('click', () => window.app._showRolePicker());
            if (el('voterLoginBtn')) el('voterLoginBtn').addEventListener('click', () => window.app._studentLogin());
            if (el('voterNameInput')) el('voterNameInput').addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); window.app._studentLogin(); } });
            if (el('teacherLoginBtn')) el('teacherLoginBtn').addEventListener('click', () => window.app._teacherLogin());
            if (el('teacherPasswordInput')) el('teacherPasswordInput').addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); window.app._teacherLogin(); } });
        } catch (e) { console.warn('Login wiring error', e); }
    }

    async _freshSync() {
        try {
            const [evals, voters, groups] = await Promise.all([
                this.storage.remote.loadEvaluationsResult(),
                this.storage.remote.loadVotersResult(),
                this.storage.remote.loadGroupsResult()
            ]);
            if (evals.available) {
                localStorage.setItem('pbEvals', JSON.stringify(evals.data));
                this.evaluations.fromJSON(evals.data);
            }
            if (voters.available) {
                localStorage.setItem('pbVoters', JSON.stringify(voters.data));
                this.voters = voters.data;
            }
            if (groups.available && groups.data.length > 0) {
                localStorage.setItem('pbGroups', JSON.stringify(groups.data));
                this.groups.fromJSON(groups.data);
                this.groupPanel.buildList();
            }
        } catch (e) {}
    }

    async _refreshStudentEvals() {
        try {
            const remoteEvals = await this.storage.remote.loadEvaluationsResult();
            if (remoteEvals.available) {
                localStorage.setItem('pbEvals', JSON.stringify(remoteEvals.data));
                this.evaluations.fromJSON(remoteEvals.data);
            }
        } catch (e) {}
        this.evaluationPanel.buildGrid();
        if (this.tabManager) {
            const active = this.tabManager.activeTab;
        }
    }

    _applyRoleVisibility() {
        this.tabManager.tabs.forEach(tab => {
            const tabId = tab.dataset.tab;
            if (this.isTeacher) {
                tab.style.display = '';
            } else {
                if (tabId === 'evaluate') {
                    tab.style.display = '';
                } else {
                    tab.style.display = 'none';
                }
            }
        });
        if (this.isTeacher) {
            this.tabManager.switch('dashboard');
        } else {
            this.tabManager.switch('evaluate');
        }
    }

    _loadData() {
        const savedRubric = this.storage.loadRubric();
        if (savedRubric) this.rubric.fromJSON(savedRubric);

        const savedGroups = this.storage.loadGroups();
        if (savedGroups) this.groups.fromJSON(savedGroups);

        const savedEvals = this.storage.loadEvaluations();
        if (savedEvals) this.evaluations.fromJSON(savedEvals);

        this._ensureDefaultMembers();
    }

    _ensureDefaultMembers() {
        for (let i = 0; i <= 8; i++) {
            if (!this.groups.get(i)) {
                this.groups.add({ name: `Group ${i + 1}`, members: '' });
            }
        }
        const addMember = (groupIndex, name) => {
            const g = this.groups.get(groupIndex);
            if (!g) return false;
            const members = g.members ? g.members.split('\n').map(m => m.trim()).filter(m => m) : [];
            if (!members.includes(name)) {
                members.push(name);
                g.members = members.join('\n');
                return true;
            }
            return false;
        };

        let changed = false;

        changed |= addMember(0, 'Nathaniel Rodrigo');
        changed |= addMember(0, 'Junna Dag-uman');
        changed |= addMember(0, 'Merry Jay Tumulak');

        changed |= addMember(1, 'Krizia Nicole Rubio');
        changed |= addMember(1, 'Althea Tanguamos');
        changed |= addMember(1, 'John Alrey Gementiza');

        changed |= addMember(2, 'Aranas Vince');
        changed |= addMember(2, 'Palangan Lucille Mae');
        changed |= addMember(2, 'Tariao Justine Jean');

        changed |= addMember(3, 'Kevin Jay Morales');
        changed |= addMember(3, 'Nylvia Apao');
        changed |= addMember(3, 'Rosalden Rabago');

        changed |= addMember(4, 'James Susas');
        changed |= addMember(4, 'Mark Antolijao');
        changed |= addMember(4, 'Eirich Dianne Molde');

        changed |= addMember(5, 'Bal Gestly Labador');
        changed |= addMember(5, 'Elmie Soltes');
        changed |= addMember(5, 'Steven Yoldan');

        changed |= addMember(6, 'Andrew Sambulan');
        changed |= addMember(6, 'Allan Baguio');
        changed |= addMember(6, 'Archie Jutag');

        changed |= addMember(7, 'Angel Lou Geografo');
        changed |= addMember(7, 'Juliemar Bartolo');
        changed |= addMember(7, 'Gabriel Salaveria');

        changed |= addMember(8, 'April Gulbin');

        if (changed) this.storage.saveGroups(this.groups.toJSON());
    }

    _isNameInMemberList(name) {
        return !!this._resolveStudentMembership(name);
    }

    _resolveStudentMembership(name) {
        if (!EvaluationKey.isIdentity(name)) return null;
        const nameLower = name.toLowerCase();
        const matches = [];
        for (let i = 0; i < this.groups.size(); i++) {
            const members = this.groups.getMemberList(i);
            for (const member of members) {
                if (member.toLowerCase() === nameLower) matches.push({ name: member, groupIndex: i });
            }
        }
        return matches.length === 1 ? matches[0] : null;
    }

    _getStudentAccounts() {
        let stored;
        try { stored = JSON.parse(localStorage.getItem('studentAccounts') || '[]'); } catch { stored = []; }
        const entries = Array.isArray(stored)
            ? stored
            : (stored && typeof stored === 'object' ? Object.entries(stored) : []);
        const accounts = new Map();
        entries.forEach(entry => {
            if (!Array.isArray(entry) || entry.length !== 2) return;
            const [name, password] = entry;
            if (EvaluationKey.isIdentity(name) && typeof password === 'string') accounts.set(name, password);
        });
        return accounts;
    }

    _saveStudentAccounts(accounts) {
        localStorage.setItem('studentAccounts', JSON.stringify([...accounts.entries()]));
    }

    _hasStudentPassword(name) {
        const accounts = this._getStudentAccounts();
        return accounts.has(name.toLowerCase().trim());
    }

    _saveStudentPassword(name, password) {
        const accounts = this._getStudentAccounts();
        accounts.set(name.toLowerCase().trim(), password);
        this._saveStudentAccounts(accounts);
    }

    _checkStudentPassword(name, password) {
        const accounts = this._getStudentAccounts();
        return accounts.get(name.toLowerCase().trim()) === password;
    }

    _findVoterGroupIndex(name) {
        const membership = this._resolveStudentMembership(name);
        return membership ? membership.groupIndex : null;
    }

    _setupTabListeners() {
        this.tabManager.tabs.forEach(tab => {
            tab.addEventListener('click', () => {
                const tabId = tab.dataset.tab;
                this.tabManager.switch(tabId);
                this._onTabSwitch(tabId);
            });
        });
    }

    _onTabSwitch(tabId) {
        if (this._resultsInterval) {
            clearInterval(this._resultsInterval);
            this._resultsInterval = null;
        }
        if (tabId === 'dashboard') {
            this.dashboardPanel.render();
        }
        if (tabId === 'setup') {
            this.setupPanel.enableEditing();
            this.setupPanel.updatePreview();
        }
        if (tabId === 'groups') {
            this.groupPanel.buildList();
        }
        if (tabId === 'evaluate') {
            this.evaluationPanel.buildGrid();
        }
        if (tabId === 'voters') {
            this._renderVoters();
        }

        if (tabId === 'results') {
            this._refreshResults();
            this._resultsInterval = setInterval(() => this._refreshResults(), 3000);
        }
    }

    _renderVoters() {
        const container = document.getElementById('votersList');
        const allEntries = this.evaluations.getAllEntries();
        const votersMap = new Map();
        allEntries.forEach(e => {
            if (!votersMap.has(e.voter)) votersMap.set(e.voter, { groupCount: 0, memberCount: 0, groups: [] });
            const voter = votersMap.get(e.voter);
            voter.groups.push(e.groupIndex);
            if (e.type === 'member') {
                voter.memberCount++;
            } else {
                voter.groupCount++;
            }
        });
        const allNames = [...votersMap.keys()].sort();
        if (allNames.length === 0) {
            container.innerHTML = '<div class="empty-state"><p>No votes recorded yet.</p></div>';
            return;
        }
        const totalGroups = this.groups.size();
        let html = '<div style="overflow-x:auto;"><table class="results-table"><tr><th>#</th><th>Name</th><th>Groups Rated</th><th>Members Rated</th><th>Status</th></tr>';
        allNames.forEach((name, i) => {
            const v = votersMap.get(name);
            const totalVotes = v.groupCount + v.memberCount;
            const statusClass = totalVotes > 0 ? 'grade-A' : 'grade-D';
            const statusText = totalVotes > 0 ? 'Voted' : 'Not yet';
            html += `<tr>
                <td>${i + 1}</td>
                <td><strong>${SafeHtml.escapeText(name)}</strong></td>
                <td>${v.groupCount} / ${totalGroups}</td>
                <td>${v.memberCount}</td>
                <td><span class="grade-badge ${statusClass}">${statusText}</span></td>
            </tr>`;
        });
        html += '</table></div>';
        container.innerHTML = html;
    }

    async _refreshResults() {
        try {
            const remoteEvals = await this.storage.remote.loadEvaluationsResult();
            if (remoteEvals.available) {
                localStorage.setItem('pbEvals', JSON.stringify(remoteEvals.data));
                this.evaluations.fromJSON(remoteEvals.data);
                const freshEvals = new EvaluationCollection(this.groups).fromJSON(remoteEvals.data);
                this.resultsPanel.showPasswordPrompt(freshEvals);
                if (this.tabManager) {
                    const active = this.tabManager.activeTab;
                    if (active === 'voters') {
                        this._renderVoters();
                    }
                    if (active === 'dashboard') {
                        this.dashboardPanel.render();
                    }
                }
            }
        } catch (e) {}
    }

    _setupGlobalListeners() {
        document.getElementById('addCriteriaBtn').addEventListener('click', () => this.setupPanel.addCriteria());
        document.getElementById('saveRubricBtn').addEventListener('click', () => this.setupPanel.saveRubric());

        document.getElementById('clearAllBtn').addEventListener('click', () => this.resultsPanel.clearAll());
        document.getElementById('exportAllBtn').addEventListener('click', () => this.resultsPanel.exportCSV());

        document.addEventListener('visibilitychange', () => {
            if (!document.hidden) this._refreshResults();
        });
    }
}

document.addEventListener('DOMContentLoaded', async () => {
    const app = new App();
    await app.init();
});
