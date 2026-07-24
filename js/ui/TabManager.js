class TabManager {
    constructor() {
        this.tabs = document.querySelectorAll('.tab');
        this.contents = document.querySelectorAll('.tab-content');
    }

    switch(tabId) {
        this.tabs.forEach(t => t.classList.remove('active'));
        this.contents.forEach(t => t.classList.remove('active'));

        const tabButton = Array.from(this.tabs).find(t => t.dataset.tab === tabId);
        if (tabButton) tabButton.classList.add('active');

        const content = document.getElementById(`tab-${tabId}`);
        if (content) content.classList.add('active');

        window.scrollTo({ top: 0, behavior: 'smooth' });
    }
}
