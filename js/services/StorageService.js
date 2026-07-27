class StorageService {
    constructor() {
        this.remote = new FirebaseService();
        this._votersCache = null;
        this._lastState = null;
    }

    async init() {
        const remoteReady = await this.remote.init();
        if (remoteReady && typeof this.remote.loadStateResult === 'function') {
            try {
                const state = await this.remote.loadStateResult();
                if (state.available) {
                    this.applyRemoteState(state.data);
                    return state;
                }
            } catch (e) {}
        }
        try {
            const rubric = await this.remote.loadRubricResult();
            if (rubric.available && rubric.data) localStorage.setItem('pbRubric', JSON.stringify(rubric.data));
        } catch (e) {}
        try {
            const groups = await this.remote.loadGroupsResult();
            if (groups.available && groups.data.length > 0) localStorage.setItem('pbGroups', JSON.stringify(groups.data));
        } catch (e) {}
        try {
            const remoteEvals = await this.remote.loadEvaluationsResult();
            if (remoteEvals.available) {
                localStorage.setItem('pbEvals', JSON.stringify(remoteEvals.data));
            }
        } catch (e) {}
        try {
            const voters = await this.remote.loadVotersResult();
            if (voters.available) this.replaceVoters(voters.data);
        } catch (e) {}
        return { available: remoteReady };
    }

    _ls(key) { return localStorage.getItem(key); }
    _lss(key, val) { localStorage.setItem(key, val); }

    saveRubric(config) {
        this._lss('pbRubric', JSON.stringify(config));
        this.remote.saveRubric(config);
    }

    loadRubric() {
        const d = this._ls('pbRubric');
        return d ? JSON.parse(d) : null;
    }

    loadGroups() {
        const d = this._ls('pbGroups');
        return d ? JSON.parse(d) : null;
    }

    async saveEvaluations(evaluations) {
        return this._persistEvaluations(() => this.remote.saveEvaluations(evaluations), evaluations);
    }

    async deleteGroupEvaluations(groupIndex, evaluations) {
        return this._persistEvaluations(() => this.remote.deleteEvaluation(groupIndex), evaluations);
    }

    async deleteMemberEvaluations(groupIndex, memberName, evaluations) {
        return this._persistEvaluations(() => this.remote.deleteMemberEvaluation(groupIndex, memberName), evaluations);
    }

    async deleteGroupEvaluationsResult(groupIndex, voter, expectedGroup, expectedRevision) {
        return this._guardedEvaluationDelete('deleteEvaluationResult', [groupIndex, voter, expectedGroup, expectedRevision],
            entry => entry.type === 'group' && (!voter || FirebaseService._normalizedRosterKey(entry.voter) === FirebaseService._normalizedRosterKey(voter)),
            groupIndex, expectedGroup, expectedRevision);
    }

    async deleteMemberEvaluationsResult(groupIndex, memberName, voter, expectedGroup, expectedRevision) {
        return this._guardedEvaluationDelete('deleteMemberEvaluationResult', [groupIndex, memberName, voter, expectedGroup, expectedRevision],
            entry => entry.type === 'member' && (!memberName || entry.memberName === memberName)
                && (!voter || FirebaseService._normalizedRosterKey(entry.voter) === FirebaseService._normalizedRosterKey(voter)),
            groupIndex, expectedGroup, expectedRevision);
    }

    async _guardedEvaluationDelete(method, remoteArgs, predicate, groupIndex, expectedGroup, expectedRevision) {
        const firebaseDisabled = this.remote && this.remote.runtimeConfig && this.remote.runtimeConfig.enabled === false;
        let result;
        if (firebaseDisabled) {
            result = FirebaseService.deleteEvaluationsState(this._localRosterState(), groupIndex, expectedGroup, expectedRevision, predicate, true);
        } else {
            let ready = false;
            try { ready = await this.remote.init(); } catch (e) {}
            if (!ready || typeof this.remote[method] !== 'function') return { ok: false, success: false, error: 'remote-unavailable' };
            try { result = await this.remote[method](...remoteArgs); } catch (e) { return { ok: false, success: false, error: 'remote-failed' }; }
        }
        if (result && result.state) this.applyRemoteState(result.state);
        return result && result.ok === true
            ? result
            : (result || { ok: false, success: false, error: 'invalid-remote-result' });
    }

    async clearAllEvaluations() {
        return this._persistEvaluations(() => this.remote.clearAllEvaluations(), {});
    }

    async _persistEvaluations(remoteMutation, evaluations) {
        let remoteAvailable;
        try {
            remoteAvailable = await this.remote.init();
        } catch (e) {
            remoteAvailable = false;
        }
        if (!remoteAvailable) {
            // A configured Firebase classroom must not report a destructive
            // clear as complete until Firestore has acknowledged it. Local-only
            // fallback is reserved for explicitly disabled Firebase storage.
            if (this.remote && this.remote.runtimeConfig && this.remote.runtimeConfig.enabled === true) return false;
            this._lss('pbEvals', JSON.stringify(evaluations));
            return true;
        }
        try {
            if (await remoteMutation() !== true) return false;
            this._lss('pbEvals', JSON.stringify(evaluations));
            return true;
        } catch (e) {
            return false;
        }
    }

    loadEvaluations() {
        const d = this._ls('pbEvals');
        return d ? JSON.parse(d) : null;
    }

    saveVoters(voters) {
        return this.replaceVoters(voters);
    }

    loadVoters() {
        if (this._votersCache) return this._votersCache;
        const d = this._ls('pbVoters');
        let voters = [];
        try { voters = d ? JSON.parse(d) : []; } catch (e) {}
        this._votersCache = StorageService._rosterVoters(voters);
        return this._votersCache;
    }

    replaceVoters(voters) {
        const roster = StorageService._rosterVoters(voters);
        this._lss('pbVoters', JSON.stringify(roster));
        this._votersCache = roster;
        return roster;
    }

    applyRemoteState(state) {
        if (!state || !Array.isArray(state.groups)
            || !state.evaluations || typeof state.evaluations !== 'object' || Array.isArray(state.evaluations)
            || !Array.isArray(state.voters)) return false;
        const normalized = {
            schemaVersion: state.schemaVersion === FirebaseService.ROSTER_SCHEMA_VERSION ? FirebaseService.ROSTER_SCHEMA_VERSION : 0,
            rosterInitialized: state.rosterInitialized === true,
            rosterRevision: Number.isSafeInteger(state.rosterRevision) && state.rosterRevision >= 0 ? state.rosterRevision : 0,
            groups: state.groups.map(group => ({ name: group.name, members: group.members })),
            evaluations: { ...state.evaluations },
            voters: this.replaceVoters(state.voters)
        };
        this._lss('pbGroups', JSON.stringify(normalized.groups));
        this._lss('pbEvals', JSON.stringify(normalized.evaluations));
        this._lss('pbRosterMeta', JSON.stringify({
            schemaVersion: normalized.schemaVersion,
            rosterInitialized: normalized.rosterInitialized,
            rosterRevision: normalized.rosterRevision
        }));
        this._lastState = normalized;
        return normalized;
    }

    getRosterRevision() {
        if (this._lastState && Number.isSafeInteger(this._lastState.rosterRevision)) return this._lastState.rosterRevision;
        try {
            const meta = JSON.parse(this._ls('pbRosterMeta') || '{}');
            return Number.isSafeInteger(meta.rosterRevision) && meta.rosterRevision >= 0 ? meta.rosterRevision : 0;
        } catch (e) {
            return 0;
        }
    }

    _localRosterState() {
        let meta = {};
        try { meta = JSON.parse(this._ls('pbRosterMeta') || '{}'); } catch (e) {}
        return {
            schemaVersion: FirebaseService.ROSTER_SCHEMA_VERSION,
            rosterInitialized: meta.rosterInitialized === true || this.loadGroups() !== null,
            rosterRevision: this.getRosterRevision(),
            groups: this.loadGroups(),
            evaluations: this.loadEvaluations() || {},
            voters: this.loadVoters()
        };
    }

    async deleteGroup(groupIndex, expectedGroup = null, expectedRevision = this.getRosterRevision()) {
        const firebaseDisabled = this.remote && this.remote.runtimeConfig && this.remote.runtimeConfig.enabled === false;
        if (firebaseDisabled) {
            const localResult = FirebaseService.deleteGroupState(this._localRosterState(), groupIndex, true, expectedGroup, expectedRevision, true);
            if (!localResult.ok || !this.applyRemoteState(localResult.state)) {
                return localResult.ok ? { ok: false, success: false, error: 'invalid-local-state' } : localResult;
            }
            return localResult;
        }

        let ready = false;
        try { ready = await this.remote.init(); } catch (e) {}
        if (!ready || typeof this.remote.deleteGroup !== 'function') {
            return { ok: false, success: false, error: 'remote-unavailable' };
        }
        let result;
        try { result = await this.remote.deleteGroup(groupIndex, expectedGroup, expectedRevision); } catch (e) {
            return { ok: false, success: false, error: 'remote-failed' };
        }
        if (result && result.error === 'stale-roster-revision' && result.state) this.applyRemoteState(result.state);
        if (!result || result.ok !== true || !this.applyRemoteState(result.state)) {
            return result && result.ok === false ? result : { ok: false, success: false, error: 'invalid-remote-result' };
        }
        return result;
    }

    async addGroup(group, expectedRevision = this.getRosterRevision()) {
        return this._mutateRoster('addGroup', [group, expectedRevision], expectedRevision, groups => [...groups, group]);
    }

    async updateGroup(groupIndex, group, expectedGroup = null, expectedRevision = this.getRosterRevision()) {
        return this._mutateRoster('updateGroup', [groupIndex, group, expectedGroup, expectedRevision], expectedRevision, groups => {
            if (!groups[groupIndex] || !FirebaseService._matchesExpectedGroup(groups, groupIndex, expectedGroup)) return null;
            const next = groups.map(item => ({ ...item }));
            next[groupIndex] = group;
            return next;
        });
    }

    async _mutateRoster(method, remoteArgs, expectedRevision, localTransform) {
        const firebaseDisabled = this.remote && this.remote.runtimeConfig && this.remote.runtimeConfig.enabled === false;
        let result;
        if (firebaseDisabled) {
            result = FirebaseService.mutateRosterState(this._localRosterState(), expectedRevision, localTransform, true);
        } else {
            let ready = false;
            try { ready = await this.remote.init(); } catch (e) {}
            if (!ready || typeof this.remote[method] !== 'function') return { ok: false, success: false, error: 'remote-unavailable' };
            try { result = await this.remote[method](...remoteArgs); } catch (e) { return { ok: false, success: false, error: 'remote-failed' }; }
        }
        if (result && result.error === 'stale-roster-revision' && result.state) this.applyRemoteState(result.state);
        if (!result || result.ok !== true || !this.applyRemoteState(result.state)) {
            return result && result.ok === false ? result : { ok: false, success: false, error: 'invalid-remote-result' };
        }
        return result;
    }

    async ensureInitialGroups(groups) {
        const firebaseDisabled = this.remote && this.remote.runtimeConfig && this.remote.runtimeConfig.enabled === false;
        if (firebaseDisabled) {
            const existing = this._localRosterState();
            if (existing.rosterInitialized && this.loadGroups() === null) {
                return { ok: false, success: false, error: 'invalid-initialized-roster' };
            }
            if (this.loadGroups() !== null) {
                const state = existing;
                if (!this.applyRemoteState(state)) return { ok: false, success: false, error: 'invalid-local-state' };
                return { ok: true, success: true, seeded: false, state };
            }
            const state = {
                schemaVersion: FirebaseService.ROSTER_SCHEMA_VERSION,
                rosterInitialized: true,
                rosterRevision: 0,
                groups,
                evaluations: this.loadEvaluations() || {},
                voters: this.loadVoters()
            };
            if (!this.applyRemoteState(state)) return { ok: false, success: false, error: 'invalid-local-state' };
            return { ok: true, success: true, seeded: true, state };
        }
        let ready = false;
        try { ready = await this.remote.init(); } catch (e) {}
        if (!ready || typeof this.remote.seedGroupsIfUninitialized !== 'function') {
            return { ok: false, success: false, error: 'remote-unavailable' };
        }
        let result;
        try { result = await this.remote.seedGroupsIfUninitialized(groups); } catch (e) {
            return { ok: false, success: false, error: 'remote-failed' };
        }
        if (!result || result.ok !== true || !this.applyRemoteState(result.state)) {
            return result && result.ok === false ? result : { ok: false, success: false, error: 'invalid-remote-result' };
        }
        return result;
    }

    static _rosterVoters(voters) {
        if (!Array.isArray(voters)) return [];
        const roster = [];
        const names = new Set();
        voters.forEach(voter => {
            if (!voter || !EvaluationKey.isIdentity(voter.name)) return;
            const identity = typeof FirebaseService !== 'undefined'
                ? FirebaseService._normalizedRosterKey(voter.name)
                : voter.name.toLowerCase();
            if (!identity) return;
            if (names.has(identity)) return;
            names.add(identity);
            const rosterVoter = { name: voter.name };
            if (voter.loggedIn === true) rosterVoter.loggedIn = true;
            roster.push(rosterVoter);
        });
        return roster;
    }

    async clearAll() {
        if (!await this.clearAllEvaluations()) return false;
        localStorage.removeItem('pbRubric');
        localStorage.removeItem('pbGroups');
        localStorage.removeItem('pbVoters');
        this._votersCache = [];
        return true;
    }
}
