// OnboardingTutorial.js - Interactive onboarding tutorial

export class OnboardingTutorial {
    constructor() {
        this.currentStep = 1;
        this.totalSteps = 8;
        this.overlay = document.getElementById('onboarding-overlay');
        this.contentEl = document.getElementById('step-content');
        this.progressText = document.getElementById('progress-text');
        this.progressFill = document.getElementById('progress-fill');
        this.nextBtn = document.getElementById('next-btn');
        this.prevBtn = document.getElementById('prev-btn');
        this.skipBtn = document.getElementById('skip-btn');
        this.spotlightBorder = document.getElementById('spotlight-border');
        this.tooltip = document.getElementById('onboarding-tooltip');
        this.tooltipContent = document.getElementById('tooltip-content');
        this.currentHighlightedElement = null;

        this.steps = [
            {
                title: "Welcome to Evidex",
                description: "Evidex helps you extract and format research evidence from any webpage. This quick tour will show you how to use all the features.",
                action: null
            },
            {
                title: "Adding a Website URL",
                description: "Start by entering the URL of an article or webpage you want to extract evidence from.",
                highlight: '#url-input',
                tooltip: "Try this example URL: <strong>https://www.nature.com/articles/s41586-023-06647-8</strong>",
                action: () => {
                    const urlInput = document.getElementById('url-input');
                    urlInput.value = 'https://www.nature.com/articles/s41586-023-06647-8';
                    urlInput.dispatchEvent(new Event('input', {bubbles: true}));
                }
            },
            {
                title: "Adding Your Claim",
                description: "Enter the claim or argument you want to find supporting evidence for. The AI will search the webpage for relevant content.",
                highlight: '#claim-input',
                tooltip: "Example claim: <strong>AI models are becoming increasingly sophisticated</strong>",
                action: () => {
                    const claimInput = document.getElementById('claim-input');
                    claimInput.value = 'AI models are becoming increasingly sophisticated';
                    claimInput.dispatchEvent(new Event('input', {bubbles: true}));
                }
            },
            {
                title: "Generating Evidence Cards",
                description: "Click 'Cite Evidence' to let the AI analyze the webpage and create formatted evidence cards.",
                highlight: '#cut-button',
                tooltip: "The AI will extract relevant quotes and format them with proper citations",
                action: () => {
                    // Simulate the evidence generation process
                    setTimeout(() => this.showSamplePanel(), 1000);
                }
            },
            {
                title: "Highlighting Text",
                description: "Now that you have evidence cards, you can edit and highlight important text. Click on the demo card text below to open the editing panel and try highlighting.",
                highlight: '.onboarding-highlight-demo .group-content',
                tooltip: "Click on the text to open editing tools, then select text and click <strong>Highlight</strong>",
                showSampleCard: true,
                forceSampleCard: true,
                exampleCardType: 'highlight',
                showEditingPanel: true,
                editingPanelOptions: {
                    delay: 200,
                    cardSelector: '.onboarding-highlight-demo .group-card',
                    cardId: 'tutorial-sample-2',
                    focus: 'highlight',
                    emphasizeContent: true,
                    autoSelectText: true
                }
            },
            {
                title: "Changing Highlight Colors",
                description: "Customize your highlight colors using the color picker. Each card can have its own highlight color for better organization.",
                highlight: '.card-editing-panel .color-picker-container',
                tooltip: "Click the <strong>color square</strong> to choose a custom highlight color",
                showSampleCard: true,
                forceSampleCard: true,
                exampleCardType: 'color',
                showEditingPanel: true,
                editingPanelOptions: {
                    delay: 200,
                    cardSelector: '.onboarding-highlight-demo .group-card',
                    cardId: 'tutorial-sample-2',
                    focus: 'color-picker',
                    emphasizeContent: true
                }
            },
            {
                title: "Copying Individual Cards",
                description: "Click on any card title to copy that individual evidence card to your clipboard with formatting preserved. Perfect for pasting into documents.",
                highlight: '.group-title',
                tooltip: "Click on the <strong>card title</strong> to copy this individual card",
                showSampleCard: true,
                action: () => {
                    // Add visual emphasis to the card title
                    setTimeout(() => {
                        const cardTitle = document.querySelector('.onboarding-sample-card .group-title');
                        if (cardTitle) {
                            cardTitle.style.animation = 'tutorialHighlight 2s ease-in-out infinite';
                            cardTitle.style.background = 'rgba(94, 114, 228, 0.1)';
                            cardTitle.style.borderRadius = '6px';
                            cardTitle.style.padding = '4px 8px';
                        }
                    }, 300);
                }
            },
            {
                title: "Bulk Copy and Download",
                description: "Use the Copy button to copy all cards at once, or Download to export everything as a formatted Word document with highlights preserved.",
                highlight: '.cuts-footer .action-buttons',
                tooltip: "<strong>Copy</strong> copies all cards to clipboard, <strong>Download</strong> saves as .docx file",
                showSampleCard: true
            }
        ];

        this.bindEvents();
    }

