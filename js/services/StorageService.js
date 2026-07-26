class StorageService {
    constructor() {
        this.remote = new FirebaseService();
        this._votersCache = null;
    }

    async init() {
        await this.remote.init();
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
            if (voters.available && voters.data.length > 0) localStorage.setItem('pbVoters', JSON.stringify(voters.data));
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
        this._lss('pbEvals', JSON.stringify(evaluations));
        await this.remote.saveEvaluations(evaluations);
    }

    loadEvaluations() {
        const d = this._ls('pbEvals');
        return d ? JSON.parse(d) : null;
    }

    saveVoters(voters) {
        this._lss('pbVoters', JSON.stringify(voters));
        this.remote.saveVoters(voters);
        this._votersCache = voters;
    }

    loadVoters() {
        if (this._votersCache) return this._votersCache;
        const d = this._ls('pbVoters');
        this._votersCache = d ? JSON.parse(d) : [];
        return this._votersCache;
    }

    clearAll() {
        localStorage.removeItem('pbRubric');
        localStorage.removeItem('pbGroups');
        localStorage.removeItem('pbEvals');
        localStorage.removeItem('pbVoters');
        this.remote.clearAllEvaluations();
    }
}
