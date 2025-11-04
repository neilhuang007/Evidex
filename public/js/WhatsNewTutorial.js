// WhatsNewTutorial.js - Feature spotlight for custom exporting

const STORAGE_KEY = 'evidex_whatsnew_custom_export_v1';

export class WhatsNewTutorial {
    constructor(app) {
        this.app = app;
        this.overlay = document.getElementById('whatsnew-overlay');
        this.contentEl = document.getElementById('whatsnew-step-content');
        this.panelEl = document.getElementById('whatsnew-content');
        this.progressText = document.getElementById('whatsnew-progress-text');
        this.progressFill = document.getElementById('whatsnew-progress-fill');
        this.nextBtn = document.getElementById('whatsnew-next-btn');
        this.prevBtn = document.getElementById('whatsnew-prev-btn');
        this.skipBtn = document.getElementById('whatsnew-skip-btn');
        this.triggerBtn = document.getElementById('whatsnew-trigger');
        this.spotlightBorder = document.getElementById('whatsnew-spotlight');
        this.tooltip = document.getElementById('whatsnew-tooltip');
        this.tooltipContent = document.getElementById('whatsnew-tooltip-content');
        this.dropdown = document.getElementById('download-dropdown');
        this.dropdownWrapper = document.querySelector('.dropdown-wrapper');
        this.modal = document.getElementById('custom-order-modal');

        this.currentStepIndex = 0;
        this.currentHighlight = null;
        this.modalOpenedByTutorial = false;
        this.samplesInjected = false;
        this.userHadCards = Array.isArray(this.app?.cards) && this.app.cards.length > 0;
        this.highlightTimeout = null;

        this.refreshTriggerVisibility();

        this.demoTaglines = [
            'Executive Summary',
            'Agent Findings',
            'Evidence Threads',
            'Human Review Actions'
        ];

        this.steps = [
            {
                title: 'Coordinate AI agents faster',
                description: 'Use custom exporting to orchestrate thousands of evidence points into a logical brief. Evidex and its agents do the heavy lifting so analysts stay focused on judgment calls.',
                action: () => this.prepareWorkspace(),
                cleanup: () => {
                }
            },
            {
                title: 'Open the export hub',
                description: 'Head to the download menu whenever you are ready to package evidence for your AI teammates or human reviewers.',
                highlight: '#download-all-button',
                tooltip: 'Hover or click to reveal every export format. We will keep it open for the next step.',
                highlightDelay: 220,
                action: () => this.showDropdown(),
                cleanup: () => this.hideDropdown()
            },
            {
                title: 'Launch custom exporting',
                description: 'Choose Custom Order to direct Evidex agents on exactly how to stage the narrative for you.',
                highlight: '#custom-order-btn',
                tooltip: 'Click Custom Order to open the planner built for large research handoffs.',
                highlightDelay: 280,
                action: () => this.showDropdown(),
                cleanup: () => this.hideDropdown()
            },
            {
                title: 'Taglines become your playbook',
                description: 'Select the taglines that describe each evidence cluster. Evidex keeps agents aligned as they assemble thousands of citations for you.',
                highlight: '#available-taglines-list',
                tooltip: 'Click any tagline chip to add it into the export order. We populated a demo set so you can see it in action.',
                highlightDelay: 520,
                action: () => this.prepareCustomOrderDemo(),
                cleanup: () => {
                }
            },
            {
                title: 'Arrange the perfect sequence',
                description: 'Type or reorder taglines to fit the flow your agents should follow. Every comma locks in the structure humans will review.',
                highlight: '#tagline-order-input',
                tooltip: 'Use commas to orchestrate the order. Try grouping executive briefs ahead of deep dives when AI prepares large dossiers.',
                highlightDelay: 420,
                action: () => this.prefillTaglineInput(),
                cleanup: () => {
                }
            },
            {
                title: 'Export for teams and automations',
                description: 'Pick DOCX or PDF to ship the same agent-ready ordering to colleagues. One export keeps both AI workflows and humans in sync.',
                highlight: '.format-selector',
                tooltip: 'Choose the format that fits your pipeline. DOCX stays editable, PDF is ready to circulate as-is.',
                highlightDelay: 320,
                action: () => this.focusFormatSelector(),
                cleanup: () => {
                }
            },
            {
                title: 'You are ready to brief at scale',
                description: 'Custom exporting now captures the logic your agents need and saves analysts hours of reordering. Finish to keep building or replay anytime from the header.',
                action: () => this.hideContextualUi(),
                cleanup: () => {
                }
            }
        ];

        this.handleResize = () => {
            if (!this.overlay?.classList.contains('show')) return;
            const step = this.steps[this.currentStepIndex];
            if (!step) return;
            this.applyHighlight(step, {delay: 0, skipRetry: true});
        };

        window.addEventListener('resize', this.handleResize);

        this.bindEvents();
        this.init();
    }

