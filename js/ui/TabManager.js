class TabManager {
    constructor() {
        this.tabs = document.querySelectorAll('.tab');
        this.contents = document.querySelectorAll('.tab-content');
        this.activeTab = Array.from(this.tabs).find(tab => tab.classList.contains('active'))?.dataset.tab || null;
        this.tabs.forEach(tab => {
            tab.addEventListener('keydown', event => this._handleTabKeydown(event));
        });
    }

    switch(tabId) {
        this.tabs.forEach(t => {
            const selected = t.dataset.tab === tabId;
            t.classList.toggle('active', selected);
            t.setAttribute('aria-selected', selected ? 'true' : 'false');
            t.tabIndex = selected ? 0 : -1;
        });
        this.contents.forEach(t => t.classList.remove('active'));

        const tabButton = Array.from(this.tabs).find(t => t.dataset.tab === tabId);
        if (tabButton) tabButton.classList.add('active');

        const content = document.getElementById(`tab-${tabId}`);
        if (content) content.classList.add('active');
        this.activeTab = tabId;

        const reduceMotion = typeof window.matchMedia === 'function'
            && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        window.scrollTo({ top: 0, behavior: reduceMotion ? 'auto' : 'smooth' });
    }

    _handleTabKeydown(event) {
        const tabs = Array.from(this.tabs).filter(tab => !tab.hidden && tab.style.display !== 'none');
        const currentIndex = tabs.indexOf(event.currentTarget);
        if (currentIndex < 0) return;
        let nextIndex = null;
        if (event.key === 'ArrowRight' || event.key === 'ArrowDown') nextIndex = (currentIndex + 1) % tabs.length;
        if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') nextIndex = (currentIndex - 1 + tabs.length) % tabs.length;
        if (event.key === 'Home') nextIndex = 0;
        if (event.key === 'End') nextIndex = tabs.length - 1;
        if (nextIndex === null) return;
        event.preventDefault();
        const next = tabs[nextIndex];
        next.focus();
        this.switch(next.dataset.tab);
        if (typeof window.app?._onTabSwitch === 'function') window.app._onTabSwitch(next.dataset.tab);
    }
}
