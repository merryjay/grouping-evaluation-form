class DashboardPanel {
    constructor(app) {
        this.app = app;
        this.el = document.getElementById('dashboardContent');
    }

    render() {
        const safe = SafeHtml.escapeText;
        const entries = this.app.evaluations.getAllEntries();
        const groupAggregated = this.app.evaluations.getAggregatedByGroup();
        const memberAggregated = this.app.evaluations.getAggregatedByMember();
        const totalGroups = this.app.groups.size();
        const uniqueVoters = new Set(entries.map(e => e.voter)).size;
        const totalVotes = entries.length;
        const totalMembers = memberAggregated.length;

        let html = '';

        html += `<div class="score-display" style="margin-bottom:20px;">
            <div class="score-box blue"><div class="score-value">${totalGroups}</div><div class="score-label">Total Groups</div></div>
            <div class="score-box purple"><div class="score-value">${totalMembers}</div><div class="score-label">Members</div></div>
            <div class="score-box green"><div class="score-value">${uniqueVoters}</div><div class="score-label">Voters</div></div>
            <div class="score-box"><div class="score-value">${totalVotes}</div><div class="score-label">Total Votes</div></div>
        </div>`;

        if (groupAggregated.length > 0 || memberAggregated.length > 0) {
            groupAggregated.sort((a, b) => b.totalWeighted - a.totalWeighted);
            memberAggregated.sort((a, b) => b.totalWeighted - a.totalWeighted);

            if (groupAggregated.length > 0) {
                const best = groupAggregated[0];
                const bestGroup = this.app.groups.get(best.groupIndex);
                const bestName = bestGroup ? bestGroup.name : `Group ${best.groupIndex + 1}`;

                html += `<div class="card" style="border-left:5px solid #f59e0b;background:linear-gradient(135deg,#fffbeb,#fef3c7);">
                    <div style="display:flex;align-items:center;gap:12px;">
                        <div style="font-size:40px;">&#127942;</div>
                        <div>
                            <h2 style="margin:0;border:none;padding:0;font-size:20px;color:#92400e;">Best Group</h2>
                            <p style="font-size:16px;font-weight:700;color:#1e293b;margin-top:4px;">${safe(bestName)}</p>
                            <p style="font-size:13px;color:#64748b;">Weighted: ${safe(best.totalWeighted)}% &middot; Raw: ${safe(best.totalRaw)} &middot; ${safe(best.scoreCount)} vote${best.scoreCount !== 1 ? 's' : ''}</p>
                        </div>
                    </div>
                </div>`;
            }

            if (memberAggregated.length > 0) {
                const bestMember = memberAggregated[0];
                const bestMemberGroup = this.app.groups.get(bestMember.groupIndex);
                const memberGroupName = bestMemberGroup ? bestMemberGroup.name : `Group ${bestMember.groupIndex + 1}`;

                html += `<div class="card" style="border-left:5px solid #10b981;background:linear-gradient(135deg,#ecfdf5,#d1fae5);">
                    <div style="display:flex;align-items:center;gap:12px;">
                        <div style="font-size:40px;">&#127942;</div>
                        <div>
                            <h2 style="margin:0;border:none;padding:0;font-size:20px;color:#065f46;">Best Individual</h2>
                            <p style="font-size:16px;font-weight:700;color:#1e293b;margin-top:4px;">${safe(bestMember.memberName)} (${safe(memberGroupName)})</p>
                            <p style="font-size:13px;color:#64748b;">Weighted: ${safe(bestMember.totalWeighted)}% &middot; Raw: ${safe(bestMember.totalRaw)} &middot; ${safe(bestMember.scoreCount)} vote${bestMember.scoreCount !== 1 ? 's' : ''}</p>
                        </div>
                    </div>
                </div>`;
            }

            if (groupAggregated.length > 0) {
                html += `<div class="card">
                    <h2>Group Rankings</h2>
                    <div style="overflow-x:auto;">
                    <table class="results-table">
                        <tr><th>#</th><th>Group</th><th>Avg Raw</th><th>Weighted %</th><th>Votes</th></tr>`;
                groupAggregated.forEach((r, i) => {
                    const group = this.app.groups.get(r.groupIndex);
                    const groupName = group ? group.name : `Group ${r.groupIndex + 1}`;
                    const rankClass = i < 3 ? `rank-${i + 1}` : '';
                    const medal = i === 0 ? '&#129351;' : i === 1 ? '&#129352;' : i === 2 ? '&#129353;' : '';
                    html += `<tr class="${rankClass}">
                        <td>${medal || (i + 1)}</td>
                        <td><strong>${safe(groupName)}</strong></td>
                        <td>${safe(r.totalRaw)}</td>
                        <td>${safe(r.totalWeighted)}%</td>
                        <td>${safe(r.scoreCount)}</td>
                    </tr>`;
                });
                html += `</table></div></div>`;
            }

            if (memberAggregated.length > 0) {
                html += `<div class="card">
                    <h2>Individual Rankings</h2>
                    <div style="overflow-x:auto;">
                    <table class="results-table">
                        <tr><th>#</th><th>Name</th><th>Group</th><th>Weighted %</th><th>Grade</th><th>Votes</th></tr>`;
                memberAggregated.forEach((r, i) => {
                    const group = this.app.groups.get(r.groupIndex);
                    const groupName = group ? group.name : `Group ${r.groupIndex + 1}`;
                    const rankClass = i < 3 ? `rank-${i + 1}` : '';
                    const medal = i === 0 ? '&#129351;' : i === 1 ? '&#129352;' : i === 2 ? '&#129353;' : '';
                    const grade = this.app.scoring ? this.app.scoring.getGrade(r.totalWeighted) : '';
                    html += `<tr class="${rankClass}">
                        <td>${medal || (i + 1)}</td>
                        <td><strong>${safe(r.memberName)}</strong></td>
                        <td>${safe(groupName)}</td>
                        <td>${safe(r.totalWeighted)}%</td>
                        <td>${safe(grade)}</td>
                        <td>${safe(r.scoreCount)}</td>
                    </tr>`;
                });
                html += `</table></div></div>`;
            }

            const rubric = this.app.rubric;
            const labels = rubric ? rubric.getScoreLabels() : [];
            html += `<div class="card">
                <h2>Criteria Evaluation Table</h2>
                <div style="overflow-x:auto;">
                <table class="rubric-table">
                    <tr><th>Criteria</th>`;
            for (let s = rubric.maxScore; s >= 1; s--) {
                html += `<th>${safe(labels[s - 1])} (${s})</th>`;
            }
            html += `<th>Score</th></tr>`;
            if (rubric && rubric.criteria.length > 0) {
                rubric.criteria.forEach(c => {
                    const avg = groupAggregated.length > 0 ? groupAggregated.reduce((sum, g) => {
                        return sum + (g.scores[c.name] || 0);
                    }, 0) / groupAggregated.length : 0;
                    html += `<tr><td class="criteria-name">${safe(c.name)}</td>`;
                    for (let s = rubric.maxScore; s >= 1; s--) {
                        const desc = rubric.getDescriptor(c.name, s);
                        html += `<td class="descriptor">${desc === `Score level ${s}` ? '&mdash;' : safe(desc)}</td>`;
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

        const votersMap = new Map();
        entries.forEach(e => {
            if (!votersMap.has(e.voter)) votersMap.set(e.voter, { groupCount: 0, memberCount: 0, groups: [] });
            const voter = votersMap.get(e.voter);
            voter.groups.push(e.groupIndex);
            if (e.type === 'member') {
                voter.memberCount++;
            } else {
                voter.groupCount++;
            }
        });

        html += `<div class="card">
            <h2>Voter Status</h2>
            <div style="overflow-x:auto;">
            <table class="results-table">
                <tr><th>#</th><th>Name</th><th>Groups Rated</th><th>Members Rated</th><th>Status</th></tr>`;
        const allNames = [...votersMap.keys()].sort();
        if (allNames.length === 0) {
            html += `<tr><td colspan="5" style="text-align:center;color:#94a3b8;">No votes recorded yet.</td></tr>`;
        } else {
            allNames.forEach((name, i) => {
                const v = votersMap.get(name);
                const totalVotes = v.groupCount + v.memberCount;
                const statusClass = totalVotes > 0 ? 'grade-A' : 'grade-D';
                const statusText = totalVotes > 0 ? 'Voted' : 'Not yet';
                html += `<tr>
                    <td>${i + 1}</td>
                    <td><strong>${safe(name)}</strong></td>
                    <td>${v.groupCount} / ${totalGroups}</td>
                    <td>${v.memberCount}</td>
                    <td><span class="grade-badge ${statusClass}">${statusText}</span></td>
                </tr>`;
            });
        }
        html += `</table></div></div>`;

        this.el.innerHTML = html;
    }
}
