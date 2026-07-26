class EvaluationCollection {
    constructor(groups = null) {
        this.evaluations = Object.create(null);
        this.groups = groups;
    }

    setGroups(groups) {
        this.groups = groups;
        return this;
    }

    fromJSON(data) {
        this.evaluations = Object.create(null);
        if (!data || typeof data !== 'object' || Array.isArray(data)) return this;
        for (const key of Object.keys(data).slice(0, 5000)) {
            const info = this._parseKey(key);
            const canonicalKey = this._keyForInfo(info);
            if (info && canonicalKey && data[key] && typeof data[key] === 'object' && !Array.isArray(data[key])
                && !Object.prototype.hasOwnProperty.call(this.evaluations, canonicalKey)) {
                this.evaluations[canonicalKey] = data[key];
            }
        }
        return this;
    }

    toJSON() {
        return { ...this.evaluations };
    }

    _gKey(groupIndex, voter) {
        return EvaluationKey.groupKey(groupIndex, this._canonicalVoter(voter));
    }

    _mKey(groupIndex, memberName, voter) {
        return EvaluationKey.memberKey(groupIndex, this._canonicalMember(groupIndex, memberName), this._canonicalVoter(voter));
    }

    _parseKey(key) {
        return this._canonicalInfo(EvaluationKey.parse(key));
    }

    getGroupEval(groupIndex, voter) {
        const key = this._gKey(groupIndex, voter);
        return key ? this.evaluations[key] || null : null;
    }

    getMemberEval(groupIndex, memberName, voter) {
        const key = this._mKey(groupIndex, memberName, voter);
        return key ? this.evaluations[key] || null : null;
    }

    getAllByGroup(groupIndex) {
        const results = [];
        for (const key of Object.keys(this.evaluations)) {
            const info = this._parseKey(key);
            if (info && this._isValidMemberInfo(info) && info.groupIndex === groupIndex && info.type === 'group') {
                results.push({ ...this._payloadFor(key), ...info });
            }
        }
        return results;
    }

    getAllByMember(groupIndex, memberName) {
        const results = [];
        for (const key of Object.keys(this.evaluations)) {
            const info = this._parseKey(key);
            if (info && this._isValidMemberInfo(info) && info.type === 'member' && info.groupIndex === groupIndex && info.memberName === memberName) {
                results.push({ ...this._payloadFor(key), ...info });
            }
        }
        return results;
    }

    getVotersForGroup(groupIndex) {
        return this.getAllByGroup(groupIndex).map(e => e.voter);
    }

    saveGroup(groupIndex, scores, totalRaw, totalWeighted, grade, voter) {
        const key = this._gKey(groupIndex, voter);
        if (!key || (this.groups && !this.groups.get(groupIndex))) return false;
        this.evaluations[key] = {
            scores: { ...scores },
            totalRaw,
            totalWeighted,
            grade,
            voter,
            date: new Date().toLocaleDateString()
        };
        return true;
    }

    saveMember(groupIndex, memberName, scores, totalRaw, totalWeighted, grade, voter) {
        const key = this._mKey(groupIndex, memberName, voter);
        if (!key || !this._isValidMemberInfo(EvaluationKey.parse(key))) return false;
        this.evaluations[key] = {
            scores: { ...scores },
            totalRaw,
            totalWeighted,
            grade,
            voter,
            memberName,
            date: new Date().toLocaleDateString()
        };
        return true;
    }

    deleteGroup(groupIndex, voter) {
        if (voter) {
            const key = this._gKey(groupIndex, voter);
            if (key) delete this.evaluations[key];
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
            const key = this._mKey(groupIndex, memberName, voter);
            if (key) delete this.evaluations[key];
        } else if (memberName) {
            for (const key of Object.keys(this.evaluations)) {
            const info = this._parseKey(key);
            if (info && this._isValidMemberInfo(info) && info.type === 'member' && info.groupIndex === groupIndex && info.memberName === memberName) {
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
        this.evaluations = Object.create(null);
    }

    getAllEntries() {
        const entries = [];
        Object.keys(this.evaluations).forEach(key => {
            const info = this._parseKey(key);
            if (info && this._isValidMemberInfo(info)) entries.push({ ...this._payloadFor(key), ...info });
        });
        return entries;
    }

    _payloadFor(key) {
        const data = this.evaluations[key];
        return data && typeof data === 'object' && !Array.isArray(data) ? data : {};
    }

    _isValidMemberInfo(info) {
        return !!info;
    }

    _keyForInfo(info) {
        if (!info) return null;
        return info.type === 'group'
            ? EvaluationKey.groupKey(info.groupIndex, info.voter)
            : EvaluationKey.memberKey(info.groupIndex, info.memberName, info.voter);
    }

    _canonicalInfo(info) {
        if (!info || !this.groups) return info;
        if (!this.groups.get(info.groupIndex)) return null;
        const voter = this._canonicalVoter(info.voter);
        if (!voter) return null;
        if (info.type === 'group') return { ...info, voter };
        const memberName = this._canonicalMember(info.groupIndex, info.memberName);
        return memberName ? { ...info, voter, memberName } : null;
    }

    _canonicalVoter(name) {
        if (!this.groups || !EvaluationKey.isIdentity(name)) return this.groups ? null : name;
        const matches = [];
        for (let index = 0; index < this.groups.size(); index++) {
            this.groups.getMemberList(index).forEach(member => {
                if (member.toLowerCase() === name.toLowerCase()) matches.push(member);
            });
        }
        return matches.length === 1 ? matches[0] : null;
    }

    _canonicalMember(groupIndex, name) {
        if (!this.groups || !EvaluationKey.isIdentity(name)) return this.groups ? null : name;
        const matches = this.groups.getMemberList(groupIndex).filter(member => member.toLowerCase() === name.toLowerCase());
        return matches.length === 1 ? matches[0] : null;
    }

    getAggregatedByGroup() {
        const groups = Object.create(null);
        for (const entry of this.getAllEntries()) {
            if (entry.type !== 'group') continue;
            if (!groups[entry.groupIndex]) {
                groups[entry.groupIndex] = { scores: Object.create(null), voters: [], totalRaw: 0, totalWeighted: 0, count: 0 };
            }
            const g = groups[entry.groupIndex];
            g.voters.push(entry.voter);
            g.totalRaw += Number.isFinite(entry.totalRaw) ? entry.totalRaw : 0;
            g.totalWeighted += Number.isFinite(entry.totalWeighted) ? entry.totalWeighted : 0;
            g.count++;
            for (const [crit, score] of Object.entries(this._scoreMap(entry.scores))) {
                g.scores[crit] = (g.scores[crit] || 0) + score;
            }
        }
        return Object.entries(groups).map(([idx, g]) => {
            const avgScores = Object.create(null);
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
        const members = Object.create(null);
        for (const entry of this.getAllEntries()) {
            if (entry.type !== 'member') continue;
            if (groupIndex !== undefined && entry.groupIndex !== groupIndex) continue;
            const mn = entry.memberName;
            if (!members[mn]) {
                members[mn] = { scores: Object.create(null), voters: [], totalRaw: 0, totalWeighted: 0, count: 0, groupIndex: entry.groupIndex };
            }
            const m = members[mn];
            m.voters.push(entry.voter);
            m.totalRaw += Number.isFinite(entry.totalRaw) ? entry.totalRaw : 0;
            m.totalWeighted += Number.isFinite(entry.totalWeighted) ? entry.totalWeighted : 0;
            m.count++;
            for (const [crit, score] of Object.entries(this._scoreMap(entry.scores))) {
                m.scores[crit] = (m.scores[crit] || 0) + score;
            }
        }
        return Object.entries(members).map(([name, m]) => {
            const avgScores = Object.create(null);
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

    _scoreMap(scores) {
        if (!scores || typeof scores !== 'object' || Array.isArray(scores)) return Object.create(null);
        const normalized = Object.create(null);
        for (const key of Object.keys(scores).slice(0, 30)) {
            const score = scores[key];
            if (key.length > 0 && key.length <= 160 && !/[\u0000-\u001F\u007F]/.test(key)
                && !['__proto__', 'constructor', 'prototype'].includes(key)
                && Number.isFinite(score) && Number.isInteger(score) && score >= 0 && score <= 5) {
                normalized[key] = score;
            }
        }
        return normalized;
    }
}
