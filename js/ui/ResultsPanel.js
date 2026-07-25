class ResultsPanel {
    constructor(authService, groups, evaluations, exportService) {
        this.auth = authService;
        this.groups = groups;
        this.evaluations = evaluations;
        this.exportService = exportService;

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
        const aggregated = evals.getAggregatedByGroup();
        const allEntries = evals.getAllEntries();

        if (aggregated.length === 0) {
            this.el.resultsContent.innerHTML = '<div class="empty-state"><p>No evaluations yet.</p></div>';
            this.el.classStats.innerHTML = '';
            return;
        }

        aggregated.sort((a, b) => b.totalWeighted - a.totalWeighted);

        let html = `<div style="overflow-x:auto; -webkit-overflow-scrolling:touch;">
            <table class="results-table">
            <tr><th>#</th><th>Group</th><th>Total Raw</th><th>Final Weighted %</th><th>Voters</th><th>Actions</th></tr>`;

        aggregated.forEach((r, i) => {
            const rankClass = i < 3 ? `rank-${i + 1}` : '';
            const group = this.groups.get(r.groupIndex);
            const groupName = group ? group.name : `Group ${r.groupIndex + 1}`;
            html += `<tr class="${rankClass}">
                <td>${i + 1}</td>
                <td><strong>${groupName}</strong></td>
                <td>${r.totalRaw}</td>
                <td>${r.totalWeighted}%</td>
                <td>${r.scoreCount}</td>
                <td>
                    <button class="btn btn-sm toggle-stats-btn" data-group="${r.groupIndex}" style="padding:4px 8px;font-size:10px;width:auto;margin-right:4px;background:#e2e8f0;border:none;border-radius:6px;cursor:pointer;">Stats</button>
                    <button class="btn btn-danger delete-eval-btn" data-group="${r.groupIndex}" style="padding:4px 8px;font-size:10px;width:auto">Clear</button>
                </td>
            </tr>`;
            html += `<tr id="stats-row-${r.groupIndex}" style="display:none;"><td colspan="6" style="padding:12px;background:#f8fafc;">
                <div style="font-size:12px;font-weight:600;color:#475569;margin-bottom:8px;">Average Scores per Criterion</div>
                <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:6px;">`;
            const rubric = window.app ? window.app.rubric : null;
            for (const [crit, avg] of Object.entries(r.scores)) {
                const critConfig = rubric ? rubric.criteria.find(c => c.name === crit) : null;
                const weight = critConfig ? critConfig.weight : '';
                html += `<div style="background:#fff;border:1px solid #e2e8f0;border-radius:6px;padding:6px 10px;">
                    <div style="font-size:11px;color:#64748b;">${crit}${weight ? ` (${weight}%)` : ''}</div>
                    <div style="font-size:14px;font-weight:700;color:#1e293b;">${avg}</div>
                </div>`;
            }
            html += `</div></td></tr>`;
        });
        html += `</table></div>`;
        this.el.resultsContent.innerHTML = html;

        this.el.resultsContent.querySelectorAll('.toggle-stats-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const gi = btn.dataset.group;
                const row = document.getElementById(`stats-row-${gi}`);
                if (row) {
                    const isVisible = row.style.display !== 'none';
                    row.style.display = isVisible ? 'none' : 'table-row';
                    btn.textContent = isVisible ? 'Stats' : 'Hide';
                }
            });
        });

        this.el.resultsContent.querySelectorAll('.delete-eval-btn').forEach(btn => {
            btn.addEventListener('click', () => this._deleteEvaluation(parseInt(btn.dataset.group)));
        });

        this._renderStats(aggregated, allEntries);
    }

    _showVoterDetails(groupIndex) {
        const entries = this.evaluations.getAllByGroup(groupIndex);
        const group = this.groups.get(groupIndex);
        const groupName = group ? group.name : `Group ${groupIndex + 1}`;
        if (entries.length === 0) return;
        let details = entries.map((e, i) =>
            `${i + 1}. ${e.voter} &mdash; Raw: ${e.totalRaw}, Weighted: ${e.totalWeighted}%, Grade: ${e.grade}`
        ).join('\n');
        alert(`Votes for ${groupName}:\n\n${details}`);
    }

    _renderStats(aggregated, allEntries) {
        const totalVotes = allEntries.length;
        const uniqueVoters = new Set(allEntries.map(e => e.voter)).size;
        const groupsRated = aggregated.length;
        const totalGroups = this.groups.size();
        const avgWeighted = aggregated.length > 0 ? (aggregated.reduce((s, r) => s + r.totalWeighted, 0) / aggregated.length).toFixed(1) : 0;
        const highest = aggregated.length > 0 ? Math.max(...aggregated.map(r => r.totalWeighted)) : 0;
        const lowest = aggregated.length > 0 ? Math.min(...aggregated.map(r => r.totalWeighted)) : 0;

        let statsHtml = `
            <div class="score-display">
                <div class="score-box blue"><div class="score-value">${groupsRated}/${totalGroups}</div><div class="score-label">Groups Rated</div></div>
                <div class="score-box green"><div class="score-value">${totalVotes}</div><div class="score-label">Total Votes</div></div>
                <div class="score-box" style="background:linear-gradient(135deg,#8b5cf6,#6d28d9);"><div class="score-value">${uniqueVoters}</div><div class="score-label">Total Voters</div></div>
                <div class="score-box"><div class="score-value">${avgWeighted}%</div><div class="score-label">Class Avg</div></div>
                <div class="score-box orange"><div class="score-value">${highest}%</div><div class="score-label">Highest</div></div>
            </div>`;
        this.el.classStats.innerHTML = statsHtml;
    }

    async _deleteEvaluation(groupIndex) {
        const group = this.groups.get(groupIndex);
        if (!confirm(`Clear ALL votes for ${group ? group.name : `Group ${groupIndex + 1}`}?`)) return;
        this.evaluations.delete(groupIndex);
        localStorage.setItem('pbEvals', JSON.stringify(this.evaluations.toJSON()));
        await this.storage.pb.deleteEvaluation(groupIndex);
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
