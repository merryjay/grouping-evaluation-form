
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
        this._ensureDefaultMembers();
        this.setupPanel.loadRubricIntoUI();
        this.groupPanel.buildList();
        this._setupLogin();
        this._setupTabListeners();
        this._setupGlobalListeners();
        this._autoLogin();

        if (this.evaluations.size() > 0) {
            this.evaluationPanel.buildGrid();
        }

        this.rubric.activityName = document.getElementById('activityName').value;
    }

    _autoLogin() {
        const saved = localStorage.getItem('rubricLoggedInUser');
        if (!saved) return;
        try {
            const data = JSON.parse(saved);
            if (data.type === 'teacher') {
                this.isTeacher = true;
                this.currentVoter = null;
                document.getElementById('loginOverlay').style.display = 'none';
                document.getElementById('logoutBtn').style.display = '';
                this._applyRoleVisibility();
                this.dashboardPanel.render();
            }
        } catch (e) {}
    }

    _setupLogin() {
        const overlay = document.getElementById('loginOverlay');
        const rolePicker = document.getElementById('loginRolePicker');
        const teacherPwDiv = document.getElementById('loginTeacherPw');
        const logoutBtn = document.getElementById('logoutBtn');

        const showRolePicker = () => {
            rolePicker.style.display = 'block';
            teacherPwDiv.style.display = 'none';
        };
        const showTeacherPw = () => {
            rolePicker.style.display = 'none';
            teacherPwDiv.style.display = 'block';
            document.getElementById('teacherPasswordInput').focus();
        };

        const _getDeviceId = () => {
            let id = localStorage.getItem('rubricDeviceId');
            if (!id) {
                id = 'Device_' + Math.random().toString(36).substring(2, 8);
                localStorage.setItem('rubricDeviceId', id);
            }
            return id;
        };

        this._doLogout = () => {
            const wasVoter = this.currentVoter;
            localStorage.removeItem('rubricLoggedInUser');
            this.currentVoter = null;
            this.isTeacher = false;
            this.voterGroupIndex = null;
            if (wasVoter) {
                const v = this.voters.find(x => x.name.toLowerCase() === wasVoter.toLowerCase());
                if (v) { v.loggedIn = false; this.storage.saveVoters(this.voters); }
            }
            this.evaluations.clearAll();
            logoutBtn.style.display = 'none';
            document.getElementById('teacherPasswordInput').value = '';
            document.getElementById('teacherLoginError').style.display = 'none';
            showRolePicker();
            overlay.style.display = 'flex';
        };

        const studentLogin = async () => {
            await this._freshSync();
            const deviceId = _getDeviceId();
            this.currentVoter = deviceId;
            this.isTeacher = false;
            this.voterGroupIndex = null;
            const existing = this.voters.find(v => v.name === deviceId);
            if (!existing) {
                this.voters.push({ name: deviceId, hasVoted: false, votedCount: 0, ratedGroups: [], loggedIn: true });
            } else {
                existing.loggedIn = true;
            }
            this.storage.saveVoters(this.voters);
            overlay.style.display = 'none';
            logoutBtn.style.display = '';
            this._applyRoleVisibility();
            this._refreshStudentEvals();
        };

        document.getElementById('chooseStudentBtn').addEventListener('click', studentLogin);
        document.getElementById('chooseTeacherBtn').addEventListener('click', showTeacherPw);

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

        document.getElementById('backToRolePickerBtn2').addEventListener('click', showRolePicker);
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
        if (window.app.resultsPanel) window.app.resultsPanel.showPasswordPrompt();
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

    _findVoterGroup() {
        this.voterGroupIndex = null;
        if (!this.currentVoter) return;
        this.groups.getAll().forEach((g, i) => {
            const members = this.groups.getMemberList(i);
            const match = members.some(m =>
                m.toLowerCase() === this.currentVoter.toLowerCase() ||
                m.toLowerCase().startsWith(this.currentVoter.toLowerCase() + ' ') ||
                m.toLowerCase().endsWith(' ' + this.currentVoter.toLowerCase())
            );
            if (match) this.voterGroupIndex = i;
        });
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

    _ensureDefaultMembers() {
        const addMember = (groupIndex, name, prepend = false) => {
            const group = this.groups.get(groupIndex);
            if (!group) return;
            const members = group.members ? group.members.split('\n').map(m => m.trim()).filter(m => m) : [];
            if (!members.includes(name)) {
                if (prepend) {
                    members.unshift(name);
                } else {
                    members.push(name);
                }
                group.members = members.join('\n');
                return true;
            }
            return false;
        };

        let changed = false;

        changed |= addMember(0, 'Nathaniel Rodrigo', true);
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

        if (changed) {
            this.storage.saveGroups(this.groups.toJSON());
        }
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
            if (!this.isTeacher) {
                document.getElementById('editRubricBtn').style.display = 'none';
                document.getElementById('setupButtons').style.display = 'none';
            } else {
                document.getElementById('editRubricBtn').style.display = '';
            }
            this.auth.lockSetup();
            this.setupPanel.hidePasswordPrompt();
            this.setupPanel.disableEditing();
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
        const allMembers = new Map();
        this.groups.getAll().forEach((g, i) => {
            const members = this.groups.getMemberList(i);
            members.forEach(m => {
                if (!allMembers.has(m)) allMembers.set(m, []);
                allMembers.get(m).push(i);
            });
        });
        const votersMap = {};
        allEntries.forEach(e => {
            if (!votersMap[e.voter]) votersMap[e.voter] = new Set();
            votersMap[e.voter].add(e.groupIndex);
        });
        this.voters.forEach(v => {
            if (v.ratedGroups && v.ratedGroups.length > 0) {
                if (!votersMap[v.name]) votersMap[v.name] = new Set();
                v.ratedGroups.forEach(gi => votersMap[v.name].add(gi));
            }
        });
        const allNames = [...new Set([...allMembers.keys(), ...this.voters.map(v => v.name)])];
        allNames.sort();
        if (allNames.length === 0) {
            container.innerHTML = '<div class="empty-state"><p>No students found.</p></div>';
            return;
        }
        let html = '<div style="overflow-x:auto;"><table class="results-table"><tr><th>#</th><th>Name</th><th>Status</th><th>Groups Rated</th><th>Group Names</th></tr>';
        allNames.forEach((name, i) => {
            const ratedSet = votersMap[name] || new Set();
            const votedGroups = [...ratedSet];
            const hasVoted = votedGroups.length > 0;
            const statusClass = hasVoted ? 'grade-A' : 'grade-D';
            const statusText = hasVoted ? 'Voted' : 'Not yet';
            const groupNames = votedGroups.map(gi => {
                const g = this.groups.get(gi);
                return g ? g.name : `Group ${gi + 1}`;
            }).join(', ');
            html += `<tr>
                <td>${i + 1}</td>
                <td><strong>${name}</strong></td>
                <td><span class="grade-badge ${statusClass}">${statusText}</span></td>
                <td>${votedGroups.length} / ${this.groups.size()}</td>
                <td style="font-size:11px;color:#64748b;">${groupNames || '&mdash;'}</td>
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
        document.getElementById('editRubricBtn').addEventListener('click', () => this.setupPanel.showPasswordPrompt());
        document.getElementById('setupCancelBtn').addEventListener('click', () => this.setupPanel.hidePasswordPrompt());
        document.getElementById('setupUnlockBtn').addEventListener('click', () => this.setupPanel._verifyPassword());
        document.getElementById('addCriteriaBtn').addEventListener('click', () => this.setupPanel.addCriteria());
        document.getElementById('saveRubricBtn').addEventListener('click', () => this.setupPanel.saveRubric());

        document.getElementById('resultsPassword').addEventListener('keypress', (e) => {
            if (e.key === 'Enter') this.resultsPanel.verifyPassword();
        });
        document.getElementById('viewResultsBtn').addEventListener('click', () => this.resultsPanel.verifyPassword());
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
