class ScoringService {
    constructor(rubricConfig) {
        this.rubricConfig = rubricConfig;
    }

    setRubricConfig(config) {
        this.rubricConfig = config;
    }

    calculate(scores) {
        let totalRaw = 0;
        let totalWeighted = 0;
        let totalWeight = 0;

        this.rubricConfig.criteria.forEach(c => {
            const score = scores[c.name] || 0;
            totalRaw += score;
            totalWeighted += (score / this.rubricConfig.maxScore) * c.weight;
            totalWeight += c.weight;
        });

        const weightedPct = totalWeight > 0 ? (totalWeighted / totalWeight * 100) : 0;
        return {
            totalRaw,
            totalWeighted: parseFloat(weightedPct.toFixed(1)),
            grade: this.getGrade(weightedPct)
        };
    }

    getGrade(pct) {
        if (pct >= 90) return 'A+';
        if (pct >= 80) return 'A';
        if (pct >= 70) return 'B';
        if (pct >= 60) return 'C';
        if (pct >= 50) return 'D';
        return 'F';
    }
}
