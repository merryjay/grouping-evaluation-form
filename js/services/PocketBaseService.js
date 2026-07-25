class PocketBaseService {
    constructor() {
        this.baseUrl = '';
        this.cache = {};
    }

    async loadRubric() {
        const res = await fetch(`${this.baseUrl}/api/collections/rubric_config/records?sort=-created&perPage=1`);
        const data = await res.json();
        if (data.items && data.items.length > 0) {
            this.cache.rubricId = data.items[0].id;
            return data.items[0].data;
        }
        return null;
    }

    async saveRubric(config) {
        const body = JSON.stringify({ data: config });
        if (this.cache.rubricId) {
            await fetch(`${this.baseUrl}/api/collections/rubric_config/records/${this.cache.rubricId}`, {
                method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body
            });
        } else {
            const res = await fetch(`${this.baseUrl}/api/collections/rubric_config/records`, {
                method: 'POST', headers: { 'Content-Type': 'application/json' }, body
            });
            const d = await res.json();
            this.cache.rubricId = d.id;
        }
    }

    async loadGroups() {
        const res = await fetch(`${this.baseUrl}/api/collections/groups/records?sort=created`);
        const data = await res.json();
        return data.items.map(i => i.data);
    }

    async saveGroups(groups) {
        const existing = await (await fetch(`${this.baseUrl}/api/collections/groups/records?sort=created`)).json();
        for (let i = 0; i < groups.length; i++) {
            if (existing.items[i]) {
                await fetch(`${this.baseUrl}/api/collections/groups/records/${existing.items[i].id}`, {
                    method: 'PATCH', headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ data: groups[i] })
                });
            } else {
                await fetch(`${this.baseUrl}/api/collections/groups/records`, {
                    method: 'POST', headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ data: groups[i] })
                });
            }
        }
        for (let i = groups.length; i < existing.items.length; i++) {
            await fetch(`${this.baseUrl}/api/collections/groups/records/${existing.items[i].id}`, { method: 'DELETE' });
        }
    }

    async loadEvaluations() {
        const res = await fetch(`${this.baseUrl}/api/collections/evaluations/records?perPage=500`);
        const data = await res.json();
        const result = {};
        for (const item of data.items) {
            const gi = item.data.groupIndex;
            if (gi === null || gi === undefined || isNaN(gi)) continue;
            const voterName = item.voter || item.data.voter || 'unknown';
            const key = `${gi}_${voterName}`;
            result[key] = { scores: item.data.scores, totalRaw: item.data.totalRaw, totalWeighted: item.data.totalWeighted, grade: item.data.grade, date: item.data.date, id: item.id, voter: voterName };
        }
        return result;
    }

    async saveEvaluation(groupIndex, scores, totalRaw, totalWeighted, grade, voter) {
        const all = await (await fetch(`${this.baseUrl}/api/collections/evaluations/records?perPage=500`)).json();
        const vl = voter.toLowerCase();
        const existing = all.items.find(i => i.data && i.data.groupIndex === groupIndex && (i.voter && i.voter.toLowerCase() === vl || i.data.voter && i.data.voter.toLowerCase() === vl));
        const body = JSON.stringify({ data: { groupIndex, scores, totalRaw, totalWeighted, grade, date: new Date().toLocaleDateString() }, voter });
        if (existing) {
            await fetch(`${this.baseUrl}/api/collections/evaluations/records/${existing.id}`, {
                method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body
            });
        } else {
            await fetch(`${this.baseUrl}/api/collections/evaluations/records`, {
                method: 'POST', headers: { 'Content-Type': 'application/json' }, body
            });
        }
    }

    async deleteEvaluation(groupIndex, voter) {
        const all = await (await fetch(`${this.baseUrl}/api/collections/evaluations/records?perPage=500`)).json();
        const vl = voter ? voter.toLowerCase() : null;
        const items = all.items.filter(i => i.data && i.data.groupIndex === groupIndex && (!voter || i.voter && i.voter.toLowerCase() === vl || i.data.voter && i.data.voter.toLowerCase() === vl));
        for (const item of items) {
            await fetch(`${this.baseUrl}/api/collections/evaluations/records/${item.id}`, { method: 'DELETE' });
        }
    }

    async clearAllEvaluations() {
        const all = await (await fetch(`${this.baseUrl}/api/collections/evaluations/records`)).json();
        for (const item of all.items) {
            await fetch(`${this.baseUrl}/api/collections/evaluations/records/${item.id}`, { method: 'DELETE' });
        }
    }

    async loadVoters() {
        const res = await fetch(`${this.baseUrl}/api/collections/voters/records`);
        const data = await res.json();
        return data.items.map(i => i.data);
    }

    async _cleanInvalidEvaluations() {
        const all = await (await fetch(`${this.baseUrl}/api/collections/evaluations/records?perPage=500`)).json();
        let deleted = 0;
        for (const item of all.items) {
            const gi = item.data ? item.data.groupIndex : undefined;
            if (gi === null || gi === undefined || gi === '' || isNaN(gi)) {
                await fetch(`${this.baseUrl}/api/collections/evaluations/records/${item.id}`, { method: 'DELETE' });
                deleted++;
            }
        }
        return deleted;
    }

    async _restoreEvaluations(local) {
        const all = await (await fetch(`${this.baseUrl}/api/collections/evaluations/records?perPage=500`)).json();
        const existingKeys = new Set(all.items.map(i => `${i.data.groupIndex}_${i.voter || i.data.voter || 'unknown'}`));
        for (const [key, evalData] of Object.entries(local)) {
            if (existingKeys.has(key)) continue;
            const under = key.indexOf('_');
            const groupIndex = parseInt(key.slice(0, under));
            const voter = key.slice(under + 1);
            await fetch(`${this.baseUrl}/api/collections/evaluations/records`, {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ data: { ...evalData, groupIndex }, voter })
            });
        }
        localStorage.setItem('pbEvals', JSON.stringify(local));
    }

    async saveVoters(voters) {
        const existing = await (await fetch(`${this.baseUrl}/api/collections/voters/records`)).json();
        for (const item of existing.items) {
            await fetch(`${this.baseUrl}/api/collections/voters/records/${item.id}`, { method: 'DELETE' });
        }
        for (const v of voters) {
            await fetch(`${this.baseUrl}/api/collections/voters/records`, {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ data: v })
            });
        }
    }
}
