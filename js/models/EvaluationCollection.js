class EvaluationCollection {
    constructor() {
        this.evaluations = {};
    }

    fromJSON(data) {
        this.evaluations = data || {};
        return this;
    }

    toJSON() {
        return { ...this.evaluations };
    }

    get(groupIndex) {
        return this.evaluations[groupIndex] || null;
    }

    save(groupIndex, scores, totalRaw, totalWeighted, grade) {
        this.evaluations[groupIndex] = {
            scores: { ...scores },
            totalRaw,
            totalWeighted,
            grade,
            date: new Date().toLocaleDateString()
        };
    }

    delete(groupIndex) {
        delete this.evaluations[groupIndex];
    }

    clearAll() {
        this.evaluations = {};
    }

    getAllEntries() {
        return Object.entries(this.evaluations).map(([idx, data]) => ({
            groupIndex: parseInt(idx),
            ...data
        }));
    }

    size() {
        return Object.keys(this.evaluations).length;
    }
}
