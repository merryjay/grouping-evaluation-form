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

    _gKey(groupIndex, voter) {
        return `g:${groupIndex}:${voter}`;
    }

    _mKey(groupIndex, memberName, voter) {
        return `m:${groupIndex}:${memberName}:${voter}`;
    }

    _parseKey(key) {
        const parts = key.split(':');
        if (parts[0] === 'g') {
            return { type: 'group', groupIndex: parseInt(parts[1]), voter: parts.slice(2).join(':') };
        }
        if (parts[0] === 'm') {
            return { type: 'member', groupIndex: parseInt(parts[1]), memberName: parts.slice(2, -1).join(':'), voter: parts.slice(-1)[0] };
        }
        return null;
    }

    getGroupEval(groupIndex, voter) {
        return this.evaluations[this._gKey(groupIndex, voter)] || null;
    }

    getMemberEval(groupIndex, memberName, voter) {
        return this.evaluations[this._mKey(groupIndex, memberName, voter)] || null;
    }

    getAllByGroup(groupIndex) {
        const results = [];
        for (const key of Object.keys(this.evaluations)) {
            const info = this._parseKey(key);
            if (info && info.groupIndex === groupIndex && info.type === 'group') {
                results.push({ voter: info.voter, ...this.evaluations[key] });
            }
        }
        return results;
    }

    getAllByMember(groupIndex, memberName) {
        const results = [];
        for (const key of Object.keys(this.evaluations)) {
            const info = this._parseKey(key);
            if (info && info.type === 'member' && info.groupIndex === groupIndex && info.memberName === memberName) {
                results.push({ voter: info.voter, ...this.evaluations[key] });
            }
        }
        return results;
    }

    getVotersForGroup(groupIndex) {
        return this.getAllByGroup(groupIndex).map(e => e.voter);
    }

    saveGroup(groupIndex, scores, totalRaw, totalWeighted, grade, voter) {
        const key = this._gKey(groupIndex, voter);
        this.evaluations[key] = {
            scores: { ...scores },
            totalRaw,
            totalWeighted,
            grade,
            voter,
            date: new Date().toLocaleDateString()
        };
    }

    saveMember(groupIndex, memberName, scores, totalRaw, totalWeighted, grade, voter) {
        const key = this._mKey(groupIndex, memberName, voter);
        this.evaluations[key] = {
            scores: { ...scores },
            totalRaw,
            totalWeighted,
            grade,
            voter,
            memberName,
            date: new Date().toLocaleDateString()
        };
    }

    deleteGroup(groupIndex, voter) {
        if (voter) {
            delete this.evaluations[this._gKey(groupIndex, voter)];
        } else {
            for (const key of Object.keys(this.evaluations)) {
                const info = this._parseKey(key);
                if (info && info.type === 'group' && info.groupIndex === groupIndex) {
                    delete this.evaluations[key];
                }
            }
        }
    }

    deleteMember(groupIndex, memberName, voter) {
        if (voter && memberName) {
            delete this.evaluations[this._mKey(groupIndex, memberName, voter)];
        } else if (memberName) {
            for (const key of Object.keys(this.evaluations)) {
                const info = this._parseKey(key);
                if (info && info.type === 'member' && info.groupIndex === groupIndex && info.memberName === memberName) {
                    delete this.evaluations[key];
                }
            }
        } else {
            for (const key of Object.keys(this.evaluations)) {
                const info = this._parseKey(key);
                if (info && info.type === 'member' && info.groupIndex === groupIndex) {
                    delete this.evaluations[key];
                }
            }
        }
    }

    clearAll() {
        this.evaluations = {};
    }

    getAllEntries() {
        return Object.entries(this.evaluations).map(([key, data]) => {
            const info = this._parseKey(key);
            return { ...info, ...data };
        });
    }

    getAggregatedByGroup() {
        const groups = {};
        for (const entry of this.getAllEntries()) {
            if (entry.type !== 'group') continue;
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

    getAggregatedByMember(groupIndex) {
        const members = {};
        for (const entry of this.getAllEntries()) {
            if (entry.type !== 'member') continue;
            if (groupIndex !== undefined && entry.groupIndex !== groupIndex) continue;
            const mn = entry.memberName;
            if (!members[mn]) {
                members[mn] = { scores: {}, voters: [], totalRaw: 0, totalWeighted: 0, count: 0, groupIndex: entry.groupIndex };
            }
            const m = members[mn];
            m.voters.push(entry.voter);
            m.totalRaw += entry.totalRaw;
            m.totalWeighted += entry.totalWeighted;
            m.count++;
            for (const [crit, score] of Object.entries(entry.scores)) {
                m.scores[crit] = (m.scores[crit] || 0) + score;
            }
        }
        return Object.entries(members).map(([name, m]) => {
            const avgScores = {};
            for (const [crit, total] of Object.entries(m.scores)) {
                avgScores[crit] = parseFloat((total / m.count).toFixed(1));
            }
            const avgRaw = parseFloat((m.totalRaw / m.count).toFixed(1));
            const avgWeighted = parseFloat((m.totalWeighted / m.count).toFixed(1));
            return {
                memberName: name,
                groupIndex: m.groupIndex,
                voters: m.voters,
                scoreCount: m.count,
                scores: avgScores,
                totalRaw: avgRaw,
                totalWeighted: avgWeighted
            };
        });
    }

    size() {
        return Object.keys(this.evaluations).length;
    }
}
