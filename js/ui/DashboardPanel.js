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

            `;

        const rubric = this.app.rubric;
        const labels = rubric ? rubric.getScoreLabels() : [];
        html += `<div class="card">
            <h2>Criteria Evaluation Table</h2>
            <div style="overflow-x:auto;">
            <table class="rubric-table">
                <tr><th>Criteria</th>`;
        for (let s = rubric.maxScore; s >= 1; s--) {
            html += `<th>${labels[s - 1]} (${s})</th>`;
        }
        html += `<th>Score</th></tr>`;
        if (rubric && rubric.criteria.length > 0) {
            rubric.criteria.forEach(c => {
                const avg = aggregated.length > 0 ? aggregated.reduce((sum, g) => {
                    return sum + (g.scores[c.name] || 0);
                }, 0) / aggregated.length : 0;
                html += `<tr><td class="criteria-name">${c.name}</td>`;
                for (let s = rubric.maxScore; s >= 1; s--) {
                    const desc = rubric.getDescriptor(c.name, s);
                    html += `<td class="descriptor">${desc === `Score level ${s}` ? '&mdash;' : desc}</td>`;
                }
                const pct = avg > 0 ? (avg / rubric.maxScore * 100).toFixed(0) : 0;
                const color = avg > 0 ? (pct >= 80 ? '#10b981' : pct >= 60 ? '#f59e0b' : '#ef4444') : '#94a3b8';
                html += `<td style="font-weight:700;color:${color};font-size:16px;">${avg > 0 ? avg.toFixed(1) : '&mdash;'}</td>`;
                html += `</tr>`;
            });
        }
        html += `</table></div></div>`;
        } else {
            html += `<div class="card"><div class="empty-state"><p>No evaluations yet. Students need to vote first.</p></div></div>`;
        }

        const votersMap = {};
        entries.forEach(e => {
            if (!votersMap[e.voter]) votersMap[e.voter] = { count: 0, groups: [] };
            votersMap[e.voter].count++;
            votersMap[e.voter].groups.push(e.groupIndex);
        });

        html += `<div class="card">
            <h2>Voter Status</h2>
            <div style="overflow-x:auto;">
            <table class="results-table">
                <tr><th>#</th><th>Name</th><th>Groups Rated</th><th>Status</th></tr>`;
        const allNames = Object.keys(votersMap).sort();
        if (allNames.length === 0) {
            html += `<tr><td colspan="3" style="text-align:center;color:#94a3b8;">No votes recorded yet.</td></tr>`;
        } else {
            allNames.forEach((name, i) => {
                const voterData = votersMap[name];
                const groupsRated = voterData ? voterData.count : 0;
                const statusClass = groupsRated > 0 ? 'grade-A' : 'grade-D';
                const statusText = groupsRated > 0 ? 'Voted' : 'Not yet';
                html += `<tr>
                    <td>${i + 1}</td>
                    <td><strong>${name}</strong></td>
                    <td>${groupsRated} / ${totalGroups}</td>
                    <td><span class="grade-badge ${statusClass}">${statusText}</span></td>
                </tr>`;
            });
        }
        html += `</table></div></div>`;

        this.el.innerHTML = html;
    }
}
