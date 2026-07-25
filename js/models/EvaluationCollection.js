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

    _key(groupIndex, voter) {
        return `${groupIndex}_${voter}`;
    }

    get(groupIndex, voter) {
        if (voter) return this.evaluations[this._key(groupIndex, voter)] || null;
        return null;
    }

    getAllByGroup(groupIndex) {
        const prefix = `${groupIndex}_`;
        const results = [];
        for (const key of Object.keys(this.evaluations)) {
            if (key.startsWith(prefix)) {
                results.push({ voter: key.slice(prefix.length), ...this.evaluations[key] });
            }
        }
        return results;
    }

    getVotersForGroup(groupIndex) {
        return this.getAllByGroup(groupIndex).map(e => e.voter);
    }

    save(groupIndex, scores, totalRaw, totalWeighted, grade, voter) {
        const key = this._key(groupIndex, voter);
        this.evaluations[key] = {
            scores: { ...scores },
            totalRaw,
            totalWeighted,
            grade,
            voter,
            date: new Date().toLocaleDateString()
        };
    }

    delete(groupIndex, voter) {
        if (voter) {
            delete this.evaluations[this._key(groupIndex, voter)];
        } else {
            const prefix = `${groupIndex}_`;
            for (const key of Object.keys(this.evaluations)) {
                if (key.startsWith(prefix)) delete this.evaluations[key];
            }
        }
    }

    clearAll() {
        this.evaluations = {};
    }

    getAllEntries() {
        return Object.entries(this.evaluations).map(([key, data]) => {
            const under = key.indexOf('_');
            return {
                groupIndex: parseInt(key.slice(0, under)),
                voter: key.slice(under + 1),
                ...data
            };
        });
    }

    getAggregatedByGroup() {
        const groups = {};
        for (const entry of this.getAllEntries()) {
            if (!groups[entry.groupIndex]) {
                groups[entry.groupIndex] = { scores: {}, voters: [], totalRaw: 0, totalWeighted: 0, count: 0 };
            }
            const g = groups[entry.groupIndex];
            g.voters.push(entry.voter);
            g.totalRaw += entry.totalRaw;
            g.totalWeighted += entry.totalWeighted;
            g.count++;
            for (const [crit, score] of Object.entries(entry.scores)) {
                g.scores[crit] = (g.scores[crit] || 0) + score;
            }
        }
        return Object.entries(groups).map(([idx, g]) => {
            const avgScores = {};
            for (const [crit, total] of Object.entries(g.scores)) {
                avgScores[crit] = parseFloat((total / g.count).toFixed(1));
            }
            const avgRaw = parseFloat((g.totalRaw / g.count).toFixed(1));
            const avgWeighted = parseFloat((g.totalWeighted / g.count).toFixed(1));
            return {
                groupIndex: parseInt(idx),
                voters: g.voters,
                scoreCount: g.count,
                scores: avgScores,
                totalRaw: avgRaw,
                totalWeighted: avgWeighted,
                date: new Date().toLocaleDateString()
            };
        });
    }

    size() {
        return Object.keys(this.evaluations).length;
    }
}
