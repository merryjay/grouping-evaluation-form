
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
        this._selectedRole = null;

        this._doLogout = () => {};

        const a = window.app;
        a._resetLogin = () => {
            this._selectedRole = null;
            this.currentVoter = null;
            this.isTeacher = false;
            this.voterGroupIndex = null;
            const ia = document.getElementById('loginInputArea');
            if (ia) ia.style.display = 'none';
            const inp = document.getElementById('loginInput');
            if (inp) { inp.value = ''; inp.type = 'text'; inp.placeholder = ''; }
            const err = document.getElementById('loginError');
            if (err) { err.style.display = 'none'; err.textContent = ''; }
            const sb = document.getElementById('roleStudentBtn');
            const tb = document.getElementById('roleTeacherBtn');
            if (sb) sb.style.background = 'white';
            if (tb) tb.style.background = 'white';
        };
        a._selectRole = (role) => {
            this._selectedRole = role;
            const i = document.getElementById('loginInput');
            const ia = document.getElementById('loginInputArea');
            const sub = document.getElementById('loginSubtitle');
            const err = document.getElementById('loginError');
            if (err) { err.style.display = 'none'; err.textContent = ''; }
            if (i) i.value = '';
            const sb = document.getElementById('roleStudentBtn');
            const tb = document.getElementById('roleTeacherBtn');
            if (sb) sb.style.background = role === 'student' ? 'linear-gradient(135deg,#667eea,#764ba2)' : 'white';
            if (sb) sb.style.color = role === 'student' ? 'white' : '#1e293b';
            if (tb) tb.style.background = role === 'teacher' ? 'linear-gradient(135deg,#1e293b,#334155)' : 'white';
            if (tb) tb.style.color = role === 'teacher' ? 'white' : '#1e293b';
            if (ia) ia.style.display = 'flex';
            if (i) {
                if (role === 'student') {
                    i.type = 'text';
                    i.placeholder = 'Your full name';
                    if (sub) sub.textContent = 'Enter your name to start evaluating groups.';
                } else {
                    i.type = 'password';
                    i.placeholder = 'Teacher password';
                    if (sub) sub.textContent = 'Enter the teacher password to access the dashboard.';
                }
                i.focus();
            }
        };
        a._showError = (msg) => {
            const err = document.getElementById('loginError');
            if (err) { err.textContent = msg; err.style.display = 'block'; }
        };
        a._doLogin = async () => {
            if (!this._selectedRole) {
                a._showError('Please select a role (Student or Teacher).');
                return;
            }
            const input = document.getElementById('loginInput');
            const value = input ? input.value.trim() : '';
            if (!value) {
                if (this._selectedRole === 'student') {
                    a._showError('Please enter your name.');
                } else {
                    a._showError('Please enter the teacher password.');
                }
                return;
            }
            if (this._selectedRole === 'teacher') {
                if (value !== 'VSU2026Admin!') {
                    a._showError('Incorrect password.');
                    return;
                }
                this.currentVoter = null;
                this.isTeacher = true;
                localStorage.setItem('rubricLoggedInUser', JSON.stringify({ type: 'teacher' }));
                const ol = document.getElementById('loginOverlay');
                if (ol) ol.style.display = 'none';
                const lb = document.getElementById('logoutBtn');
                if (lb) lb.style.display = '';
                this._applyRoleVisibility();
                this.dashboardPanel.render();
            } else {
                try {
                    const raw = await this.storage.pb.loadEvaluations();
                    if (raw) {
                        localStorage.setItem('pbEvals', JSON.stringify(raw));
                        this.evaluations.fromJSON(raw);
                    }
                } catch (e) {}
                this.currentVoter = value;
                this.isTeacher = false;
                this.voterGroupIndex = null;
                const existing = this.voters.find(v => v.name === value);
                if (!existing) {
                    this.voters.push({ name: value, hasVoted: false, votedCount: 0, ratedGroups: [], loggedIn: true });
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
            }
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
            const ol = document.getElementById('loginOverlay');
            if (ol) ol.style.display = 'flex';
            a._resetLogin();
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
