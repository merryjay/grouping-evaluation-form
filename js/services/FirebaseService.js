class FirebaseService {
    // Bounded to the current classroom UI: 100 groups × 100 members, 30 criteria, and 3–5 point scores.
    static LIMITS = Object.freeze({
        groups: 100,
        groupMembers: 100,
        groupMembersText: 12000,
        voters: 500,
        evaluations: 5000,
        criteria: 30,
        scoreEntries: 30,
        text: 160,
        date: 64
    });

    constructor(runtimeConfig = window.FirebaseRuntimeConfig, sdkLoader = FirebaseService._loadSdk) {
        this.runtimeConfig = runtimeConfig || { enabled: false };
        this._sdkLoader = sdkLoader;
        this.ready = false;
        this._initializationAttempted = false;
        this._sdk = null;
        this._db = null;
        this._stateRef = null;
    }

    async init() {
        if (this._initializationAttempted) return this.ready;
        this._initializationAttempted = true;
        if (!this.runtimeConfig.enabled || !this.runtimeConfig.firebaseConfig) return false;

        try {
            const [appSdk, firestoreSdk] = await this._sdkLoader();
            const config = this.runtimeConfig.firebaseConfig;
            const app = appSdk.getApps().find(candidate => candidate.options.appId === config.appId)
                || appSdk.initializeApp(config);
            this._sdk = firestoreSdk;
            this._db = firestoreSdk.getFirestore(app);
            this._stateRef = firestoreSdk.doc(this._db, 'groupingEvaluationForms', 'default');
            this.ready = true;
        } catch (error) {
            console.warn('Firebase remote storage is unavailable; local storage remains in use.', error);
        }
        return this.ready;
    }

    static _loadSdk() {
        return Promise.all([
            import('https://www.gstatic.com/firebasejs/11.10.0/firebase-app.js'),
            import('https://www.gstatic.com/firebasejs/11.10.0/firebase-firestore.js')
        ]);
    }

    async _readState() {
        if (!await this.init()) return { available: false, data: null };
        try {
            const snapshot = await this._sdk.getDoc(this._stateRef);
            return {
                available: true,
                data: FirebaseService.normalizeDocument(snapshot.exists() ? snapshot.data() : {})
            };
        } catch (error) {
            console.warn('Firebase remote storage read failed; local storage remains in use.', error);
            return { available: false, data: null };
        }
    }

    async _fieldResult(field) {
        const result = await this._readState();
        return result.available ? { available: true, data: result.data[field] } : result;
    }

    async _write(data) {
        if (!await this.init()) return false;
        try {
            await this._sdk.setDoc(this._stateRef, {
                ...data,
                updatedAt: this._sdk.serverTimestamp()
            }, { merge: true });
            return true;
        } catch (error) {
            console.warn('Firebase remote storage write failed; local storage remains in use.', error);
            return false;
        }
    }

    async loadRubricResult() { return this._fieldResult('rubric'); }
    async loadGroupsResult() { return this._fieldResult('groups'); }
    async loadVotersResult() { return this._fieldResult('voters'); }
    async loadEvaluationsResult() { return this._fieldResult('evaluations'); }

    async loadRubric() { return (await this.loadRubricResult()).data; }
    async loadGroups() { return (await this.loadGroupsResult()).data; }
    async loadEvaluations() { return (await this.loadEvaluationsResult()).data; }
    async loadVoters() { return (await this.loadVotersResult()).data; }

    async saveRubric(config) { return this._write({ rubric: config }); }
    async saveGroups(groups) { return this._write({ groups }); }
    async saveEvaluations(evaluations) {
        if (!FirebaseService._isPlainObject(evaluations) || Object.keys(evaluations).length > FirebaseService.LIMITS.evaluations) return false;
        return this._updateEvaluations((current, groups) => {
            const normalized = FirebaseService._normalizeEvaluations(evaluations, groups);
            if (Object.keys(normalized).length !== Object.keys(evaluations).length) return false;
            Object.keys(current).forEach(key => delete current[key]);
            Object.assign(current, normalized);
            return true;
        });
    }
    async saveVoters(voters) { return this._write({ voters }); }

    async subscribeEvaluations(listener) {
        if (typeof listener !== 'function' || !await this.init() || typeof this._sdk.onSnapshot !== 'function') return null;
        try {
            const unsubscribe = this._sdk.onSnapshot(this._stateRef, snapshot => {
                listener({
                    available: true,
                    data: FirebaseService.normalizeDocument(snapshot.exists() ? snapshot.data() : {}).evaluations
                });
            }, error => {
                console.warn('Firebase evaluation listener failed; existing local evaluations remain in use.', error);
            });
            return typeof unsubscribe === 'function' ? unsubscribe : () => {};
        } catch (error) {
            console.warn('Firebase evaluation listener is unavailable.', error);
            return null;
        }
    }

    async saveEvaluation(groupIndex, scores, totalRaw, totalWeighted, grade, voter) {
        const key = EvaluationKey.groupKey(groupIndex, voter);
        if (!key) return false;
        const payload = FirebaseService._normalizeEvaluationPayload({ scores, totalRaw, totalWeighted, grade, date: new Date().toLocaleDateString() });
        return payload ? this._updateEvaluations((evaluations, groups) => this._upsertEvaluation(evaluations, groups, key, payload)) : false;
    }

    async saveMemberEvaluation(groupIndex, memberName, scores, totalRaw, totalWeighted, grade, voter) {
        const key = EvaluationKey.memberKey(groupIndex, memberName, voter);
        if (!key) return false;
        const payload = FirebaseService._normalizeEvaluationPayload({ scores, totalRaw, totalWeighted, grade, date: new Date().toLocaleDateString() });
        return payload ? this._updateEvaluations((evaluations, groups) => this._upsertEvaluation(evaluations, groups, key, payload)) : false;
    }

    async deleteEvaluation(groupIndex, voter) {
        return this._updateEvaluations(evaluations => {
            this._removeMatchingEvaluations(evaluations,
                entry => entry.type === 'group' && entry.groupIndex === groupIndex && (!voter || entry.voter.toLowerCase() === voter.toLowerCase()));
            return true;
        });
    }

    async deleteMemberEvaluation(groupIndex, memberName, voter) {
        return this._updateEvaluations(evaluations => {
            this._removeMatchingEvaluations(evaluations,
                entry => entry.type === 'member'
                    && entry.groupIndex === groupIndex
                    && (!memberName || entry.memberName === memberName)
                    && (!voter || entry.voter.toLowerCase() === voter.toLowerCase()));
            return true;
        });
    }

    async clearAllEvaluations() { return this._write({ evaluations: {} }); }

    async _updateEvaluations(transform) {
        if (!await this.init()) return false;
        try {
            let updated = false;
            await this._sdk.runTransaction(this._db, async transaction => {
                const snapshot = await transaction.get(this._stateRef);
                const state = FirebaseService.normalizeDocument(snapshot.exists() ? snapshot.data() : {});
                const evaluations = { ...state.evaluations };
                if (transform(evaluations, state.groups) !== true) return;
                transaction.set(this._stateRef, {
                    evaluations,
                    updatedAt: this._sdk.serverTimestamp()
                }, { merge: true });
                updated = true;
            });
            return updated;
        } catch (error) {
            console.warn('Firebase remote storage update failed; local storage remains in use.', error);
            return false;
        }
    }

    _removeMatchingEvaluations(evaluations, predicate) {
        Object.keys(evaluations).forEach(key => {
            const entry = this._parseEvaluationKey(key);
            if (entry && predicate(entry)) delete evaluations[key];
        });
        return evaluations;
    }

    _parseEvaluationKey(key) {
        return EvaluationKey.parse(key);
    }

    _upsertEvaluation(evaluations, groups, key, payload) {
        if (!FirebaseService._isCanonicalEvaluationKey(key, groups)) return false;
        const exists = Object.prototype.hasOwnProperty.call(evaluations, key);
        if (!exists && Object.keys(evaluations).length >= FirebaseService.LIMITS.evaluations) return false;
        evaluations[key] = payload;
        return true;
    }

    static normalizeDocument(raw) {
        const state = this._isPlainObject(raw) ? raw : {};
        const groups = this._normalizeGroups(state.groups);
        return {
            rubric: this._normalizeRubric(state.rubric),
            groups,
            voters: this._normalizeVoters(state.voters),
            evaluations: this._normalizeEvaluations(state.evaluations, groups)
        };
    }

    static _normalizeRubric(value) {
        if (!this._isPlainObject(value)) return null;
        const activityName = this._text(value.activityName, this.LIMITS.text);
        const maxScore = value.maxScore;
        if (!activityName || ![3, 4, 5].includes(maxScore) || !Array.isArray(value.criteria)
            || value.criteria.length === 0 || value.criteria.length > this.LIMITS.criteria) return null;

        const criteria = [];
        for (const criterion of value.criteria) {
            if (!this._isPlainObject(criterion)) return null;
            const name = this._text(criterion.name, this.LIMITS.text);
            if (!name || ['__proto__', 'constructor', 'prototype'].includes(name)
                || !Number.isFinite(criterion.weight) || criterion.weight < 0 || criterion.weight > 100) return null;
            criteria.push({ name, weight: criterion.weight });
        }
        return { activityName, maxScore, criteria };
    }

    static _normalizeGroups(value) {
        if (!Array.isArray(value)) return [];
        const groups = [];
        for (const group of value.slice(0, this.LIMITS.groups)) {
            if (!this._isPlainObject(group)) continue;
            const name = group.name;
            const members = this._normalizeMembers(group.members);
            if (!EvaluationKey.isIdentity(name) || members === null) continue;
            groups.push({ name, members });
        }
        return groups;
    }

    static _normalizeMembers(value) {
        if (typeof value !== 'string' || value.length > this.LIMITS.groupMembersText) return null;
        const members = value === '' ? [] : value.split(/\r?\n/);
        if (members.length > this.LIMITS.groupMembers) return null;
        const normalized = [];
        const identities = new Set();
        for (const member of members) {
            const name = member.trim();
            if (!EvaluationKey.isIdentity(name)) return null;
            const identity = name.toLowerCase();
            if (identities.has(identity)) return null;
            identities.add(identity);
            normalized.push(name);
        }
        return normalized.join('\n');
    }

    static _normalizeVoters(value) {
        if (!Array.isArray(value)) return [];
        const voters = [];
        const names = new Set();
        for (const voter of value.slice(0, this.LIMITS.voters)) {
            if (!this._isPlainObject(voter)) continue;
            const name = voter.name;
            if (!EvaluationKey.isIdentity(name) || names.has(name)) continue;
            names.add(name);
            const rosterVoter = { name };
            if (voter.loggedIn === true) rosterVoter.loggedIn = true;
            voters.push(rosterVoter);
        }
        return voters;
    }

    static _normalizeGroupIndexes(value) {
        if (!Array.isArray(value)) return [];
        const indexes = new Set();
        for (const index of value.slice(0, this.LIMITS.groups)) {
            if (EvaluationKey._isGroupIndex(index)) indexes.add(index);
        }
        return [...indexes];
    }

    static _normalizeStrings(value, limit) {
        if (!Array.isArray(value)) return [];
        const strings = [];
        for (const item of value.slice(0, limit)) {
            const text = this._text(item, this.LIMITS.text);
            if (text) strings.push(text);
        }
        return strings;
    }

    static _normalizeEvaluations(value, groups) {
        if (!this._isPlainObject(value)) return Object.create(null);
        const evaluations = Object.create(null);
        const rejected = new Set();
        const voterResolver = this._voterResolver(groups);
        for (const key of Object.keys(value).slice(0, this.LIMITS.evaluations)) {
            const info = EvaluationKey.parse(key);
            const payload = this._normalizeEvaluationPayload(value[key]);
            const canonicalKey = info ? this._canonicalEvaluationKey(info, groups, voterResolver) : null;
            if (!canonicalKey || !payload || rejected.has(canonicalKey)) continue;
            if (Object.prototype.hasOwnProperty.call(evaluations, canonicalKey)) {
                delete evaluations[canonicalKey];
                rejected.add(canonicalKey);
                continue;
            }
            evaluations[canonicalKey] = payload;
        }
        return evaluations;
    }

    static _canonicalEvaluationKey(info, groups, voterResolver = this._voterResolver(groups)) {
        if (!groups[info.groupIndex]) return null;
        const voter = this._canonicalVoter(info.voter, voterResolver);
        if (!voter) return null;
        if (info.type === 'group') return EvaluationKey.groupKey(info.groupIndex, voter);
        const memberName = this._canonicalMember(info.groupIndex, info.memberName, groups);
        return memberName ? EvaluationKey.memberKey(info.groupIndex, memberName, voter) : null;
    }

    static _isCanonicalEvaluationKey(key, groups) {
        const info = EvaluationKey.parse(key);
        return !!info && this._canonicalEvaluationKey(info, groups) === key;
    }

    static _voterResolver(groups) {
        const candidates = new Map();
        groups.forEach(group => {
            group.members.split('\n').forEach(member => {
                const identity = member.toLowerCase();
                candidates.set(identity, candidates.has(identity) ? null : member);
            });
        });
        return candidates;
    }

    static _canonicalVoter(name, voterResolver) {
        return EvaluationKey.isIdentity(name) ? voterResolver.get(name.toLowerCase()) || null : null;
    }

    static _canonicalMember(groupIndex, name, groups) {
        if (!EvaluationKey.isIdentity(name) || !groups[groupIndex]) return null;
        const matches = groups[groupIndex].members.split('\n').filter(member => member.toLowerCase() === name.toLowerCase());
        return matches.length === 1 ? matches[0] : null;
    }

    static _normalizeEvaluationPayload(value) {
        if (!this._isPlainObject(value)) return null;
        const scores = this._normalizeScores(value.scores);
        const grade = this._text(value.grade, 8);
        const date = this._text(value.date, this.LIMITS.date);
        if (!scores || !Number.isFinite(value.totalRaw) || value.totalRaw < 0 || value.totalRaw > this.LIMITS.criteria * 5
            || !Number.isFinite(value.totalWeighted) || value.totalWeighted < 0 || value.totalWeighted > 100
            || !/^(A\+?|B|C|D|F)$/.test(grade || '') || !date) return null;
        return { scores, totalRaw: value.totalRaw, totalWeighted: value.totalWeighted, grade, date };
    }

    static _normalizeScores(value) {
        if (!this._isPlainObject(value)) return null;
        const scores = Object.create(null);
        const keys = Object.keys(value);
        if (keys.length > this.LIMITS.scoreEntries) return null;
        for (const key of keys) {
            const name = this._text(key, this.LIMITS.text);
            const score = value[key];
            if (!name || ['__proto__', 'constructor', 'prototype'].includes(name)
                || !Number.isFinite(score) || !Number.isInteger(score) || score < 0 || score > 5) return null;
            scores[name] = score;
        }
        return scores;
    }

    static _isPlainObject(value) {
        if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
        const prototype = Object.getPrototypeOf(value);
        return prototype === Object.prototype || prototype === null;
    }

    static _text(value, maxLength) {
        return typeof value === 'string'
            && value.length > 0
            && value.length <= maxLength
            && value === value.trim()
            && !/[\u0000-\u001F\u007F]/.test(value)
            ? value
            : null;
    }
}
