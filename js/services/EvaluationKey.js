class EvaluationKey {
    static MAX_GROUP_INDEX = 99;
    static MAX_ID_LENGTH = 120;

    static parse(key) {
        if (typeof key !== 'string' || key.length === 0 || key.length > 400) return null;
        const parts = key.split(':');
        const groupIndex = this._parseGroupIndex(parts[1]);
        if (groupIndex === null) return null;

        if (parts[0] === 'g' && parts.length === 3 && this.isIdentity(parts[2])) {
            return { type: 'group', groupIndex, voter: parts[2] };
        }
        if (parts[0] === 'm' && parts.length === 4 && this.isIdentity(parts[2]) && this.isIdentity(parts[3])) {
            return { type: 'member', groupIndex, memberName: parts[2], voter: parts[3] };
        }
        return null;
    }

    static groupKey(groupIndex, voter) {
        return this._isGroupIndex(groupIndex) && this.isIdentity(voter) ? `g:${groupIndex}:${voter}` : null;
    }

    static memberKey(groupIndex, memberName, voter) {
        return this._isGroupIndex(groupIndex) && this.isIdentity(memberName) && this.isIdentity(voter)
            ? `m:${groupIndex}:${memberName}:${voter}`
            : null;
    }

    static _parseGroupIndex(value) {
        if (typeof value !== 'string' || !/^(0|[1-9]\d{0,1})$/.test(value)) return null;
        const groupIndex = Number(value);
        return this._isGroupIndex(groupIndex) ? groupIndex : null;
    }

    static _isGroupIndex(value) {
        return Number.isSafeInteger(value) && value >= 0 && value <= this.MAX_GROUP_INDEX;
    }

    static isIdentity(value) {
        return typeof value === 'string'
            && value.length > 0
            && value.length <= this.MAX_ID_LENGTH
            && value === value.trim()
            && !['__proto__', 'constructor', 'prototype'].includes(value)
            && !/[:\u0000-\u001F\u007F]/.test(value);
    }
}