    bindEvents() {
        this.nextBtn?.addEventListener('click', () => this.nextStep());
        this.prevBtn?.addEventListener('click', () => this.prevStep());
        this.skipBtn?.addEventListener('click', () => this.complete());
        this.triggerBtn?.addEventListener('click', () => this.start({force: true}));

        this.handleKeydown = (event) => {
            if (event.key === 'Escape' && this.overlay?.classList.contains('show')) {
                event.preventDefault();
                this.complete();
            }
        };
        document.addEventListener('keydown', this.handleKeydown);
    }

    init() {
        if (localStorage.getItem(STORAGE_KEY)) return;
        // Delay auto-start so onboarding can finish first.
        setTimeout(() => {
            if (this.overlay?.classList.contains('show')) return;
            const onboardingVisible = document.getElementById('onboarding-overlay')?.classList.contains('show');
            if (!onboardingVisible) {
                this.start();
            }
        }, 2400);
    }

    start(options = {}) {
        if (!this.overlay) return;
        if (!options.force && localStorage.getItem(STORAGE_KEY)) return;
        if (this.overlay.classList.contains('show')) return;
        this.prepareWorkspace();
        this.overlay.classList.add('show');
        this.resetPanelPosition();
        this.showStep(0);
    }

    showStep(index) {
        if (index < 0 || index >= this.steps.length) return;

        if (index !== this.currentStepIndex) {
            const previous = this.steps[this.currentStepIndex];
            previous?.cleanup?.();
        }

        this.currentStepIndex = index;
        const step = this.steps[index];

        if (this.progressText && this.progressFill) {
            this.progressText.textContent = `Step ${index + 1} of ${this.steps.length}`;
            this.progressFill.style.width = `${((index + 1) / this.steps.length) * 100}%`;
        }

        if (this.contentEl) {
            this.contentEl.innerHTML = `
                <h2 class="onboarding-title">${step.title}</h2>
                <p class="onboarding-description">${step.description}</p>
            `;
        }

        if (this.prevBtn) {
            this.prevBtn.style.display = index > 0 ? 'block' : 'none';
        }
        if (this.nextBtn) {
            this.nextBtn.textContent = index === this.steps.length - 1 ? 'Finish' : 'Next';
        }

        this.resetHighlightState();

        if (typeof step.action === 'function') {
            step.action();
        }

        this.applyHighlight(step);
    }

    nextStep() {
        if (this.currentStepIndex >= this.steps.length - 1) {
            this.complete();
            return;
        }
        this.showStep(this.currentStepIndex + 1);
    }

    prevStep() {
        if (this.currentStepIndex === 0) return;
        this.showStep(this.currentStepIndex - 1);
    }

    resetHighlightState() {
        if (this.highlightTimeout) {
            clearTimeout(this.highlightTimeout);
            this.highlightTimeout = null;
        }
        this.hideTooltip();
        this.hideSpotlight();
    }

    resetPanelPosition() {
        const panel = this.panelEl;
        if (!panel) return;
        panel.classList.remove('adaptive');
        panel.style.bottom = '2rem';
        panel.style.right = '2rem';
        panel.style.top = 'auto';
        panel.style.left = 'auto';
        panel.style.transform = 'none';
    }

    positionTutorialContent(selector) {
        const panel = this.panelEl;
        if (!panel) return;
        if (!selector) {
            this.resetPanelPosition();
            return;
        }

        const target = document.querySelector(selector);
        if (!target) {
            this.resetPanelPosition();
            return;
        }

        const rect = target.getBoundingClientRect();
        const viewportWidth = window.innerWidth;
        const viewportHeight = window.innerHeight;
        const margin = 24;
        const panelWidth = Math.min(panel.offsetWidth || 360, viewportWidth - margin * 2);
        const panelHeight = Math.min(panel.offsetHeight || 320, viewportHeight - margin * 2);
        const clampY = (value) => Math.max(margin, Math.min(value, viewportHeight - panelHeight - margin));

        panel.classList.add('adaptive');
        panel.style.transform = 'none';

        if (viewportWidth - rect.right > panelWidth + margin) {
            panel.style.left = `${Math.min(rect.right + margin, viewportWidth - panelWidth - margin)}px`;
            panel.style.top = `${clampY(rect.top)}px`;
            panel.style.right = 'auto';
            panel.style.bottom = 'auto';
            return;
        }

        if (rect.left > panelWidth + margin) {
            panel.style.left = `${Math.max(margin, rect.left - panelWidth - margin)}px`;
            panel.style.top = `${clampY(rect.top)}px`;
            panel.style.right = 'auto';
            panel.style.bottom = 'auto';
            return;
        }

        if (viewportHeight - rect.bottom > panelHeight + margin) {
            panel.style.left = '50%';
            panel.style.top = `${Math.min(rect.bottom + margin, viewportHeight - panelHeight - margin)}px`;
            panel.style.right = 'auto';
            panel.style.bottom = 'auto';
            panel.style.transform = 'translateX(-50%)';
            return;
        }

        if (rect.top > panelHeight + margin) {
            panel.style.left = '50%';
            panel.style.top = `${Math.max(margin, rect.top - panelHeight - margin)}px`;
            panel.style.right = 'auto';
            panel.style.bottom = 'auto';
            panel.style.transform = 'translateX(-50%)';
            return;
        }

        this.resetPanelPosition();
    }

