class StorageService {
    constructor(prefix = '') {
        this.prefix = prefix;
        this.keys = {
            rubricConfig: `${prefix}rubricConfig`,
            rubricGroups: `${prefix}rubricGroups`,
            groupEvaluations: `${prefix}groupEvaluations`
        };
    }

    saveRubric(config) {
        localStorage.setItem(this.keys.rubricConfig, JSON.stringify(config));
    }

    loadRubric() {
        const data = localStorage.getItem(this.keys.rubricConfig);
        return data ? JSON.parse(data) : null;
    }

    saveGroups(groups) {
        localStorage.setItem(this.keys.rubricGroups, JSON.stringify(groups));
    }

    loadGroups() {
        const data = localStorage.getItem(this.keys.rubricGroups);
        return data ? JSON.parse(data) : null;
    }

    saveEvaluations(evaluations) {
        localStorage.setItem(this.keys.groupEvaluations, JSON.stringify(evaluations));
    }

    loadEvaluations() {
        const data = localStorage.getItem(this.keys.groupEvaluations);
        return data ? JSON.parse(data) : null;
    }

    clearAll() {
        localStorage.removeItem(this.keys.rubricConfig);
        localStorage.removeItem(this.keys.rubricGroups);
        localStorage.removeItem(this.keys.groupEvaluations);
    }
}
