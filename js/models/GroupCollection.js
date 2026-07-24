class GroupCollection {
    constructor() {
        this.groups = [];
    }

    fromJSON(data) {
        this.groups = Array.isArray(data) ? data.map(g => ({ ...g })) : [];
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
        if (!g || !g.members) return [];
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
