class FirebaseService {
    static ROSTER_SCHEMA_VERSION = 2;
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
                exists: snapshot.exists(),
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
    async loadStateResult() { return this._readState(); }

    async loadRubric() { return (await this.loadRubricResult()).data; }
    async loadGroups() { return (await this.loadGroupsResult()).data; }
    async loadEvaluations() { return (await this.loadEvaluationsResult()).data; }
    async loadVoters() { return (await this.loadVotersResult()).data; }

    _accountRef(normalizedUsername) {
        const id = typeof StudentCredentialService !== 'undefined'
            ? StudentCredentialService.accountDocumentId(normalizedUsername)
            : null;
        return id && this._sdk ? this._sdk.doc(this._db, 'groupingEvaluationForms', 'default', 'studentAccounts', id) : null;
    }

    async saveRubric(config) { return this._write({ rubric: config }); }
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

    async subscribeState(listener) {
        if (typeof listener !== 'function' || !await this.init() || typeof this._sdk.onSnapshot !== 'function') return null;
        try {
            const unsubscribe = this._sdk.onSnapshot(this._stateRef, snapshot => {
                const state = FirebaseService.normalizeDocument(snapshot.exists() ? snapshot.data() : {});
                listener({
                    available: true,
                    exists: snapshot.exists(),
                    data: state
                });
            }, error => {
                console.warn('Firebase state listener failed; existing local state remains in use.', error);
            });
            return typeof unsubscribe === 'function' ? unsubscribe : () => {};
        } catch (error) {
            console.warn('Firebase evaluation listener is unavailable.', error);
            return null;
        }
    }

    // Kept for callers that only consume evaluations. New callers should use
    // subscribeState so groups, evaluations, and voters move as one snapshot.
    async subscribeEvaluations(listener) {
        if (typeof listener !== 'function') return null;
        return this.subscribeState(result => listener({
            available: result.available,
            exists: result.exists,
            data: result.data.evaluations,
            state: result.data,
            groups: result.data.groups,
            voters: result.data.voters
        }));
    }

    async saveEvaluation(groupIndex, scores, totalRaw, totalWeighted, grade, voter, expectedGroup = null) {
        const key = EvaluationKey.groupKey(groupIndex, voter);
        if (!key) return false;
        const payload = FirebaseService._normalizeEvaluationPayload({ scores, totalRaw, totalWeighted, grade, date: new Date().toLocaleDateString() });
        return payload ? this._updateEvaluations((evaluations, groups) => {
            if (!FirebaseService._matchesExpectedGroup(groups, groupIndex, expectedGroup)) return false;
            return this._upsertEvaluation(evaluations, groups, key, payload);
        }) : false;
    }

