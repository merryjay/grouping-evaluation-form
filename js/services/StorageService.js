class StorageService {
    constructor() {
        this.remote = new FirebaseService();
        this._votersCache = null;
    }

    async init() {
        await this.remote.init();
        try {
            const localRubric = this._ls('pbRubric');
            if (!localRubric || localRubric === 'null') {
                const rubric = await this.remote.loadRubricResult();
                if (rubric.available && rubric.data) localStorage.setItem('pbRubric', JSON.stringify(rubric.data));
            }
        } catch (e) {}
        try {
            const localGroups = this._ls('pbGroups');
            if (!localGroups || localGroups === 'null' || localGroups === '[]') {
                const groups = await this.remote.loadGroupsResult();
                if (groups.available && groups.data.length > 0) localStorage.setItem('pbGroups', JSON.stringify(groups.data));
            }
        } catch (e) {}
        try {
            const localEvals = this._ls('pbEvals');
            if (!localEvals || localEvals === 'null' || localEvals === '{}') {
                const remoteEvals = await this.remote.loadEvaluationsResult();
                if (remoteEvals.available) {
                    localStorage.setItem('pbEvals', JSON.stringify(remoteEvals.data));
                }
            }
        } catch (e) {}
        try {
            const localVoters = this._ls('pbVoters');
            if (!localVoters || localVoters === 'null' || localVoters === '[]') {
                const voters = await this.remote.loadVotersResult();
                if (voters.available) this.replaceVoters(voters.data);
            }
        } catch (e) {}
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

    saveGroups(groups) {
        this._lss('pbGroups', JSON.stringify(groups));
        this.remote.saveGroups(groups);
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

    async clearAllEvaluations() {
        return this._persistEvaluations(() => this.remote.clearAllEvaluations(), {});
    }

    async deleteVoterEvaluations(voterName) {
        const evals = this.loadEvaluations() || {};
        const updated = Object.create(null);
        for (const key of Object.keys(evals)) {
            const info = EvaluationKey.parse(key);
            if (info && info.voter && info.voter.toLowerCase() === voterName.toLowerCase()) continue;
            updated[key] = evals[key];
        }
        return this._persistEvaluations(() => this.remote.deleteVoterEvaluations(voterName), updated);
    }

    async _persistEvaluations(remoteMutation, evaluations) {
        this._lss('pbEvals', JSON.stringify(evaluations));
        let remoteAvailable;
        try {
            remoteAvailable = await this.remote.init();
        } catch (e) {
            remoteAvailable = false;
        }
        if (!remoteAvailable) {
            return !(this.remote && this.remote.runtimeConfig && this.remote.runtimeConfig.enabled === true);
        }
        try {
            return await remoteMutation() === true;
        } catch (e) {
            return false;
        }
    }

    loadEvaluations() {
        const d = this._ls('pbEvals');
        return d ? JSON.parse(d) : null;
    }

    saveVoters(voters) {
        const roster = this.replaceVoters(voters);
        this.remote.saveVoters(roster);
        return roster;
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

    static _rosterVoters(voters) {
        if (!Array.isArray(voters)) return [];
        const roster = [];
        const names = new Set();
        voters.forEach(voter => {
            if (!voter || !EvaluationKey.isIdentity(voter.name)) return;
            const identity = voter.name.toLowerCase();
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