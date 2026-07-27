class GroupCollection {
    constructor() {
        this.groups = [];
    }

    fromJSON(data) {
        this.groups = [];
        if (!Array.isArray(data)) return this;
        for (const group of data.slice(0, 100)) {
            if (!group || typeof group !== 'object' || Array.isArray(group)
                || !EvaluationKey.isIdentity(group.name)
                || typeof group.members !== 'string' || group.members.length > 12000) continue;
            const members = group.members === '' ? [] : group.members.split(/\r?\n/);
            if (members.length > 100) continue;
            const normalizedMembers = [];
            let valid = true;
            for (const member of members) {
                const name = member.trim();
                if (!EvaluationKey.isIdentity(name)) {
                    valid = false;
                    break;
                }
                normalizedMembers.push(name);
            }
            if (valid) this.groups.push({ name: group.name, members: normalizedMembers.join('\n') });
        }
        return this;
    }

    toJSON() {
        return this.groups.map(g => ({ ...g }));
    }

    get(index) {
        return this.groups[index] || null;
    }

    getAll() {
        return this.groups;
    }

    getMemberList(index) {
        const g = this.groups[index];
        if (!g || typeof g.members !== 'string' || !g.members) return [];
        return g.members.split('\n').map(m => m.trim()).filter(m => m);
    }

    add(group) {
        this.groups.push({ name: group.name || `Group ${this.groups.length + 1}`, members: group.members || '' });
    }

    remove(index) {
        if (this.groups.length <= 1) return false;
        this.groups.splice(index, 1);
        return true;
    }

    update(index, data) {
        if (this.groups[index]) {
            if (data.name !== undefined) this.groups[index].name = data.name;
            if (data.members !== undefined) this.groups[index].members = data.members;
        }
    }

    size() {
        return this.groups.length;
    }
}