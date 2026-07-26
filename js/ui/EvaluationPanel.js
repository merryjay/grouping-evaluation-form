class EvaluationPanel {
    constructor(rubricConfig, groups, evaluations, scoringService, storageService) {
        this.rubric = rubricConfig;
        this.groups = groups;
        this.evaluations = evaluations;
        this.scoring = scoringService;
        this.storage = storageService;
        this.selectedGroupIndex = null;
        this.mode = 'group';

        this.el = {
            grid: document.getElementById('groupsEvaluationGrid'),
            title: document.getElementById('evaluationTitle')
        };
    }

    buildGrid(selectedGroupIndex = null) {
        this.selectedGroupIndex = selectedGroupIndex;

        if (selectedGroupIndex !== null) {
            this.el.grid.className = '';
        } else {
            this.el.grid.className = 'eval-list';
        }

        if (this.rubric.criteria.length === 0 || this.groups.size() === 0) {
            this.el.grid.innerHTML = '<div class="card empty-state" style="text-align:center; padding:60px 20px;"><div style="font-size:48px; margin-bottom:16px;">&#9203;</div><p style="font-size:18px; font-weight:600; color:#64748b;">Wait for evaluation</p><p style="font-size:13px; color:#94a3b8; margin-top:8px;">The teacher hasn&apos;t set up the evaluation yet. Please check back later.</p></div>';
            return;
        }

        const labels = this.rubric.getScoreLabels();
        let html = '';

        html += this._buildModeToggle();

        const groupsToRender = selectedGroupIndex !== null
            ? [this.groups.get(selectedGroupIndex)].filter(Boolean)
            : this.groups.getAll();

        if (selectedGroupIndex !== null) {
            this.el.title.textContent = `${this.rubric.activityName} - ${this.groups.get(selectedGroupIndex).name}`;
            html += `<div style="margin-bottom:16px;">
                <button class="btn btn-secondary" id="backToAllGroups" style="width:auto; padding:8px 16px; font-size:12px;">&larr; Back to All Groups</button>
            </div>`;
        } else {
            this.el.title.textContent = `${this.rubric.activityName} - Group Evaluation`;
        }

        groupsToRender.forEach((group, gi) => {
            const actualIndex = selectedGroupIndex !== null ? selectedGroupIndex : this.groups.getAll().indexOf(group);
            const memberList = this._getSortedMembers(actualIndex);
            const voter = window.app && window.app.currentVoter;
            const isOwnGroup = window.app && !window.app.isTeacher && window.app.voterGroupIndex === actualIndex;

            if (this.mode === 'member') {
                html += this._buildMemberCard(actualIndex, group, memberList, voter, isOwnGroup, labels);
            } else {
                html += this._buildGroupCard(actualIndex, group, memberList, voter, isOwnGroup, labels);
            }
        });

        this.el.grid.innerHTML = html;

        if (selectedGroupIndex !== null) {
            this._toggleBody(selectedGroupIndex);
            const backBtn = document.getElementById('backToAllGroups');
            if (backBtn) {
                backBtn.addEventListener('click', () => {
                    window.app.tabManager.switch('evaluate');
                    window.app.evaluationPanel.buildGrid();
                });
            }
        }

        this._bindGroupEvents();
        if (this.mode === 'member') this._bindMemberEvents();
    }

    _buildModeToggle() {
        return `<div style="display:flex; gap:8px; margin-bottom:16px; background:#f1f5f9; border-radius:12px; padding:4px;">
            <button class="eval-mode-btn" data-mode="group" style="flex:1; padding:10px 16px; border:none; border-radius:8px; font-size:13px; font-weight:700; cursor:pointer; ${this.mode === 'group' ? 'background:white; color:#667eea; box-shadow:0 2px 8px rgba(0,0,0,0.1);' : 'background:transparent; color:#64748b;'}">Rate by Group</button>
            <button class="eval-mode-btn" data-mode="member" style="flex:1; padding:10px 16px; border:none; border-radius:8px; font-size:13px; font-weight:700; cursor:pointer; ${this.mode === 'member' ? 'background:white; color:#667eea; box-shadow:0 2px 8px rgba(0,0,0,0.1);' : 'background:transparent; color:#64748b;'}">Rate by Person</button>
        </div>`;
    }

    _buildGroupCard(actualIndex, group, memberList, voter, isOwnGroup, labels) {
        const hasVoted = voter && !window.app.isTeacher && this.evaluations.getGroupEval(actualIndex, voter);
        let html = `<div class="group-card" id="group-card-${actualIndex}">`;
        html += `<div class="eval-toggle" data-target="${actualIndex}" style="cursor:${isOwnGroup || hasVoted ? 'default' : 'pointer'};">`;
        html += `<div style="display:flex; justify-content:space-between; align-items:center;">`;
        html += `<div class="group-name" style="font-size:16px; font-weight:700; color:#1e293b;">${this._escapeHtml(group.name)}${isOwnGroup ? ' <span style="font-size:10px;color:#e74c3c;font-weight:600;background:#fee2e2;padding:2px 8px;border-radius:10px;margin-left:6px;">YOUR GROUP</span>' : ''}${hasVoted ? ' <span style="font-size:10px;color:#059669;font-weight:600;background:#d1fae5;padding:2px 8px;border-radius:10px;margin-left:6px;">✓ VOTED</span>' : ''}</div>`;
        html += `<div style="display:flex; align-items:center; gap:8px;">`;
        if (!isOwnGroup && !hasVoted) {
            html += `<span class="eval-toggle-icon" style="font-size:14px; color:#94a3b8;">&#9660;</span>`;
        }
        html += `</div></div>`;
        html += `<div style="font-size:12px; color:#94a3b8; margin-top:4px;">${memberList.length} member${memberList.length !== 1 ? 's' : ''}</div>`;
        html += `</div>`;

        if (isOwnGroup) {
            html += `<div style="padding:14px;text-align:center;color:#94a3b8;font-size:13px;">You cannot rate your own group.</div>`;
        } else if (hasVoted) {
            html += `<div style="padding:14px;text-align:center;">
                <p style="color:#059669;font-size:14px;font-weight:600;">✓ You have already rated this group.</p>
            </div>`;
        } else {
            html += `<div class="eval-body" id="eval-body-${actualIndex}" style="display:none; margin-top:12px;">`;
            html += this._buildRubricHTML(actualIndex, labels);
            html += `</div>`;
        }
        html += `</div>`;
        return html;
    }

    _buildMemberCard(actualIndex, group, memberList, voter, isOwnGroup, labels) {
        let html = `<div class="group-card" id="member-card-${actualIndex}">`;
        html += `<div class="member-toggle" data-target="${actualIndex}" style="cursor:pointer;">`;
        html += `<div style="display:flex; justify-content:space-between; align-items:center;">`;
        html += `<div class="group-name" style="font-size:16px; font-weight:700; color:#1e293b;">${this._escapeHtml(group.name)}${isOwnGroup ? ' <span style="font-size:10px;color:#e74c3c;font-weight:600;background:#fee2e2;padding:2px 8px;border-radius:10px;margin-left:6px;">YOUR GROUP</span>' : ''}</div>`;
        html += `<span style="font-size:12px; color:#94a3b8;">${memberList.length} member${memberList.length !== 1 ? 's' : ''}</span>`;
        html += `</div></div>`;

        html += `<div class="member-body" id="member-body-${actualIndex}" style="display:none; margin-top:12px;">`;
        html += `<div style="border-top:1px solid #f1f5f9; padding-top:12px;">`;
        html += `<h4 style="font-size:11px; text-transform:uppercase; color:#94a3b8; margin-bottom:10px; font-weight:600; letter-spacing:1px;">Select a member to rate</h4>`;
        html += `<div style="display:flex; flex-direction:column; gap:6px;">`;

        memberList.forEach((m, mi) => {
            const isSelf = voter && m.toLowerCase().trim() === voter.toLowerCase().trim();
            const hasRated = voter && this.evaluations.getMemberEval(actualIndex, m, voter);
            const encName = this._escapeHtml(m);
            html += `<div class="member-rating-row" data-group="${actualIndex}" data-member-index="${mi}" style="display:flex; align-items:center; gap:8px; padding:8px 10px; background:${isSelf ? '#f1f5f9' : (hasRated ? '#d1fae5' : '#f8fafc')}; border:1px solid ${hasRated ? '#a7f3d0' : '#e2e8f0'}; border-radius:10px; cursor:${isSelf || hasRated ? 'default' : 'pointer'}; transition:all 0.2s;">
                <span style="font-size:13px; font-weight:600; color:#475569; flex:1;">${mi + 1}. ${encName}</span>
                ${isSelf ? '<span style="font-size:10px;color:#94a3b8;">You</span>' : ''}
                ${hasRated ? '<span style="font-size:10px;color:#059669;font-weight:600;">✓ Rated</span>' : '<span style="font-size:10px;color:#667eea;font-weight:600;">Rate</span>'}
            </div>`;
            html += `<div class="member-eval-form" id="member-eval-${actualIndex}-${mi}" style="display:none; margin-top:4px; padding:10px; background:white; border:1px solid #e2e8f0; border-radius:10px;" data-group="${actualIndex}" data-member-index="${mi}"></div>`;
        });

        html += `</div></div>`;
        html += `</div>`;
        html += `</div>`;
        return html;
    }

    _buildRubricHTML(groupIndex, labels) {
        let html = `<div class="rating-section">`;
        html += `<div style="display:grid; grid-template-columns:repeat(auto-fill,minmax(280px,1fr)); gap:10px;">`;
        this.rubric.criteria.forEach((c, ci) => {
            html += `<div style="background:#f8fafc; border:1px solid #f1f5f9; border-radius:10px; padding:10px;">`;
            html += `<div style="font-size:12px; font-weight:600; color:#475569; margin-bottom:6px;">${this._escapeHtml(c.name)}</div>`;
            html += `<div class="star-rating" data-group="${groupIndex}" data-criterion="${ci}">`;
            for (let s = 1; s <= this.rubric.maxScore; s++) {
                html += `<button class="star-btn" data-score="${s}">${s}</button>`;
            }
            html += `</div>`;
            html += `</div>`;
        });
        html += `</div>`;
        html += `<div style="display:flex; gap:8px; margin-top:12px;">`;
        html += `<button class="save-group-btn" data-group-index="${groupIndex}" style="flex:1;">Submit Vote</button>`;
        html += `</div></div>`;
        return html;
    }

    _buildMemberRubricHTML(groupIndex, memberName, labels) {
        const voter = window.app && window.app.currentVoter;
        const existing = this.evaluations.getMemberEval(groupIndex, memberName, voter);
        const currentScores = existing ? existing.scores : {};
        let html = `<div class="rating-section">`;
        html += `<div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">
            <span style="font-size:13px; font-weight:700; color:#1e293b;">${this._escapeHtml(memberName)}</span>
            <span style="font-size:10px; color:#94a3b8;">Rate each criterion</span>
        </div>`;
        html += `<div style="display:grid; grid-template-columns:repeat(auto-fill,minmax(280px,1fr)); gap:10px;">`;
        this.rubric.criteria.forEach((c, ci) => {
            const currentScore = currentScores[c.name] || 0;
            html += `<div style="background:#f8fafc; border:1px solid #f1f5f9; border-radius:10px; padding:10px;">`;
            html += `<div style="font-size:12px; font-weight:600; color:#475569; margin-bottom:6px;">${this._escapeHtml(c.name)}</div>`;
            html += `<div class="star-rating" data-group="${groupIndex}" data-criterion="${ci}">`;
            for (let s = 1; s <= this.rubric.maxScore; s++) {
                const selectedClass = s === currentScore ? 'selected' : '';
                html += `<button class="star-btn ${selectedClass}" data-score="${s}">${s}</button>`;
            }
            html += `</div>`;
            html += `</div>`;
        });
        html += `</div>`;
        html += `<div style="display:flex; gap:8px; margin-top:12px;">`;
        html += `<button class="save-member-btn" data-group="${groupIndex}" style="flex:1; padding:10px; background:linear-gradient(135deg,#667eea,#764ba2); color:white; border:none; border-radius:8px; font-size:13px; font-weight:700; cursor:pointer;">Submit Rating</button>`;
        html += `</div></div>`;
        return html;
    }

    _bindGroupEvents() {
        this.el.grid.querySelectorAll('.eval-toggle').forEach(el => {
            el.addEventListener('click', () => {
                const target = parseInt(el.dataset.target);
                this._toggleBody(target);
            });
        });

        this.el.grid.querySelectorAll('.star-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const parent = btn.closest('.star-rating');
                parent.querySelectorAll('.star-btn').forEach(b => b.classList.remove('selected'));
                btn.classList.add('selected');
            });
        });

        this.el.grid.querySelectorAll('.save-group-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const groupIndex = parseInt(btn.dataset.groupIndex);
                this._saveEvaluation(groupIndex);
            });
        });

        this.el.grid.querySelectorAll('.eval-mode-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                this.mode = btn.dataset.mode;
                this.buildGrid();
            });
        });
    }

    _bindMemberEvents() {
        this.el.grid.querySelectorAll('.member-toggle').forEach(el => {
            el.addEventListener('click', () => {
                const target = parseInt(el.dataset.target);
                const body = document.getElementById(`member-body-${target}`);
                if (body) {
                    body.style.display = body.style.display === 'none' ? 'block' : 'none';
                }
            });
        });

        this.el.grid.querySelectorAll('.member-rating-row').forEach(row => {
            row.addEventListener('click', (e) => {
                const voter = window.app && window.app.currentVoter;
                const groupIndex = parseInt(row.dataset.group);
                const memberIndex = parseInt(row.dataset.memberIndex);
                const memberName = this._getSortedMembers(groupIndex)[memberIndex];
                if (memberName === undefined) return;
                if (voter && memberName.toLowerCase().trim() === voter.toLowerCase().trim()) return;
                this._toggleMemberForm(groupIndex, memberIndex);
            });
        });

        this.el.grid.querySelectorAll('.star-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const parent = btn.closest('.star-rating');
                parent.querySelectorAll('.star-btn').forEach(b => b.classList.remove('selected'));
                btn.classList.add('selected');
            });
        });

        this.el.grid.querySelectorAll('.save-member-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const groupIndex = parseInt(btn.dataset.group);
                const form = btn.closest('.member-eval-form');
                const memberIndex = form ? parseInt(form.dataset.memberIndex) : -1;
                const memberName = this._getSortedMembers(groupIndex)[memberIndex];
                if (memberName !== undefined) this._saveMemberEvaluation(groupIndex, memberName, form);
            });
        });

        this.el.grid.querySelectorAll('.eval-mode-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                this.mode = btn.dataset.mode;
                this.buildGrid();
            });
        });
    }

    _toggleBody(groupIndex) {
        const body = document.getElementById(`eval-body-${groupIndex}`);
        const icon = document.querySelector(`.eval-toggle[data-target="${groupIndex}"] .eval-toggle-icon`);
        if (!body) return;

        const isVisible = body.style.display !== 'none';
        body.style.display = isVisible ? 'none' : 'block';
        if (icon) {
            icon.style.transform = isVisible ? 'rotate(0deg)' : 'rotate(180deg)';
        }
        if (!isVisible) {
            setTimeout(() => {
                const card = document.getElementById(`group-card-${groupIndex}`);
                if (card) card.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
            }, 50);
        }
    }

    _toggleMemberForm(groupIndex, memberIndex) {
        const voter = window.app && window.app.currentVoter;
        const labels = this.rubric.getScoreLabels();

        const memberName = this._getSortedMembers(groupIndex)[memberIndex];
        if (memberName === undefined) return;

        const formId = `member-eval-${groupIndex}-${memberIndex}`;
        const form = document.getElementById(formId);
        if (!form) return;

        const isVisible = form.style.display !== 'none';
        if (isVisible) {
            form.style.display = 'none';
            form.innerHTML = '';
        } else {
            const allForms = document.querySelectorAll('.member-eval-form');
            allForms.forEach(f => { f.style.display = 'none'; f.innerHTML = ''; });
            form.innerHTML = this._buildMemberRubricHTML(groupIndex, memberName, labels);
            form.style.display = 'block';

            form.querySelectorAll('.star-btn').forEach(btn => {
                btn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    const parent = btn.closest('.star-rating');
                    parent.querySelectorAll('.star-btn').forEach(b => b.classList.remove('selected'));
                    btn.classList.add('selected');
                });
            });

            const saveBtn = form.querySelector('.save-member-btn');
            if (saveBtn) {
                saveBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    this._saveMemberEvaluation(groupIndex, memberName, form);
                });
            }
        }
    }

    _getVoter() {
        return window.app && window.app.currentVoter ? window.app.currentVoter : 'unknown';
    }

    async _saveEvaluation(groupIndex) {
        const btn = document.querySelector(`.save-group-btn[data-group-index="${groupIndex}"]`);
        if (btn && btn.disabled) return;
        if (btn) { btn.disabled = true; btn.textContent = 'Saving...'; }
        try {
            if (window.app && !window.app.isTeacher && window.app.voterGroupIndex === groupIndex) {
                alert('You cannot rate your own group.');
                if (btn) { btn.disabled = false; btn.textContent = 'Submit Vote'; }
                return;
            }
            const voter = this._getVoter();
            if (voter === 'unknown') { if (btn) { btn.disabled = false; btn.textContent = 'Submit Vote'; } return; }
            const scores = Object.create(null);
            this.rubric.criteria.forEach((c, ci) => {
                const container = this.el.grid.querySelector(`.star-rating[data-group="${groupIndex}"][data-criterion="${ci}"]`);
                const selected = container ? container.querySelector('.star-btn.selected') : null;
                scores[c.name] = selected ? parseInt(selected.dataset.score) : 0;
            });

            const result = this.scoring.calculate(scores);

            const remoteSaved = await this.storage.remote.saveEvaluation(groupIndex, scores, result.totalRaw, result.totalWeighted, result.grade, voter);
            if (!remoteSaved) {
                if (btn) { btn.disabled = false; btn.textContent = 'Submit Vote'; }
                return;
            }
            const localSaved = this.evaluations.saveGroup(groupIndex, scores, result.totalRaw, result.totalWeighted, result.grade, voter);
            if (!localSaved) {
                if (btn) { btn.disabled = false; btn.textContent = 'Submit Vote'; }
                return;
            }
            localStorage.setItem('pbEvals', JSON.stringify(this.evaluations.toJSON()));

            let voters = window.app.storage.loadVoters();
            const vl = voter.toLowerCase();
            let v = voters.find(x => x.name.toLowerCase() === vl);
            if (!v) {
                voters.push({ name: voter, hasVoted: false, votedCount: 0, ratedGroups: [], ratedMembers: [], loggedIn: false });
                v = voters[voters.length - 1];
            }
            v.hasVoted = true;
            const ratedGroups = new Set(v.ratedGroups || []);
            ratedGroups.add(groupIndex);
            v.ratedGroups = [...ratedGroups];
            v.votedCount = v.ratedGroups.length;
            window.app.storage.saveVoters(voters);
            window.app.voters = voters;

            if (btn) { btn.disabled = false; btn.textContent = '✓ VOTED'; }
            this.buildGrid();
            if (window.app.resultsPanel) window.app.resultsPanel.showPasswordPrompt();
            if (window.app._renderVoters) window.app._renderVoters();
        } catch (e) {
            if (btn) { btn.disabled = false; btn.textContent = 'Submit Vote'; }
        }
    }

    async _saveMemberEvaluation(groupIndex, memberName, form = null) {
        const voter = this._getVoter();
        if (voter === 'unknown') return;

        const isSelf = voter.toLowerCase().trim() === memberName.toLowerCase().trim();
        if (isSelf) {
            alert('You cannot rate yourself.');
            return;
        }

        const scores = Object.create(null);
        if (!form) {
            const memberIndex = this._getSortedMembers(groupIndex).findIndex(member => member === memberName);
            form = this.el.grid.querySelector(`.member-eval-form[data-group="${groupIndex}"][data-member-index="${memberIndex}"]`);
        }
        if (!form) return;

        this.rubric.criteria.forEach((c, ci) => {
            const container = form.querySelector(`.star-rating[data-group="${groupIndex}"][data-criterion="${ci}"]`);
            const selected = container ? container.querySelector('.star-btn.selected') : null;
            scores[c.name] = selected ? parseInt(selected.dataset.score) : 0;
        });

        const saveBtn = form.querySelector('.save-member-btn');
        if (saveBtn) { saveBtn.disabled = true; saveBtn.textContent = 'Saving...'; }

        try {
            const result = this.scoring.calculate(scores);

            const remoteSaved = await this.storage.remote.saveMemberEvaluation(groupIndex, memberName, scores, result.totalRaw, result.totalWeighted, result.grade, voter);
            if (!remoteSaved) {
                if (saveBtn) { saveBtn.disabled = false; saveBtn.textContent = 'Submit Rating'; }
                return;
            }
            const localSaved = this.evaluations.saveMember(groupIndex, memberName, scores, result.totalRaw, result.totalWeighted, result.grade, voter);
            if (!localSaved) {
                if (saveBtn) { saveBtn.disabled = false; saveBtn.textContent = 'Submit Rating'; }
                return;
            }
            localStorage.setItem('pbEvals', JSON.stringify(this.evaluations.toJSON()));

            let voters = window.app.storage.loadVoters();
            const vl = voter.toLowerCase();
            let v = voters.find(x => x.name.toLowerCase() === vl);
            if (!v) {
                voters.push({ name: voter, hasVoted: false, votedCount: 0, ratedGroups: [], ratedMembers: [], loggedIn: false });
                v = voters[voters.length - 1];
            }
            const ratedMembers = new Set(v.ratedMembers || []);
            ratedMembers.add(`${groupIndex}:${memberName}`);
            v.ratedMembers = [...ratedMembers];
            window.app.storage.saveVoters(voters);
            window.app.voters = voters;

            if (saveBtn) saveBtn.textContent = '✓ Saved';
            this.buildGrid();
            if (window.app.resultsPanel) window.app.resultsPanel.showPasswordPrompt();
        } catch (e) {
            if (saveBtn) { saveBtn.disabled = false; saveBtn.textContent = 'Submit Rating'; }
        }
    }

    async _clearEvaluation(groupIndex) {
        const voter = this._getVoter();
        if (voter === 'unknown') return;
        const group = this.groups.get(groupIndex);
        if (!confirm(`Clear your ratings for ${group ? group.name : `Group ${groupIndex + 1}`}?`)) return;

        await this.storage.remote.deleteEvaluation(groupIndex, voter);
        this.evaluations.deleteGroup(groupIndex, voter);
        localStorage.setItem('pbEvals', JSON.stringify(this.evaluations.toJSON()));

        let voters = window.app.storage.loadVoters();
        const v = voters.find(x => x.name.toLowerCase() === voter.toLowerCase());
        if (v && v.ratedGroups) {
            v.ratedGroups = v.ratedGroups.filter(gi => gi !== groupIndex);
            v.votedCount = v.ratedGroups.length;
            if (v.ratedGroups.length === 0) v.hasVoted = false;
            window.app.storage.saveVoters(voters);
            window.app.voters = voters;
        }

        const body = document.getElementById(`eval-body-${groupIndex}`);
        if (body) {
            body.querySelectorAll('.star-btn').forEach(b => b.classList.remove('selected'));
        }

        this._refreshDeleteButton(groupIndex);
        if (window.app.resultsPanel) window.app.resultsPanel.showPasswordPrompt();
        if (window.app._renderVoters) window.app._renderVoters();
    }

    _refreshDeleteButton(groupIndex) {
        const body = document.getElementById(`eval-body-${groupIndex}`);
        if (!body) return;
        const container = body.querySelector('.save-group-btn').parentNode;
        const existingDelete = container.querySelector('.delete-eval-btn');
        const voter = this._getVoter();
        const hasEval = this.evaluations.getGroupEval(groupIndex, voter) !== null;

        if (hasEval && !existingDelete) {
            const delBtn = document.createElement('button');
            delBtn.className = 'btn btn-danger delete-eval-btn';
            delBtn.style.cssText = 'flex:0 0 auto; padding:10px 16px; font-size:13px; width:auto;';
            delBtn.dataset.group = groupIndex;
            delBtn.textContent = 'Delete';
            delBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                this._clearEvaluation(groupIndex);
            });
            container.appendChild(delBtn);
        } else if (!hasEval && existingDelete) {
            existingDelete.remove();
        }
    }

    async _enableReVote(groupIndex) {
        const voter = this._getVoter();
        if (voter === 'unknown') return;
        await this.storage.remote.deleteEvaluation(groupIndex, voter);
        this.evaluations.deleteGroup(groupIndex, voter);
        localStorage.setItem('pbEvals', JSON.stringify(this.evaluations.toJSON()));
        this.buildGrid();
    }

    _escapeHtml(str) {
        return SafeHtml.escapeText(str);
    }

    _getSortedMembers(groupIndex) {
        return this.groups.getMemberList(groupIndex).sort((a, b) => a.localeCompare(b));
    }
}
