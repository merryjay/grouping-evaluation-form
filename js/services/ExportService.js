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
        const entries = this.evaluations.getAllEntries();
        if (entries.length === 0) return null;

        const criteriaNames = this.rubricConfig.getCriteriaNames();
        let csv = 'Rank,Group,' + criteriaNames.join(',') + ',Raw Total,Weighted %,Grade,Date\n';

        entries.sort((a, b) => b.totalWeighted - a.totalWeighted);

        entries.forEach((r, i) => {
            const group = this.groups.get(r.groupIndex);
            const groupName = group ? group.name : `Group ${r.groupIndex + 1}`;
            const scores = criteriaNames.map(c => r.scores[c] || 0).join(',');
            csv += `${i + 1},"${groupName}",${scores},${r.totalRaw},${r.totalWeighted}%,${r.grade},${r.date}\n`;
        });

        return csv;
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
