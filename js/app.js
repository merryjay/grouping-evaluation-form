
class App {
    constructor() {
        this.storage = new StorageService();
        this.auth = new AuthService('VSU2026');
        this.rubric = new RubricConfig();
        this.groups = new GroupCollection();
        this.evaluations = new EvaluationCollection();
        this.tabManager = new TabManager();
        this.scoring = new ScoringService(this.rubric);
        this.evaluationPanel = new EvaluationPanel(this.rubric, this.groups, this.evaluations, this.scoring, this.storage);
        this.groupNavigator = new GroupNavigator(this.tabManager, this.evaluationPanel);
        this.exportService = new ExportService(this.rubric, this.groups, this.evaluations);
        this.setupPanel = new SetupPanel(this.auth, this.rubric, this.storage, this.tabManager);
        this.groupPanel = new GroupPanel(this.groups, this.storage);
        this.resultsPanel = new ResultsPanel(this.auth, this.groups, this.evaluations, this.exportService);
        this.resultsPanel.setStorage(this.storage);

        window.app = this;
    }

    init() {
        this._loadData();
        this._ensureDefaultMembers();
        this._setupTabListeners();
        this._setupGlobalListeners();
        this.setupPanel.loadRubricIntoUI();
        this.groupPanel.buildList();

        if (this.evaluations.size() > 0) {
            this.evaluationPanel.buildGrid();
        }

        this.rubric.activityName = document.getElementById('activityName').value;
    }

    _loadData() {
        const savedRubric = this.storage.loadRubric();
        if (savedRubric) this.rubric.fromJSON(savedRubric);

        const savedGroups = this.storage.loadGroups();
        if (savedGroups) this.groups.fromJSON(savedGroups);

        const savedEvals = this.storage.loadEvaluations();
        if (savedEvals) this.evaluations.fromJSON(savedEvals);
    }

    _ensureDefaultMembers() {
        const addMember = (groupIndex, name, prepend = false) => {
            const group = this.groups.get(groupIndex);
            if (!group) return;
            const members = group.members ? group.members.split('\n').map(m => m.trim()).filter(m => m) : [];
            if (!members.includes(name)) {
                if (prepend) {
                    members.unshift(name);
                } else {
                    members.push(name);
                }
                group.members = members.join('\n');
                return true;
            }
            return false;
        };

        let changed = false;

        // Group 1
        changed |= addMember(0, 'Nathaniel Rodrigo', true);
        changed |= addMember(0, 'Junna Dag-uman');
        changed |= addMember(0, 'Merry Jay Tumulak');

        // Group 2
        changed |= addMember(1, 'Krizia Nicole Rubio');
        changed |= addMember(1, 'Althea Tanguamos');
        changed |= addMember(1, 'John Alrey Gementiza');

        // Group 3
        changed |= addMember(2, 'Aranas Vince');
        changed |= addMember(2, 'Palangan Lucille Mae');
        changed |= addMember(2, 'Tariao Justine Jean');

        // Group 4
        changed |= addMember(3, 'Kevin Jay Morales');
        changed |= addMember(3, 'Nylvia Apao');
        changed |= addMember(3, 'Rosalden Rabago');

        // Group 5
        changed |= addMember(4, 'James Susas');
        changed |= addMember(4, 'Mark Antolijao');

        // Group 6
        changed |= addMember(5, 'Bal Gestly Labador');
        changed |= addMember(5, 'Elmie Soltes');
        changed |= addMember(5, 'Steven Yoldan');

        // Group 7
        changed |= addMember(6, 'Andrew Sambulan');
        changed |= addMember(6, 'Allan Baguio');
        changed |= addMember(6, 'Archie Jutag');

        // Group 8
        changed |= addMember(7, 'Angel Lou Geografo');
        changed |= addMember(7, 'Juliemar Bartolo');
        changed |= addMember(7, 'Gabriel Salaveria');

        if (changed) {
            this.storage.saveGroups(this.groups.toJSON());
        }
    }

    _setupTabListeners() {
        this.tabManager.tabs.forEach(tab => {
            tab.addEventListener('click', () => {
                const tabId = tab.dataset.tab;
                this.tabManager.switch(tabId);
                this._onTabSwitch(tabId);
            });
        });
    }

    _onTabSwitch(tabId) {
        if (tabId === 'setup') {
            this.auth.lockSetup();
            this.setupPanel.hidePasswordPrompt();
            this.setupPanel.disableEditing();
            this.setupPanel.updatePreview();
        }
        if (tabId === 'groups') {
            this.groupPanel.buildList();
        }
        if (tabId === 'evaluate') {
            this.evaluationPanel.buildGrid();
        }
        if (tabId === 'results') {
            this.auth.lockResults();
            this.resultsPanel.showPasswordPrompt();
        }
    }

    _setupGlobalListeners() {
        document.getElementById('editRubricBtn').addEventListener('click', () => this.setupPanel.showPasswordPrompt());
        document.getElementById('setupCancelBtn').addEventListener('click', () => this.setupPanel.hidePasswordPrompt());
        document.getElementById('setupUnlockBtn').addEventListener('click', () => this.setupPanel._verifyPassword());
        document.getElementById('addCriteriaBtn').addEventListener('click', () => this.setupPanel.addCriteria());
        document.getElementById('saveRubricBtn').addEventListener('click', () => this.setupPanel.saveRubric());

        document.getElementById('resultsPassword').addEventListener('keypress', (e) => {
            if (e.key === 'Enter') this.resultsPanel.verifyPassword();
        });
        document.getElementById('viewResultsBtn').addEventListener('click', () => this.resultsPanel.verifyPassword());
        document.getElementById('clearAllBtn').addEventListener('click', () => this.resultsPanel.clearAll());
        document.getElementById('exportAllBtn').addEventListener('click', () => this.resultsPanel.exportCSV());
        document.getElementById('exportCSVBtn').addEventListener('click', () => this.resultsPanel.exportCSV());
    }
}

document.addEventListener('DOMContentLoaded', () => {
    const app = new App();
    app.init();
});