    applyHighlight(step, options = {}) {
        const selector = step?.highlight;
        const tooltip = step?.tooltip;
        const delay = options.delay ?? step?.highlightDelay ?? 260;
        const skipRetry = options.skipRetry ?? false;

        this.resetHighlightState();

        if (!selector) {
            this.resetPanelPosition();
            return;
        }

        const execute = () => {
            const target = document.querySelector(selector);
            if (!target) {
                this.resetPanelPosition();
                if (!skipRetry) {
                    this.highlightTimeout = window.setTimeout(() => {
                        this.applyHighlight(step, {...options, delay: 200, skipRetry: true});
                    }, 200);
                }
                return;
            }

            this.positionTutorialContent(selector);
            this.highlightElement(selector);
            if (tooltip) {
                this.showTooltip(selector, tooltip);
            } else {
                this.hideTooltip();
            }
            this.highlightTimeout = null;
        };

        if (delay <= 0) {
            execute();
        } else {
            this.highlightTimeout = window.setTimeout(execute, delay);
        }
    }

    refreshTriggerVisibility() {
        if (!this.triggerBtn) return;
        if (localStorage.getItem(STORAGE_KEY)) {
            this.removeTrigger();
        }
    }

    removeTrigger() {
        if (!this.triggerBtn) return;
        this.triggerBtn.remove();
        this.triggerBtn = null;
    }

    prepareWorkspace() {
        const cutsPanel = document.querySelector('.cuts-panel');
        if (!cutsPanel) return;

        const hadCards = Array.isArray(this.app?.cards) && this.app.cards.length > 0;
        this.userHadCards = hadCards;

        if (!hadCards) {
            if (window.onboarding?.showSamplePanel) {
                window.onboarding.showSamplePanel(true);
                this.samplesInjected = true;
            } else {
                this.injectManualSamples();
            }
        }

        cutsPanel.style.display = 'block';
        cutsPanel.classList.add('show');
    }

    injectManualSamples() {
        const cutsList = document.getElementById('cuts-list');
        if (!cutsList) return;

        if (!cutsList.querySelector('.onboarding-sample-card')) {
            const sample = document.createElement('div');
            sample.className = 'card-group onboarding-sample-card';
            sample.innerHTML = `
                <div class="group-header">
                    <h3 class="group-title" title="Click to copy this card">Sample Evidence Card</h3>
                </div>
                <div class="group-body">
                    <div class="group-card">
                        <div class="group-cite">Agent Collaboration, 2025</div>
                        <div class="group-content">
                            Evidex agents organize complex research packets end-to-end so humans can approve the final story faster.
                        </div>
                        <a class="group-link" href="#">https://example.com/agents</a>
                    </div>
                </div>
            `;
            cutsList.prepend(sample);
            this.samplesInjected = true;
        }
    }

    showDropdown() {
        if (this.dropdown) {
            this.dropdown.classList.add('show');
        }
        const button = document.getElementById('download-all-button');
        button?.scrollIntoView({behavior: 'smooth', block: 'center'});
    }

    hideDropdown() {
        this.dropdown?.classList.remove('show');
    }

    prepareCustomOrderDemo() {
        if (!this.modal?.classList.contains('show')) {
            const previousSuppression = window.suppressCustomOrderTutorial;
            window.suppressCustomOrderTutorial = true;
            this.app?.openCustomOrderModal();
            window.suppressCustomOrderTutorial = previousSuppression;
            this.modalOpenedByTutorial = true;
            this.modal = document.getElementById('custom-order-modal');
        }

        this.populateDemoTaglines();
        const list = document.getElementById('available-taglines-list');
        list?.scrollIntoView({behavior: 'smooth', block: 'center'});
    }

