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
        if (selectedGroupIndex !== null && !this.groups.get(selectedGroupIndex)) selectedGroupIndex = null;
        this.selectedGroupIndex = selectedGroupIndex;

        if (selectedGroupIndex !== null) {
            this.el.grid.className = '';
        } else {
            this.el.grid.className = 'eval-list';
        }

        if (this.rubric.criteria.length === 0 || this.groups.size() === 0) {
            this.el.grid.innerHTML = '<div class="card empty-state"><p style="font-size:18px; font-weight:600;">Evaluation is not ready yet</p><p>The teacher has not set up the rubric or groups. Please check back later.</p></div>';
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
                <button class="btn btn-secondary" id="backToAllGroups" style="width:auto; padding:8px 16px; font-size:13px;">&larr; Back to All Groups</button>
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
        return `<div class="segmented-control" role="group" aria-label="Evaluation mode">
            <button type="button" class="eval-mode-btn segment-btn" data-mode="group" aria-pressed="${this.mode === 'group'}">Rate by group</button>
            <button type="button" class="eval-mode-btn segment-btn" data-mode="member" aria-pressed="${this.mode === 'member'}">Rate by person</button>
        </div>`;
    }

    _buildGroupCard(actualIndex, group, memberList, voter, isOwnGroup, labels) {
        const hasVoted = voter && !window.app.isTeacher && this.evaluations.hasGroupCompletion(actualIndex, voter);
        let html = `<div class="group-card" id="group-card-${actualIndex}">`;
        html += `<button type="button" class="eval-toggle disclosure-btn" data-target="${actualIndex}" aria-expanded="false" aria-controls="eval-body-${actualIndex}" ${isOwnGroup || hasVoted ? 'disabled' : ''}>`;
        html += `<div style="display:flex; justify-content:space-between; align-items:center;">`;
        html += `<div class="group-name" style="font-size:16px; font-weight:700; color:#1e293b;">${this._escapeHtml(group.name)}${isOwnGroup ? ' <span style="font-size:10px;color:#e74c3c;font-weight:600;background:#fee2e2;padding:2px 8px;border-radius:10px;margin-left:6px;">YOUR GROUP</span>' : ''}${hasVoted ? ' <span style="font-size:10px;color:#059669;font-weight:600;background:#d1fae5;padding:2px 8px;border-radius:10px;margin-left:6px;">✓ VOTED</span>' : ''}</div>`;
        html += `<div style="display:flex; align-items:center; gap:8px;">`;
        if (!isOwnGroup && !hasVoted) {
            html += `<span class="eval-toggle-icon" aria-hidden="true" style="font-size:13px; color:#94a3b8;">Show</span>`;
        }
        html += `</div></div>`;
        html += `<div style="font-size:12px; color:#94a3b8; margin-top:4px;">${memberList.length} member${memberList.length !== 1 ? 's' : ''}</div>`;
        html += `</button>`;

        if (isOwnGroup) {
            html += `<div style="padding:14px;text-align:center;color:#94a3b8;font-size:13px;">You cannot rate your own group.</div>`;
        } else if (hasVoted) {
            html += `<div style="padding:14px;text-align:center;">
                <p style="color:#059669;font-size:15px;font-weight:600;">Vote submitted for this group.</p>
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
        html += `<button type="button" class="member-toggle disclosure-btn" data-target="${actualIndex}" aria-expanded="false" aria-controls="member-body-${actualIndex}">`;
        html += `<div style="display:flex; justify-content:space-between; align-items:center;">`;
        html += `<div class="group-name" style="font-size:16px; font-weight:700; color:#1e293b;">${this._escapeHtml(group.name)}${isOwnGroup ? ' <span style="font-size:10px;color:#e74c3c;font-weight:600;background:#fee2e2;padding:2px 8px;border-radius:10px;margin-left:6px;">YOUR GROUP</span>' : ''}</div>`;
        html += `<span style="font-size:12px; color:#94a3b8;">${memberList.length} member${memberList.length !== 1 ? 's' : ''}</span>`;
        html += `</div></button>`;

        html += `<div class="member-body" id="member-body-${actualIndex}" style="display:none; margin-top:12px;">`;
        html += `<div style="border-top:1px solid #f1f5f9; padding-top:12px;">`;
        html += `<h4 style="font-size:11px; text-transform:uppercase; color:#94a3b8; margin-bottom:10px; font-weight:600; letter-spacing:1px;">Select a member to rate</h4>`;
        html += `<div style="display:flex; flex-direction:column; gap:6px;">`;

        memberList.forEach((m, mi) => {
            const isSelf = voter && m.toLowerCase().trim() === voter.toLowerCase().trim();
            const hasRated = voter && this.evaluations.hasMemberCompletion(actualIndex, m, voter);
            const encName = this._escapeHtml(m);
            html += `<button type="button" class="member-rating-row" data-group="${actualIndex}" data-member-index="${mi}" ${isSelf || hasRated ? 'disabled' : ''} aria-controls="member-eval-${actualIndex}-${mi}" aria-expanded="false" style="display:flex; align-items:center; gap:8px; padding:8px;">
                <span style="font-size:13px; font-weight:600; color:#475569; flex:1;">${mi + 1}. ${encName}</span>
                ${isSelf ? '<span style="font-size:10px;color:#94a3b8;">You</span>' : ''}
                ${hasRated ? '<span style="font-size:10px;color:#059669;font-weight:600;">✓ Rated</span>' : '<span style="font-size:10px;color:#667eea;font-weight:600;">Rate</span>'}
            </button>`;
            html += `<div class="member-eval-form" id="member-eval-${actualIndex}-${mi}" style="display:none; margin-top:8px; padding:8px; background:#fcfcfd; border:1px solid #e2e8f0; border-radius:8px;" data-group="${actualIndex}" data-member-index="${mi}"></div>`;
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
            html += `<div class="criterion-score-card">`;
            html += `<div style="font-size:12px; font-weight:600; color:#475569; margin-bottom:6px;">${this._escapeHtml(c.name)}</div>`;
            html += `<div class="star-rating" role="group" aria-label="${this._escapeHtml(c.name)} score" data-group="${groupIndex}" data-criterion="${ci}">`;
            for (let s = 1; s <= this.rubric.maxScore; s++) {
                html += `<button type="button" class="star-btn" data-score="${s}" aria-label="${this._escapeHtml(c.name)}: ${s} of ${this.rubric.maxScore}" aria-pressed="false">${s}</button>`;
            }
            html += `</div>`;
            html += `</div>`;
        });
        html += `</div>`;
        html += `<p class="evaluation-progress" id="group-progress-${groupIndex}" role="status">0 of ${this.rubric.criteria.length} criteria scored</p><div style="display:flex; gap:8px; margin-top:12px;">`;
        html += `<button type="button" class="save-group-btn" data-group-index="${groupIndex}" style="flex:1;">Submit vote</button>`;
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
            html += `<div class="criterion-score-card">`;
            html += `<div style="font-size:12px; font-weight:600; color:#475569; margin-bottom:6px;">${this._escapeHtml(c.name)}</div>`;
            html += `<div class="star-rating" role="group" aria-label="${this._escapeHtml(c.name)} score for ${this._escapeHtml(memberName)}" data-group="${groupIndex}" data-criterion="${ci}">`;
            for (let s = 1; s <= this.rubric.maxScore; s++) {
                const selectedClass = s === currentScore ? 'selected' : '';
                html += `<button type="button" class="star-btn ${selectedClass}" data-score="${s}" aria-label="${this._escapeHtml(c.name)}: ${s} of ${this.rubric.maxScore}" aria-pressed="${s === currentScore}">${s}</button>`;
            }
            html += `</div>`;
            html += `</div>`;
        });
        html += `</div>`;
        html += `<div style="display:flex; gap:8px; margin-top:12px;">`;
        html += `<button type="button" class="save-member-btn" data-group="${groupIndex}" style="flex:1;">Submit rating</button>`;
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
                parent.querySelectorAll('.star-btn').forEach(b => { b.classList.remove('selected'); b.setAttribute('aria-pressed', 'false'); });
                btn.classList.add('selected');
                btn.setAttribute('aria-pressed', 'true');
                this._updateProgress(parseInt(parent.dataset.group));
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
                    const isVisible = body.style.display !== 'none';
                    body.style.display = isVisible ? 'none' : 'block';
                    el.setAttribute('aria-expanded', isVisible ? 'false' : 'true');
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
                parent.querySelectorAll('.star-btn').forEach(b => { b.classList.remove('selected'); b.setAttribute('aria-pressed', 'false'); });
                btn.classList.add('selected');
                btn.setAttribute('aria-pressed', 'true');
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
        const toggle = document.querySelector(`.eval-toggle[data-target="${groupIndex}"]`);
        if (toggle) toggle.setAttribute('aria-expanded', isVisible ? 'false' : 'true');
        if (icon) {
            icon.textContent = isVisible ? 'Show' : 'Hide';
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
                    parent.querySelectorAll('.star-btn').forEach(b => { b.classList.remove('selected'); b.setAttribute('aria-pressed', 'false'); });
                    btn.classList.add('selected');
                    btn.setAttribute('aria-pressed', 'true');
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
            const expectedGroup = this._groupSnapshot(groupIndex);
            const stateVersion = window.app && window.app._stateVersion;
            if (!this._isCurrentGroup(groupIndex, expectedGroup, stateVersion)) {
                if (btn) { btn.disabled = false; btn.textContent = 'Submit Vote'; }
                this.resetState();
                this.buildGrid();
                return;
            }
            if (window.app && !window.app.isTeacher && window.app.voterGroupIndex === groupIndex) {
                this._status('You cannot rate your own group.', 'warning');
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

            const remoteSaved = await this.storage.remote.saveEvaluation(groupIndex, scores, result.totalRaw, result.totalWeighted, result.grade, voter, expectedGroup);
            if (!remoteSaved) {
                if (btn) { btn.disabled = false; btn.textContent = 'Submit Vote'; }
                this._status('Your selections are still here, but the vote could not be saved. Please try again.', 'error');
                return;
            }
            if (!this._isCurrentGroup(groupIndex, expectedGroup, stateVersion)) {
                if (btn) { btn.disabled = false; btn.textContent = 'Submit Vote'; }
                this.resetState();
                this.buildGrid();
                return;
            }
            const localSaved = this.evaluations.saveGroup(groupIndex, scores, result.totalRaw, result.totalWeighted, result.grade, voter);
            if (!localSaved) {
                if (btn) { btn.disabled = false; btn.textContent = 'Submit Vote'; }
                this._status('Your selections are still here, but the vote could not be saved. Please try again.', 'error');
                return;
            }
            localStorage.setItem('pbEvals', JSON.stringify(this.evaluations.toJSON()));

            if (window.app && window.app._syncVoterRosterFromEvaluations) {
                window.app._syncVoterRosterFromEvaluations();
            }

            if (btn) { btn.disabled = false; btn.textContent = '✓ VOTED'; }
            this._status('Group vote saved.', 'success');
            this.buildGrid();
            if (window.app.resultsPanel) window.app.resultsPanel.showPasswordPrompt();
            if (window.app._renderVoters) window.app._renderVoters();
        } catch (e) {
            if (btn) { btn.disabled = false; btn.textContent = 'Submit Vote'; }
            this._status('Your selections are still here, but the vote could not be saved. Please try again.', 'error');
        }
    }

    async _saveMemberEvaluation(groupIndex, memberName, form = null) {
        const voter = this._getVoter();
        if (voter === 'unknown') return;

        const isSelf = voter.toLowerCase().trim() === memberName.toLowerCase().trim();
        if (isSelf) {
            this._status('You cannot rate yourself.', 'warning');
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
            const expectedGroup = this._groupSnapshot(groupIndex);
            const stateVersion = window.app && window.app._stateVersion;
            if (!this._isCurrentGroup(groupIndex, expectedGroup, stateVersion)) {
                if (saveBtn) { saveBtn.disabled = false; saveBtn.textContent = 'Submit Rating'; }
                this.resetState();
                this.buildGrid();
                return;
            }
            const result = this.scoring.calculate(scores);

            const remoteSaved = await this.storage.remote.saveMemberEvaluation(groupIndex, memberName, scores, result.totalRaw, result.totalWeighted, result.grade, voter, expectedGroup);
            if (!remoteSaved) {
                if (saveBtn) { saveBtn.disabled = false; saveBtn.textContent = 'Submit Rating'; }
                this._status('Your selections are still here, but the rating could not be saved. Please try again.', 'error');
                return;
            }
            if (!this._isCurrentGroup(groupIndex, expectedGroup, stateVersion)) {
                if (saveBtn) { saveBtn.disabled = false; saveBtn.textContent = 'Submit Rating'; }
                this.resetState();
                this.buildGrid();
                return;
            }
            const localSaved = this.evaluations.saveMember(groupIndex, memberName, scores, result.totalRaw, result.totalWeighted, result.grade, voter);
            if (!localSaved) {
                if (saveBtn) { saveBtn.disabled = false; saveBtn.textContent = 'Submit Rating'; }
                this._status('Your selections are still here, but the rating could not be saved. Please try again.', 'error');
                return;
            }
            localStorage.setItem('pbEvals', JSON.stringify(this.evaluations.toJSON()));

            if (window.app && window.app._syncVoterRosterFromEvaluations) {
                window.app._syncVoterRosterFromEvaluations();
            }

            if (saveBtn) saveBtn.textContent = '✓ Saved';
            this._status('Individual rating saved.', 'success');
            this.buildGrid();
            if (window.app.resultsPanel) window.app.resultsPanel.showPasswordPrompt();
        } catch (e) {
            if (saveBtn) { saveBtn.disabled = false; saveBtn.textContent = 'Submit Rating'; }
            this._status('Your selections are still here, but the rating could not be saved. Please try again.', 'error');
        }
    }

    async _clearEvaluation(groupIndex) {
        const voter = this._getVoter();
        if (voter === 'unknown') return;
        const group = this.groups.get(groupIndex);
        if (!confirm(`Clear your ratings for ${group ? group.name : `Group ${groupIndex + 1}`}?`)) return;

        const result = await this.storage.deleteGroupEvaluationsResult(
            groupIndex,
            voter,
            this._groupSnapshot(groupIndex),
            this._rosterRevision()
        );
        if (!this._applyGuardedDeleteResult(result)) return;

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
            delBtn.style.cssText = 'flex:0 0 auto; padding:8px 16px; font-size:13px; width:auto;';
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
        const result = await this.storage.deleteGroupEvaluationsResult(
            groupIndex,
            voter,
            this._groupSnapshot(groupIndex),
            this._rosterRevision()
        );
        if (!this._applyGuardedDeleteResult(result)) return;
        this.buildGrid();
    }

    _escapeHtml(str) {
        return SafeHtml.escapeText(str);
    }

    _getSortedMembers(groupIndex) {
        return this.groups.getMemberList(groupIndex).sort((a, b) => a.localeCompare(b));
    }

    resetState() {
        this.selectedGroupIndex = null;
    }

    _groupSnapshot(groupIndex) {
        const group = this.groups.get(groupIndex);
        return group ? { name: group.name, members: group.members } : null;
    }

    _isCurrentGroup(groupIndex, expectedGroup, stateVersion) {
        const group = this.groups.get(groupIndex);
        if (!group || !expectedGroup || group.name !== expectedGroup.name || group.members !== expectedGroup.members) return false;
        return !window.app || stateVersion === undefined || stateVersion === window.app._stateVersion;
    }

    _rosterRevision() {
        return window.app && Number.isSafeInteger(window.app.rosterRevision)
            ? window.app.rosterRevision
            : (this.storage && typeof this.storage.getRosterRevision === 'function' ? this.storage.getRosterRevision() : 0);
    }

    _applyGuardedDeleteResult(result) {
        if (result && result.state && window.app && typeof window.app._applyFullState === 'function') {
            window.app._applyFullState({ available: true, data: result.state }, { source: 'evaluation-delete' });
        } else if (result && result.ok && result.state) {
            this.evaluations.fromJSON(result.state.evaluations);
        }
        if (result && result.ok) return true;
        this._status(result && (result.error === 'stale-roster-revision' || result.error === 'stale-group-index')
            ? 'The roster changed on another device. The latest state was loaded; please retry.'
            : 'Could not clear this evaluation. Please try again.', 'error');
        return false;
    }

    _updateProgress(groupIndex) {
        const progress = document.getElementById(`group-progress-${groupIndex}`);
        if (!progress || !this.el || !this.el.grid || typeof this.el.grid.querySelectorAll !== 'function') return;
        const selected = this.el.grid.querySelectorAll(`.star-rating[data-group="${groupIndex}"] .star-btn.selected`).length;
        const total = this.rubric.criteria.length;
        progress.textContent = selected === total
            ? `All ${total} criteria scored. Ready to submit.`
            : `${selected} of ${total} criteria scored`;
        if (progress.classList) progress.classList.toggle('is-complete', selected === total);
    }

    _status(message, type = 'info') {
        const status = document.getElementById('evaluationStatus');
        if (status) {
            status.textContent = message;
            status.className = `weight-status ${type === 'success' ? 'is-valid' : type === 'error' ? 'is-invalid' : ''}`;
        }
        if (window.app && typeof window.app.showStatus === 'function') window.app.showStatus(message, type);
    }
}