    async saveMemberEvaluation(groupIndex, memberName, scores, totalRaw, totalWeighted, grade, voter, expectedGroup = null) {
        const key = EvaluationKey.memberKey(groupIndex, memberName, voter);
        if (!key) return false;
        const payload = FirebaseService._normalizeEvaluationPayload({ scores, totalRaw, totalWeighted, grade, date: new Date().toLocaleDateString() });
        return payload ? this._updateEvaluations((evaluations, groups) => {
            if (!FirebaseService._matchesExpectedGroup(groups, groupIndex, expectedGroup)) return false;
            return this._upsertEvaluation(evaluations, groups, key, payload);
        }) : false;
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

    async deleteEvaluationResult(groupIndex, voter, expectedGroup, expectedRevision) {
        return this._guardedEvaluationDelete(groupIndex, expectedGroup, expectedRevision, entry =>
            entry.type === 'group' && (!voter || FirebaseService._normalizedRosterKey(entry.voter) === FirebaseService._normalizedRosterKey(voter))
        );
    }

    async deleteMemberEvaluationResult(groupIndex, memberName, voter, expectedGroup, expectedRevision) {
        return this._guardedEvaluationDelete(groupIndex, expectedGroup, expectedRevision, entry =>
            entry.type === 'member'
                && (!memberName || entry.memberName === memberName)
                && (!voter || FirebaseService._normalizedRosterKey(entry.voter) === FirebaseService._normalizedRosterKey(voter))
        );
    }

    async _guardedEvaluationDelete(groupIndex, expectedGroup, expectedRevision, predicate) {
        if (!Number.isSafeInteger(expectedRevision) || expectedRevision < 0 || !await this.init()) {
            return { ok: false, success: false, error: 'remote-unavailable-or-invalid-revision' };
        }
        let result = { ok: false, success: false, error: 'transaction-not-run' };
        try {
            await this._sdk.runTransaction(this._db, async transaction => {
                const snapshot = await transaction.get(this._stateRef);
                const next = FirebaseService.deleteEvaluationsState(
                    snapshot.exists() ? snapshot.data() : null,
                    groupIndex,
                    expectedGroup,
                    expectedRevision,
                    predicate,
                    snapshot.exists()
                );
                if (!next.ok) { result = next; return; }
                transaction.set(this._stateRef, {
                    evaluations: next.state.evaluations,
                    updatedAt: this._sdk.serverTimestamp()
                }, { merge: true });
                result = next;
            });
        } catch (error) {
            console.warn('Firebase guarded evaluation deletion failed; local state was not changed.', error);
            return { ok: false, success: false, error: 'transaction-failed' };
        }
        return result;
    }

    async clearAllEvaluations() { return this._write({ evaluations: {} }); }

    async deleteGroup(groupIndex, expectedGroup = null, expectedRevision = null) {
        if (!await this.init()) return { ok: false, success: false, error: 'unavailable' };
        let result = { ok: false, success: false, error: 'transaction-not-run' };
        try {
            await this._sdk.runTransaction(this._db, async transaction => {
                const snapshot = await transaction.get(this._stateRef);
                const next = FirebaseService.deleteGroupState(snapshot.exists() ? snapshot.data() : null, groupIndex, snapshot.exists(), expectedGroup, expectedRevision, true);
                if (!next.ok) {
                    result = next;
                    return;
                }
                transaction.set(this._stateRef, {
                    schemaVersion: next.state.schemaVersion,
                    rosterInitialized: next.state.rosterInitialized,
                    rosterRevision: next.state.rosterRevision,
                    groups: next.state.groups,
                    evaluations: next.state.evaluations,
                    voters: next.state.voters,
                    updatedAt: this._sdk.serverTimestamp()
                }, { merge: true });
                result = next;
            });
        } catch (error) {
            console.warn('Firebase group deletion failed; local state was not changed.', error);
            return { ok: false, success: false, error: 'transaction-failed' };
        }
        return result;
    }

    async addGroup(group, expectedRevision) {
        return this._mutateRoster(expectedRevision, groups => {
            if (groups.length >= FirebaseService.LIMITS.groups) return null;
            return [...groups, group];
        });
    }

    async updateGroup(groupIndex, group, expectedGroup = null, expectedRevision = null) {
        return this._mutateRoster(expectedRevision, groups => {
            if (!FirebaseService._matchesExpectedGroup(groups, groupIndex, expectedGroup) || !groups[groupIndex]) return null;
            const next = groups.map(item => ({ ...item }));
            next[groupIndex] = group;
            return next;
        });
    }

    async _mutateRoster(expectedRevision, transform) {
        if (!Number.isSafeInteger(expectedRevision) || expectedRevision < 0 || !await this.init()) {
            return { ok: false, success: false, error: 'remote-unavailable-or-invalid-revision' };
        }
        let result = { ok: false, success: false, error: 'transaction-not-run' };
        try {
            await this._sdk.runTransaction(this._db, async transaction => {
                const snapshot = await transaction.get(this._stateRef);
                const next = FirebaseService.mutateRosterState(snapshot.exists() ? snapshot.data() : null, expectedRevision, transform, snapshot.exists());
                if (!next.ok) { result = next; return; }
                transaction.set(this._stateRef, {
                    schemaVersion: next.state.schemaVersion,
                    rosterInitialized: next.state.rosterInitialized,
                    rosterRevision: next.state.rosterRevision,
                    groups: next.state.groups,
                    evaluations: next.state.evaluations,
                    voters: next.state.voters,
                    updatedAt: this._sdk.serverTimestamp()
                }, { merge: true });
                result = next;
            });
        } catch (error) {
            console.warn('Firebase roster mutation failed; local state was not changed.', error);
            return { ok: false, success: false, error: 'transaction-failed' };
        }
        return result;
    }

    async prepareStudentLogin(name) {
        if (typeof StudentCredentialService === 'undefined' || !StudentCredentialService.isAvailable() || !await this.init()) {
            return { ok: false, error: 'credential-service-unavailable' };
        }
        const identity = StudentCredentialService.normalizeUsername(name);
        if (!identity) return { ok: false, error: 'invalid-name' };
        try {
            const snapshot = await this._sdk.getDoc(this._stateRef);
            const state = FirebaseService.normalizeDocument(snapshot.exists() ? snapshot.data() : {});
            const membership = FirebaseService.resolveUniqueRosterMember(state.groups, identity.display);
            if (!membership) return { ok: false, error: 'not-unique-roster-member' };
            const accountRef = this._accountRef(identity.key);
            if (!accountRef) return { ok: false, error: 'credential-service-unavailable' };
            const account = await this._sdk.getDoc(accountRef);
            if (!account.exists()) return { ok: true, status: 'unclaimed', membership, rosterRevision: state.rosterRevision };
            const record = StudentCredentialService.validateRecord(account.data());
            if (!record || record.normalizedUsername !== identity.key) return { ok: false, error: 'invalid-account-record' };
            return { ok: true, status: 'claimed', membership, rosterRevision: state.rosterRevision };
        } catch (error) {
            console.warn('Student login preparation failed.', error);
            return { ok: false, error: 'remote-unavailable' };
        }
    }

    async claimStudentAccount(name, password) {
        if (typeof StudentCredentialService === 'undefined' || !StudentCredentialService.isAvailable() || !await this.init()) {
            return { ok: false, error: 'credential-service-unavailable' };
        }
        const identity = StudentCredentialService.normalizeUsername(name);
        if (!identity) return { ok: false, error: 'invalid-name' };
        const accountRef = this._accountRef(identity.key);
        if (!accountRef) return { ok: false, error: 'credential-service-unavailable' };
        let result = { ok: false, error: 'claim-not-run' };
        try {
            await this._sdk.runTransaction(this._db, async transaction => {
                const stateSnapshot = await transaction.get(this._stateRef);
                const state = FirebaseService.normalizeDocument(stateSnapshot.exists() ? stateSnapshot.data() : {});
                const membership = FirebaseService.resolveUniqueRosterMember(state.groups, identity.display);
                if (!membership) { result = { ok: false, error: 'not-unique-roster-member' }; return; }
                const accountSnapshot = await transaction.get(accountRef);
                if (accountSnapshot.exists()) {
                    const record = StudentCredentialService.validateRecord(accountSnapshot.data());
                    result = record && record.normalizedUsername === identity.key
                        ? { ok: true, status: 'already-claimed', membership, rosterRevision: state.rosterRevision }
                        : { ok: false, error: 'invalid-account-record' };
                    return;
                }
                const record = await StudentCredentialService.createRecord(membership.name, password);
                if (!record || record.normalizedUsername !== identity.key) { result = { ok: false, error: 'invalid-credential' }; return; }
                transaction.set(accountRef, {
                    ...record,
                    createdAt: this._sdk.serverTimestamp(),
                    updatedAt: this._sdk.serverTimestamp()
                });
                result = { ok: true, status: 'claimed', membership, rosterRevision: state.rosterRevision };
            });
        } catch (error) {
            console.warn('Student account claim failed.', error);
            return { ok: false, error: 'remote-unavailable' };
        }
        return result;
    }

    async authenticateStudent(name, password) {
        if (typeof StudentCredentialService === 'undefined' || !StudentCredentialService.isAvailable() || !await this.init()) {
            return { ok: false, error: 'credential-service-unavailable' };
        }
        const identity = StudentCredentialService.normalizeUsername(name);
        if (!identity) return { ok: false, error: 'invalid-name' };
        try {
            const stateSnapshot = await this._sdk.getDoc(this._stateRef);
            const state = FirebaseService.normalizeDocument(stateSnapshot.exists() ? stateSnapshot.data() : {});
            const membership = FirebaseService.resolveUniqueRosterMember(state.groups, identity.display);
            if (!membership) return { ok: false, error: 'not-unique-roster-member' };
            const accountRef = this._accountRef(identity.key);
            const account = accountRef && await this._sdk.getDoc(accountRef);
            if (!account || !account.exists()) return { ok: false, error: 'account-not-claimed' };
            const record = StudentCredentialService.validateRecord(account.data());
            if (!record || record.normalizedUsername !== identity.key) return { ok: false, error: 'invalid-account-record' };
            if (!await StudentCredentialService.verify(record, password)) return { ok: false, error: 'wrong-password' };
            return { ok: true, status: 'claimed', membership, rosterRevision: state.rosterRevision };
        } catch (error) {
            console.warn('Student authentication failed.', error);
            return { ok: false, error: 'remote-unavailable' };
        }
    }

    async seedGroupsIfUninitialized(groups) {
        const seedGroups = FirebaseService._strictCanonicalGroups(groups);
        if (!seedGroups || !await this.init()) {
            return { ok: false, success: false, error: 'unavailable-or-invalid-seed' };
        }
        let result = { ok: false, success: false, error: 'transaction-not-run' };
        try {
            await this._sdk.runTransaction(this._db, async transaction => {
                const snapshot = await transaction.get(this._stateRef);
                const raw = snapshot.exists() ? snapshot.data() : {};
                if (snapshot.exists() && !FirebaseService._isPlainObject(raw)) {
                    result = { ok: false, success: false, error: 'invalid-state' };
                    return;
                }
                const hasMarker = Object.prototype.hasOwnProperty.call(raw, 'rosterInitialized');
                const hasGroups = Object.prototype.hasOwnProperty.call(raw, 'groups');
                if (hasMarker) {
                    // Once marked, malformed or absent roster data must fail
                    // closed rather than silently recreating classroom groups.
                    const current = FirebaseService._strictRosterState(raw, true);
                    if (!current) {
                        result = { ok: false, success: false, error: 'invalid-initialized-roster' };
                        return;
                    }
                    result = { ok: true, success: true, seeded: false, state: FirebaseService._stateFromRoster(current) };
                    return;
                }
                if (hasGroups) {
                    const legacyGroups = FirebaseService._strictCanonicalGroups(raw.groups);
                    if (!legacyGroups) {
                        result = { ok: false, success: false, error: 'invalid-legacy-roster' };
                        return;
                    }
                    const legacyEvaluations = FirebaseService._normalizeEvaluations(raw.evaluations, legacyGroups);
                    const state = FirebaseService._rosterState(raw, legacyGroups, legacyEvaluations, 0);
                    transaction.set(this._stateRef, {
                        schemaVersion: state.schemaVersion,
                        rosterInitialized: state.rosterInitialized,
                        rosterRevision: state.rosterRevision,
                        groups: state.groups,
                        evaluations: state.evaluations,
                        voters: state.voters,
                        updatedAt: this._sdk.serverTimestamp()
                    }, { merge: true });
                    result = { ok: true, success: true, seeded: false, state };
                    return;
                }
                const state = {
                    rubric: FirebaseService._normalizeRubric(raw.rubric),
                    schemaVersion: FirebaseService.ROSTER_SCHEMA_VERSION,
                    rosterInitialized: true,
                    rosterRevision: 0,
                    groups: seedGroups,
                    voters: FirebaseService._normalizeVoters(raw.voters, seedGroups),
                    evaluations: FirebaseService._normalizeEvaluations(raw.evaluations, seedGroups)
                };
                transaction.set(this._stateRef, {
                    schemaVersion: state.schemaVersion,
                    rosterInitialized: state.rosterInitialized,
                    rosterRevision: state.rosterRevision,
                    groups: state.groups,
                    voters: state.voters,
                    evaluations: state.evaluations,
                    updatedAt: this._sdk.serverTimestamp()
                }, { merge: true });
                result = { ok: true, success: true, seeded: true, state };
            });
        } catch (error) {
            console.warn('Firebase initial group seed failed; local state was not changed.', error);
            return { ok: false, success: false, error: 'transaction-failed' };
        }
        return result;
    }

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
            schemaVersion: state.schemaVersion === this.ROSTER_SCHEMA_VERSION ? this.ROSTER_SCHEMA_VERSION : 0,
            rosterInitialized: state.rosterInitialized === true,
            rosterRevision: Number.isSafeInteger(state.rosterRevision) && state.rosterRevision >= 0 ? state.rosterRevision : 0,
            groups,
            voters: this._normalizeVoters(state.voters),
            evaluations: this._normalizeEvaluations(state.evaluations, groups)
        };
    }

    // This is shared by the Firestore transaction and explicitly-disabled
    // local storage fallback. It never mutates its input.
    static deleteGroupState(raw, groupIndex, exists = true, expectedGroup = null, expectedRevision = null, requireInitialized = false) {
        if (!exists || !EvaluationKey._isGroupIndex(groupIndex)) {
            return { ok: false, success: false, error: 'invalid-state-or-index' };
        }
        const source = this._strictRosterState(raw, requireInitialized);
        if (!source || groupIndex >= source.groups.length) {
            if (this._isPlainObject(raw) && this._strictCanonicalGroups(raw.groups)
                && this._strictCanonicalEvaluations(raw.evaluations, this._strictCanonicalGroups(raw.groups)) === null) {
                return { ok: false, success: false, error: 'invalid-evaluations' };
            }
            return { ok: false, success: false, error: 'invalid-state-or-index' };
        }
        if (expectedRevision !== null && expectedRevision !== source.rosterRevision) {
            return { ok: false, success: false, error: 'stale-roster-revision', state: this._stateFromRoster(source) };
        }
        if (!this._matchesExpectedGroup(source.groups, groupIndex, expectedGroup)) {
            return { ok: false, success: false, error: 'stale-group-index' };
        }

        const nextGroups = source.groups.filter((group, index) => index !== groupIndex);
        if (this._hasAmbiguousRosterMembers(nextGroups)) return { ok: false, success: false, error: 'ambiguous-roster-members' };
        const nextEvaluations = Object.create(null);
        for (const key of Object.keys(source.evaluations)) {
            const info = EvaluationKey.parse(key);
            if (!info || info.groupIndex === groupIndex) continue;
            const shifted = { ...info, groupIndex: info.groupIndex > groupIndex ? info.groupIndex - 1 : info.groupIndex };
            const shiftedKey = this._canonicalEvaluationKey(shifted, nextGroups);
            // A removed or now-ambiguous voter/member must not retain a record.
            if (!shiftedKey) continue;
            if (Object.prototype.hasOwnProperty.call(nextEvaluations, shiftedKey)) {
                return { ok: false, success: false, error: 'evaluation-key-collision' };
            }
            nextEvaluations[shiftedKey] = source.evaluations[key];
        }
        return {
            ok: true,
            success: true,
            state: this._rosterState(raw, nextGroups, nextEvaluations, source.rosterRevision + 1)
        };
    }

    static mutateRosterState(raw, expectedRevision, transform, exists = true) {
        const source = exists ? this._strictRosterState(raw, true) : null;
        if (!source) return { ok: false, success: false, error: 'invalid-initialized-roster' };
        if (source.rosterRevision !== expectedRevision) {
            return { ok: false, success: false, error: 'stale-roster-revision', state: this._stateFromRoster(source) };
        }
        let nextGroups;
        try { nextGroups = transform(source.groups.map(group => ({ ...group }))); } catch (e) { nextGroups = null; }
        const normalizedGroups = this._strictCanonicalGroups(nextGroups);
        if (!normalizedGroups) return { ok: false, success: false, error: 'invalid-roster-mutation' };
        if (this._hasAmbiguousRosterMembers(normalizedGroups)) return { ok: false, success: false, error: 'ambiguous-roster-members' };
        const evaluations = this._reconcileEvaluations(source.evaluations, normalizedGroups);
        if (evaluations === null) return { ok: false, success: false, error: 'evaluation-key-collision' };
        return {
            ok: true,
            success: true,
            state: this._rosterState(raw, normalizedGroups, evaluations, source.rosterRevision + 1)
        };
    }

    static deleteEvaluationsState(raw, groupIndex, expectedGroup, expectedRevision, predicate, exists = true) {
        if (!exists || !EvaluationKey._isGroupIndex(groupIndex) || typeof predicate !== 'function') {
            return { ok: false, success: false, error: 'invalid-state-or-index' };
        }
        const source = this._strictRosterState(raw, true);
        if (!source) return { ok: false, success: false, error: 'invalid-initialized-roster' };
        if (source.rosterRevision !== expectedRevision) {
            return { ok: false, success: false, error: 'stale-roster-revision', state: this._stateFromRoster(source) };
        }
        if (!this._matchesExpectedGroup(source.groups, groupIndex, expectedGroup)) {
            return { ok: false, success: false, error: 'stale-group-index', state: this._stateFromRoster(source) };
        }
        const evaluations = Object.create(null);
        for (const key of Object.keys(source.evaluations)) {
            const entry = EvaluationKey.parse(key);
            if (!entry || (entry.groupIndex === groupIndex && predicate(entry))) continue;
            evaluations[key] = source.evaluations[key];
        }
        return { ok: true, success: true, state: this._rosterState(raw, source.groups, evaluations, source.rosterRevision) };
    }

    static _strictRosterState(raw, requireInitialized = false) {
        if (!this._isPlainObject(raw)) return null;
        const initialized = raw.rosterInitialized === true;
        if (requireInitialized && (!initialized || raw.schemaVersion !== this.ROSTER_SCHEMA_VERSION)) return null;
        if (Object.prototype.hasOwnProperty.call(raw, 'rosterInitialized') && !initialized) return null;
        const groups = this._strictCanonicalGroups(raw.groups);
        if (!groups) return null;
        const evaluations = this._strictCanonicalEvaluations(raw.evaluations, groups);
        if (evaluations === null) return null;
        const rosterRevision = Number.isSafeInteger(raw.rosterRevision) && raw.rosterRevision >= 0
            ? raw.rosterRevision
            : (initialized ? null : 0);
        if (rosterRevision === null) return null;
        return { raw, groups, evaluations, rosterRevision, initialized };
    }

    static _rosterState(raw, groups, evaluations, rosterRevision) {
        return {
            rubric: this._normalizeRubric(raw.rubric),
            schemaVersion: this.ROSTER_SCHEMA_VERSION,
            rosterInitialized: true,
            rosterRevision,
            groups,
            evaluations,
            voters: this._normalizeVoters(raw.voters, groups, { retainGroupIndex: true })
        };
    }

    static _stateFromRoster(source) {
        return this._rosterState(source.raw, source.groups, source.evaluations, source.rosterRevision);
    }

    static _reconcileEvaluations(evaluations, groups) {
        const next = Object.create(null);
        for (const key of Object.keys(evaluations)) {
            const info = EvaluationKey.parse(key);
            const canonicalKey = info && this._canonicalEvaluationKey(info, groups);
            if (!canonicalKey) continue;
            if (Object.prototype.hasOwnProperty.call(next, canonicalKey)) return null;
            next[canonicalKey] = evaluations[key];
        }
        return next;
    }

    static _strictCanonicalGroups(value) {
        if (!Array.isArray(value) || value.length > this.LIMITS.groups) return null;
        const groups = this._normalizeGroups(value);
        if (groups.length !== value.length) return null;
        for (let index = 0; index < groups.length; index++) {
            if (!this._isPlainObject(value[index])
                || value[index].name !== groups[index].name
                || value[index].members !== groups[index].members) return null;
        }
        return groups;
    }

    static _strictCanonicalEvaluations(value, groups) {
        if (value === undefined) return Object.create(null);
        if (!this._isPlainObject(value) || Object.keys(value).length > this.LIMITS.evaluations) return null;
        const evaluations = Object.create(null);
        for (const key of Object.keys(value)) {
            const info = EvaluationKey.parse(key);
            const payload = this._normalizeEvaluationPayload(value[key]);
            if (!info || !payload || this._canonicalEvaluationKey(info, groups) !== key
                || Object.prototype.hasOwnProperty.call(evaluations, key)) return null;
            evaluations[key] = payload;
        }
        return evaluations;
    }

    static _matchesExpectedGroup(groups, groupIndex, expectedGroup) {
        const group = groups[groupIndex];
        if (!group) return false;
        if (expectedGroup === null || expectedGroup === undefined) return true;
        return expectedGroup !== null && typeof expectedGroup === 'object' && !Array.isArray(expectedGroup)
            && expectedGroup.name === group.name
            && expectedGroup.members === group.members;
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

    static _normalizeVoters(value, groups = null, { retainGroupIndex = false } = {}) {
        if (!Array.isArray(value)) return [];
        const voters = [];
        const names = new Set();
        const resolver = groups ? this._voterResolver(groups) : null;
        for (const voter of value.slice(0, this.LIMITS.voters)) {
            if (!this._isPlainObject(voter)) continue;
            const name = groups ? this._canonicalVoter(voter.name, resolver) : voter.name;
            const identity = this._normalizedRosterKey(name);
            if (!identity || names.has(identity)) continue;
            names.add(identity);
            const rosterVoter = { name };
            if (voter.loggedIn === true) rosterVoter.loggedIn = true;
            if (retainGroupIndex && Object.prototype.hasOwnProperty.call(voter, 'voterGroupIndex')) {
                const voterGroupIndex = this._voterGroupIndex(name, groups);
                if (voterGroupIndex !== null) rosterVoter.voterGroupIndex = voterGroupIndex;
            }
            voters.push(rosterVoter);
        }
        return voters;
    }

    static _voterGroupIndex(name, groups) {
        if (!groups || !EvaluationKey.isIdentity(name)) return null;
        const matches = [];
        groups.forEach((group, index) => {
            group.members.split('\n').forEach(member => {
                if (this._normalizedRosterKey(member) === this._normalizedRosterKey(name)) matches.push(index);
            });
        });
        return matches.length === 1 ? matches[0] : null;
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
                const identity = this._normalizedRosterKey(member);
                if (!identity) return;
                candidates.set(identity, candidates.has(identity) ? null : member);
            });
        });
        return candidates;
    }

    static _canonicalVoter(name, voterResolver) {
        const identity = this._normalizedRosterKey(name);
        return identity ? voterResolver.get(identity) || null : null;
    }

    static _canonicalMember(groupIndex, name, groups) {
        const identity = this._normalizedRosterKey(name);
        if (!identity || !groups[groupIndex]) return null;
        const matches = groups[groupIndex].members.split('\n').filter(member => this._normalizedRosterKey(member) === identity);
        return matches.length === 1 ? matches[0] : null;
    }

    static _normalizedRosterKey(name) {
        if (typeof StudentCredentialService !== 'undefined') {
            const normalized = StudentCredentialService.normalizeUsername(name);
            return normalized ? normalized.key : null;
        }
        if (!EvaluationKey.isIdentity(name)) return null;
        try {
            const display = name.normalize('NFKC').trim().replace(/\s+/gu, ' ');
            return EvaluationKey.isIdentity(display) ? display.toLocaleLowerCase('en-US') : null;
        } catch (e) {
            return null;
        }
    }

    static _hasAmbiguousRosterMembers(groups) {
        const names = new Set();
        for (const group of groups) {
            for (const member of group.members === '' ? [] : group.members.split('\n')) {
                const key = this._normalizedRosterKey(member);
                if (!key || names.has(key)) return true;
                names.add(key);
            }
        }
        return false;
    }

    static resolveUniqueRosterMember(groups, input) {
        const key = this._normalizedRosterKey(input);
        if (!key) return null;
        const matches = [];
        groups.forEach((group, groupIndex) => {
            group.members.split('\n').forEach(member => {
                if (this._normalizedRosterKey(member) === key) matches.push({ name: member, groupIndex });
            });
        });
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
