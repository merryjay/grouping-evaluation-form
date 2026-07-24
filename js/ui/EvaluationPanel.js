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

        if (this.rubric.criteria.length === 0) {
            this.el.grid.innerHTML = '<div class="card empty-state"><p>Please set up your rubric first.</p></div>';
            return;
        }
        if (this.groups.size() === 0) {
            this.el.grid.innerHTML = '<div class="card empty-state"><p>Please add groups first.</p></div>';
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
            const evalData = this.evaluations.get(actualIndex) || {};
            const memberList = this.groups.getMemberList(actualIndex);

            html += `<div class="group-card" id="group-card-${actualIndex}">`;
            html += `<div class="eval-toggle" data-target="${actualIndex}" style="cursor:pointer;">`;
            html += `<div style="display:flex; justify-content:space-between; align-items:center;">`;
            html += `<div class="group-name" style="font-size:16px; font-weight:700; color:#1e293b;">${this._escapeHtml(group.name)}</div>`;
            html += `<div style="display:flex; align-items:center; gap:8px;">`;
            if (evalData.scores) {
                html += `<span class="grade-badge grade-${evalData.grade.charAt(0)}" style="font-size:11px; padding:4px 10px;">${evalData.grade} — ${evalData.totalWeighted}%</span>`;
            }
            html += `<span class="eval-toggle-icon" style="font-size:14px; color:#94a3b8;">&#9660;</span>`;
            html += `</div></div>`;
            html += `<div style="font-size:12px; color:#94a3b8; margin-top:4px;">${memberList.length} member${memberList.length !== 1 ? 's' : ''}</div>`;
            html += `</div>`;

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
                if (currentScore > 0) {
                    html += `<div class="rating-label" style="color:#27ae60; font-weight:600; margin-top:4px;">${currentScore} - ${scoreLabel}</div>`;
                }
                html += `</div>`;
            });

            html += `</div>`;
            html += `<div style="display:flex; gap:8px; margin-top:12px;">`;
            html += `<button class="save-group-btn" data-group-index="${actualIndex}" style="flex:1;">Save Evaluation</button>`;
            if (evalData.scores) {
                html += `<button class="btn btn-danger delete-eval-btn" data-group="${actualIndex}" style="flex:0 0 auto; padding:10px 16px; font-size:13px; width:auto;">Delete</button>`;
            }
            html += `</div></div></div></div>`;
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
                this._saveEvaluation(parseInt(btn.dataset.groupIndex));
            });
        });

        this.el.grid.querySelectorAll('.delete-eval-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                this._clearEvaluation(parseInt(btn.dataset.group));
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

    _saveEvaluation(groupIndex) {
        const scores = {};
        this.rubric.criteria.forEach((c, ci) => {
            const container = this.el.grid.querySelector(`.star-rating[data-group="${groupIndex}"][data-criterion="${ci}"]`);
            const selected = container ? container.querySelector('.star-btn.selected') : null;
            scores[c.name] = selected ? parseInt(selected.dataset.score) : 0;
        });

        const result = this.scoring.calculate(scores);
        this.evaluations.save(groupIndex, scores, result.totalRaw, result.totalWeighted, result.grade);
        this.storage.saveEvaluations(this.evaluations.toJSON());

        const group = this.groups.get(groupIndex);
        alert(`${group ? group.name : `Group ${groupIndex + 1}`} evaluation saved!`);

        const card = document.getElementById(`group-card-${groupIndex}`);
        if (card) {
            const existingBadge = card.querySelector('.grade-badge');
            const badgeContainer = card.querySelector('.eval-toggle > div > div:last-child');
            if (badgeContainer) {
                if (existingBadge) existingBadge.remove();
                const badge = document.createElement('span');
                badge.className = `grade-badge grade-${result.grade.charAt(0)}`;
                badge.style.cssText = 'font-size:11px; padding:4px 10px;';
                badge.textContent = `${result.grade} — ${result.totalWeighted}%`;
                badgeContainer.insertBefore(badge, badgeContainer.firstChild);
            }
        }

        this._refreshDeleteButton(groupIndex);
    }

    _clearEvaluation(groupIndex) {
        if (!confirm(`Clear ratings for ${this.groups.get(groupIndex).name}?`)) return;

        this.evaluations.delete(groupIndex);
        this.storage.saveEvaluations(this.evaluations.toJSON());

        const body = document.getElementById(`eval-body-${groupIndex}`);
        if (body) {
            body.querySelectorAll('.star-btn').forEach(b => b.classList.remove('selected'));
            body.querySelectorAll('.rating-label').forEach(l => l.remove());
        }

        const card = document.getElementById(`group-card-${groupIndex}`);
        if (card) {
            const badge = card.querySelector('.grade-badge');
            if (badge) badge.remove();
        }

        this._refreshDeleteButton(groupIndex);
        alert('Ratings cleared.');
    }

    _refreshDeleteButton(groupIndex) {
        const body = document.getElementById(`eval-body-${groupIndex}`);
        if (!body) return;
        const container = body.querySelector('.save-group-btn').parentNode;
        const existingDelete = container.querySelector('.delete-eval-btn');
        const hasEval = this.evaluations.get(groupIndex) !== null;

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

    _escapeHtml(str) {
        const div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    }
}
