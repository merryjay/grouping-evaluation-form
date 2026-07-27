class GroupNavigator {
    constructor(tabManager, evaluationPanel) {
        this.tabManager = tabManager;
        this.evaluationPanel = evaluationPanel;
        this.currentGroupIndex = null;
        this.animationDuration = 300;
    }

    navigateToGroup(groupIndex) {
        this.currentGroupIndex = groupIndex;
        this.tabManager.switch('evaluate');
        this.evaluationPanel.buildGrid(groupIndex);

        setTimeout(() => {
            this._highlightGroup(groupIndex);
        }, 150);
    }

    getCurrentGroupIndex() {
        return this.currentGroupIndex;
    }

    resetState() {
        this.currentGroupIndex = null;
    }

    _highlightGroup(groupIndex) {
        const groupCard = document.getElementById(`group-card-${groupIndex}`);
        if (!groupCard) return;

        this._scrollToElement(groupCard);
        this._applyHighlightEffect(groupCard);
    }

    _scrollToElement(element) {
        const rect = element.getBoundingClientRect();
        const scrollTo = rect.top + window.pageYOffset - (window.innerHeight / 2) + (rect.height / 2);
        const reduceMotion = typeof window.matchMedia === 'function'
            && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        window.scrollTo({ top: scrollTo, behavior: reduceMotion ? 'auto' : 'smooth' });
    }

    _applyHighlightEffect(element) {
        if (typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
        element.style.transition = `all ${this.animationDuration}ms ease`;
        element.style.boxShadow = '0 0 0 4px #667eea, 0 12px 40px rgba(102,126,234,0.4)';
        element.style.transform = 'scale(1.02)';

        setTimeout(() => {
            element.style.boxShadow = '';
            element.style.transform = '';
        }, 2000);
    }
}
