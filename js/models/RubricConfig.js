class RubricConfig {
    constructor() {
        this.activityName = 'Group Presentation Evaluation';
        this.maxScore = 4;
        this.criteria = [
            { name: 'Content Accuracy', weight: 10 },
            { name: 'Understanding of Topic', weight: 10 },
            { name: 'Organization & Structure', weight: 10 },
            { name: 'Delivery & Communication Skills', weight: 10 },
            { name: 'Audience Engagement/Audience impact', weight: 10 },
            { name: 'Visual Aids/Instructional Materials', weight: 10 },
            { name: 'Professional Appearance/Attire', weight: 10 },
            { name: 'Teamwork/Collaboration', weight: 10 },
            { name: 'Time allocation: 30 mins', weight: 10 },
            { name: 'Strategies: Enjoyable, uniqueness team name, gamify exercises', weight: 10 }
        ];
        this.descriptors = this._buildDefaultDescriptors();
    }

    fromJSON(data) {
        if (data.activityName) this.activityName = data.activityName;
        if (data.maxScore) this.maxScore = data.maxScore;
        if (data.criteria) this.criteria = data.criteria.map(c => ({ ...c }));
        return this;
    }

    toJSON() {
        return {
            activityName: this.activityName,
            maxScore: this.maxScore,
            criteria: this.criteria.map(c => ({ ...c }))
        };
    }

    addCriteria(name = '', weight = 0) {
        this.criteria.push({ name, weight });
    }

    removeCriteria(index) {
        if (this.criteria.length <= 1) return false;
        this.criteria.splice(index, 1);
        return true;
    }

    getCriteriaNames() {
        return this.criteria.map(c => c.name);
    }

    getScoreLabels() {
        const labels = {
            5: ['Needs Improvement', 'Fair', 'Good', 'Very Good', 'Excellent'],
            4: ['Needs Improvement', 'Fair', 'Good', 'Excellent'],
            3: ['Needs Improvement', 'Good', 'Excellent']
        };
        return labels[this.maxScore] || labels[4];
    }

    getDescriptor(criteriaName, score) {
        if (this.descriptors[criteriaName] && this.descriptors[criteriaName][this.maxScore]) {
            return this.descriptors[criteriaName][this.maxScore][score - 1] || `Score level ${score}`;
        }
        return `Score level ${score}`;
    }

    getTotalWeight() {
        return this.criteria.reduce((sum, c) => sum + c.weight, 0);
    }

    _buildDefaultDescriptors() {
        return {
            'Content Accuracy': {
                4: ['Content lacks accuracy and completeness', 'Some inaccuracies or missing information', 'Mostly accurate with minor errors', 'Information is accurate, complete, and well-researched']
            },
            'Understanding of Topic': {
                4: ['Limited understanding of the topic', 'Basic understanding but struggles with some concepts', 'Shows good understanding with minor difficulties', 'Demonstrates excellent mastery and answers questions confidently']
            },
            'Organization & Structure': {
                4: ['Lacks clear organization', 'Somewhat organized but difficult to follow at times', 'Generally organized with minor lapses', 'Presentation has a clear introduction, body, and conclusion']
            },
            'Delivery & Communication Skills': {
                4: ['Difficult to hear or understand', 'Some issues with clarity or confidence', 'Generally clear and confident', 'Speaks clearly, confidently, and maintains audience attention']
            },
            'Audience Engagement/Audience impact': {
                4: ['Little to no audience engagement', 'Limited audience interaction', 'Maintains audience interest most of the time', 'Actively engages audience through questions, examples, or interaction']
            },
            'Visual Aids/Instructional Materials': {
                4: ['Materials are missing or ineffective', 'Materials are somewhat relevant but lack effectiveness', 'Materials are useful with minor improvements needed', 'Materials are attractive, relevant, and enhance learning']
            },
            'Professional Appearance/Attire': {
                4: ['Unprofessional appearance', 'Somewhat inappropriate or untidy', 'Generally appropriate attire', 'Attire is neat, professional, and appropriate']
            },
            'Teamwork/Collaboration': {
                4: ['Lack of teamwork and coordination', 'Uneven participation among members', 'Most members participate actively', 'All members contribute equally and work cohesively']
            },
            'Time allocation: 30 mins': {
                4: ['Extended 30 mins on discussion', 'Extended 10 mins on discussion', 'Extended 5 mins on lesson discussion', 'Ended the lessons on time']
            },
            'Strategies: Enjoyable, uniqueness team name, gamify exercises': {
                4: ['Lacks enthusiasm and interest', 'Limited excitement or creativity', 'Mostly enjoyable with some creativity', 'Highly enjoyable, creative, and energetic presentation']
            }
        };
    }
}