    init() {
        // Check if user has seen onboarding
        const hasSeenOnboarding = localStorage.getItem('evidex_onboarding_completed');

        if (!hasSeenOnboarding) {
            setTimeout(() => this.start(), 500);
        }
    }

    start() {
        this.overlay.classList.add('show');
        this.currentStep = 1;
        this.showStep(1);
    }

    bindEvents() {
        this.nextBtn.addEventListener('click', () => this.nextStep());
        this.prevBtn.addEventListener('click', () => this.prevStep());
        this.skipBtn.addEventListener('click', () => this.complete());

        // Close on ESC
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && this.overlay.classList.contains('show')) {
                this.complete();
            }
        });

        // Handle window resize to maintain spotlight position
        window.addEventListener('resize', () => {
            if (this.overlay.classList.contains('show') && this.currentHighlightedElement) {
                // Re-highlight the current element to adjust positions
                const selector = this.steps[this.currentStep - 1]?.highlight;
                if (selector) {
                    setTimeout(() => this.highlightElement(selector), 100);
                }
            }
        });
    }

    showStep(stepNum) {
        const step = this.steps[stepNum - 1];

        // Update progress
        this.progressText.textContent = `Step ${stepNum} of ${this.totalSteps}`;
        this.progressFill.style.width = `${(stepNum / this.totalSteps) * 100}%`;

        // Update content
        this.contentEl.innerHTML = `
            <h2 class="onboarding-title">${step.title}</h2>
            <p class="onboarding-description">${step.description}</p>
            ${step.showSampleCard ? this.getSampleCardHTML(step.exampleCardType) : ''}
        `;

        // Update buttons
        this.prevBtn.style.display = stepNum > 1 ? 'block' : 'none';
        this.nextBtn.textContent = stepNum === this.totalSteps ? 'Finish' : 'Next';

        // Clear previous highlights
        this.hideSpotlight();
        this.hideTooltip();
        document.querySelectorAll('.tutorial-highlight').forEach(el => {
            el.classList.remove('tutorial-highlight');
        });

        // Position tutorial content adaptively
        this.positionTutorialContent(step.highlight);

        // Apply highlights and tooltips
        if (step.highlight) {
            setTimeout(() => {
                this.highlightElement(step.highlight);
                if (step.tooltip) {
                    this.showTooltip(step.highlight, step.tooltip);
                }
            }, 300);
        }

        // Execute action if provided
        if (typeof step.action === 'function') {
            setTimeout(() => step.action(), 500);
        }

        // Ensure sample content is visible when needed
        if (step.showSampleCard) {
            this.showSamplePanel(step.forceSampleCard);
        }

        // Trigger editing panel demos when configured
        if (step.showEditingPanel) {
            const panelDelay = step.editingPanelOptions?.delay ?? 800;
            setTimeout(() => {
                this.showEditingPanelDemo(step.editingPanelOptions);
            }, panelDelay);
        }
    }


    getSampleCardHTML(type = 'default') {
        if (type === 'highlight') {
            return `
                <div class="onboarding-example">
                    <div class="example-label">Try a Highlight</div>
                    <div class="example-content">
                        Click into the demo card below, select <span style="background: rgba(94, 114, 228, 0.25); padding: 0 4px; border-radius: 4px;">Machine learning algorithms</span>, then press <strong>Highlight</strong> to see the change.
                    </div>
                </div>
            `;
        }

        if (type === 'color') {
            return `
                <div class="onboarding-example">
                    <div class="example-label">Pick a Color</div>
                    <div class="example-content">
                        Open the color picker in the editing panel and choose a shade—each evidence card remembers its highlight color so you can group insights visually.
                    </div>
                </div>
            `;
        }

        return `
            <div class="onboarding-example">
                <div class="example-label">Sample Evidence Card</div>
                <div class="example-content">
                    <strong>AI capabilities are advancing rapidly</strong><br>
                    Recent developments show that <span style="background: yellow;">AI models have achieved human-level performance</span> in various tasks...
                </div>
            </div>
        `;
    }


    positionTutorialContent(highlightSelector) {
        const content = document.getElementById('onboarding-content');

        if (!highlightSelector) {
            // Default position - bottom right
            content.classList.remove('adaptive');
            content.style.bottom = '2rem';
            content.style.right = '2rem';
            content.style.top = 'auto';
            content.style.left = 'auto';
            return;
        }

        const element = document.querySelector(highlightSelector);
        if (element) {
            const rect = element.getBoundingClientRect();
            const contentRect = content.getBoundingClientRect();
            const viewport = {
                width: window.innerWidth,
                height: window.innerHeight
            };

            // Check if there's space to the right of the highlighted element
            const spaceRight = viewport.width - rect.right;
            const spaceLeft = rect.left;
            const spaceBottom = viewport.height - rect.bottom;

            content.classList.add('adaptive');

            if (spaceRight > 420) {
                // Position to the right of highlighted element
                content.style.left = `${rect.right + 20}px`;
                content.style.top = `${Math.max(20, rect.top)}px`;
                content.style.right = 'auto';
                content.style.bottom = 'auto';
            } else if (spaceLeft > 420) {
                // Position to the left of highlighted element
                content.style.right = `${viewport.width - rect.left + 20}px`;
                content.style.top = `${Math.max(20, rect.top)}px`;
                content.style.left = 'auto';
                content.style.bottom = 'auto';
            } else if (spaceBottom > 300) {
                // Position below highlighted element
                content.style.left = '50%';
                content.style.transform = 'translateX(-50%)';
                content.style.top = `${rect.bottom + 20}px`;
                content.style.right = 'auto';
                content.style.bottom = 'auto';
            } else {
                // Default bottom right if no good space
                content.classList.remove('adaptive');
                content.style.bottom = '2rem';
                content.style.right = '2rem';
                content.style.top = 'auto';
                content.style.left = 'auto';
                content.style.transform = 'none';
            }
        }
    }

    showSamplePanel(forceDemo = false) {
        const cutsPanel = document.querySelector('.cuts-panel');
        if (!cutsPanel) return;

        const cutsList = document.getElementById('cuts-list');
        if (!cutsList) return;

        const existingCards = cutsPanel.querySelectorAll('.card-group:not(.onboarding-sample-card)');
        const hasExistingEvidence = existingCards.length > 0;
        const sampleCards = document.querySelectorAll('.onboarding-sample-card');
        const hasSampleCards = sampleCards.length > 0;

        const shouldInjectSamples = (!hasExistingEvidence && !hasSampleCards) || (forceDemo && !hasSampleCards);

        if (shouldInjectSamples) {
            const emptyMessage = cutsList.querySelector('.cuts-empty');
            if (emptyMessage) {
                emptyMessage.remove();
            }

            const sampleCard1 = document.createElement('div');
            sampleCard1.className = 'card-group onboarding-sample-card';
            sampleCard1.innerHTML = `
                <div class="group-header">
                    <h3 class="group-title" title="Click to copy this card">Sample Evidence Card</h3>
                </div>
                <div class="group-body">
                    <div class="group-card" data-card-id="tutorial-sample-1">
                        <div class="group-cite">Smith et al., 2024</div>
                        <div class="group-content" contenteditable="true">
                            Recent studies demonstrate that <span class="highlight">artificial intelligence systems are achieving unprecedented capabilities</span> across multiple domains.
                        </div>
                        <a class="group-link" href="#">https://example.com/ai-research</a>
                    </div>
                </div>
            `;

            const sampleCard2 = document.createElement('div');
            sampleCard2.className = 'card-group onboarding-sample-card onboarding-highlight-demo';
            sampleCard2.innerHTML = `
                <div class="group-header">
                    <h3 class="group-title" title="Click to copy this card">Interactive Highlighting Demo</h3>
                </div>
                <div class="group-body">
                    <div class="group-card" data-card-id="tutorial-sample-2">
                        <div class="group-cite">Johnson & Lee, 2024</div>
                        <div class="group-content" contenteditable="true">
                            Machine learning algorithms have revolutionized data processing capabilities, enabling researchers to analyze vast datasets with remarkable accuracy and speed.
                        </div>
                        <a class="group-link" href="#">https://example.com/ml-research</a>
                    </div>
                </div>
            `;

            cutsList.prepend(sampleCard1);
            cutsList.prepend(sampleCard2);
        } else if (forceDemo) {
            const highlightDemo = cutsList.querySelector('.onboarding-highlight-demo');
            const standardSample = cutsList.querySelector('.onboarding-sample-card:not(.onboarding-highlight-demo)');

            if (highlightDemo) {
                cutsList.prepend(highlightDemo);
            }

            if (standardSample) {
                const reference = cutsList.querySelector('.onboarding-highlight-demo');
                cutsList.insertBefore(standardSample, reference ? reference.nextElementSibling : cutsList.firstChild);
            }
        }

        if (cutsPanel.style.display !== 'block') {
            cutsPanel.style.display = 'block';
            setTimeout(() => cutsPanel.classList.add('show'), 100);
        }
    }


    showEditingPanelDemo(options = {}) {
        if (!window.editingPanel) return;

        const {
            cardSelector = '.onboarding-sample-card .group-card',
            cardId,
            focus = null,
            emphasizeContent = false,
            autoSelectText = false
        } = options || {};

        const sampleCard = document.querySelector(cardSelector) || document.querySelector('.onboarding-sample-card .group-card');
        if (!sampleCard) return;

        const resolvedCardId = cardId || sampleCard.dataset.cardId || `tutorial-sample-${Date.now()}`;
        sampleCard.dataset.cardId = resolvedCardId;

        const content = sampleCard.querySelector('.group-content');

        this.clearEditingPanelAnimations();

        if (content) {
            content.setAttribute('contenteditable', 'true');
            content.style.cursor = 'text';

            if (emphasizeContent) {
                content.style.background = 'rgba(94, 114, 228, 0.05)';
                content.style.border = '2px dashed rgba(94, 114, 228, 0.3)';
                content.style.borderRadius = '6px';
                content.style.padding = '8px';
                content.style.animation = 'tutorialHighlight 2s ease-in-out infinite';
            }

            if (window.editingPanel.contentElements) {
                window.editingPanel.contentElements.set(resolvedCardId, content);
            }

            if (typeof window.editingPanel.setupContentEventListeners === 'function' && !content.dataset.onboardingListeners) {
                window.editingPanel.setupContentEventListeners(content, resolvedCardId);
                content.dataset.onboardingListeners = 'true';
            }
        }

        const panel = window.editingPanel.createEditingPanel(sampleCard, resolvedCardId);
        if (!panel) return;

        panel.classList.add('show');

        setTimeout(() => {
            if (typeof window.editingPanel.initPickrForCard === 'function') {
                window.editingPanel.initPickrForCard(resolvedCardId);
            }

            this.applyEditingPanelHighlights(panel, focus);

            if (autoSelectText && content) {
                content.focus();
                const range = document.createRange();
                const textNode = content.firstChild;
                if (textNode && textNode.textContent) {
                    const selectionLength = Math.min(textNode.textContent.length, 34);
                    range.setStart(textNode, 0);
                    range.setEnd(textNode, selectionLength);
                    const selection = window.getSelection();
                    selection.removeAllRanges();
                    selection.addRange(range);
                }
            }
        }, 200);
    }


    clearEditingPanelAnimations() {
        // Clear any existing tutorial animations
        document.querySelectorAll('.highlight-toggle, .color-picker-container, .group-title, .group-content').forEach(el => {
            el.style.animation = '';
            el.style.background = '';
            el.style.boxShadow = '';
            el.style.borderRadius = '';
            el.style.padding = '';
            el.style.border = '';
            el.style.transform = '';
            el.style.fontWeight = '';
        });
    }

    applyEditingPanelHighlights(panel, focus) {
        const targetFocus = focus || this.steps[this.currentStep - 1]?.editingPanelOptions?.focus;

        if (targetFocus === 'highlight') {
            const highlightBtn = panel.querySelector('.highlight-toggle');
            if (highlightBtn) {
                highlightBtn.style.animation = 'tutorialHighlight 2s ease-in-out infinite';
                highlightBtn.style.background = 'rgba(94, 114, 228, 0.2)';
                highlightBtn.style.border = '3px solid rgba(94, 114, 228, 0.5)';
                highlightBtn.style.borderRadius = '8px';
                highlightBtn.style.transform = 'scale(1.05)';
                highlightBtn.style.fontWeight = 'bold';
            }
        } else if (targetFocus === 'color-picker') {
            const colorPicker = panel.querySelector('.color-picker-container');
            if (colorPicker) {
                colorPicker.style.animation = 'tutorialHighlight 2s ease-in-out infinite';
                colorPicker.style.boxShadow = '0 0 0 4px rgba(94, 114, 228, 0.4)';
                colorPicker.style.borderRadius = '8px';
                colorPicker.style.background = 'rgba(94, 114, 228, 0.1)';
            }
        }
    }


    showHighlightingDemo() {
        this.showEditingPanelDemo({
            cardSelector: '.onboarding-highlight-demo .group-card',
            cardId: 'tutorial-sample-2',
            focus: 'highlight',
            emphasizeContent: true,
            autoSelectText: true
        });
    }


    highlightElement(selector) {
        const element = document.querySelector(selector);
        if (element) {
            // Store the current highlighted element
            this.currentHighlightedElement = element;

            const rect = element.getBoundingClientRect();
            const padding = 15;

            // Calculate positions for the spotlight
            const spotlightLeft = Math.max(0, rect.left - padding);
            const spotlightTop = Math.max(0, rect.top - padding);
            const spotlightWidth = Math.min(window.innerWidth - spotlightLeft, rect.width + (padding * 2));
            const spotlightHeight = Math.min(window.innerHeight - spotlightTop, rect.height + (padding * 2));

            // Update the spotlight border position
            this.spotlightBorder.style.left = `${spotlightLeft}px`;
            this.spotlightBorder.style.top = `${spotlightTop}px`;
            this.spotlightBorder.style.width = `${spotlightWidth}px`;
            this.spotlightBorder.style.height = `${spotlightHeight}px`;
            this.spotlightBorder.classList.add('show');

            // Make the element interactive by increasing its z-index
            element.style.position = 'relative';
            element.style.zIndex = '10002';
            element.style.pointerEvents = 'auto';

            element.classList.add('tutorial-highlight');
        }
    }

    showTooltip(targetSelector, content) {
        const target = document.querySelector(targetSelector);
        if (target) {
            const rect = target.getBoundingClientRect();
            this.tooltipContent.innerHTML = content;

            // Position tooltip
            const tooltipWidth = 300;
            let left = rect.left + (rect.width / 2) - (tooltipWidth / 2);
            let top = rect.bottom + 20;

            // Adjust if off-screen
            if (left < 20) left = 20;
            if (left + tooltipWidth > window.innerWidth - 20) {
                left = window.innerWidth - tooltipWidth - 20;
            }

            this.tooltip.style.left = `${left}px`;
            this.tooltip.style.top = `${top}px`;
            this.tooltip.classList.add('show');

            // Add arrow
            const arrow = this.tooltip.querySelector('.tooltip-arrow');
            arrow.className = 'tooltip-arrow bottom';
        }
    }

    hideSpotlight() {
        this.spotlightBorder.classList.remove('show');

        // Reset the previously highlighted element
        if (this.currentHighlightedElement) {
            this.currentHighlightedElement.style.position = '';
            this.currentHighlightedElement.style.zIndex = '';
            this.currentHighlightedElement.style.pointerEvents = '';
            this.currentHighlightedElement = null;
        }
    }

    hideTooltip() {
        this.tooltip.classList.remove('show');
    }

    nextStep() {
        if (this.currentStep < this.totalSteps) {
            this.currentStep++;
            this.showStep(this.currentStep);
        } else {
            this.complete();
        }
    }

    prevStep() {
        if (this.currentStep > 1) {
            this.currentStep--;
            this.showStep(this.currentStep);
        }
    }

    complete() {
        // Mark as completed
        localStorage.setItem('evidex_onboarding_completed', 'true');

        // Hide overlay
        this.overlay.classList.remove('show');

        // Clean up
        this.hideSpotlight();
        this.hideTooltip();
        document.querySelectorAll('.tutorial-highlight').forEach(el => {
            el.classList.remove('tutorial-highlight');
        });

        // Reset tutorial content positioning
        const content = document.getElementById('onboarding-content');
        content.classList.remove('adaptive');
        content.style.bottom = '2rem';
        content.style.right = '2rem';
        content.style.top = 'auto';
        content.style.left = 'auto';
        content.style.transform = 'none';

        // Remove all sample cards if they exist
        document.querySelectorAll('.onboarding-sample-card').forEach(card => {
            card.remove();
        });

        // Clean up all tutorial animations and editing panels
        this.clearEditingPanelAnimations();
        document.querySelectorAll('.card-editing-panel').forEach(panel => {
            panel.querySelectorAll('*').forEach(el => {
                el.style.animation = '';
                el.style.background = '';
                el.style.boxShadow = '';
                el.style.border = '';
            });
            panel.remove();
        });

        // Hide cuts panel if it was shown for demo
        const cutsList = document.getElementById('cuts-list');
        if (cutsList && cutsList.children.length === 0) {
            const cutsPanel = document.querySelector('.cuts-panel');
            if (cutsPanel) {
                cutsPanel.style.display = 'none';
                cutsPanel.classList.remove('show');
            }
        }
    }
}
