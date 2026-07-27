class GroupPanel {
    constructor(groups, storageService) {
        this.groups = groups;
        this.storage = storageService;
        this._openGroups = new Set();
        this._deleting = false;
        this._mutating = false;

        this.el = {
            container: document.getElementById('groupsListReadOnly'),
            addBtn: document.getElementById('addGroupBtn'),
            status: document.getElementById('groupsStatus')
        };

        this.el.addBtn.addEventListener('click', () => {
            if (window.app && window.app.isTeacher) this._addGroup();
        });

        this.el.container.addEventListener('click', (e) => {
            const removeMemberBtn = e.target.closest('.remove-member-btn');
            if (removeMemberBtn) {
                const groupIndex = parseInt(removeMemberBtn.dataset.group);
                const memberIndex = parseInt(removeMemberBtn.dataset.memberIndex);
                const member = this._getSortedMembers(groupIndex)[memberIndex];
                if (member !== undefined) this._removeMember(groupIndex, member);
                return;
            }

            const editMemberBtn = e.target.closest('.edit-member-btn');
            if (editMemberBtn) {
                e.stopPropagation();
                const groupIndex = parseInt(editMemberBtn.getAttribute('data-group'));
                const memberIndex = parseInt(editMemberBtn.dataset.memberIndex);
                const oldName = this._getSortedMembers(groupIndex)[memberIndex];
                if (oldName !== undefined) this._editMemberName(groupIndex, oldName);
                return;
            }
            const editGroupBtn = e.target.closest('.edit-group-btn');
            if (editGroupBtn) {
                e.stopPropagation();
                const index = parseInt(editGroupBtn.dataset.index);
                this._editGroupName(index);
                return;
            }
            const addMemberBtn = e.target.closest('.add-member-btn');
            if (addMemberBtn) {
                const index = parseInt(addMemberBtn.getAttribute('data-group'));
                const input = document.querySelector(`.add-member-input[data-group="${index}"]`);
                const name = input ? input.value.trim() : '';
                if (name) {
                    this._addMember(index, name);
                    input.value = '';
                }
                return;
            }
        });

        this.el.container.addEventListener('keydown', (e) => {
            const input = e.target.closest('.add-member-input');
            if (input && e.key === 'Enter') {
                const index = parseInt(input.getAttribute('data-group'));
                const name = input.value.trim();
                if (name) {
                    this._addMember(index, name);
                    input.value = '';
                }
            }
        });
    }

    buildList() {
        try {
            const isTeacher = window.app && window.app.isTeacher;
            this.el.addBtn.style.display = isTeacher ? '' : 'none';
            let html = '<div class="eval-list">';
            this.groups.getAll().forEach((g, i) => {
                const members = this._getSortedMembers(i);
                const isOpen = this._openGroups.has(i);
                html += `<article class="group-card${isOpen ? ' open' : ''}" style="padding:0;" aria-labelledby="group-name-${i}">
                <div style="display:flex; align-items:center; padding:8px 12px; gap:8px;">
                    <button type="button" class="group-toggle disclosure-btn" data-index="${i}" aria-expanded="${isOpen}" aria-controls="group-members-${i}">
                        <span id="group-name-${i}" class="group-name">${this._escapeHtml(g.name)}</span>
                        <span style="margin-left:auto; color:#5f6673; font-size:12px;">${members.length} member${members.length !== 1 ? 's' : ''} · ${isOpen ? 'Hide members' : 'Show members'}</span>
                    </button>
                    ${isTeacher ? `<button type="button" class="edit-group-btn group-action" data-index="${i}" aria-label="Rename ${this._escapeHtml(g.name)}">Edit</button><button type="button" class="remove-group-btn group-action group-action-danger" data-index="${i}" aria-label="Delete ${this._escapeHtml(g.name)}">Delete</button>` : ''}
                </div>
                <div class="group-members-body" id="group-members-${i}" ${isOpen ? '' : 'hidden'}>
                    <div style="border-top:1px solid #f1f5f9; padding-top:8px;">`;
                if (members.length > 0) {
                    html += `<div style="display:flex; flex-direction:column; gap:6px;">`;
                    members.forEach((m, mi) => {
                        const encName = this._escapeHtml(m);
                        html += `<div class="member-row" style="display:flex; align-items:center; gap:8px; padding:2px 0;">
                        <span style="flex:1; background:#f1f5f9; padding:6px 14px; border-radius:20px; font-size:13px; color:#475569; font-weight:500;">${mi + 1}. ${encName}</span>
                        ${isTeacher ? `<div style="display:flex; gap:4px; flex-shrink:0;">
                            <button type="button" class="edit-member-btn member-action" data-group="${i}" data-member-index="${mi}" aria-label="Rename ${encName}">Edit</button>
                            <button type="button" class="remove-member-btn member-action member-action-danger" data-group="${i}" data-member-index="${mi}" aria-label="Remove ${encName} from ${this._escapeHtml(g.name)}">Remove</button>
                        </div>` : ''}
                    </div>`;
                    });
                    html += `</div>`;
                } else {
                    html += `<div style="display:flex; flex-direction:column; gap:6px;"><span style="font-size:12px; color:#999;" id="no-members-${i}">No members listed</span></div>`;
                }
                html += isTeacher ? `<div class="group-member-form">
                        <label class="sr-only" for="add-member-${i}">Member name for ${this._escapeHtml(g.name)}</label><input id="add-member-${i}" type="text" class="add-member-input" data-group="${i}" placeholder="Enter member name" autocomplete="name">
                        <button type="button" class="add-member-btn btn btn-primary" data-group="${i}">Add member</button>
                    </div>` : ''
                html += `</div>
                </div>
            </article>`;
            });
            html += '</div>';
            this.el.container.innerHTML = html;

            this.el.container.querySelectorAll('.group-card').forEach(card => {
                const toggle = card.querySelector('.group-toggle');
                if (!toggle) return;
                const index = parseInt(toggle.getAttribute('data-index'));

                toggle.addEventListener('click', (e) => {
                    const wasOpen = card.classList.contains('open');
                    card.classList.toggle('open');
                    toggle.setAttribute('aria-expanded', wasOpen ? 'false' : 'true');
                    const body = card.querySelector('.group-members-body');
                    if (body) body.hidden = wasOpen;
                    if (wasOpen) this._openGroups.delete(index);
                    else this._openGroups.add(index);
                });
            });

            this.el.container.querySelectorAll('.remove-group-btn').forEach(btn => {
                btn.addEventListener('click', async (e) => {
                    e.stopPropagation();
                    const index = parseInt(btn.dataset.index);
                    await this._removeGroup(index, btn);
                });
            });
        } catch (e) {
            GroupPanel.prototype._announce.call(this, 'Could not render the group list. Please refresh and try again.', 'error');
        }
    }

    async _addGroup() {
        if (this._mutating) return false;
        this._mutating = true;
        try {
            const result = await this.storage.addGroup(
                { name: `Group ${this.groups.size() + 1}`, members: '' },
                this._rosterRevision()
            );
            return this._applyRosterResult(result);
        } finally {
            this._mutating = false;
        }
    }

    async _removeGroup(index, button = null) {
        const data = this.groups.getAll();
        if (this._deleting || this._mutating || index < 0 || index >= data.length) return false;
        const groupName = data[index].name;
        const expectedGroup = { name: data[index].name, members: data[index].members };
        if (!confirm(`Delete group "${groupName}" and all evaluations for this group? This cannot be undone.`)) return false;
        this._deleting = true;
        this._mutating = true;
        if (button) { button.disabled = true; button.textContent = '…'; }
        try {
            const result = await this.storage.deleteGroup(index, expectedGroup, this._rosterRevision());
            if (!result || result.ok !== true) {
                GroupPanel.prototype._announce.call(this, 'Could not delete group. Please try again.', 'error');
                return false;
            }
            return this._applyRosterResult(result);
        } catch (e) {
            GroupPanel.prototype._announce.call(this, 'Could not delete group. Please try again.', 'error');
            return false;
        } finally {
            this._deleting = false;
            this._mutating = false;
            if (button && button.isConnected) { button.disabled = false; button.textContent = 'Delete'; }
        }
    }

    resetState() {
        this._openGroups.clear();
    }

    async _addMember(groupIndex, name) {
        const g = this.groups.get(groupIndex);
        if (!g || this._mutating) return false;
        if (!EvaluationKey.isIdentity(name)) {
            GroupPanel.prototype._announce.call(this, 'Member names must be 1–120 characters without colons, control characters, or reserved names.', 'error');
            return false;
        }
        const members = this.groups.getMemberList(groupIndex);
        if (members.includes(name)) { GroupPanel.prototype._announce.call(this, `"${name}" is already in this group.`, 'warning'); return false; }
        members.push(name);
        return this._updateGroup(groupIndex, { name: g.name, members: members.join('\n') });
    }

    async _removeMember(groupIndex, name) {
        const g = this.groups.get(groupIndex);
        if (!g || this._mutating) return false;
        if (!confirm(`Remove "${name}" from ${g.name}?`)) return false;
        const members = this.groups.getMemberList(groupIndex);
        const filtered = members.filter(m => m !== name);
        if (filtered.length === members.length) return false;
        return this._updateGroup(groupIndex, { name: g.name, members: filtered.join('\n') });
    }

    async _editGroupName(index) {
        const g = this.groups.get(index);
        if (!g || this._mutating) return false;
        const name = prompt('Enter new group name:', g.name);
        if (name && name.trim() && name.trim() !== g.name) {
            if (!EvaluationKey.isIdentity(name.trim())) {
                GroupPanel.prototype._announce.call(this, 'Group names must be 1–120 characters without colons, control characters, or reserved names.', 'error');
                return false;
            }
            return this._updateGroup(index, { name: name.trim(), members: g.members });
        }
        return false;
    }

    async _editMemberName(groupIndex, oldName) {
        const g = this.groups.get(groupIndex);
        if (!g || this._mutating) return false;
        const name = prompt('Enter new name:', oldName);
        if (name && name.trim() && name.trim() !== oldName) {
            if (!EvaluationKey.isIdentity(name.trim())) {
                GroupPanel.prototype._announce.call(this, 'Member names must be 1–120 characters without colons, control characters, or reserved names.', 'error');
                return false;
            }
            const members = this.groups.getMemberList(groupIndex);
            const idx = members.indexOf(oldName);
            if (idx !== -1) {
                members[idx] = name.trim();
                return this._updateGroup(groupIndex, { name: g.name, members: members.join('\n') });
            }
        }
        return false;
    }

    async _updateGroup(index, group) {
        const current = this.groups.get(index);
        if (!current || this._mutating) return false;
        this._mutating = true;
        try {
            const result = await this.storage.updateGroup(index, group, { name: current.name, members: current.members }, this._rosterRevision());
            return this._applyRosterResult(result);
        } finally {
            this._mutating = false;
        }
    }

    _rosterRevision() {
        if (window.app && Number.isSafeInteger(window.app.rosterRevision)) return window.app.rosterRevision;
        return this.storage && typeof this.storage.getRosterRevision === 'function' ? this.storage.getRosterRevision() : 0;
    }

    _applyRosterResult(result) {
        if (!result || result.ok !== true) {
            GroupPanel.prototype._announce.call(this, result && result.error === 'stale-roster-revision'
                ? 'Groups changed on another device. The latest roster has been loaded.'
                : 'Could not update groups. Please try again.', 'error');
            if (result && result.state && window.app && typeof window.app._applyFullState === 'function') {
                window.app._applyFullState({ available: true, data: result.state }, { source: 'stale-roster' });
            }
            return false;
        }
        if (window.app && typeof window.app._applyFullState === 'function') {
            window.app._applyFullState({ available: true, data: result.state }, { source: 'roster-mutation' });
        } else {
            this.groups.fromJSON(result.state.groups);
            this.resetState();
            this.buildList();
        }
        GroupPanel.prototype._announce.call(this, 'Group roster saved.', 'success');
        return true;
    }

    _getSortedMembers(groupIndex) {
        return this.groups.getMemberList(groupIndex).sort((a, b) => a.localeCompare(b));
    }

    _escapeHtml(str) {
        return SafeHtml.escapeText(str);
    }

    _announce(message, type = 'info') {
        if (this.el && this.el.status) {
            this.el.status.textContent = message;
            this.el.status.className = `weight-status ${type === 'success' ? 'is-valid' : type === 'error' ? 'is-invalid' : ''}`;
        }
        if (window.app && typeof window.app.showStatus === 'function') window.app.showStatus(message, type);
        else if (typeof alert === 'function') alert(message);
    }
}
