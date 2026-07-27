class ResultsPanel {
    constructor(authService, groups, evaluations, exportService) {
        this.auth = authService;
        this.groups = groups;
        this.evaluations = evaluations;
        this.exportService = exportService;
        this.mode = 'group';

        this.el = {
            resultsContent: document.getElementById('resultsContent'),
            classStats: document.getElementById('classStats')
        };
    }

    showPasswordPrompt(freshEvals = null) {
        this.render(freshEvals);
    }

    render(freshEvals = null) {
        const evals = freshEvals || this.evaluations;

        const toggleHtml = `<div class="segmented-control" role="group" aria-label="Results view">
            <button type="button" class="results-mode-btn segment-btn" data-mode="group" aria-pressed="${this.mode === 'group'}">Group results</button>
            <button type="button" class="results-mode-btn segment-btn" data-mode="member" aria-pressed="${this.mode === 'member'}">Individual results</button>
        </div>`;

        if (this.mode === 'member') {
            this._renderMemberResults(evals, toggleHtml);
        } else {
            this._renderGroupResults(evals, toggleHtml);
        }

        this.el.resultsContent.querySelectorAll('.results-mode-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                this.mode = btn.dataset.mode;
                this.render();
            });
        });
    }

    _renderGroupResults(evals, toggleHtml) {
        const safe = SafeHtml.escapeText;
        const aggregated = evals.getAggregatedByGroup();
        const allEntries = evals.getAllEntries();

        if (aggregated.length === 0) {
            this.el.resultsContent.innerHTML = toggleHtml + '<div class="empty-state"><p>No group votes yet.</p><p>Submitted group evaluations will appear here.</p></div>';
            this.el.classStats.innerHTML = '';
            return;
        }

        aggregated.sort((a, b) => b.totalWeighted - a.totalWeighted);

        let html = toggleHtml;
        html += `<div class="table-scroll" role="region" aria-label="Group evaluation results" tabindex="0">
            <table class="results-table">
            <thead><tr><th scope="col">#</th><th scope="col">Group</th><th scope="col">Total raw</th><th scope="col">Final weighted %</th><th scope="col">Voters</th><th scope="col">Actions</th></tr></thead><tbody>`;

        aggregated.forEach((r, i) => {
            const rankClass = i < 3 ? `rank-${i + 1}` : '';
            const group = this.groups.get(r.groupIndex);
            const groupName = group ? group.name : `Group ${r.groupIndex + 1}`;
            html += `<tr class="${rankClass}">
                <td>${i + 1}</td>
                <td><strong>${safe(groupName)}</strong></td>
                <td>${safe(r.totalRaw)}</td>
                <td>${safe(r.totalWeighted)}%</td>
                <td>${safe(r.scoreCount)}</td>
                <td>
                    <button type="button" class="btn btn-sm toggle-stats-btn" data-result-index="${i}" aria-expanded="false" aria-controls="stats-row-${i}">Show statistics</button>
                    <button type="button" class="btn btn-danger delete-eval-btn" data-result-index="${i}">Clear group votes</button>
                </td>
            </tr>`;
            html += `<tr id="stats-row-${i}" style="display:none;"><td colspan="6" style="padding:12px;background:#f8fafc;">
                <div style="font-size:12px;font-weight:600;color:#475569;margin-bottom:8px;">Average Scores per Criterion</div>
                <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:6px;">`;
            const rubric = window.app ? window.app.rubric : null;
            for (const [crit, avg] of Object.entries(r.scores)) {
                const critConfig = rubric ? rubric.criteria.find(c => c.name === crit) : null;
                const weight = critConfig ? critConfig.weight : '';
                html += `<div style="background:#fcfcfd;border:1px solid #e2e8f0;border-radius:8px;padding:8px;">
                    <div style="font-size:11px;color:#64748b;">${safe(crit)}${weight ? ` (${safe(weight)}%)` : ''}</div>
                    <div style="font-size:15px;font-weight:700;color:#1e293b;">${safe(avg)}</div>
                </div>`;
            }
            html += `</div></td></tr>`;
        });
        html += `</tbody></table></div>`;
        this.el.resultsContent.innerHTML = html;

        this.el.resultsContent.querySelectorAll('.toggle-stats-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const resultIndex = parseInt(btn.dataset.resultIndex);
                const row = document.getElementById(`stats-row-${resultIndex}`);
                if (row) {
                    const isVisible = row.style.display !== 'none';
                    row.style.display = isVisible ? 'none' : 'table-row';
                    btn.textContent = isVisible ? 'Show statistics' : 'Hide statistics';
                    btn.setAttribute('aria-expanded', isVisible ? 'false' : 'true');
                }
            });
        });

        this.el.resultsContent.querySelectorAll('.delete-eval-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const result = aggregated[parseInt(btn.dataset.resultIndex)];
                if (result) this._deleteEvaluation(result.groupIndex);
            });
        });

        this._renderStats(aggregated, allEntries);
    }

    _renderMemberResults(evals, toggleHtml) {
        const safe = SafeHtml.escapeText;
        const allMembers = evals.getAggregatedByMember();

        if (allMembers.length === 0) {
            this.el.resultsContent.innerHTML = toggleHtml + '<div class="empty-state"><p>No individual votes yet.</p><p>Submitted individual evaluations will appear here.</p></div>';
            this.el.classStats.innerHTML = '';
            return;
        }

        allMembers.sort((a, b) => b.totalWeighted - a.totalWeighted);

        let html = toggleHtml;
        html += `<div class="table-scroll" role="region" aria-label="Individual evaluation results" tabindex="0">
            <table class="results-table">
            <thead><tr><th scope="col">#</th><th scope="col">Name</th><th scope="col">Group</th><th scope="col">Final weighted %</th><th scope="col">Grade</th><th scope="col">Voters</th><th scope="col">Actions</th></tr></thead><tbody>`;

        allMembers.forEach((r, i) => {
            const rankClass = i < 3 ? `rank-${i + 1}` : '';
            const group = this.groups.get(r.groupIndex);
            const groupName = group ? group.name : `Group ${r.groupIndex + 1}`;
            const grade = window.app && window.app.scoring ? window.app.scoring.getGrade(r.totalWeighted) : '';
            html += `<tr class="${rankClass}">
                <td>${i + 1}</td>
                <td><strong>${safe(r.memberName)}</strong></td>
                <td>${safe(groupName)}</td>
                <td>${safe(r.totalWeighted)}%</td>
                <td><span class="grade-badge">${safe(grade)}</span></td>
                <td>${safe(r.scoreCount)}</td>
                <td>
                    <button type="button" class="btn btn-sm toggle-member-stats-btn" data-result-index="${i}" aria-expanded="false" aria-controls="member-stats-row-${i}">Show statistics</button>
                    <button type="button" class="btn btn-danger delete-member-btn" data-result-index="${i}">Clear individual votes</button>
                </td>
            </tr>`;
            html += `<tr id="member-stats-row-${i}" style="display:none;"><td colspan="7" style="padding:12px;background:#f8fafc;">
                <div style="font-size:12px;font-weight:600;color:#475569;margin-bottom:8px;">Average Scores per Criterion</div>
                <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:6px;">`;
            const rubric = window.app ? window.app.rubric : null;
            for (const [crit, avg] of Object.entries(r.scores)) {
                const critConfig = rubric ? rubric.criteria.find(c => c.name === crit) : null;
                const weight = critConfig ? critConfig.weight : '';
                html += `<div style="background:#fcfcfd;border:1px solid #e2e8f0;border-radius:8px;padding:8px;">
                    <div style="font-size:11px;color:#64748b;">${safe(crit)}${weight ? ` (${safe(weight)}%)` : ''}</div>
                    <div style="font-size:15px;font-weight:700;color:#1e293b;">${safe(avg)}</div>
                </div>`;
            }
            html += `</div></td></tr>`;
        });
        html += `</tbody></table></div>`;
        this.el.resultsContent.innerHTML = html;

        this.el.resultsContent.querySelectorAll('.toggle-member-stats-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const resultIndex = parseInt(btn.dataset.resultIndex);
                const row = document.getElementById(`member-stats-row-${resultIndex}`);
                if (row) {
                    const isVisible = row.style.display !== 'none';
                    row.style.display = isVisible ? 'none' : 'table-row';
                    btn.textContent = isVisible ? 'Show statistics' : 'Hide statistics';
                    btn.setAttribute('aria-expanded', isVisible ? 'false' : 'true');
                }
            });
        });

        this.el.resultsContent.querySelectorAll('.delete-member-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const member = allMembers[parseInt(btn.dataset.resultIndex)];
                if (member) this._deleteMemberEvaluation(member.groupIndex, member.memberName);
            });
        });

        this._renderMemberStats(allMembers);
    }

    _renderStats(aggregated, allEntries) {
        const totalVotes = allEntries.length;
        const uniqueVoters = new Set(allEntries.map(e => e.voter)).size;
        const groupsRated = aggregated.length;
        const totalGroups = this.groups.size();
        const avgWeighted = aggregated.length > 0 ? (aggregated.reduce((s, r) => s + r.totalWeighted, 0) / aggregated.length).toFixed(1) : 0;
        const highest = aggregated.length > 0 ? Math.max(...aggregated.map(r => r.totalWeighted)) : 0;
        const lowest = aggregated.length > 0 ? Math.min(...aggregated.map(r => r.totalWeighted)) : 0;

        this.el.classStats.innerHTML = `
            <div class="score-display">
                <div class="score-box blue"><div class="score-value">${groupsRated}/${totalGroups}</div><div class="score-label">Groups Rated</div></div>
                <div class="score-box green"><div class="score-value">${totalVotes}</div><div class="score-label">Total Votes</div></div>
                <div class="score-box" style="background:linear-gradient(135deg,#8b5cf6,#6d28d9);"><div class="score-value">${uniqueVoters}</div><div class="score-label">Total Voters</div></div>
                <div class="score-box"><div class="score-value">${avgWeighted}%</div><div class="score-label">Class Avg</div></div>
                <div class="score-box orange"><div class="score-value">${highest}%</div><div class="score-label">Highest</div></div>
            </div>`;
    }

    _renderMemberStats(allMembers) {
        const totalMembers = allMembers.length;
        const totalVotes = allMembers.reduce((s, r) => s + r.scoreCount, 0);
        const avgWeighted = totalMembers > 0 ? (allMembers.reduce((s, r) => s + r.totalWeighted, 0) / totalMembers).toFixed(1) : 0;
        const highest = totalMembers > 0 ? Math.max(...allMembers.map(r => r.totalWeighted)) : 0;

        this.el.classStats.innerHTML = `
            <div class="score-display">
                <div class="score-box purple"><div class="score-value">${totalMembers}</div><div class="score-label">Members Rated</div></div>
                <div class="score-box green"><div class="score-value">${totalVotes}</div><div class="score-label">Total Votes</div></div>
                <div class="score-box"><div class="score-value">${avgWeighted}%</div><div class="score-label">Avg Score</div></div>
                <div class="score-box orange"><div class="score-value">${highest}%</div><div class="score-label">Highest</div></div>
            </div>`;
    }

    async _deleteEvaluation(groupIndex) {
        const group = this.groups.get(groupIndex);
        if (!confirm(`Clear all group votes for ${group ? group.name : `Group ${groupIndex + 1}`}?`)) return;
        const result = await this.storage.deleteGroupEvaluationsResult(
            groupIndex,
            null,
            this._groupSnapshot(groupIndex),
            this._rosterRevision()
        );
        if (!this._applyGuardedDeleteResult(result)) return;
        this._recordResultsMutation();
        this.render();
        this._announce('Group votes cleared.', 'success');
    }

    async _deleteMemberEvaluation(groupIndex, memberName) {
        const group = this.groups.get(groupIndex);
        if (!confirm(`Clear all individual votes for ${memberName} in ${group ? group.name : `Group ${groupIndex + 1}`}?`)) return;
        const result = await this.storage.deleteMemberEvaluationsResult(
            groupIndex,
            memberName,
            null,
            this._groupSnapshot(groupIndex),
            this._rosterRevision()
        );
        if (!this._applyGuardedDeleteResult(result)) return;
        this._recordResultsMutation();
        this.render();
        this._announce('Individual votes cleared.', 'success');
    }

    setStorage(storage) {
        this.storage = storage;
    }

    async clearAll() {
        if (!confirm('Clear all group and individual evaluations? This cannot be undone.')) return;
        const cleared = await this.storage.clearAllEvaluations();
        if (!cleared) return this._showClearError();
        this.evaluations.clearAll();
        this._recordResultsMutation();
        this.render();
        this._announce('All evaluations cleared.', 'success');
    }

    _updatedEvaluations(update) {
        const updated = new EvaluationCollection(this.groups).fromJSON(this.evaluations.toJSON());
        update(updated);
        return updated;
    }

    _recordResultsMutation() {
        if (window.app && typeof window.app._markResultsMutation === 'function') {
            window.app._markResultsMutation();
        }
        if (window.app && typeof window.app._syncVoterRosterFromEvaluations === 'function') {
            window.app._syncVoterRosterFromEvaluations({ persistRemote: true });
        }
    }

    _showClearError() {
        this._announce('Could not clear results. Please try again.', 'error');
    }

    _groupSnapshot(groupIndex) {
        const group = this.groups.get(groupIndex);
        return group ? { name: group.name, members: group.members } : null;
    }

    _rosterRevision() {
        return window.app && Number.isSafeInteger(window.app.rosterRevision)
            ? window.app.rosterRevision
            : (this.storage && typeof this.storage.getRosterRevision === 'function' ? this.storage.getRosterRevision() : 0);
    }

    _applyGuardedDeleteResult(result) {
        if (result && result.state && window.app && typeof window.app._applyFullState === 'function') {
            window.app._applyFullState({ available: true, data: result.state }, { source: 'results-delete' });
        } else if (result && result.ok && result.state) {
            this.evaluations.fromJSON(result.state.evaluations);
        }
        if (result && result.ok) return true;
        this._announce(result && (result.error === 'stale-roster-revision' || result.error === 'stale-group-index')
            ? 'The roster changed on another device. The latest state was loaded; please retry.'
            : 'Could not clear results. Please try again.', 'error');
        return false;
    }

    exportCSV() {
        if (this.evaluations.size() === 0) {
            this._announce('There is no evaluation data to export yet.', 'warning');
            return;
        }
        this.exportService.download();
    }

    _announce(message, type = 'info') {
        if (window.app && typeof window.app.showStatus === 'function') window.app.showStatus(message, type);
        else if (typeof alert === 'function') alert(message);
    }
}
