
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
        this._resultsVersion = 0;
        this._stateVersion = 0;
        this.rosterRevision = this.storage.getRosterRevision ? this.storage.getRosterRevision() : 0;
        this._studentLoginState = 'name';
        this._studentLoginOperation = 0;

        window.app = this;

        this._doLogout = () => {};
        this._studentLogin = async () => {};
        this._teacherLogin = () => {};
        this._showRolePicker = () => {};
        this._showNameInput = () => {};
        this._showTeacherPw = () => {};
        this.showStatus = (message, type = 'info') => {
            const status = document.getElementById('appStatus');
            if (!status) return false;
            status.textContent = message;
            status.dataset.status = type;
            if (status.classList) status.classList.add('is-visible');
            return true;
        };

        const a = window.app;
        a._showRolePicker = () => {
            this._invalidateStudentLogin();
            const rp = document.getElementById('loginRolePicker');
            const ni = document.getElementById('loginNameInput');
            const tp = document.getElementById('loginTeacherPw');
            if (rp) rp.style.display = 'block';
            if (ni) ni.style.display = 'none';
            if (tp) tp.style.display = 'none';
            this._updateStudentAccountState('');
        };
        a._showNameInput = () => {
            this._invalidateStudentLogin();
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
            const confirmLabel = document.getElementById('studentConfirmPwLabel');
            if (confirmLabel) confirmLabel.style.display = 'none';
            const btn = document.getElementById('voterLoginBtn');
            if (btn) { btn.textContent = 'Check name'; btn.disabled = false; btn.removeAttribute('aria-busy'); }
            this._updateStudentAccountState('');
            const inp = document.getElementById('voterNameInput');
            if (inp) { inp.value = ''; inp.focus(); }
        };
        a._showTeacherPw = () => {
            this._invalidateStudentLogin();
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
            this._invalidateStudentLogin();
            const wasVoter = this.currentVoter;
            localStorage.removeItem('rubricLoggedInUser');
            localStorage.removeItem('rubricDeviceName');
            this.currentVoter = null;
            this.isTeacher = false;
            this.voterGroupIndex = null;
            if (wasVoter) {
                const v = this.voters.find(x => x.name.toLowerCase() === wasVoter.toLowerCase());
                if (v) { v.loggedIn = false; this.voters = this.storage.replaceVoters(this.voters); }
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
            const roleContext = document.getElementById('roleContext');
            if (roleContext) roleContext.textContent = 'Choose a role to begin';
            this.showStatus('You have been logged out.', 'info');
        };
        a._studentLogin = async () => {
            const nameInput = document.getElementById('voterNameInput');
            const name = nameInput ? nameInput.value : '';
            const err = document.getElementById('loginError');
            const pwErr = document.getElementById('studentPwError');
            const pwInput = document.getElementById('studentPassword');
            const confirmInput = document.getElementById('studentConfirmPw');
            const pwArea = document.getElementById('studentPwArea');
            const btn = document.getElementById('voterLoginBtn');
            if (this._studentLoginState === 'claiming' || this._studentLoginState === 'verifying') return;
            const operation = ++this._studentLoginOperation;
            const setBusy = text => {
                if (btn) { btn.disabled = true; btn.textContent = text; btn.setAttribute('aria-busy', 'true'); }
            };
            const endBusy = text => {
                if (operation !== this._studentLoginOperation) return;
                if (btn) { btn.disabled = false; btn.textContent = text; btn.removeAttribute('aria-busy'); }
            };
            const showError = message => {
                if (pwErr) { pwErr.textContent = message; pwErr.style.display = 'block'; }
                this.showStatus(message, 'error');
            };
            const stale = () => operation !== this._studentLoginOperation;

            if (this._studentLoginState === 'name') {
                if (!name || !name.trim()) {
                    if (err) { err.textContent = 'Please enter your name.'; err.style.display = 'block'; }
                    return;
                }
                if (err) err.style.display = 'none';
                setBusy('Checking...');
                const prepared = await this.storage.remote.prepareStudentLogin(name);
                if (stale()) return;
                endBusy('Enter');
                if (!prepared || !prepared.ok) {
                    if (err) {
                        err.textContent = prepared && prepared.error === 'credential-service-unavailable'
                            ? 'Student password service is unavailable. Please try again later.'
                            : 'Registration failed. Your name is not listed as one unique official member. Please contact the administrator.';
                        err.style.display = 'block';
                    }
                    this._updateStudentAccountState('');
                    return;
                }
                this._studentLoginName = prepared.membership.name;
                this._pendingStudentMembership = {
                    membership: prepared.membership,
                    rosterRevision: prepared.rosterRevision,
                    stateVersion: this._stateVersion
                };
                if (pwArea) pwArea.style.display = 'flex';
                this._studentLoginState = prepared.status === 'claimed' ? 'existing-password' : 'create-password';
                if (this._studentLoginState === 'existing-password') {
                    if (confirmInput) confirmInput.style.display = 'none';
                    const confirmLabel = document.getElementById('studentConfirmPwLabel');
                    if (confirmLabel) confirmLabel.style.display = 'none';
                    if (pwInput) { pwInput.value = ''; pwInput.placeholder = 'Enter your password'; pwInput.focus(); }
                    if (pwInput) pwInput.autocomplete = 'current-password';
                    if (btn) btn.textContent = 'Log in';
                    this._updateStudentAccountState(`Roster name recognized: ${prepared.membership.name}. Enter your existing password, or change the name above.`);
                } else {
                    if (confirmInput) { confirmInput.style.display = 'block'; confirmInput.value = ''; }
                    const confirmLabel = document.getElementById('studentConfirmPwLabel');
                    if (confirmLabel) confirmLabel.style.display = 'block';
                    if (pwInput) { pwInput.value = ''; pwInput.placeholder = 'Create a password'; pwInput.focus(); }
                    if (pwInput) pwInput.autocomplete = 'new-password';
                    if (btn) btn.textContent = 'Create password';
                    this._updateStudentAccountState(`Roster name recognized: ${prepared.membership.name}. Create a password for this account, or change the name above.`);
                }
                return;
            }

            const password = pwInput ? pwInput.value : '';
            if (!password) {
                showError('Please enter a password.');
                return;
            }
            if (this._studentLoginState === 'create-password') {
                const confirm = confirmInput ? confirmInput.value : '';
                if (password !== confirm) {
                    showError('Passwords do not match. Please try again.');
                    return;
                }
                this._studentLoginState = 'claiming';
                setBusy('Creating...');
                const claimed = await this.storage.remote.claimStudentAccount(this._studentLoginName, password);
                this._clearStudentPasswordFields();
                if (stale()) return;
                if (!claimed || !claimed.ok) {
                    this._studentLoginState = 'create-password';
                    endBusy('Create password');
                    showError('Could not create your password. Please try again.');
                    return;
                }
                if (claimed.status === 'already-claimed') {
                    this._studentLoginState = 'existing-password';
                    if (confirmInput) confirmInput.style.display = 'none';
                    const confirmLabel = document.getElementById('studentConfirmPwLabel');
                    if (confirmLabel) confirmLabel.style.display = 'none';
                    if (pwInput) { pwInput.placeholder = 'Enter your password'; pwInput.focus(); }
                    endBusy('Log in');
                    showError('An account already exists. Enter its password.');
                    return;
                }
                if (pwErr) pwErr.style.display = 'none';
                endBusy('Log in');
                return this._finishStudentLogin(claimed.membership, operation, {
                    rosterRevision: claimed.rosterRevision,
                    stateVersion: this._stateVersion
                });
            }

            if (this._studentLoginState !== 'existing-password') return;
            this._studentLoginState = 'verifying';
            setBusy('Verifying...');
            const authenticated = await this.storage.remote.authenticateStudent(this._studentLoginName, password);
            this._clearStudentPasswordFields();
            if (stale()) return;
            if (!authenticated || !authenticated.ok) {
                this._studentLoginState = 'existing-password';
                endBusy('Log in');
                showError(authenticated && authenticated.error === 'wrong-password' ? 'Incorrect password. Please try again.' : 'Could not verify your password. Please try again.');
                return;
            }
            if (pwErr) pwErr.style.display = 'none';
            endBusy('Log In');
            return this._finishStudentLogin(authenticated.membership, operation, {
                rosterRevision: authenticated.rosterRevision,
                stateVersion: this._stateVersion
            });
        };
        a._teacherLogin = () => {
            this._invalidateStudentLogin();
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
            this.showStatus('Teacher workspace opened.', 'success');
        };
    }

    async init() {
        try {
            await this.storage.init();
        } catch (e) { console.warn('storage init failed', e); }
        try { this._loadData(); } catch (e) { console.warn('loadData failed', e); }
        this._removeLegacyStudentAccounts();
        try { await this._ensureInitialGroups(); } catch (e) { console.warn('initial group seed failed', e); }
        try { this.voters = this.storage.loadVoters(); } catch (e) { console.warn('loadVoters failed', e); }
        try { this.setupPanel.loadRubricIntoUI(); } catch (e) { console.warn('loadRubricIntoUI failed', e); }
        try { this.groupPanel.buildList(); } catch (e) { console.warn('buildList failed', e); }
        this._setupLogin();
        try { this._setupTabListeners(); } catch (e) { console.warn('tab listeners failed', e); }
        try { this._setupGlobalListeners(); } catch (e) { console.warn('global listeners failed', e); }
        this._startEvaluationSync();

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
            if (el('studentPassword')) el('studentPassword').addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); window.app._studentLogin(); } });
            if (el('studentConfirmPw')) el('studentConfirmPw').addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); window.app._studentLogin(); } });
            if (el('teacherLoginBtn')) el('teacherLoginBtn').addEventListener('click', () => window.app._teacherLogin());
            if (el('teacherPasswordInput')) el('teacherPasswordInput').addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); window.app._teacherLogin(); } });
        } catch (e) { console.warn('Login wiring error', e); }
    }

    _clearStudentPasswordFields() {
        const password = document.getElementById('studentPassword');
        const confirm = document.getElementById('studentConfirmPw');
        if (password) password.value = '';
        if (confirm) confirm.value = '';
    }

    _updateStudentAccountState(message) {
        const state = document.getElementById('studentAccountState');
        if (!state) return;
        state.textContent = message;
        if (state.classList) state.classList.toggle('is-visible', !!message);
    }

    _invalidateStudentLogin() {
        this._studentLoginOperation = (this._studentLoginOperation || 0) + 1;
        this._studentLoginName = null;
        this._pendingStudentMembership = null;
        this._studentLoginState = 'name';
        this._clearStudentPasswordFields();
        if (typeof this._updateStudentAccountState === 'function') this._updateStudentAccountState('');
    }

    _isCurrentStudentLogin(operation, membership, context = {}) {
        if (operation !== this._studentLoginOperation || !membership || !membership.name
            || !Number.isSafeInteger(membership.groupIndex)) return false;
        const current = this._resolveStudentMembership(membership.name);
        if (!current || current.name !== membership.name || current.groupIndex !== membership.groupIndex) return false;
        if (Number.isSafeInteger(context.rosterRevision) && this.rosterRevision !== context.rosterRevision) return false;
        if (Number.isSafeInteger(context.stateVersion) && this._stateVersion !== context.stateVersion) return false;
        return true;
    }

    async _finishStudentLogin(membership, operation, context = {}) {
        if (!this._isCurrentStudentLogin(operation, membership, context)) return false;
        this._studentLoginName = null;
        this._pendingStudentMembership = null;
        this._clearStudentPasswordFields();
        try {
            const remoteEvals = await this.storage.remote.loadEvaluationsResult();
            if (!this._isCurrentStudentLogin(operation, membership, context)) return false;
            if (remoteEvals.available) {
                localStorage.setItem('pbEvals', JSON.stringify(remoteEvals.data));
                this.evaluations.fromJSON(remoteEvals.data);
            }
        } catch (e) {}
        if (!this._isCurrentStudentLogin(operation, membership, context)) return false;
        try {
            const prepared = await this.storage.remote.prepareStudentLogin(membership.name);
            if (!this._isCurrentStudentLogin(operation, membership, context)
                || !prepared || !prepared.ok || prepared.status !== 'claimed'
                || prepared.rosterRevision !== context.rosterRevision
                || prepared.membership.name !== membership.name
                || prepared.membership.groupIndex !== membership.groupIndex) return false;
        } catch (e) {
            return false;
        }
        if (!this._isCurrentStudentLogin(operation, membership, context)) return false;
        this._studentLoginState = 'name';
        this.currentVoter = membership.name;
        this.isTeacher = false;
        this.voterGroupIndex = membership.groupIndex;
        const existing = this.voters.find(v => FirebaseService._normalizedRosterKey(v.name) === FirebaseService._normalizedRosterKey(membership.name));
        if (!existing) this.voters.push({ name: membership.name, loggedIn: true });
        else existing.loggedIn = true;
        // Login presence is deliberately local/session-only. It must not race
        // roster mutations or reintroduce cleaned voter metadata remotely.
        this.voters = this.storage.replaceVoters(this.voters);
        const overlay = document.getElementById('loginOverlay');
        if (overlay) overlay.style.display = 'none';
        const logout = document.getElementById('logoutBtn');
        if (logout) logout.style.display = '';
        this._applyRoleVisibility();
        this.showStatus(`Signed in as ${membership.name}.`, 'success');
        this.evaluationPanel.buildGrid();
        return true;
    }

    _removeLegacyStudentAccounts() {
        // Previous releases stored plaintext passwords locally. Automatic
        // conversion would require holding those secrets during remote writes,
        // so this migration removes them and requires a one-time new password.
        try {
            localStorage.getItem('studentAccounts');
        } catch (e) {
            // Removal still runs in finally when storage reads are blocked.
        } finally {
            try { localStorage.removeItem('studentAccounts'); } catch (e) {}
        }
    }

    async _freshSync() {
        try {
            const [evals, voters, groups] = await Promise.all([
                this.storage.remote.loadEvaluationsResult(),
                this.storage.remote.loadVotersResult(),
                this.storage.remote.loadGroupsResult()
            ]);
            if (evals.available && voters.available && groups.available) {
                this._applyFullState({ available: true, data: { groups: groups.data, evaluations: evals.data, voters: voters.data } });
            }
        } catch (e) {}
    }

    async _refreshStudentEvals() {
        try {
            const remoteEvals = await this.storage.remote.loadEvaluationsResult();
            App.prototype._applyRemoteEvaluations.call(this, remoteEvals);
        } catch (e) {}
        this.evaluationPanel.buildGrid();
    }

    _syncVoterRosterFromEvaluations({ persistRemote = false } = {}) {
        const source = Array.isArray(this.voters)
            ? this.voters
            : (this.storage && typeof this.storage.loadVoters === 'function' ? this.storage.loadVoters() : []);
        if (!this.storage || typeof this.storage.replaceVoters !== 'function') {
            this.voters = source;
            return this.voters;
        }
        // Completion remains in EvaluationCollection. Replacing the roster strips
        // legacy hasVoted/rated* fields from app state, cache, and local storage.
        this.voters = this.storage.replaceVoters(source);
        // Voter presence is local/session metadata. Never write it back from a
        // possibly stale client, because roster transactions own remote voters.
        return this.voters;
    }

    _applyRemoteEvaluations(remoteEvals, { rebuildStudent = false, renderResults = false } = {}) {
        if (!remoteEvals || !remoteEvals.available) return false;
        localStorage.setItem('pbEvals', JSON.stringify(remoteEvals.data));
        this.evaluations.fromJSON(remoteEvals.data);
        App.prototype._syncVoterRosterFromEvaluations.call(this);
        if (renderResults && this.resultsPanel) {
            const freshEvals = new EvaluationCollection(this.groups).fromJSON(remoteEvals.data);
            this.resultsPanel.showPasswordPrompt(freshEvals);
        }
        if (rebuildStudent && !this.isTeacher && this.currentVoter && this.evaluationPanel) {
            this.evaluationPanel.buildGrid();
        }
        return true;
    }

    _applyFullState(remoteState, { source = 'sync' } = {}) {
        if (!remoteState || !remoteState.available || !remoteState.data) return false;
        const state = remoteState.data;
        if (!Array.isArray(state.groups) || !Array.isArray(state.voters)
            || !state.evaluations || typeof state.evaluations !== 'object' || Array.isArray(state.evaluations)) return false;

        if (this.storage && typeof this.storage.applyRemoteState === 'function') {
            if (!this.storage.applyRemoteState(state)) return false;
            this.voters = this.storage.loadVoters();
        } else {
            localStorage.setItem('pbGroups', JSON.stringify(state.groups));
            localStorage.setItem('pbEvals', JSON.stringify(state.evaluations));
            this.voters = Array.isArray(state.voters) ? state.voters.map(voter => ({ ...voter })) : [];
        }
        this.groups.fromJSON(state.groups);
        this.evaluations.fromJSON(state.evaluations);
        this.rosterRevision = Number.isSafeInteger(state.rosterRevision) && state.rosterRevision >= 0 ? state.rosterRevision : 0;
        this._stateVersion = (this._stateVersion || 0) + 1;

        if (this.groupPanel && typeof this.groupPanel.resetState === 'function') this.groupPanel.resetState();
        if (this.evaluationPanel && typeof this.evaluationPanel.resetState === 'function') this.evaluationPanel.resetState();
        if (this.groupNavigator && typeof this.groupNavigator.resetState === 'function') this.groupNavigator.resetState();

        if (!this.isTeacher && this.currentVoter) {
            const membership = this._resolveStudentMembership(this.currentVoter);
            if (!membership) this._endInvalidStudentSession();
            else {
                this.currentVoter = membership.name;
                this.voterGroupIndex = membership.groupIndex;
            }
        }

        if (this.groupPanel && typeof this.groupPanel.buildList === 'function') this.groupPanel.buildList();
        if (this.evaluationPanel && typeof this.evaluationPanel.buildGrid === 'function') this.evaluationPanel.buildGrid();
        if (this.dashboardPanel && typeof this.dashboardPanel.render === 'function') this.dashboardPanel.render();
        if (typeof this._renderVoters === 'function') this._renderVoters();
        if (this.resultsPanel && typeof this.resultsPanel.showPasswordPrompt === 'function') this.resultsPanel.showPasswordPrompt();
        return true;
    }

    _endInvalidStudentSession() {
        this._studentLoginName = null;
        this.currentVoter = null;
        this.voterGroupIndex = null;
        this.isTeacher = false;
        localStorage.removeItem('rubricLoggedInUser');
        localStorage.removeItem('rubricDeviceName');
        const logout = document.getElementById('logoutBtn');
        if (logout) logout.style.display = 'none';
        const overlay = document.getElementById('loginOverlay');
        if (overlay) overlay.style.display = 'flex';
        if (typeof this._showRolePicker === 'function') this._showRolePicker();
    }

    async _startEvaluationSync() {
        if (this._evaluationUnsubscribe || !this.storage || !this.storage.remote
            || (typeof this.storage.remote.subscribeState !== 'function'
                && typeof this.storage.remote.subscribeEvaluations !== 'function')) return;
        try {
            const subscribe = this.storage.remote.subscribeState || this.storage.remote.subscribeEvaluations;
            const unsubscribe = await subscribe.call(this.storage.remote, remoteState => {
                if (remoteState && remoteState.data && Array.isArray(remoteState.data.groups)
                    && Array.isArray(remoteState.data.voters)) {
                    App.prototype._applyFullState.call(this, remoteState, { source: 'listener' });
                } else if (remoteState && remoteState.state) {
                    App.prototype._applyFullState.call(this, { available: remoteState.available, data: remoteState.state }, { source: 'listener' });
                } else {
                    App.prototype._applyRemoteEvaluations.call(this, remoteState, { rebuildStudent: true });
                }
            });
            if (typeof unsubscribe === 'function') this._evaluationUnsubscribe = unsubscribe;
        } catch (e) {}
    }

    _applyRoleVisibility() {
        this.tabManager.tabs.forEach(tab => {
            const tabId = tab.dataset.tab;
            if (this.isTeacher) {
                tab.style.display = '';
                tab.hidden = false;
            } else {
                if (tabId === 'evaluate') {
                    tab.style.display = '';
                    tab.hidden = false;
                } else {
                    tab.style.display = 'none';
                    tab.hidden = true;
                }
            }
        });
        const roleContext = document.getElementById('roleContext');
        if (roleContext) roleContext.textContent = this.isTeacher
            ? 'Teacher workspace · roster, results, and reporting'
            : `Student workspace · evaluating as ${this.currentVoter || 'student'}`;
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

    async _ensureInitialGroups() {
        if (!this.storage || typeof this.storage.ensureInitialGroups !== 'function') return false;
        const result = await this.storage.ensureInitialGroups(this._defaultGroups());
        if (result && result.ok && result.state) {
            this._applyFullState({ available: true, data: result.state }, { source: 'seed' });
        }
        return !!(result && result.ok);
    }

    _defaultGroups() {
        return [
            { name: 'Group 1', members: 'Nathaniel Rodrigo\nJunna Dag-uman\nMerry Jay Tumulak' },
            { name: 'Group 2', members: 'Krizia Nicole Rubio\nAlthea Tanguamos\nJohn Alrey Gementiza' },
            { name: 'Group 3', members: 'Aranas Vince\nPalangan Lucille Mae\nTariao Justine Jean' },
            { name: 'Group 4', members: 'Kevin Jay Morales\nNylvia Apao\nRosalden Rabago' },
            { name: 'Group 5', members: 'James Susas\nMark Antolijao\nEirich Dianne Molde' },
            { name: 'Group 6', members: 'Bal Gestly Labador\nElmie Soltes\nSteven Yoldan' },
            { name: 'Group 7', members: 'Andrew Sambulan\nAllan Baguio\nArchie Jutag' },
            { name: 'Group 8', members: 'Angel Lou Geografo\nJuliemar Bartolo\nGabriel Salaveria' },
            { name: 'Group 9', members: 'April Gulbin' }
        ];
    }

    _isNameInMemberList(name) {
        return !!this._resolveStudentMembership(name);
    }

    _resolveStudentMembership(name) {
        if (typeof FirebaseService !== 'undefined') return FirebaseService.resolveUniqueRosterMember(this.groups.getAll(), name);
        if (!EvaluationKey.isIdentity(name)) return null;
        let key;
        try { key = name.normalize('NFKC').trim().replace(/\s+/gu, ' ').toLocaleLowerCase('en-US'); } catch (e) { return null; }
        const matches = [];
        for (let index = 0; index < this.groups.size(); index++) {
            this.groups.getMemberList(index).forEach(member => {
                try {
                    if (member.normalize('NFKC').trim().replace(/\s+/gu, ' ').toLocaleLowerCase('en-US') === key) {
                        matches.push({ name: member, groupIndex: index });
                    }
                } catch (e) {}
            });
        }
        return matches.length === 1 ? matches[0] : null;
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
            if (!this.isTeacher && this.currentVoter) {
                this._refreshStudentEvals();
            } else {
                this.evaluationPanel.buildGrid();
            }
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
            container.innerHTML = '<div class="empty-state"><p>No votes recorded yet. Evaluation activity will appear here as students submit votes.</p></div>';
            return;
        }
        const totalGroups = this.groups.size();
        let html = '<div class="table-scroll" role="region" aria-label="Voter status table" tabindex="0"><table class="results-table"><thead><tr><th scope="col">#</th><th scope="col">Name</th><th scope="col">Groups rated</th><th scope="col">Members rated</th><th scope="col">Status</th></tr></thead><tbody>';
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
        html += '</tbody></table></div>';
        container.innerHTML = html;
    }

    async _refreshResults() {
        const refreshVersion = this._resultsVersion || 0;
        try {
            const remoteEvals = await this.storage.remote.loadEvaluationsResult();
            if (refreshVersion !== (this._resultsVersion || 0)) return;
            if (App.prototype._applyRemoteEvaluations.call(this, remoteEvals, { renderResults: true })) {
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

    _markResultsMutation() {
        this._resultsVersion = (this._resultsVersion || 0) + 1;
    }

    _setupGlobalListeners() {
        document.getElementById('addCriteriaBtn').addEventListener('click', () => this.setupPanel.addCriteria());
        document.getElementById('saveRubricBtn').addEventListener('click', () => this.setupPanel.saveRubric());

        document.getElementById('clearAllBtn').addEventListener('click', () => {
            Promise.resolve().then(() => this.resultsPanel.clearAll()).catch(() => {
                if (typeof this.showStatus !== 'function' || !this.showStatus('Could not clear results. Please try again.', 'error')) alert('Could not clear results. Please try again.');
            });
        });
        document.getElementById('exportAllBtn').addEventListener('click', () => this.resultsPanel.exportCSV());

        document.addEventListener('visibilitychange', () => {
            if (!document.hidden) {
                if (!this.isTeacher && this.currentVoter) this._refreshStudentEvals();
                else this._refreshResults();
            }
        });
    }
}

document.addEventListener('DOMContentLoaded', async () => {
    const app = new App();
    await app.init();
});