    populateDemoTaglines() {
        const list = document.getElementById('available-taglines-list');
        if (!list) return;

        const chips = Array.from(list.children).length > 0;
        if (!chips || this.samplesInjected) {
            list.innerHTML = this.demoTaglines.map((tag) =>
                `<div class="tagline-chip">${this.escape(tag)}</div>`
            ).join('');
        }

        if (this.app?.setAvailableTaglines) {
            this.app.setAvailableTaglines(this.demoTaglines);
        }
    }

    prefillTaglineInput() {
        const input = document.getElementById('tagline-order-input');
        if (!input) return;

        if (!this.userHadCards) {
            input.value = this.demoTaglines.join(', ');
        }
        if (this.app?.validateCustomOrderInput) {
            this.app.validateCustomOrderInput();
        }
        input.focus();
        input.scrollIntoView({behavior: 'smooth', block: 'center'});
    }

    focusFormatSelector() {
        const selector = document.querySelector('.format-selector');
        if (selector) {
            selector.scrollIntoView({behavior: 'smooth', block: 'center'});
        }
    }

    hideContextualUi() {
        this.hideDropdown();
        this.hideTooltip();
    }

    complete() {
        localStorage.setItem(STORAGE_KEY, 'true');
        this.hideContextualUi();
        this.resetHighlightState();
        this.resetPanelPosition();
        this.removeTrigger();
        this.overlay?.classList.remove('show');
        if (this.modalOpenedByTutorial && this.modal?.classList.contains('show')) {
            this.modal.classList.remove('show');
        }
        this.cleanupSamplesIfNeeded();
        this.modalOpenedByTutorial = false;
    }

    cleanupSamplesIfNeeded() {
        if (this.userHadCards) return;
        if (!this.samplesInjected) return;
        document.querySelectorAll('.onboarding-sample-card').forEach((card) => card.remove());
        const cutsPanel = document.querySelector('.cuts-panel');
        const cutsList = document.getElementById('cuts-list');
        if (cutsPanel && cutsList) {
            if (!cutsList.children.length) {
                cutsList.innerHTML = '<div class="cuts-empty">No selections yet. Add research papers and websites using the source panel</div>';
                cutsPanel.classList.remove('show');
                cutsPanel.style.display = 'none';
            }
        }
    }

    clearHighlight() {
        this.resetHighlightState();
    }

    hideSpotlight() {
        this.spotlightBorder?.classList.remove('show');
        if (!this.currentHighlight) return;
        const {element, originalStyles} = this.currentHighlight;
        element.classList.remove('tutorial-highlight');
        element.style.position = originalStyles.position;
        element.style.zIndex = originalStyles.zIndex;
        element.style.pointerEvents = originalStyles.pointerEvents;
        this.currentHighlight = null;
    }

    highlightElement(selector) {
        const element = document.querySelector(selector);
        if (!element || !this.spotlightBorder) {
            this.hideSpotlight();
            return;
        }

        const computed = window.getComputedStyle(element);
        const originalStyles = {
            position: element.style.position || '',
            zIndex: element.style.zIndex || '',
            pointerEvents: element.style.pointerEvents || ''
        };

        if (computed.position === 'static') {
            element.style.position = 'relative';
        }
        element.style.zIndex = '10002';
        if (computed.pointerEvents === 'none') {
            element.style.pointerEvents = 'auto';
        }

        element.classList.add('tutorial-highlight');

        const rect = element.getBoundingClientRect();
        const padding = 16;
        this.spotlightBorder.style.left = `${rect.left - padding}px`;
        this.spotlightBorder.style.top = `${rect.top - padding}px`;
        this.spotlightBorder.style.width = `${rect.width + padding * 2}px`;
        this.spotlightBorder.style.height = `${rect.height + padding * 2}px`;
        this.spotlightBorder.classList.add('show');

        element.scrollIntoView({behavior: 'smooth', block: 'center', inline: 'center'});

        this.currentHighlight = {element, originalStyles};
    }

    showTooltip(selector, html) {
        if (!this.tooltip || !this.tooltipContent) return;
        const anchor = document.querySelector(selector);
        if (!anchor) return;

        const rect = anchor.getBoundingClientRect();
        const tooltipWidth = 320;
        let left = rect.left + rect.width / 2 - tooltipWidth / 2;
        left = Math.max(16, Math.min(left, window.innerWidth - tooltipWidth - 16));

        const top = rect.bottom + 16;

        this.tooltipContent.innerHTML = html;
        this.tooltip.style.left = `${left}px`;
        this.tooltip.style.top = `${top}px`;
        this.tooltip.classList.add('show');

        const arrow = this.tooltip.querySelector('.tooltip-arrow');
        if (arrow) {
            arrow.className = 'tooltip-arrow bottom';
        }
    }

    hideTooltip() {
        this.tooltip?.classList.remove('show');
    }

    escape(text) {
        return (text || '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }
}
