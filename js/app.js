
class App {
    constructor() {
        this.storage = new StorageService();
        this.auth = new AuthService('VSU2026');
        this.rubric = new RubricConfig();
        this.groups = new GroupCollection();
        this.evaluations = new EvaluationCollection();
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
            const rp = document.getElementById('loginRolePicker');
            const ni = document.getElementById('loginNameInput');
            const tp = document.getElementById('loginTeacherPw');
            if (rp) rp.style.display = 'none';
            if (ni) ni.style.display = 'block';
            if (tp) tp.style.display = 'none';
            const err = document.getElementById('loginError');
            if (err) { err.style.display = 'none'; err.textContent = 'Please enter your name.'; }
            const inp = document.getElementById('voterNameInput');
            if (inp) inp.focus();
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
            if (!name) {
                const err = document.getElementById('loginError');
                if (err) err.style.display = 'block';
                return;
            }
            try {
                const raw = await this.storage.pb.loadEvaluations();
                if (raw) {
                    localStorage.setItem('pbEvals', JSON.stringify(raw));
                    this.evaluations.fromJSON(raw);
                }
            } catch (e) {}
            const err = document.getElementById('loginError');
            if (err) err.style.display = 'none';
            this.currentVoter = name;
            this.isTeacher = false;
            this.voterGroupIndex = null;
            const existing = this.voters.find(v => v.name === name);
            if (!existing) {
                this.voters.push({ name, hasVoted: false, votedCount: 0, ratedGroups: [], loggedIn: true });
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
        localStorage.removeItem('pbRubric');
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
                this.storage.pb.loadEvaluations(),
                this.storage.pb.loadVoters(),
                this.storage.pb.loadGroups()
            ]);
            if (evals) {
                localStorage.setItem('pbEvals', JSON.stringify(evals));
                this.evaluations.fromJSON(evals);
            }
            if (voters) {
                localStorage.setItem('pbVoters', JSON.stringify(voters));
                this.voters = voters;
            }
            if (groups && groups.length > 0) {
                localStorage.setItem('pbGroups', JSON.stringify(groups));
                this.groups.fromJSON(groups);
                this.groupPanel.buildList();
            }
        } catch (e) {}
    }

    async _refreshStudentEvals() {
        try {
            const raw = await this.storage.pb.loadEvaluations();
            if (raw) {
                localStorage.setItem('pbEvals', JSON.stringify(raw));
                this.evaluations.fromJSON(raw);
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
            this.auth.lockResults();
            this._refreshResults();
            this._resultsInterval = setInterval(() => this._refreshResults(), 3000);
        }
    }

    _renderVoters() {
        const container = document.getElementById('votersList');
        const allEntries = this.evaluations.getAllEntries();
        const votersMap = {};
        allEntries.forEach(e => {
            if (!votersMap[e.voter]) votersMap[e.voter] = { count: 0, groups: [] };
            votersMap[e.voter].count++;
            votersMap[e.voter].groups.push(e.groupIndex);
        });
        const allNames = Object.keys(votersMap).sort();
        if (allNames.length === 0) {
            container.innerHTML = '<div class="empty-state"><p>No votes recorded yet.</p></div>';
            return;
        }
        const totalGroups = this.groups.size();
        let html = '<div style="overflow-x:auto;"><table class="results-table"><tr><th>#</th><th>Name</th><th>Groups Rated</th><th>Status</th></tr>';
        allNames.forEach((name, i) => {
            const voterData = votersMap[name];
            const groupsRated = voterData ? voterData.count : 0;
            const statusClass = groupsRated > 0 ? 'grade-A' : 'grade-D';
            const statusText = groupsRated > 0 ? 'Voted' : 'Not yet';
            html += `<tr>
                <td>${i + 1}</td>
                <td><strong>${name}</strong></td>
                <td>${groupsRated} / ${totalGroups}</td>
                <td><span class="grade-badge ${statusClass}">${statusText}</span></td>
            </tr>`;
        });
        html += '</table></div>';
        container.innerHTML = html;
    }

    async _refreshResults() {
        try {
            const raw = await this.storage.pb.loadEvaluations();
            if (raw) {
                localStorage.setItem('pbEvals', JSON.stringify(raw));
                const freshEvals = Object.keys(raw).length > 0 ? new EvaluationCollection().fromJSON(raw) : null;
                this.resultsPanel.showPasswordPrompt(freshEvals);
                if (this.tabManager) {
                    const active = this.tabManager.activeTab;
                    if (active === 'voters') {
                        this.evaluations.fromJSON(raw);
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
