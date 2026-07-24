class ResultsPanel {
    constructor(authService, groups, evaluations, exportService) {
        this.auth = authService;
        this.groups = groups;
        this.evaluations = evaluations;
        this.exportService = exportService;

        this.el = {
            passwordCard: document.getElementById('passwordCard'),
            passwordInput: document.getElementById('resultsPassword'),
            passwordError: document.getElementById('passwordError'),
            lockedContent: document.getElementById('resultsLocked'),
            resultsContent: document.getElementById('resultsContent'),
            classStats: document.getElementById('classStats')
        };
    }

    showPasswordPrompt() {
        this.el.passwordCard.style.display = 'block';
        this.el.lockedContent.style.display = 'none';
        this.el.passwordInput.value = '';
        this.el.passwordError.style.display = 'none';
    }

    verifyPassword() {
        if (this.auth.unlockResults(this.el.passwordInput.value)) {
            this.el.passwordCard.style.display = 'none';
            this.el.lockedContent.style.display = 'block';
            this.render();
        } else {
            this.el.passwordError.style.display = 'block';
            this.el.passwordInput.value = '';
        }
    }

    render() {
        const entries = this.evaluations.getAllEntries();
        if (entries.length === 0) {
            this.el.resultsContent.innerHTML = '<div class="empty-state"><p>No evaluations yet.</p></div>';
            this.el.classStats.innerHTML = '';
            return;
        }

        entries.sort((a, b) => b.totalWeighted - a.totalWeighted);

        let html = `<div style="overflow-x:auto; -webkit-overflow-scrolling:touch;">
            <table class="results-table">
            <tr><th>#</th><th>Group</th><th>Raw Total</th><th>Weighted %</th><th>Grade</th><th>Date</th><th>Action</th></tr>`;

        entries.forEach((r, i) => {
            const rankClass = i < 3 ? `rank-${i + 1}` : '';
            const group = this.groups.get(r.groupIndex);
            const groupName = group ? group.name : `Group ${r.groupIndex + 1}`;
            html += `<tr class="${rankClass}">
                <td>${i + 1}</td>
                <td><strong>${groupName}</strong></td>
                <td>${r.totalRaw}</td>
                <td>${r.totalWeighted}%</td>
                <td><span class="grade-badge grade-${r.grade.charAt(0)}">${r.grade}</span></td>
                <td>${r.date}</td>
                <td><button class="btn btn-danger delete-eval-btn" data-group="${r.groupIndex}" style="padding:6px 10px;font-size:11px;width:auto">Delete</button></td>
            </tr>`;
        });
        html += `</table></div>`;
        this.el.resultsContent.innerHTML = html;

        this.el.resultsContent.querySelectorAll('.delete-eval-btn').forEach(btn => {
            btn.addEventListener('click', () => this._deleteEvaluation(parseInt(btn.dataset.group)));
        });

        this._renderStats(entries);
    }

    _renderStats(entries) {
        const avgWeighted = (entries.reduce((s, r) => s + r.totalWeighted, 0) / entries.length).toFixed(1);
        const highest = Math.max(...entries.map(r => r.totalWeighted));
        const lowest = Math.min(...entries.map(r => r.totalWeighted));
        const gradeCounts = {};
        entries.forEach(r => { gradeCounts[r.grade] = (gradeCounts[r.grade] || 0) + 1; });

        let statsHtml = `
            <div class="score-display">
                <div class="score-box blue"><div class="score-value">${entries.length}</div><div class="score-label">Groups</div></div>
                <div class="score-box green"><div class="score-value">${avgWeighted}%</div><div class="score-label">Average</div></div>
                <div class="score-box"><div class="score-value">${highest}%</div><div class="score-label">Highest</div></div>
                <div class="score-box orange"><div class="score-value">${lowest}%</div><div class="score-label">Lowest</div></div>
            </div>
            <div style="margin-top:12px">
                <strong>Grade Distribution:</strong><br>
                ${Object.keys(gradeCounts).sort().map(g => `<span class="grade-badge grade-${g.charAt(0)}" style="margin:3px">${g}: ${gradeCounts[g]}</span>`).join(' ')}
            </div>`;
        this.el.classStats.innerHTML = statsHtml;
    }

    _deleteEvaluation(groupIndex) {
        if (!confirm('Delete this group evaluation?')) return;
        this.evaluations.delete(groupIndex);
        this.storage.saveEvaluations(this.evaluations.toJSON());
        this.render();
    }

    setStorage(storage) {
        this.storage = storage;
    }

    clearAll() {
        if (!confirm('Clear ALL evaluations? This cannot be undone.')) return;
        this.evaluations.clearAll();
        this.storage.saveEvaluations(this.evaluations.toJSON());
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
