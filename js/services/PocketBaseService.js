class PocketBaseService {
    constructor() {
        this.baseUrl = '';
        this.cache = {};
    }

    async _fetch(url, options = {}) {
        try {
            const res = await fetch(url, options);
            if (!res.ok) return null;
            return await res.json();
        } catch (e) {
            return null;
        }
    }

    async loadRubric() {
        const data = await this._fetch(`${this.baseUrl}/api/collections/rubric_config/records?sort=-created&perPage=1`);
        if (data && data.items && data.items.length > 0) {
            this.cache.rubricId = data.items[0].id;
            return data.items[0].data;
        }
        return null;
    }

    async saveRubric(config) {
        const body = JSON.stringify({ data: config });
        if (this.cache.rubricId) {
            await this._fetch(`${this.baseUrl}/api/collections/rubric_config/records/${this.cache.rubricId}`, {
                method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body
            });
        } else {
            const res = await this._fetch(`${this.baseUrl}/api/collections/rubric_config/records`, {
                method: 'POST', headers: { 'Content-Type': 'application/json' }, body
            });
            if (res) this.cache.rubricId = res.id;
        }
    }

    async loadGroups() {
        const data = await this._fetch(`${this.baseUrl}/api/collections/groups/records?sort=created`);
        if (data && data.items) return data.items.map(i => i.data);
        return [];
    }

    async saveGroups(groups) {
        const existing = await this._fetch(`${this.baseUrl}/api/collections/groups/records?sort=created`);
        if (!existing) return;
        for (let i = 0; i < groups.length; i++) {
            const body = JSON.stringify({ data: groups[i] });
            if (existing.items[i]) {
                await this._fetch(`${this.baseUrl}/api/collections/groups/records/${existing.items[i].id}`, {
                    method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body
                });
            } else {
                await this._fetch(`${this.baseUrl}/api/collections/groups/records`, {
                    method: 'POST', headers: { 'Content-Type': 'application/json' }, body
                });
            }
        }
        for (let i = groups.length; i < existing.items.length; i++) {
            await this._fetch(`${this.baseUrl}/api/collections/groups/records/${existing.items[i].id}`, { method: 'DELETE' });
        }
    }

    async loadEvaluations() {
        const data = await this._fetch(`${this.baseUrl}/api/collections/evaluations/records?perPage=500`);
        if (!data || !data.items) return {};
        const result = {};
        for (const item of data.items) {
            const d = item.data;
            if (!d || d.groupIndex === null || d.groupIndex === undefined || isNaN(d.groupIndex)) continue;
            const voterName = item.voter || d.voter || 'unknown';
            const type = d.type || 'group';
            if (type === 'member' && d.memberName) {
                const key = `m:${d.groupIndex}:${d.memberName}:${voterName}`;
                result[key] = { scores: d.scores, totalRaw: d.totalRaw, totalWeighted: d.totalWeighted, grade: d.grade, date: d.date, id: item.id, voter: voterName, memberName: d.memberName };
            } else {
                const key = `g:${d.groupIndex}:${voterName}`;
                result[key] = { scores: d.scores, totalRaw: d.totalRaw, totalWeighted: d.totalWeighted, grade: d.grade, date: d.date, id: item.id, voter: voterName };
            }
        }
        return result;
    }

    async saveEvaluation(groupIndex, scores, totalRaw, totalWeighted, grade, voter) {
        const all = await this._fetch(`${this.baseUrl}/api/collections/evaluations/records?perPage=500`);
        if (!all) return;
        const vl = voter.toLowerCase();
        const existing = all.items.find(i => {
            const d = i.data;
            return d && d.groupIndex === groupIndex && d.type !== 'member' && (i.voter && i.voter.toLowerCase() === vl || d.voter && d.voter.toLowerCase() === vl);
        });
        const body = JSON.stringify({ data: { type: 'group', groupIndex, scores, totalRaw, totalWeighted, grade, date: new Date().toLocaleDateString() }, voter });
        if (existing) {
            await this._fetch(`${this.baseUrl}/api/collections/evaluations/records/${existing.id}`, {
                method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body
            });
        } else {
            await this._fetch(`${this.baseUrl}/api/collections/evaluations/records`, {
                method: 'POST', headers: { 'Content-Type': 'application/json' }, body
            });
        }
    }

    async saveMemberEvaluation(groupIndex, memberName, scores, totalRaw, totalWeighted, grade, voter) {
        const all = await this._fetch(`${this.baseUrl}/api/collections/evaluations/records?perPage=500`);
        if (!all) return;
        const vl = voter.toLowerCase();
        const ml = memberName.toLowerCase();
        const existing = all.items.find(i => {
            const d = i.data;
            return d && d.type === 'member' && d.groupIndex === groupIndex && d.memberName && d.memberName.toLowerCase() === ml && (i.voter && i.voter.toLowerCase() === vl || d.voter && d.voter.toLowerCase() === vl);
        });
        const body = JSON.stringify({ data: { type: 'member', groupIndex, memberName, scores, totalRaw, totalWeighted, grade, date: new Date().toLocaleDateString() }, voter });
        if (existing) {
            await this._fetch(`${this.baseUrl}/api/collections/evaluations/records/${existing.id}`, {
                method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body
            });
        } else {
            await this._fetch(`${this.baseUrl}/api/collections/evaluations/records`, {
                method: 'POST', headers: { 'Content-Type': 'application/json' }, body
            });
        }
    }

    async deleteEvaluation(groupIndex, voter) {
        const all = await this._fetch(`${this.baseUrl}/api/collections/evaluations/records?perPage=500`);
        if (!all) return;
        const vl = voter ? voter.toLowerCase() : null;
        const items = all.items.filter(i => {
            const d = i.data;
            return d && d.groupIndex === groupIndex && d.type !== 'member' && (!voter || i.voter && i.voter.toLowerCase() === vl || d.voter && d.voter.toLowerCase() === vl);
        });
        for (const item of items) {
            await this._fetch(`${this.baseUrl}/api/collections/evaluations/records/${item.id}`, { method: 'DELETE' });
        }
    }

    async deleteMemberEvaluation(groupIndex, memberName, voter) {
        const all = await this._fetch(`${this.baseUrl}/api/collections/evaluations/records?perPage=500`);
        if (!all) return;
        const vl = voter ? voter.toLowerCase() : null;
        const ml = memberName ? memberName.toLowerCase() : null;
        const items = all.items.filter(i => {
            const d = i.data;
            return d && d.type === 'member' && d.groupIndex === groupIndex && (!ml || d.memberName && d.memberName.toLowerCase() === ml) && (!vl || i.voter && i.voter.toLowerCase() === vl || d.voter && d.voter.toLowerCase() === vl);
        });
        for (const item of items) {
            await this._fetch(`${this.baseUrl}/api/collections/evaluations/records/${item.id}`, { method: 'DELETE' });
        }
    }

    async clearAllEvaluations() {
        const all = await this._fetch(`${this.baseUrl}/api/collections/evaluations/records`);
        if (!all) return;
        for (const item of all.items) {
            await this._fetch(`${this.baseUrl}/api/collections/evaluations/records/${item.id}`, { method: 'DELETE' });
        }
    }

    async loadVoters() {
        const data = await this._fetch(`${this.baseUrl}/api/collections/voters/records`);
        if (data && data.items) return data.items.map(i => i.data);
        return [];
    }

    async saveVoters(voters) {
        const existing = await this._fetch(`${this.baseUrl}/api/collections/voters/records`);
        if (!existing) return;
        for (const item of existing.items) {
            await this._fetch(`${this.baseUrl}/api/collections/voters/records/${item.id}`, { method: 'DELETE' });
        }
        for (const v of voters) {
            await this._fetch(`${this.baseUrl}/api/collections/voters/records`, {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ data: v })
            });
        }
    }
}
