
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
    }

    async init() {
        await this.storage.init();
        this._loadData();
        this.voters = this.storage.loadVoters();
        this.setupPanel.loadRubricIntoUI();
        this.groupPanel.buildList();
        this._setupLogin();
        this._setupTabListeners();
        this._setupGlobalListeners();

        if (this.evaluations.size() > 0) {
            this.evaluationPanel.buildGrid();
        }

        this.rubric.activityName = document.getElementById('activityName').value;
    }

    _setupLogin() {
        const overlay = document.getElementById('loginOverlay');
        const rolePicker = document.getElementById('loginRolePicker');
        const nameInputDiv = document.getElementById('loginNameInput');
        const teacherPwDiv = document.getElementById('loginTeacherPw');
        const logoutBtn = document.getElementById('logoutBtn');

        const showRolePicker = () => {
            rolePicker.style.display = 'block';
            nameInputDiv.style.display = 'none';
            teacherPwDiv.style.display = 'none';
        };
        const showNameInput = () => {
            rolePicker.style.display = 'none';
            nameInputDiv.style.display = 'block';
            teacherPwDiv.style.display = 'none';
            document.getElementById('loginError').style.display = 'none';
            document.getElementById('loginError').textContent = 'Please enter your name.';
            document.getElementById('voterNameInput').focus();
        };
        const showTeacherPw = () => {
            rolePicker.style.display = 'none';
            nameInputDiv.style.display = 'none';
            teacherPwDiv.style.display = 'block';
            document.getElementById('teacherPasswordInput').focus();
        };

        this._doLogout = () => {
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
            logoutBtn.style.display = 'none';
            document.getElementById('voterNameInput').value = '';
            document.getElementById('teacherPasswordInput').value = '';
            document.getElementById('loginError').style.display = 'none';
            document.getElementById('teacherLoginError').style.display = 'none';
            showRolePicker();
            overlay.style.display = 'flex';
        };

        logoutBtn.addEventListener('click', () => this._doLogout());
        document.getElementById('chooseStudentBtn').addEventListener('click', showNameInput);
        document.getElementById('chooseTeacherBtn').addEventListener('click', showTeacherPw);
        document.getElementById('backToRolePickerBtn').addEventListener('click', showRolePicker);
        document.getElementById('backToRolePickerBtn2').addEventListener('click', showRolePicker);

        const studentLogin = async () => {
            const name = document.getElementById('voterNameInput').value.trim();
            if (!name) { document.getElementById('loginError').style.display = 'block'; return; }

            await this._freshSync();

            document.getElementById('loginError').style.display = 'none';
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
            overlay.style.display = 'none';
            logoutBtn.style.display = '';
            this._applyRoleVisibility();
            this._refreshStudentEvals();
        };

        document.getElementById('voterLoginBtn').addEventListener('click', studentLogin);
        document.getElementById('voterNameInput').addEventListener('keypress', (e) => { if (e.key === 'Enter') studentLogin(); });

        const teacherLogin = () => {
            const pw = document.getElementById('teacherPasswordInput').value;
            if (pw !== 'VSU2026Admin!') { document.getElementById('teacherLoginError').style.display = 'block'; return; }
            document.getElementById('teacherLoginError').style.display = 'none';
            this.currentVoter = null;
            this.isTeacher = true;
            localStorage.setItem('rubricLoggedInUser', JSON.stringify({ type: 'teacher' }));
            overlay.style.display = 'none';
            logoutBtn.style.display = '';
            this._applyRoleVisibility();
            this.dashboardPanel.render();
        };

        document.getElementById('teacherLoginBtn').addEventListener('click', teacherLogin);
        document.getElementById('teacherPasswordInput').addEventListener('keypress', (e) => { if (e.key === 'Enter') teacherLogin(); });
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
