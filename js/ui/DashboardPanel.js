class DashboardPanel {
    constructor(app) {
        this.app = app;
        this.el = document.getElementById('dashboardContent');
    }

    render() {
        const entries = this.app.evaluations.getAllEntries();
        const aggregated = this.app.evaluations.getAggregatedByGroup();
        const totalGroups = this.app.groups.size();
        const uniqueVoters = new Set(entries.map(e => e.voter)).size;
        const totalVotes = entries.length;

        let html = '';

        html += `<div class="score-display" style="margin-bottom:20px;">
            <div class="score-box blue"><div class="score-value">${totalGroups}</div><div class="score-label">Total Groups</div></div>
            <div class="score-box green"><div class="score-value">${uniqueVoters}</div><div class="score-label">Voters</div></div>
            <div class="score-box"><div class="score-value">${totalVotes}</div><div class="score-label">Total Votes</div></div>
            <div class="score-box orange"><div class="score-value">${aggregated.length}</div><div class="score-label">Groups Rated</div></div>
        </div>`;

        if (aggregated.length > 0) {
            aggregated.sort((a, b) => b.totalWeighted - a.totalWeighted);
            const best = aggregated[0];
            const bestGroup = this.app.groups.get(best.groupIndex);
            const bestName = bestGroup ? bestGroup.name : `Group ${best.groupIndex + 1}`;

            html += `<div class="card" style="border-left:5px solid #f59e0b;background:linear-gradient(135deg,#fffbeb,#fef3c7);">
                <div style="display:flex;align-items:center;gap:12px;">
                    <div style="font-size:40px;">&#127942;</div>
                    <div>
                        <h2 style="margin:0;border:none;padding:0;font-size:20px;color:#92400e;">Best Group</h2>
                        <p style="font-size:16px;font-weight:700;color:#1e293b;margin-top:4px;">${bestName}</p>
                        <p style="font-size:13px;color:#64748b;">Weighted: ${best.totalWeighted}% &middot; Raw: ${best.totalRaw} &middot; ${best.scoreCount} vote${best.scoreCount !== 1 ? 's' : ''}</p>
                    </div>
                </div>
            </div>`;

            html += `<div class="card">
                <h2>Group Rankings</h2>
                <div style="overflow-x:auto;">
                <table class="results-table">
                    <tr><th>#</th><th>Group</th><th>Avg Raw</th><th>Weighted %</th><th>Votes</th></tr>`;
            aggregated.forEach((r, i) => {
                const group = this.app.groups.get(r.groupIndex);
                const groupName = group ? group.name : `Group ${r.groupIndex + 1}`;
                const rankClass = i < 3 ? `rank-${i + 1}` : '';
                const medal = i === 0 ? '&#129351;' : i === 1 ? '&#129352;' : i === 2 ? '&#129353;' : '';
                html += `<tr class="${rankClass}">
                    <td>${medal || (i + 1)}</td>
                    <td><strong>${groupName}</strong></td>
                    <td>${r.totalRaw}</td>
                    <td>${r.totalWeighted}%</td>
                    <td>${r.scoreCount}</td>
                </tr>`;
            });
            html += `</table></div></div>`;

            html += `<div class="card">
                <h2>Per-Criterion Average Scores</h2>
                <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:10px;">`;
            const rubric = this.app.rubric;
            if (rubric && rubric.criteria.length > 0) {
                rubric.criteria.forEach(c => {
                    const avg = aggregated.reduce((sum, g) => {
                        return sum + (g.scores[c.name] || 0);
                    }, 0) / aggregated.length;
                    const pct = (avg / rubric.maxScore * 100).toFixed(0);
                    const color = pct >= 80 ? '#10b981' : pct >= 60 ? '#f59e0b' : '#ef4444';
                    html += `<div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;padding:12px;">
                        <div style="font-size:12px;color:#64748b;font-weight:500;">${c.name}</div>
                        <div style="font-size:24px;font-weight:800;color:${color};margin-top:4px;">${avg.toFixed(1)} <span style="font-size:12px;color:#94a3b8;">/ ${rubric.maxScore}</span></div>
                        <div style="height:6px;background:#e2e8f0;border-radius:3px;margin-top:6px;">
                            <div style="height:100%;width:${pct}%;background:${color};border-radius:3px;"></div>
                        </div>
                    </div>`;
                });
            }
            html += `</div></div>`;
        } else {
            html += `<div class="card"><div class="empty-state"><p>No evaluations yet. Students need to vote first.</p></div></div>`;
        }

        this.el.innerHTML = html;
    }
}
