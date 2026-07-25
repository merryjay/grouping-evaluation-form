class EvaluationPanel {
    constructor(rubricConfig, groups, evaluations, scoringService, storageService) {
        this.rubric = rubricConfig;
        this.groups = groups;
        this.evaluations = evaluations;
        this.scoring = scoringService;
        this.storage = storageService;
        this.selectedGroupIndex = null;

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
            let evalData = this.evaluations.get(actualIndex) || {};
            if (!window.app || !window.app.isTeacher) evalData = {};
            const memberList = this.groups.getMemberList(actualIndex);
            const voter = window.app && window.app.currentVoter;
            const isOwnGroup = window.app && !window.app.isTeacher && window.app.voterGroupIndex === actualIndex;
            const hasVoted = voter && !window.app.isTeacher && this.evaluations.get(actualIndex, voter);

            html += `<div class="group-card" id="group-card-${actualIndex}" style="${isOwnGroup ? 'opacity:0.7;' : ''}">`;
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
                html += `<div class="rating-section">`;
                html += `<div style="display:grid; grid-template-columns:repeat(auto-fill,minmax(280px,1fr)); gap:10px;">`;

                this.rubric.criteria.forEach((c, ci) => {
                    const currentScore = evalData.scores ? evalData.scores[c.name] : 0;
                    const scoreLabel = currentScore > 0 ? labels[currentScore - 1] : '';
                    html += `<div style="background:#f8fafc; border:1px solid #f1f5f9; border-radius:10px; padding:10px;">`;
                    html += `<div style="font-size:12px; font-weight:600; color:#475569; margin-bottom:6px;">${this._escapeHtml(c.name)} <span style="color:#94a3b8; font-weight:400;">(${c.weight}%)</span></div>`;
                    html += `<div class="star-rating" data-group="${actualIndex}" data-criterion="${ci}">`;
                    for (let s = 1; s <= this.rubric.maxScore; s++) {
                        const selectedClass = s === currentScore ? 'selected' : '';
                        html += `<button class="star-btn ${selectedClass}" data-score="${s}">${s}</button>`;
                    }
                    html += `</div>`;
                    html += `</div>`;
                });

                html += `</div>`;
                html += `<div style="display:flex; gap:8px; margin-top:12px;">`;
                html += `<button class="save-group-btn" data-group-index="${actualIndex}" style="flex:1;">Submit Vote</button>`;
                if (evalData.scores && window.app && window.app.isTeacher) {
                    html += `<button class="btn btn-danger delete-eval-btn" data-group="${actualIndex}" style="flex:0 0 auto; padding:10px 16px; font-size:13px; width:auto;">Delete</button>`;
                }
                html += `</div></div>`;
            }
            html += `</div></div>`;
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

        this.el.grid.querySelectorAll('.delete-eval-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                this._clearEvaluation(parseInt(btn.dataset.group));
                this.buildGrid();
            });
        });

        this.el.grid.querySelectorAll('.change-vote-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const groupIndex = parseInt(btn.dataset.group);
                this._enableReVote(groupIndex);
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
            const scores = {};
            this.rubric.criteria.forEach((c, ci) => {
                const container = this.el.grid.querySelector(`.star-rating[data-group="${groupIndex}"][data-criterion="${ci}"]`);
                const selected = container ? container.querySelector('.star-btn.selected') : null;
                scores[c.name] = selected ? parseInt(selected.dataset.score) : 0;
            });
            const result = this.scoring.calculate(scores);

            await this.storage.pb.saveEvaluation(groupIndex, scores, result.totalRaw, result.totalWeighted, result.grade, voter);

            this.evaluations.save(groupIndex, scores, result.totalRaw, result.totalWeighted, result.grade, voter);
            localStorage.setItem('pbEvals', JSON.stringify(this.evaluations.toJSON()));

            let voters = window.app.storage.loadVoters();
            const vl = voter.toLowerCase();
            let v = voters.find(x => x.name.toLowerCase() === vl);
            if (!v) {
                voters.push({ name: voter, hasVoted: false, votedCount: 0, ratedGroups: [], loggedIn: false });
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

    async _clearEvaluation(groupIndex) {
        const voter = this._getVoter();
        if (voter === 'unknown') return;
        const group = this.groups.get(groupIndex);
        if (!confirm(`Clear your ratings for ${group ? group.name : `Group ${groupIndex + 1}`}?`)) return;

        await this.storage.pb.deleteEvaluation(groupIndex, voter);
        this.evaluations.delete(groupIndex, voter);
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
        const hasEval = this.evaluations.get(groupIndex, voter) !== null;

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
        await this.storage.pb.deleteEvaluation(groupIndex, voter);
        this.evaluations.delete(groupIndex, voter);
        localStorage.setItem('pbEvals', JSON.stringify(this.evaluations.toJSON()));
        this.buildGrid();
    }

    _escapeHtml(str) {
        const div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    }
}
