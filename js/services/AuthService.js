class AuthService {
    constructor(password = 'VSU2026') {
        this.password = password;
        this._setupUnlocked = false;
        this._groupsUnlocked = false;
        this._resultsUnlocked = false;
    }

    isSetupUnlocked() { return this._setupUnlocked; }
    isGroupsUnlocked() { return this._groupsUnlocked; }
    isResultsUnlocked() { return this._resultsUnlocked; }

    verify(input) {
        return input === this.password;
    }

    unlockSetup(input) {
        this._setupUnlocked = this.verify(input);
        return this._setupUnlocked;
    }

    lockSetup() {
        this._setupUnlocked = false;
    }

    unlockGroups(input) {
        this._groupsUnlocked = this.verify(input);
        return this._groupsUnlocked;
    }

    lockGroups() {
        this._groupsUnlocked = false;
    }

    unlockResults(input) {
        this._resultsUnlocked = this.verify(input);
        return this._resultsUnlocked;
    }

    lockResults() {
        this._resultsUnlocked = false;
    }
}
