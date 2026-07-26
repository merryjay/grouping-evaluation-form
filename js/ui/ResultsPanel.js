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

        const toggleHtml = `<div style="display:flex; gap:8px; margin-bottom:16px; background:#f1f5f9; border-radius:12px; padding:4px;">
            <button class="results-mode-btn" data-mode="group" style="flex:1; padding:10px 16px; border:none; border-radius:8px; font-size:13px; font-weight:700; cursor:pointer; ${this.mode === 'group' ? 'background:white; color:#667eea; box-shadow:0 2px 8px rgba(0,0,0,0.1);' : 'background:transparent; color:#64748b;'}">Group Results</button>
            <button class="results-mode-btn" data-mode="member" style="flex:1; padding:10px 16px; border:none; border-radius:8px; font-size:13px; font-weight:700; cursor:pointer; ${this.mode === 'member' ? 'background:white; color:#667eea; box-shadow:0 2px 8px rgba(0,0,0,0.1);' : 'background:transparent; color:#64748b;'}">Individual Results</button>
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
            this.el.resultsContent.innerHTML = toggleHtml + '<div class="empty-state"><p>No evaluations yet.</p></div>';
            this.el.classStats.innerHTML = '';
            return;
        }

        aggregated.sort((a, b) => b.totalWeighted - a.totalWeighted);

        let html = toggleHtml;
        html += `<div style="overflow-x:auto; -webkit-overflow-scrolling:touch;">
            <table class="results-table">
            <tr><th>#</th><th>Group</th><th>Total Raw</th><th>Final Weighted %</th><th>Voters</th><th>Actions</th></tr>`;

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
                    <button class="btn btn-sm toggle-stats-btn" data-result-index="${i}" style="padding:4px 8px;font-size:10px;width:auto;margin-right:4px;background:#e2e8f0;border:none;border-radius:6px;cursor:pointer;">Stats</button>
                    <button class="btn btn-danger delete-eval-btn" data-result-index="${i}" style="padding:4px 8px;font-size:10px;width:auto">Clear</button>
                </td>
            </tr>`;
            html += `<tr id="stats-row-${i}" style="display:none;"><td colspan="6" style="padding:12px;background:#f8fafc;">
                <div style="font-size:12px;font-weight:600;color:#475569;margin-bottom:8px;">Average Scores per Criterion</div>
                <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:6px;">`;
            const rubric = window.app ? window.app.rubric : null;
            for (const [crit, avg] of Object.entries(r.scores)) {
                const critConfig = rubric ? rubric.criteria.find(c => c.name === crit) : null;
                const weight = critConfig ? critConfig.weight : '';
                html += `<div style="background:#fff;border:1px solid #e2e8f0;border-radius:6px;padding:6px 10px;">
                    <div style="font-size:11px;color:#64748b;">${safe(crit)}${weight ? ` (${safe(weight)}%)` : ''}</div>
                    <div style="font-size:14px;font-weight:700;color:#1e293b;">${safe(avg)}</div>
                </div>`;
            }
            html += `</div></td></tr>`;
        });
        html += `</table></div>`;
        this.el.resultsContent.innerHTML = html;

        this.el.resultsContent.querySelectorAll('.toggle-stats-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const resultIndex = parseInt(btn.dataset.resultIndex);
                const row = document.getElementById(`stats-row-${resultIndex}`);
                if (row) {
                    const isVisible = row.style.display !== 'none';
                    row.style.display = isVisible ? 'none' : 'table-row';
                    btn.textContent = isVisible ? 'Stats' : 'Hide';
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
            this.el.resultsContent.innerHTML = toggleHtml + '<div class="empty-state"><p>No individual evaluations yet.</p></div>';
            this.el.classStats.innerHTML = '';
            return;
        }

        allMembers.sort((a, b) => b.totalWeighted - a.totalWeighted);

        let html = toggleHtml;
        html += `<div style="overflow-x:auto; -webkit-overflow-scrolling:touch;">
            <table class="results-table">
            <tr><th>#</th><th>Name</th><th>Group</th><th>Final Weighted %</th><th>Grade</th><th>Voters</th><th>Actions</th></tr>`;

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
                    <button class="btn btn-sm toggle-member-stats-btn" data-result-index="${i}" style="padding:4px 8px;font-size:10px;width:auto;margin-right:4px;background:#e2e8f0;border:none;border-radius:6px;cursor:pointer;">Stats</button>
                    <button class="btn btn-danger delete-member-btn" data-result-index="${i}" style="padding:4px 8px;font-size:10px;width:auto">Clear</button>
                </td>
            </tr>`;
            html += `<tr id="member-stats-row-${i}" style="display:none;"><td colspan="7" style="padding:12px;background:#f8fafc;">
                <div style="font-size:12px;font-weight:600;color:#475569;margin-bottom:8px;">Average Scores per Criterion</div>
                <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:6px;">`;
            const rubric = window.app ? window.app.rubric : null;
            for (const [crit, avg] of Object.entries(r.scores)) {
                const critConfig = rubric ? rubric.criteria.find(c => c.name === crit) : null;
                const weight = critConfig ? critConfig.weight : '';
                html += `<div style="background:#fff;border:1px solid #e2e8f0;border-radius:6px;padding:6px 10px;">
                    <div style="font-size:11px;color:#64748b;">${safe(crit)}${weight ? ` (${safe(weight)}%)` : ''}</div>
                    <div style="font-size:14px;font-weight:700;color:#1e293b;">${safe(avg)}</div>
                </div>`;
            }
            html += `</div></td></tr>`;
        });
        html += `</table></div>`;
        this.el.resultsContent.innerHTML = html;

        this.el.resultsContent.querySelectorAll('.toggle-member-stats-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const resultIndex = parseInt(btn.dataset.resultIndex);
                const row = document.getElementById(`member-stats-row-${resultIndex}`);
                if (row) {
                    const isVisible = row.style.display !== 'none';
                    row.style.display = isVisible ? 'none' : 'table-row';
                    btn.textContent = isVisible ? 'Stats' : 'Hide';
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
        if (!confirm(`Clear ALL group votes for ${group ? group.name : `Group ${groupIndex + 1}`}?`)) return;
        this.evaluations.deleteGroup(groupIndex);
        localStorage.setItem('pbEvals', JSON.stringify(this.evaluations.toJSON()));
        await this.storage.remote.deleteEvaluation(groupIndex);
        this.render();
    }

    async _deleteMemberEvaluation(groupIndex, memberName) {
        const group = this.groups.get(groupIndex);
        if (!confirm(`Clear ALL votes for ${memberName} in ${group ? group.name : `Group ${groupIndex + 1}`}?`)) return;
        this.evaluations.deleteMember(groupIndex, memberName);
        localStorage.setItem('pbEvals', JSON.stringify(this.evaluations.toJSON()));
        await this.storage.remote.deleteMemberEvaluation(groupIndex, memberName);
        this.render();
    }

    setStorage(storage) {
        this.storage = storage;
    }

    async clearAll() {
        if (!confirm('Clear ALL evaluations? This cannot be undone.')) return;
        this.evaluations.clearAll();
        await this.storage.saveEvaluations(this.evaluations.toJSON());
        this.render();
    }

    exportCSV() {
        if (this.evaluations.size() === 0) {
            alert('No data to export.');
            return;
        }
        this.exportService.download();
    }
}
