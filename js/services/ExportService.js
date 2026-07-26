class ExportService {
    constructor(rubricConfig, groups, evaluations) {
        this.rubricConfig = rubricConfig;
        this.groups = groups;
        this.evaluations = evaluations;
    }

    setData(rubricConfig, groups, evaluations) {
        this.rubricConfig = rubricConfig;
        this.groups = groups;
        this.evaluations = evaluations;
    }

    exportAllCSV() {
        const aggregated = this.evaluations.getAggregatedByGroup();
        if (aggregated.length === 0) return null;

        const criteriaNames = this.rubricConfig.getCriteriaNames();
        let csv = this._csvRow(['Rank', 'Group', 'Votes', ...criteriaNames, 'Avg Raw', 'Avg Weighted %', 'Date']) + '\n';

        aggregated.sort((a, b) => b.totalWeighted - a.totalWeighted);

        aggregated.forEach((r, i) => {
            const group = this.groups.get(r.groupIndex);
            const groupName = group ? group.name : `Group ${r.groupIndex + 1}`;
            const scores = criteriaNames.map(c => r.scores[c] || 0);
            csv += this._csvRow([i + 1, groupName, r.scoreCount, ...scores, r.totalRaw, `${r.totalWeighted}%`, r.date]) + '\n';
        });

        csv += '\n\nIndividual Votes\n';
        csv += this._csvRow(['Group', 'Voter', 'Raw Total', 'Weighted %', 'Grade']) + '\n';
        const allEntries = this.evaluations.getAllEntries();
        allEntries.forEach(e => {
            const group = this.groups.get(e.groupIndex);
            const groupName = group ? group.name : `Group ${e.groupIndex + 1}`;
            csv += this._csvRow([groupName, e.voter, e.totalRaw, `${e.totalWeighted}%`, e.grade]) + '\n';
        });

        return csv;
    }

    _csvRow(values) {
        return values.map(value => this._csvCell(value)).join(',');
    }

    _csvCell(value) {
        const cell = `'${String(value ?? '')}`;
        return `"${cell.replace(/"/g, '""')}"`;
    }

    download(filename) {
        const csv = this.exportAllCSV();
        if (!csv) return false;

        const blob = new Blob([csv], { type: 'text/csv' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = filename || ('group_rubric_results_' + new Date().toISOString().slice(0, 10) + '.csv');
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(a.href);
        return true;
    }
}
