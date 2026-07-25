class SetupPanel {
    constructor(authService, rubricConfig, storageService, tabManager) {
        this.auth = authService;
        this.rubric = rubricConfig;
        this.storage = storageService;
        this.tabManager = tabManager;

        this.el = {
            criteriaList: document.getElementById('criteriaList'),
            setupButtons: document.getElementById('setupButtons'),
            maxScore: document.getElementById('maxScore'),
            activityName: document.getElementById('activityName'),
            rubricPreview: document.getElementById('rubricPreview')
        };

        this._bindEvents();
    }

    _bindEvents() {
        this.el.criteriaList.addEventListener('click', (e) => {
            const removeBtn = e.target.closest('.remove-criteria');
            if (removeBtn) this._removeCriteria(removeBtn);
        });
        this.el.criteriaList.addEventListener('input', () => this.updatePreview());
        this.el.maxScore.addEventListener('change', () => this.updatePreview());
        this.el.activityName.addEventListener('input', () => this.updatePreview());
    }

    loadRubricIntoUI() {
        this.el.maxScore.value = this.rubric.maxScore;
        this.el.activityName.value = this.rubric.activityName;
        this._rebuildCriteriaRows();
        this.enableEditing();
        this.updatePreview();
    }

    enableEditing() {
        this.el.criteriaList.querySelectorAll('input').forEach(input => input.removeAttribute('readonly'));
        this.el.criteriaList.querySelectorAll('.remove-criteria').forEach(btn => btn.style.display = 'block');
        this.el.maxScore.removeAttribute('disabled');
        this.el.activityName.removeAttribute('readonly');
        this.el.setupButtons.style.display = 'block';
    }

    _rebuildCriteriaRows() {
        this.el.criteriaList.innerHTML = '';
        this.rubric.criteria.forEach((c, i) => {
            this.el.criteriaList.appendChild(this._createCriteriaRow(c.name, c.weight));
        });
    }

    _createCriteriaRow(name, weight) {
        const div = document.createElement('div');
        div.className = 'criteria-row';
        div.innerHTML = `
            <div class="form-group">
                <label>Criterion Name</label>
                <input type="text" class="criteria-name-input" value="${this._escapeHtml(name)}">
            </div>
            <div class="form-group">
                <label>Weight (%)</label>
                <input type="number" class="criteria-weight" value="${weight}" min="0" max="100">
            </div>
            <button class="remove-criteria" title="Remove">&times;</button>
        `;
        return div;
    }

    _escapeHtml(str) {
        const div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    }

    addCriteria() {
        this.el.criteriaList.appendChild(this._createCriteriaRow('', 0));
        this.updatePreview();
    }

    _removeCriteria(btn) {
        const rows = this.el.criteriaList.querySelectorAll('.criteria-row');
        if (rows.length <= 1) {
            alert('You need at least one criterion.');
            return;
        }
        btn.closest('.criteria-row').remove();
        this.updatePreview();
    }

    _gatherCriteriaFromUI() {
        const rows = this.el.criteriaList.querySelectorAll('.criteria-row');
        const criteria = [];
        rows.forEach(row => {
            const name = row.querySelector('.criteria-name-input').value.trim();
            const weight = parseFloat(row.querySelector('.criteria-weight').value) || 0;
            if (name) criteria.push({ name, weight });
        });
        return criteria;
    }

    updatePreview() {
        const maxScore = parseInt(this.el.maxScore.value);
        const criteria = this._gatherCriteriaFromUI();
        if (!criteria.length) {
            this.el.rubricPreview.innerHTML = '<div class="empty-state"><p>Add criteria to see the rubric preview.</p></div>';
            return;
        }

        const labels = this.rubric.getScoreLabels();
        let html = `<table class="rubric-table">
            <tr><th>Criterion</th><th>Weight</th>`;
        labels.forEach((l, i) => {
            html += `<th>${i + 1} - ${l}</th>`;
        });
        html += `</tr>`;

        criteria.forEach(c => {
            html += `<tr><td class="criteria-name">${this._escapeHtml(c.name)}</td><td>${c.weight}%</td>`;
            for (let s = 1; s <= maxScore; s++) {
                html += `<td class="descriptor"><strong>${s} pt:</strong> ${this.rubric.getDescriptor(c.name, s)}</td>`;
            }
            html += `</tr>`;
        });
        html += `</table>`;
        this.el.rubricPreview.innerHTML = html;
    }

    saveRubric() {
        const criteria = this._gatherCriteriaFromUI();
        if (criteria.length === 0) {
            alert('Please add at least one criterion.');
            return;
        }

        const totalWeight = criteria.reduce((s, c) => s + c.weight, 0);
        if (Math.abs(totalWeight - 100) > 0.1) {
            if (!confirm(`Weights total ${totalWeight}%. Continue anyway?`)) return;
        }

        this.rubric.criteria = criteria;
        this.rubric.maxScore = parseInt(this.el.maxScore.value);
        this.rubric.activityName = this.el.activityName.value;

        this.storage.saveRubric(this.rubric.toJSON());
        alert('Rubric saved! Now set up your groups.');
        this.tabManager.switch('groups');
    }
}
