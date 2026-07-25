class StorageService {
    constructor() {
        this.pb = new PocketBaseService();
        this._votersCache = null;
    }

    async init() {
        const rubric = await this.pb.loadRubric();
        if (rubric) localStorage.setItem('pbRubric', JSON.stringify(rubric));
        const groups = await this.pb.loadGroups();
        if (groups.length > 0) localStorage.setItem('pbGroups', JSON.stringify(groups));

        await this.pb._cleanInvalidEvaluations();
        const pbEvals = await this.pb.loadEvaluations();
        const localEvals = this._ls('pbEvals');
        if (Object.keys(pbEvals).length > 0) {
            localStorage.setItem('pbEvals', JSON.stringify(pbEvals));
        } else if (localEvals) {
            const parsed = JSON.parse(localEvals);
            const hasValid = Object.keys(parsed).some(k => {
                const under = k.indexOf('_');
                const gi = parseInt(k.slice(0, under));
                return !isNaN(gi);
            });
            if (hasValid) this.pb._restoreEvaluations(parsed);
        }
        const voters = await this.pb.loadVoters();
        if (voters.length > 0) {
            localStorage.setItem('pbVoters', JSON.stringify(voters));
        } else if (this._ls('pbVoters')) {
            this.pb.saveVoters(JSON.parse(this._ls('pbVoters')));
        }
    }

    _ls(key) { return localStorage.getItem(key); }
    _lss(key, val) { localStorage.setItem(key, val); }

    saveRubric(config) {
        this._lss('pbRubric', JSON.stringify(config));
        this.pb.saveRubric(config);
    }

    loadRubric() {
        const d = this._ls('pbRubric');
        return d ? JSON.parse(d) : null;
    }

    saveGroups(groups) {
        this._lss('pbGroups', JSON.stringify(groups));
        this.pb.saveGroups(groups);
    }

    loadGroups() {
        const d = this._ls('pbGroups');
        return d ? JSON.parse(d) : null;
    }

    async saveEvaluations(evaluations) {
        this._lss('pbEvals', JSON.stringify(evaluations));
        for (const [key, data] of Object.entries(evaluations)) {
            const under = key.indexOf('_');
            if (under < 0) continue;
            const gi = parseInt(key.slice(0, under));
            if (isNaN(gi)) continue;
            await this.pb.saveEvaluation(gi, data.scores, data.totalRaw, data.totalWeighted, data.grade, key.slice(under + 1));
        }
    }

    loadEvaluations() {
        const d = this._ls('pbEvals');
        return d ? JSON.parse(d) : null;
    }

    saveVoters(voters) {
        this._lss('pbVoters', JSON.stringify(voters));
        this.pb.saveVoters(voters);
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
        this.pb.clearAllEvaluations();
    }
}
