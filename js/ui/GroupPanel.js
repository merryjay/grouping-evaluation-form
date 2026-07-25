class GroupPanel {
    constructor(groups, storageService) {
        this.groups = groups;
        this.storage = storageService;
        this._openGroups = new Set();

        this.el = {
            container: document.getElementById('groupsListReadOnly'),
            addBtn: document.getElementById('addGroupBtn')
        };

        this.el.addBtn.addEventListener('click', () => {
            if (window.app && window.app.isTeacher) this._addGroup();
        });

        this.el.container.addEventListener('click', (e) => {
            const removeMemberBtn = e.target.closest('.remove-member-btn');
            if (removeMemberBtn) return;

            const editMemberBtn = e.target.closest('.edit-member-btn');
            if (editMemberBtn) {
                e.stopPropagation();
                const groupIndex = parseInt(editMemberBtn.getAttribute('data-group'));
                const oldName = editMemberBtn.getAttribute('data-member');
                this._editMemberName(groupIndex, oldName);
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
            if (this.groups.size() === 0) {
                this._ensureDefaultGroups();
            }

            const isTeacher = window.app && window.app.isTeacher;
            this.el.addBtn.style.display = isTeacher ? '' : 'none';
            let html = '<div class="eval-list">';
            this.groups.getAll().forEach((g, i) => {
                const members = this.groups.getMemberList(i);
                const isOpen = this._openGroups.has(i);
                html += `<div class="group-card${isOpen ? ' open' : ''}" style="padding:0;">
                <div style="display:flex; align-items:stretch;">
                    <div class="group-toggle" data-index="${i}" style="cursor:pointer; flex:1; padding:14px 18px; display:flex; justify-content:space-between; align-items:center;">
                        <span style="font-weight:700; font-size:16px; color:#1e293b;">${this._escapeHtml(g.name)}</span>
                        ${isTeacher ? `<button class="edit-group-btn" data-index="${i}" title="Rename group" style="background:none; border:none; color:#64748b; cursor:pointer; font-size:14px; padding:0 4px;">&#9998;</button>` : ''}
                        <div style="display:flex; align-items:center; gap:8px; margin-left:auto;">
                            <span style="font-size:12px; color:#94a3b8; font-weight:500;">${members.length} member${members.length !== 1 ? 's' : ''}</span>
                            <span class="toggle-arrow" style="font-size:12px; color:#94a3b8; transition:transform 0.3s; transform:${isOpen ? 'rotate(180deg)' : 'rotate(0deg)'};">&#9660;</span>
                        </div>
                    </div>
                    ${isTeacher ? `<button class="remove-group-btn" data-index="${i}" title="Delete group" style="background:linear-gradient(135deg,#ef4444,#dc2626); color:white; border:none; width:40px; height:44px; border-radius:${members.length === 0 ? '0 16px 16px 0' : '0 10px 10px 0'}; cursor:pointer; font-size:18px; flex-shrink:0; box-shadow:0 4px 10px rgba(239,68,68,0.3); transition:all 0.2s; position:relative; z-index:1;">&times;</button>` : ''}
                </div>
                <div class="group-members-body" id="group-members-${i}" style="padding:0 18px 14px;">
                    <div style="border-top:1px solid #f1f5f9; padding-top:10px;">`;
                if (members.length > 0) {
                    html += `<div style="display:flex; flex-direction:column; gap:6px;">`;
                    members.sort((a, b) => a.localeCompare(b)).forEach((m, mi) => {
                        const encName = this._escapeHtml(m);
                        html += `<div class="member-row" style="display:flex; align-items:center; gap:8px; padding:2px 0;">
                        <span style="flex:1; background:#f1f5f9; padding:6px 14px; border-radius:20px; font-size:13px; color:#475569; font-weight:500;">${mi + 1}. ${encName}</span>
                        ${isTeacher ? `<div style="display:flex; gap:4px; flex-shrink:0;">
                            <button class="edit-member-btn" data-group="${i}" data-member="${encName}" style="background:none; border:none; color:#64748b; cursor:pointer; font-size:15px; width:34px; height:34px; padding:4px; border-radius:6px; display:flex; align-items:center; justify-content:center;" title="Rename member">&#9998;</button>
                            <button class="remove-member-btn" data-group="${i}" onclick="event.stopPropagation();window.app.groupPanel._removeMember(${i},decodeURIComponent('${encodeURIComponent(m)}'))" style="background:linear-gradient(135deg,#fee2e2,#fecaca); border:none; color:#dc2626; cursor:pointer; font-size:20px; width:36px; height:34px; padding:4px; border-radius:8px; display:flex; align-items:center; justify-content:center;" title="Remove member">&times;</button>
                        </div>` : ''}
                    </div>`;
                    });
                    html += `</div>`;
                } else {
                    html += `<div style="display:flex; flex-direction:column; gap:6px;"><span style="font-size:12px; color:#999;" id="no-members-${i}">No members listed</span></div>`;
                }
                html += isTeacher ? `<div style="display:flex; gap:6px; margin-top:10px;">
                        <input type="text" class="add-member-input" data-group="${i}" placeholder="Enter member name" style="flex:1; padding:8px 12px; border:1px solid #e2e8f0; border-radius:8px; font-size:13px;">
                        <button class="add-member-btn" data-group="${i}" style="background:linear-gradient(135deg,#3b82f6,#2563eb); color:white; border:none; padding:8px 14px; border-radius:8px; cursor:pointer; font-size:13px; font-weight:600; white-space:nowrap;">Add</button>
                    </div>` : ''
                html += `</div>
                </div>
            </div>`;
            });
            html += '</div>';
            this.el.container.innerHTML = html;

            this.el.container.querySelectorAll('.group-card').forEach(card => {
                const toggle = card.querySelector('.group-toggle');
                if (!toggle) return;
                const index = parseInt(toggle.getAttribute('data-index'));

                toggle.addEventListener('click', (e) => {
                    const arrow = toggle.querySelector('.toggle-arrow');
                    const wasOpen = card.classList.contains('open');
                    card.classList.toggle('open');
                    if (arrow) arrow.style.transform = wasOpen ? 'rotate(0deg)' : 'rotate(180deg)';
                    if (wasOpen) this._openGroups.delete(index);
                    else this._openGroups.add(index);
                });
            });

            this.el.container.querySelectorAll('.remove-group-btn').forEach(btn => {
                btn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    const index = parseInt(btn.dataset.index);
                    this._removeGroup(index);
                });
            });
        } catch (e) {
            alert('buildList error: ' + e.message + ' at ' + e.stack);
        }
    }

    _ensureDefaultGroups() {
        if (this.groups.size() > 0) return;
        for (let i = 1; i <= 8; i++) {
            this.groups.add({ name: `Group ${i}`, members: '' });
        }
        this.storage.saveGroups(this.groups.toJSON());
    }

    _addGroup() {
        this.groups.add({ name: `Group ${this.groups.size() + 1}`, members: '' });
        this.storage.saveGroups(this.groups.toJSON());
        this.buildList();
    }

    _removeGroup(index) {
        const data = this.groups.getAll();
        if (index < 0 || index >= data.length) return;
        if (data.length <= 1) return;
        const groupName = data[index].name;
        if (!confirm(`Delete "${groupName}"? This cannot be undone.`)) return;
        data.splice(index, 1);
        this.storage.saveGroups(this.groups.toJSON());
        this.buildList();
    }

    _addMember(groupIndex, name) {
        const g = this.groups.get(groupIndex);
        if (!g) return;
        const members = this.groups.getMemberList(groupIndex);
        if (members.includes(name)) { alert(`"${name}" is already in this group.`); return; }
        members.push(name);
        g.members = members.join('\n');
        this.storage.saveGroups(this.groups.toJSON());
        this.buildList();
    }

    _removeMember(groupIndex, name) {
        const g = this.groups.get(groupIndex);
        if (!g) return;
        if (!confirm(`Remove "${name}" from ${g.name}?`)) return;
        const members = this.groups.getMemberList(groupIndex);
        const filtered = members.filter(m => m !== name);
        if (filtered.length === members.length) return;
        g.members = filtered.join('\n');
        this.storage.saveGroups(this.groups.toJSON());
        this.buildList();
    }

    _editGroupName(index) {
        const g = this.groups.get(index);
        if (!g) return;
        const name = prompt('Enter new group name:', g.name);
        if (name && name.trim() && name.trim() !== g.name) {
            g.name = name.trim();
            this.storage.saveGroups(this.groups.toJSON());
            this.buildList();
        }
    }

    _editMemberName(groupIndex, oldName) {
        const g = this.groups.get(groupIndex);
        if (!g) return;
        const name = prompt('Enter new name:', oldName);
        if (name && name.trim() && name.trim() !== oldName) {
            const members = this.groups.getMemberList(groupIndex);
            const idx = members.indexOf(oldName);
            if (idx !== -1) {
                members[idx] = name.trim();
                g.members = members.join('\n');
                this.storage.saveGroups(this.groups.toJSON());
                this.buildList();
            }
        }
    }

    _escapeHtml(str) {
        const div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    }
}
