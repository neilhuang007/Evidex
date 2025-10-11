// CardCutterApp.js - Main application class

import {API_BASE, hexToRgba} from './utils.js';
import {DynamicOrbs} from './DynamicOrbs.js';

export class CardCutterApp {
    constructor() {
        this.urlInput = document.getElementById('url-input');
        this.claimInput = document.getElementById('claim-input');
        this.cutButton = document.getElementById('cut-button');
        this.initialExtra = document.getElementById('initial-extra');
        this.mainRoot = document.getElementById('main-root');
        this.containerEl = document.querySelector('.container');
        this.titleEl = document.querySelector('.title');
        this.cutsList = document.getElementById('cuts-list');
        this.downloadAllButton = document.getElementById('download-all-button');
        this.copyAllButton = document.getElementById('copy-all-button');
        this.cutsPanel = document.getElementById('cuts-panel');
        this.inputCard = document.querySelector('.input-card');
        this.toast = document.getElementById('toast');
        this.toastAction = document.getElementById('toast-action');

        this.currentData = null;
        this.lastDeleted = null; // { type: 'card'|'group', card?, index?, items?: [card,index][] }
        this.cards = []; // in-memory list of all cut cards
        this._isSplit = false;
        // Initial minimal mode: only show URL until link is valid
        this.initialMode = !this.peekHasCards();
        if (this.initialMode) {
            document.body.classList.add('initial-mode');
            if (this.inputCard) this.inputCard.classList.add('center-single');
        }
        this.init();
    }

    init() {
        new DynamicOrbs();

        this.cutButton.addEventListener('click', () => this.handleCutCards());
        this.downloadAllButton.addEventListener('click', () => this.handleDownloadAll());
        if (this.copyAllButton) this.copyAllButton.addEventListener('click', () => this.handleCopyAll());

        this.urlInput.addEventListener('input', () => {
            this.validateInputs();
            this.updateHintState(this.urlInput);
            this.maybeRevealInitialExtra();
        });
        this.claimInput.addEventListener('input', () => {
            this.validateInputs();
            this.updateHintState(this.claimInput);
        });

        this.urlInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') this.claimInput.focus();
        });

        this.claimInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter' && this.validateInputs()) {
                this.handleCutCards();
            }
        });

        this.addInputAnimations();
    }

    // Check localStorage without mutating state
    peekHasCards() {
        try {
            const raw = localStorage.getItem('cardsMemory');
            if (!raw) return false;
            const parsed = JSON.parse(raw);
            return Array.isArray(parsed) && parsed.length > 0;
        } catch {
            return false;
        }
    }

    // Reveal tagline + button when a valid link is entered in initial mode
    maybeRevealInitialExtra() {
        if (!this.initialMode || !this.initialExtra) return;
        const urlValue = (this.urlInput?.value || '').trim();
        // Expand on any non-empty input (no strict URL check for reveal)
        const shouldExpand = urlValue.length > 0;
        if (shouldExpand) {
            if (!this.initialExtra.classList.contains('expanded')) {
                this.initialExtra.classList.add('expanded');
                this.initialExtra.setAttribute('aria-hidden', 'false');
                // Focus tagline shortly after expand
                setTimeout(() => this.claimInput && this.claimInput.focus(), 180);
            }
            if (this.inputCard) this.inputCard.classList.remove('center-single');
        } else {
            if (this.initialExtra.classList.contains('expanded')) {
                this.initialExtra.classList.remove('expanded');
                this.initialExtra.setAttribute('aria-hidden', 'true');
            }
            if (this.inputCard) this.inputCard.classList.add('center-single');
        }
    }

    addInputAnimations() {
        const inputs = [this.urlInput, this.claimInput];
        inputs.forEach(input => {
            input.addEventListener('focus', (e) => {
                e.target.parentElement.style.transform = 'scale(1.02)';
                this.updateHintState(e.target);
            });

            input.addEventListener('blur', (e) => {
                e.target.parentElement.style.transform = 'scale(1)';
                this.updateHintState(e.target);
            });

            input.addEventListener('input', (e) => {
                this.updateHintState(e.target);
            });
        });

        // Initialize states on load
        this.updateHintState(this.urlInput);
        this.updateHintState(this.claimInput);
    }

    updateHintState(inputEl) {
        if (!inputEl) return;
        const wrapper = inputEl.parentElement;
        if (!wrapper || !wrapper.classList) return;
        const hasValue = (inputEl.value || '').trim().length > 0;
        wrapper.classList.toggle('has-value', hasValue);

        // Hint positioning logic for split layout:
        // - Stay at top when focused or has value
        // - Return to middle only when empty AND not focused
        const hint = wrapper.querySelector('.input-hint');
        if (hint && this._isSplit) {
            // Clear any existing positioning classes first
            hint.classList.remove('hint-top', 'hint-centered');

            if (!hasValue && !inputEl.matches(':focus')) {
                // Return to middle when empty and not focused
                hint.classList.add('hint-centered');
            } else {
                // Stay at top when focused or has value
                hint.classList.add('hint-top');
            }

            // Force style recalculation
            void hint.offsetHeight;
        }
    }

    validateInputs() {
        const urlValue = this.urlInput.value.trim();
        const claimValue = this.claimInput.value.trim();

        const isValid = urlValue && claimValue && this.isValidUrl(urlValue);

        if (isValid) {
            this.cutButton.style.opacity = '1';
            this.cutButton.style.cursor = 'pointer';
        } else {
            this.cutButton.style.opacity = '0.5';
            this.cutButton.style.cursor = 'not-allowed';
        }

        return isValid;
    }

    isValidUrl(string) {
        try {
            new URL(string);
            return true;
        } catch (_) {
            return false;
        }
    }

    async handleCutCards() {
        if (!this.validateInputs()) {
            this.showToast('Please enter a valid URL and claim', 'error');
            return;
        }

        const url = this.urlInput.value.trim();
        const claim = this.claimInput.value.trim();

        // Add a pending spinner card in the left pane
        const tempId = `c_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
        const wasEmpty = this.cards.length === 0;
        const pendingCard = {id: tempId, tagline: claim, link: url, cite: '', content: '', pending: true};
        this.cards.push(pendingCard);
        this.persistCards();
        this.renderCuts();
        if (wasEmpty) this.switchToSplitLayout();
        // Immediately clear inputs
        this.urlInput.value = '';
        this.claimInput.value = '';
        this.validateInputs();

        // Update hint states after clearing - use setTimeout to ensure DOM updates
        setTimeout(() => {
            this.updateHintState(this.urlInput);
            this.updateHintState(this.claimInput);
        }, 0);

        try {
            const response = await fetch(`${API_BASE}/api/cite`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({link: url, tagline: claim})
            });

            let data;
            try {
                data = await response.json();
            } catch (e) {
                throw new Error(`HTTP ${response.status} (invalid JSON)`);
            }
            if (!response.ok) {
                const msg = (data && (data.error || data.detail)) ? `${data.error || data.detail}` : `HTTP error! status: ${response.status}`;
                throw new Error(msg);
            }

            if (!data || data.status === 'fetch_error') {
                const msg = data && data.error ? data.error : 'Failed to fetch the page content. Please check the link.';
                this.showToast(msg, 'error');
                // Remove pending card on error
                this.cards = this.cards.filter(c => c.id !== tempId);
                this.persistCards();
                this.renderCuts();
                return;
            }
            // Clean and balance content before storing to ensure consistency
            // Strip ALL newlines - content should be single line with <HL> tags only
            const rawContent = data.content || '';
            const contentNoNewlines = rawContent.replace(/\r?\n/g, ' ');
            const cleanedContent = this.cleanupStoredHighlightTags(contentNoNewlines);

            const card = {
                id: tempId,
                tagline: claim,
                link: url,
                cite: data.cite || '',
                content: cleanedContent,
                pending: false
            };

            // Check if evaluation data was included in the response (parallel evaluation)
            if (data.evaluation && typeof data.evaluation.score === 'number') {
                card.evaluationScore = data.evaluation.score;
                card.evaluationBreakdown = {
                    credibility: data.evaluation.credibility,
                    support: data.evaluation.support,
                    contradictions: data.evaluation.contradictions
                };
            }

            this.currentData = card;
            const idx = this.cards.findIndex(c => c.id === tempId);
            if (idx >= 0) this.cards[idx] = card; else this.cards.push(card);
            this.persistCards();
            this.renderCuts();
            this.showToast('Card added to memory', 'success');

            // Auto-evaluate the newly added card only if evaluation wasn't included
            if (!data.evaluation) {
                this.autoEvaluateLatestCard();
            }
        } catch (error) {
            console.error('Error cutting cards:', error);
            this.showToast('Failed to process the document. Please try again.', 'error');
            // Remove pending card on error
            this.cards = this.cards.filter(c => c.id !== tempId);
            this.persistCards();
            this.renderCuts();
        }
    }

    switchToSplitLayout(animated = true) {
        if (this._isSplit) return;
        this._isSplit = true;
        // Leaving initial minimal mode
        this.initialMode = false;
        document.body.classList.remove('initial-mode');
        if (this.inputCard) this.inputCard.classList.remove('center-single');

        const PHI = 1.618, PHI_INV = 0.618, PHI_COMP = 0.382;
        const D382 = 382, D618 = 618, D1000 = 1000; // golden-ratio-inspired timings (ms)
        const STEP_PHI = Math.round(100 * PHI_COMP); // ~38ms steps

        const performSplit = () => {
            // Prepare elements to prevent layout jump (only when animating)
            const labelEls = this.inputCard ? Array.from(this.inputCard.querySelectorAll('.card-header, .input-label')) : [];
            const hintEls = this.inputCard ? Array.from(this.inputCard.querySelectorAll('.input-hint')) : [];

            // Only add reveal prep classes when we are animating the transition.
            // In non-animated (initial load) case, these classes would keep labels invisible.
            if (animated) {
                labelEls.forEach(el => {
                    el.classList.add('reveal-prepare');
                    el.style.margin = '';
                    el.style.padding = '';
                });
            }

            // Force layout calculation before transition
            if (this.mainRoot) void this.mainRoot.offsetHeight;

            // Now switch layouts; animate only when requested
            const applySplitClasses = () => {
                // Switch to two-column layout
                if (this.mainRoot) {
                    this.mainRoot.classList.remove('main-content');
                    this.mainRoot.classList.add('main-split');
                }
                if (this.containerEl) {
                    this.containerEl.classList.add('is-split');
                }
                // Reveal the cuts panel
                if (this.cutsPanel) {
                    this.cutsPanel.style.display = '';
                    if (animated) {
                        requestAnimationFrame(() => {
                            if (this.cutsPanel) {
                                void this.cutsPanel.offsetWidth;
                                this.cutsPanel.classList.add('show');
                            }
                        });
                    } else {
                        this.cutsPanel.classList.add('show');
                    }
                }
                // Ensure input hints are positioned/visible in non-animated loads
                if (!animated) {
                    if (this.urlInput) this.updateHintState(this.urlInput);
                    if (this.claimInput) this.updateHintState(this.claimInput);
                    const labelElsNow = this.inputCard ? Array.from(this.inputCard.querySelectorAll('.card-header, .input-label')) : [];
                    labelElsNow.forEach(el => {
                        el.classList.remove('reveal-prepare', 'reveal-in');
                    });
                }
            };

            if (animated) {
                requestAnimationFrame(() => {
                    applySplitClasses();
                    // Add upward flow animation to container
                    if (this.containerEl) {
                        this.containerEl.classList.add('flow-up');
                        setTimeout(() => {
                            if (this.containerEl) this.containerEl.classList.remove('flow-up');
                        }, D618);
                    }
                });
            } else {
                applySplitClasses();
            }

            // Smooth slide for input card
            if (animated && this.inputCard) {
                requestAnimationFrame(() => {
                    if (this.inputCard) {
                        this.inputCard.classList.add('split-shift');
                        setTimeout(() => {
                            if (this.inputCard) this.inputCard.classList.remove('split-shift');
                        }, D618);
                    }
                });
            }

            // Staggered reveal with smooth upward flow
            if (animated) {
                // Title flows upward
                if (this.titleEl) {
                    this.titleEl.classList.add('title-split-in');
                    setTimeout(() => {
                        if (this.titleEl) this.titleEl.classList.remove('title-split-in');
                    }, D618);
                }

                // Labels flow upward with golden ratio timing (already prepared)
                const labelEls = this.inputCard ? Array.from(this.inputCard.querySelectorAll('.card-header, .input-label')) : [];
                requestAnimationFrame(() => {
                    labelEls.forEach((el, idx) => {
                        const delay = Math.round(PHI_COMP * D382) + idx * STEP_PHI; // ~146ms + 38ms steps
                        el.style.transitionDelay = `${delay}ms`;
                        el.classList.add('reveal-in');
                    });
                });

                // Input hints: flow upward and center properly
                const hintEls = this.inputCard ? Array.from(this.inputCard.querySelectorAll('.input-hint')) : [];
                hintEls.forEach(el => {
                    // Ensure hints are properly centered
                    el.classList.add('hint-fade-prepare');
                });
                if (hintEls.length) void hintEls[0].offsetHeight;
                hintEls.forEach((el, idx) => {
                    const delay = Math.round(PHI_INV * D382) + idx * STEP_PHI; // ~236ms + 38ms steps
                    el.style.transitionDelay = `${delay}ms`;
                    el.classList.add('hint-fade-in');
                    // Clean up classes after animation and set proper state
                    setTimeout(() => {
                        el.classList.remove('hint-fade-prepare', 'hint-fade-in');
                        el.style.transitionDelay = '';
                        // Update hint states for the split layout
                        const input = el.closest('.input-wrapper')?.querySelector('.text-input');
                        if (input) {
                            this.updateHintState(input);
                        }
                    }, D1000);
                });

                // Cuts header flows upward after panel
                const cutsHeader = this.cutsPanel ? this.cutsPanel.querySelector('.cuts-header') : null;
                if (cutsHeader) {
                    cutsHeader.classList.add('reveal-prepare');
                    void cutsHeader.offsetHeight;
                    setTimeout(() => {
                        cutsHeader.classList.add('reveal-in');
                    }, Math.round(PHI_COMP * D382)); // ~146ms - golden ratio timing
                }

                // Clean up animation classes after completion
                setTimeout(() => {
                    labelEls.forEach(el => {
                        el.classList.remove('reveal-prepare', 'reveal-in');
                        el.style.transitionDelay = '';
                    });
                    if (cutsHeader) {
                        cutsHeader.classList.remove('reveal-prepare', 'reveal-in');
                    }
                }, D1000);
            }
        };

        // No blind/overlay; immediately perform the split and let elements animate
        performSplit();

        // Start onboarding tutorial after layout transition if user hasn't seen it
        if (window.onboarding) {
            // Delay to allow animation to complete
            setTimeout(() => {
                window.onboarding.init();
            }, animated ? 1200 : 100);
        }
    }

    // Render the left panel groups, grouped by tagline
    renderCuts() {
        const target = this.cutsList;
        target.innerHTML = '';
        if (!this.cards.length) {
            target.innerHTML = '<div class="cuts-empty">No cards yet. Cut your first card →</div>';
            return;
        }

        // Group by tagline
        const groups = new Map();
        for (const c of this.cards) {
            const key = (c.tagline || '').trim() || '(untitled)';
            if (!groups.has(key)) groups.set(key, []);
            groups.get(key).push(c);
        }

        for (const [tagline, list] of groups.entries()) {
            const groupEl = document.createElement('div');
            groupEl.className = 'card-group';

            const header = document.createElement('div');
            header.className = 'group-header';
            const title = document.createElement('div');
            title.className = 'group-title';
            title.textContent = tagline;
            title.setAttribute('role', 'button');
            title.setAttribute('tabindex', '0');
            title.setAttribute('title', 'Copy this evidence group');
            const cardsForGroup = Array.from(list);
            const triggerCopy = () => {
                this.handleCopyGroup(tagline, cardsForGroup);
            };
            title.addEventListener('click', (event) => {
                event.preventDefault();
                triggerCopy();
            });
            title.addEventListener('keydown', (event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    triggerCopy();
                }
            });

            // Create rating container
            const ratingContainer = document.createElement('div');
            ratingContainer.className = 'rating-container';

            // Calculate average score for the group
            const groupScore = this.calculateGroupScore(list);

            // Create 6 rating bars
            for (let i = 1; i <= 6; i++) {
                const bar = document.createElement('div');
                bar.className = 'rating-bar';

                // Skip filling bars if not evaluated yet
                if (groupScore === -1) {
                    // Leave bars empty (gray)
                } else if (groupScore === 0) {
                    // Special handling for score 0 (contradicts) - all bars are red
                    bar.classList.add('filled', 'score-contradicts');
                } else if (groupScore >= i) {
                    bar.classList.add('filled');
                    // Add color classes based on score
                    if (i <= 2) bar.classList.add('score-poor');
                    else if (i <= 4) bar.classList.add('score-moderate');
                    else if (i === 5) bar.classList.add('score-good');
                    else bar.classList.add('score-excellent');
                }
                ratingContainer.appendChild(bar);
            }

            // Add hint button with tooltip
            const hintBtn = document.createElement('button');
            hintBtn.className = 'hint-btn';
            hintBtn.setAttribute('title', 'View evaluation breakdown');
            hintBtn.innerHTML = '?';

            // Create tooltip
            const tooltip = document.createElement('div');
            tooltip.className = 'evaluation-tooltip';

            const breakdown = this.calculateGroupBreakdown(list);
            if (breakdown) {
                const clampScore = (value, max) => {
                    const numeric = Number(value);
                    if (!Number.isFinite(numeric)) return 0;
                    return Math.max(0, Math.min(Math.round(numeric), max));
                };

                const buildBars = (filled, total) => Array.from({length: total}, (_, index) =>
                    `<div class="bar${index < filled ? ' filled' : ''}"></div>`
                ).join('');

                const getScoreClass = (score, maxScore) => {
                    const percentage = (score / maxScore) * 100;
                    if (percentage >= 90) return 'score-excellent';
                    if (percentage >= 70) return 'score-good';
                    if (percentage >= 50) return 'score-moderate';
                    return 'score-poor';
                };

                const metrics = [
                    {
                        label: 'Relevance',
                        score: breakdown.support?.score || 0
                    },
                    {
                        label: 'Specificity',
                        score: breakdown.credibility?.score || 0
                    },
                    {
                        label: 'Clarity',
                        score: breakdown.contradictions?.score || 0
                    },
                    {
                        label: 'Credibility',
                        score: breakdown.credibility?.score || 0
                    }
                ];

                const metricRows = metrics.map(({label, score}) => {
                    const value = clampScore(score, 10);
                    const filledBars = Math.round((value / 10) * 5); // Convert 0-10 to 0-5 bars
                    const bars = buildBars(filledBars, 5);
                    const scoreClass = getScoreClass(value, 10);
                    return `
                        <div class="metric-row ${scoreClass}">
                            <div class="metric-bars">${bars}</div>
                        </div>
                    `;
                }).join('');

                const metricLabels = metrics.map(({label}) =>
                    `<div class="metric-label">${label}</div>`
                ).join('');

                tooltip.innerHTML = `
                    <div class="tooltip-layout">
                        <div class="tooltip-left">
                            ${metricRows}
                        </div>
                        <div class="tooltip-right">
                            ${metricLabels}
                        </div>
                    </div>
                `;
            } else {
                tooltip.innerHTML = `
                    <div class="tooltip-empty">
                        <div class="tooltip-empty-icon">↻</div>
                        <span class="tooltip-empty-text">Evaluate to preview</span>
                    </div>
                `;
            }

            hintBtn.appendChild(tooltip);
            ratingContainer.appendChild(hintBtn);

            // Add re-evaluate button
            const reEvalBtn = document.createElement('button');
            reEvalBtn.className = 'reevaluate-btn';
            reEvalBtn.setAttribute('title', 'Re-evaluate evidence quality');
            reEvalBtn.innerHTML = '↻';
            reEvalBtn.addEventListener('click', () => {
                this.evaluateGroup(tagline, list);
            });
            ratingContainer.appendChild(reEvalBtn);

            const del = document.createElement('button');
            del.className = 'group-delete';
            del.setAttribute('title', 'Delete group');
            del.innerHTML = '&times;';
            del.addEventListener('click', () => {
                // Delete whole group with undo support
                const removedPairs = [];
                const remaining = [];
                this.cards.forEach((c, i) => {
                    if ((c.tagline || '(untitled)') === tagline) removedPairs.push([c, i]);
                    else remaining.push(c);
                });
                this.cards = remaining;
                this.persistCards();
                this.renderCuts();
                this.lastDeleted = {type: 'group', tagline, items: removedPairs};
                this.showToast('Deleted group', 'success', 'Undo', () => {
                    // Reinsert items at original indexes
                    removedPairs.sort((a, b) => a[1] - b[1]).forEach(([card, idx]) => {
                        const pos = Math.min(idx, this.cards.length);
                        this.cards.splice(pos, 0, card);
                    });
                    this.persistCards();
                    this.renderCuts();
                });
            });
            header.appendChild(title);
            header.appendChild(ratingContainer);
            header.appendChild(del);

            const body = document.createElement('div');
            body.className = 'group-body';

            list.forEach((c, idx) => {
                const item = document.createElement('div');
                item.className = 'group-card';
                // Use the card's stored ID or generate a new one
                const cardId = c.id || `card-${Date.now()}-${idx}`;
                if (!c.id) c.id = cardId; // Store the ID back to the card
                item.dataset.cardId = cardId;

                const cite = document.createElement('div');
                cite.className = 'group-cite';
                cite.textContent = c.pending ? 'Processing…' : (c.cite || '');
                const para = document.createElement('div');
                para.className = 'group-content';
                if (c.pending) {
                    para.innerHTML = `<div class="mini-loading"><div class="spinner"></div><span>Processing…</span></div>`;
                } else {
                    // Apply the color from the color picker to highlighted text
                    // First check if card has saved color, then check editing panel, then default
                    let selectedColor = c.highlightColor || window.editingPanel?.selectedColors.get(cardId) || '#00FF00';

                    // Ensure the editing panel knows about this color
                    if (c.highlightColor && window.editingPanel) {
                        window.editingPanel.selectedColors.set(cardId, c.highlightColor);
                    }

                    const colorOpacity = 0.3; // Adjust opacity for readability
                    const rgbaColor = hexToRgba(selectedColor, colorOpacity);

                    // Content should already be cleaned and balanced when stored
                    // No need to apply balanceHLTags() at render time
                    const content = c.content || '';

                    // Convert <HL> tags to spans
                    let highlighted = content.replace(/<HL>/g, `<span class="highlight" style="background: linear-gradient(180deg, transparent 50%, ${rgbaColor} 50%)">`);
                    highlighted = highlighted.replace(/<\/HL>/g, '</span>');

                    para.innerHTML = highlighted;
                    // Add click handler for editing
                    para.addEventListener('click', (e) => {
                        e.stopPropagation();
                        if (window.editingPanel) {
                            window.editingPanel.handleContentClick(para);
                        }
                    });
                }
                const meta = document.createElement('a');
                meta.href = c.link || '#';
                meta.target = '_blank';
                meta.rel = 'noopener noreferrer';
                meta.className = 'group-link';
                meta.textContent = c.link || '';
                item.appendChild(cite);
                item.appendChild(para);
                item.appendChild(meta);
                body.appendChild(item);
            });

            groupEl.appendChild(header);
            groupEl.appendChild(body);
            target.appendChild(groupEl);
        }
    }

    persistCards() {
        try {
            localStorage.setItem('cardsMemory', JSON.stringify(this.cards));
        } catch {
        }
    }

    loadCards() {
        try {
            const raw = localStorage.getItem('cardsMemory');
            if (raw) this.cards = JSON.parse(raw) || [];
        } catch {
            this.cards = [];
        }

        // Check if we need to perform data migration
        const migrationVersion = this.getMigrationVersion();
        const currentVersion = 4; // v4: Simplified highlighting with no newlines

        let changed = false;

        // Only run cleanup if migration is needed
        if (migrationVersion < currentVersion) {
            console.log(`Migrating cards from version ${migrationVersion} to ${currentVersion}`);

            for (const c of this.cards) {
                // Ensure ID exists
                if (!c.id) {
                    c.id = `c_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
                    changed = true;
                }

                // Clean up content only during migration
                if (c.content && typeof c.content === 'string') {
                    // Strip newlines and clean up tags
                    const contentNoNewlines = c.content.replace(/\r?\n/g, ' ');
                    const cleaned = this.cleanupStoredHighlightTags(contentNoNewlines);

                    if (cleaned !== c.content) {
                        c.content = cleaned;
                        changed = true;
                    }
                }

                // Ensure highlight color exists
                if (!c.highlightColor) {
                    c.highlightColor = '#00FF00';
                    changed = true;
                }
            }

            // Update migration version
            this.setMigrationVersion(currentVersion);
            console.log(`Migration complete`);
        } else {
            // No migration needed, just ensure IDs and colors exist
            for (const c of this.cards) {
                if (!c.id) {
                    c.id = `c_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
                    changed = true;
                }
                if (!c.highlightColor) {
                    c.highlightColor = '#00FF00';
                    changed = true;
                }
            }
        }

        if (changed) this.persistCards();
        if (this.cards.length > 0) {
            // If returning user with existing cards, show split layout without animation
            this.switchToSplitLayout(false);
        }
    }

    getMigrationVersion() {
        try {
            return parseInt(localStorage.getItem('hlTagMigrationVersion') || '0');
        } catch {
            return 0;
        }
    }

    setMigrationVersion(version) {
        try {
            localStorage.setItem('hlTagMigrationVersion', version.toString());
        } catch {
            console.warn('Could not save migration version');
        }
    }

    // Enhanced fix for malformed consecutive opening tags (e.g., <HL>text<HL>moretext</HL> -> <HL>text</HL><HL>moretext</HL>)
    fixConsecutiveOpeningTags(content) {
        if (!content || typeof content !== 'string') return content;

        let fixed = content;

        // Fix pattern: <HL>text<HL>moretext</HL> -> close first HL before second opens
        // This regex finds <HL> followed by text, then another <HL>
        const consecutivePattern = /<HL>([^<]*(?:<(?!\/?HL>)[^<]*)*)<HL>/gi;
        let prevFixed;
        do {
            prevFixed = fixed;
            fixed = fixed.replace(consecutivePattern, '<HL>$1</HL><HL>');
        } while (fixed !== prevFixed);

        return fixed;
    }

    performDeepCleanup(content) {
        let cleaned = content;

        // Fix content that might have been corrupted by previous versions
        // Remove any HTML artifacts that shouldn't be there
        cleaned = cleaned.replace(/&amp;/g, '&');
        cleaned = cleaned.replace(/&quot;/g, '"');
        cleaned = cleaned.replace(/&#39;/g, "'");

        // Fix malformed highlight structures from manual editing
        cleaned = cleaned.replace(/\[HL\]/gi, '<HL>');
        cleaned = cleaned.replace(/\[\/HL\]/gi, '</HL>');
        cleaned = cleaned.replace(/\{HL\}/gi, '<HL>');
        cleaned = cleaned.replace(/\{\/HL\}/gi, '</HL>');

        // Fix content where HL tags got converted to text
        cleaned = cleaned.replace(/&lt;HL&gt;/gi, '<HL>');
        cleaned = cleaned.replace(/&lt;\/HL&gt;/gi, '</HL>');

        // Fix broken tag pairs that might have been created by copy-paste
        cleaned = cleaned.replace(/<HL>([^<]*?)<HL>/gi, '<HL>$1');
        cleaned = cleaned.replace(/<\/HL>([^<]*?)<\/HL>/gi, '$1</HL>');

        // Remove any rouge formatting that might interfere
        cleaned = cleaned.replace(/style\s*=\s*"[^"]*"/gi, '');
        cleaned = cleaned.replace(/class\s*=\s*"[^"]*"/gi, '');

        return cleaned;
    }

    cleanupStoredHighlightTags(content) {
        // Conservative cleanup - only fix obviously broken tags
        let cleaned = content;

        // Normalize tag format to uppercase
        cleaned = cleaned.replace(/<\/?hl>/gi, m => m.toUpperCase());
        cleaned = cleaned.replace(/<HL[^>]*>/gi, '<HL>');
        cleaned = cleaned.replace(/<\/HL[^>]*>/gi, '</HL>');

        // Remove nested tags: <HL>text<HL>more</HL>text</HL> → <HL>textmoretext</HL>
        let prev;
        do {
            prev = cleaned;
            cleaned = cleaned.replace(/<HL>([^<]*)<HL>/gi, '<HL>$1');
            cleaned = cleaned.replace(/<\/HL>([^<]*)<\/HL>/gi, '$1</HL>');
        } while (cleaned !== prev);

        // Merge adjacent tags
        cleaned = cleaned.replace(/<\/HL>\s*<HL>/gi, '');

        // Remove empty tags
        cleaned = cleaned.replace(/<HL>\s*<\/HL>/gi, '');

        // Balance tags - ensure equal open/close counts
        const openCount = (cleaned.match(/<HL>/g) || []).length;
        const closeCount = (cleaned.match(/<\/HL>/g) || []).length;

        if (openCount > closeCount) {
            // Remove excess opening tags from end
            for (let i = 0; i < openCount - closeCount; i++) {
                const idx = cleaned.lastIndexOf('<HL>');
                if (idx !== -1) {
                    cleaned = cleaned.substring(0, idx) + cleaned.substring(idx + 4);
                }
            }
        } else if (closeCount > openCount) {
            // Remove excess closing tags from end
            for (let i = 0; i < closeCount - openCount; i++) {
                const idx = cleaned.lastIndexOf('</HL>');
                if (idx !== -1) {
                    cleaned = cleaned.substring(0, idx) + cleaned.substring(idx + 5);
                }
            }
        }

        return cleaned.trim();
    }

    fixLegacyFormatting(content) {
        let fixed = content;

        // Fix malformed span tags that might have been saved incorrectly
        fixed = fixed.replace(/<span[^>]*class="highlight"[^>]*>/gi, '<HL>');
        fixed = fixed.replace(/<span[^>]*highlight[^>]*>/gi, '<HL>');

        // Fix HTML entities that might have been double-encoded
        fixed = fixed.replace(/&lt;HL&gt;/gi, '<HL>');
        fixed = fixed.replace(/&lt;\/HL&gt;/gi, '</HL>');

        // Fix malformed HL tags with extra attributes or spaces
        fixed = fixed.replace(/<HL[^>]*>/gi, '<HL>');
        fixed = fixed.replace(/<\/HL[^>]*>/gi, '</HL>');

        // Fix case variations
        fixed = fixed.replace(/<hl>/gi, '<HL>');
        fixed = fixed.replace(/<\/hl>/gi, '</HL>');
        fixed = fixed.replace(/<Hl>/gi, '<HL>');
        fixed = fixed.replace(/<\/Hl>/gi, '</HL>');

        // Fix highlight tags with different naming conventions
        fixed = fixed.replace(/<highlight>/gi, '<HL>');
        fixed = fixed.replace(/<\/highlight>/gi, '</HL>');
        fixed = fixed.replace(/<mark>/gi, '<HL>');
        fixed = fixed.replace(/<\/mark>/gi, '</HL>');

        // Fix broken tag formations (common copy-paste issues)
        fixed = fixed.replace(/< HL>/gi, '<HL>');
        fixed = fixed.replace(/<HL >/gi, '<HL>');
        fixed = fixed.replace(/<\/ HL>/gi, '</HL>');
        fixed = fixed.replace(/<\/HL >/gi, '</HL>');

        // Fix tags split across lines or with extra whitespace
        fixed = fixed.replace(/<\s*HL\s*>/gi, '<HL>');
        fixed = fixed.replace(/<\s*\/\s*HL\s*>/gi, '</HL>');

        // Fix orphaned or mismatched tags from previous editing
        fixed = fixed.replace(/([^<])<HL>/gi, '$1<HL>'); // Ensure proper spacing
        fixed = fixed.replace(/<\/HL>([^>\s])/gi, '</HL>$1'); // Ensure proper spacing

        return fixed;
    }

    finalValidation(content) {
        let validated = content;

        // Collapse multiple spaces (but not newlines - though we shouldn't have any)
        validated = validated.replace(/ +/g, ' ');

        // Remove empty HL tags
        validated = validated.replace(/<HL>\s*<\/HL>/gi, '');

        // Remove any HTML tags except HL
        validated = validated.replace(/<\/?(?!HL\b)[^>]*>/gi, '');

        // Trim whitespace at start and end
        validated = validated.trim();

        return validated;
    }

    balanceHLTags(content) {
        if (!content || typeof content !== 'string') return content;

        // Count opening and closing tags
        const openMatches = content.match(/<HL>/gi) || [];
        const closeMatches = content.match(/<\/HL>/gi) || [];
        const openCount = openMatches.length;
        const closeCount = closeMatches.length;

        // Already balanced
        if (openCount === closeCount) return content;

        // More opening than closing tags - need to add closing tags or remove opening ones
        if (openCount > closeCount) {
            // Strategy: Walk through and properly pair tags, removing unpaired opening tags
            let result = content;
            let depth = 0;
            let lastOpenIndex = -1;
            let indicesToRemove = [];

            // Find positions of all tags
            const tagPattern = /<\/?HL>/gi;
            let match;
            const positions = [];

            while ((match = tagPattern.exec(content)) !== null) {
                positions.push({
                    index: match.index,
                    isOpen: match[0].toUpperCase() === '<HL>',
                    length: match[0].length
                });
            }

            // Walk through and track unbalanced tags
            for (const pos of positions) {
                if (pos.isOpen) {
                    depth++;
                    if (depth > 1) {
                        // Nested opening tag - mark for removal
                        indicesToRemove.push(pos.index);
                    }
                    lastOpenIndex = pos.index;
                } else {
                    depth--;
                    if (depth < 0) {
                        // Closing without opening - this shouldn't happen with our cleanup
                        depth = 0;
                    }
                }
            }

            // If there are still unclosed tags, mark the last ones for removal
            if (depth > 0) {
                // Find the last N opening tags and mark them for removal
                const openingPositions = positions.filter(p => p.isOpen).map(p => p.index);
                const toRemove = openingPositions.slice(-depth);
                indicesToRemove.push(...toRemove);
            }

            // Remove tags in reverse order to maintain indices
            indicesToRemove.sort((a, b) => b - a);
            for (const idx of indicesToRemove) {
                result = result.substring(0, idx) + result.substring(idx + 4); // 4 = length of "<HL>"
            }

            return result;
        }

        // More closing than opening tags - remove excess closing tags
        if (closeCount > openCount) {
            let result = content;
            let depth = 0;
            let indicesToRemove = [];

            const tagPattern = /<\/?HL>/gi;
            let match;
            const positions = [];

            while ((match = tagPattern.exec(content)) !== null) {
                positions.push({
                    index: match.index,
                    isOpen: match[0].toUpperCase() === '<HL>',
                    length: match[0].length
                });
            }

            for (const pos of positions) {
                if (pos.isOpen) {
                    depth++;
                } else {
                    depth--;
                    if (depth < 0) {
                        // Extra closing tag - mark for removal
                        indicesToRemove.push(pos.index);
                        depth = 0;
                    }
                }
            }

            // Remove tags in reverse order
            indicesToRemove.sort((a, b) => b - a);
            for (const idx of indicesToRemove) {
                result = result.substring(0, idx) + result.substring(idx + 5); // 5 = length of "</HL>"
            }

            return result;
        }

        return content;
    }

    async handleDownloadAll() {
        if (!this.cards.length) {
            this.showToast('No cards to download', 'error');
            return;
        }

        // Preserve editing panel state during download
        const activeCardId = this.preserveEditingPanelState();

        try {
            // Collect highlight colors for each card
            const cardsWithColors = this.cards.map((card, index) => {
                // First check if the card already has a saved highlightColor
                let color = card.highlightColor || '#00FF00';

                // If no saved color, try to get from editing panel
                if (color === '#00FF00' && card.id && window.editingPanel) {
                    color = window.editingPanel.selectedColors.get(card.id) || '#00FF00';
                }

                // Fallback: find by matching DOM elements
                if (color === '#00FF00' && card.id) {
                    const cardElement = document.querySelector(`[data-card-id="${card.id}"]`);
                    if (cardElement && window.editingPanel) {
                        color = window.editingPanel.selectedColors.get(card.id) || '#00FF00';
                    }
                }

                return {...card, highlightColor: color};
            });


            const response = await fetch(`${API_BASE}/api/download-docx-bulk`, {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({cards: cardsWithColors})
            });
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            const blob = await response.blob();
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `cards_${Date.now()}.docx`;
            document.body.appendChild(a);
            a.click();
            window.URL.revokeObjectURL(url);
            document.body.removeChild(a);
            this.showToast('All cards downloaded!', 'success');
        } catch (e) {
            console.error(e);
            this.showToast('Failed to download cards', 'error');
        } finally {
            // Clear download flag and restore editing panel state
            if (window.editingPanel) {
                window.editingPanel.isDownloading = false;
            }
            this.restoreEditingPanelState(activeCardId);
        }
    }

    preserveEditingPanelState() {
        // Find the currently active editing panel and set download flag
        if (window.editingPanel && window.editingPanel.activePanels.size > 0) {
            window.editingPanel.isDownloading = true;
            const activeCardId = Array.from(window.editingPanel.activePanels.keys())[0];
            return activeCardId;
        }
        return null;
    }

    restoreEditingPanelState(cardId) {
        if (cardId && window.editingPanel) {
            setTimeout(() => {
                const contentElement = window.editingPanel.contentElements.get(cardId);
                if (contentElement) {
                    // Restore focus to keep panel active
                    contentElement.focus();
                    // Ensure panel is visible
                    const panel = window.editingPanel.activePanels.get(cardId);
                    if (panel) {
                        panel.classList.add('show');

                        // Recreate Pickr instance if it was destroyed
                        if (!window.editingPanel.pickrInstances.has(cardId)) {
                            window.editingPanel.initPickrForCard(cardId);
                        }
                    }
                }
            }, 100);
        }
    }

    async copyCardsToClipboard(cards, messages = {}) {
        const {
            empty = 'No cards to copy',
            formatted = 'Copied cards to clipboard',
            plain = 'Copied cards (plain text) to clipboard'
        } = messages;

        if (!Array.isArray(cards) || cards.length === 0) {
            this.showToast(empty, 'error');
            return;
        }

        try {
            const html = this.buildClipboardHtml(cards);
            const plaintext = this.buildClipboardPlain(cards);

            if (navigator.clipboard && window.ClipboardItem) {
                const item = new ClipboardItem({
                    'text/html': new Blob([html], {type: 'text/html'}),
                    'text/plain': new Blob([plaintext], {type: 'text/plain'})
                });
                await navigator.clipboard.write([item]);
                this.showToast(formatted, 'success');
                return;
            }

            if (navigator.clipboard && navigator.clipboard.writeText) {
                await navigator.clipboard.writeText(plaintext);
                this.showToast(plain, 'success');
                return;
            }

            const hidden = document.createElement('div');
            hidden.setAttribute('contenteditable', 'true');
            hidden.style.position = 'fixed';
            hidden.style.left = '-9999px';
            hidden.style.top = '0';
            hidden.innerHTML = html;
            document.body.appendChild(hidden);
            const range = document.createRange();
            range.selectNodeContents(hidden);
            const sel = window.getSelection();
            sel.removeAllRanges();
            sel.addRange(range);
            const ok = document.execCommand('copy');
            sel.removeAllRanges();
            document.body.removeChild(hidden);
            if (ok) {
                this.showToast(formatted, 'success');
            } else {
                throw new Error('execCommand copy failed');
            }
        } catch (e) {
            console.error('Copy failed:', e);
            this.showToast('Failed to copy to clipboard', 'error');
        }
    }

    // Build HTML that mirrors the Word doc formatting and copy to clipboard
    async handleCopyAll() {
        await this.copyCardsToClipboard(this.cards, {
            empty: 'No cards to copy',
            formatted: 'Copied formatted cards to clipboard',
            plain: 'Copied cards (plain text) to clipboard'
        });
    }

    async handleCopyGroup(tagline, cards) {
        const label = (tagline || '').trim() || '(untitled)';
        await this.copyCardsToClipboard(cards, {
            empty: 'No evidence in this group to copy',
            formatted: `Copied "${label}" to clipboard`,
            plain: `Copied "${label}" (plain text) to clipboard`
        });
    }

    // ==== Clipboard builders ====
    escapeHtml(str) {
        return (str ?? '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    // Replace <HL>..</HL> segments with styled spans; non-HL parts are escaped normally.
    // REPLACE THIS WHOLE METHOD
    renderRunsToHtml(text, opts) {
        const {defaultBold, defaultPt} = (opts || {});
        const parts = [];

        let raw = String(text ?? '');
        raw = raw.replace(/<\/?hl>/gi, m => m.toUpperCase());  // normalize <hl> to <HL>
        raw = raw.replace(/<\/span>/gi, '');
        raw = raw.replace(/<span[^>]*>/gi, '');
        raw = raw.replace(/<\/HL>\s*<HL>/gi, '');               // merge adjacent HL

        const FONT_STACK = "font-family:'Times New Roman', Times, serif";
        const resolvedDefaultPt = typeof defaultPt === 'number' ? defaultPt : 10;

        const baseStyle = [
            FONT_STACK,
            `font-size:${resolvedDefaultPt}pt`,
            (defaultBold ? 'font-weight:700' : 'font-weight:400'),
            'color:#000000'
        ].join('; ') + ';';

        // Prefer per-card export color; fallback to neon green
        const selectedColor = window.currentExportColor || '#00FF00';

        // Copy style for highlighted runs: 14px, bold, neon-green background
        const highlightStyle = [
            FONT_STACK,
            'font-size:14px',
            'font-weight:700',
            'color:#000000',
            `background-color:${selectedColor}`,
            // Small padding improves visibility when pasted into Word/Docs
            'padding:0 1px',
            'border-radius:2px'
        ].join('; ') + ';';

        const re = /<HL>([\s\S]*?)<\/HL>/gi;
        let lastIndex = 0, m;
        while ((m = re.exec(raw)) !== null) {
            const idx = m.index;
            if (idx > lastIndex) {
                const chunk = raw.slice(lastIndex, idx);
                parts.push(`<span style="${baseStyle}">${this.escapeHtml(chunk)}</span>`);
            }
            parts.push(`<span style="${highlightStyle}">${this.escapeHtml(m[1])}</span>`);
            lastIndex = re.lastIndex;
        }
        if (lastIndex < raw.length) {
            const tail = raw.slice(lastIndex);
            parts.push(`<span style="${baseStyle}">${this.escapeHtml(tail)}</span>`);
        }
        return parts.join('');
    }


    // Split by \n and preserve empty lines by returning an array of lines including ''
    splitPreserveEmpty(str) {
        return String(str ?? '').replace(/\r\n/g, '\n').split('\n');
    }

    // REPLACE THIS WHOLE METHOD
    // REPLACE THIS WHOLE METHOD
    buildClipboardHtml(cards) {
        const COLORS = {darkBlue: '#002060'};
        const SIZES = {taglinePt: 12, linkPt: 6.5, textPt: 7.5, citePt: 10.5};

        const FONT_STACK = "font-family:'Times New Roman', Times, serif";
        const TEXT_COLOR = 'color:#000000';
        const joinStyles = (parts) => parts.filter(Boolean).join('; ') + ';';

        const cardContainerStyle = joinStyles([FONT_STACK, TEXT_COLOR, 'margin:0']);
        const taglinePStyle = joinStyles(['margin:0', FONT_STACK, `font-size:${SIZES.taglinePt}pt`, 'font-weight:700', TEXT_COLOR]);
        const linkPStyle = joinStyles(['margin:0', FONT_STACK, `font-size:${SIZES.linkPt}pt`, `color:${COLORS.darkBlue}`]);
        const citePStyle = joinStyles(['margin:0', FONT_STACK, `font-size:${SIZES.citePt}pt`, 'font-weight:700', 'font-style:italic', TEXT_COLOR]);
        const spacerPStyle = joinStyles(['margin:0', FONT_STACK, `font-size:${SIZES.textPt}pt`, TEXT_COLOR]);
        const contentParagraphStyle = joinStyles(['margin:0', FONT_STACK, `font-size:${SIZES.textPt}pt`, 'line-height:1.3', TEXT_COLOR]);
        const contentBlankStyle = joinStyles(['margin:0', FONT_STACK, `font-size:${SIZES.textPt}pt`, 'line-height:1.3', TEXT_COLOR, 'height:1em']);
        const contentWrapperStyle = joinStyles([FONT_STACK, TEXT_COLOR]);
        const linkStyle = joinStyles([FONT_STACK, `font-size:${SIZES.linkPt}pt`, `color:${COLORS.darkBlue}`, 'text-decoration:none']);
        const citeStyle = joinStyles([FONT_STACK, `font-size:${SIZES.citePt}pt`, 'font-weight:700', 'font-style:italic', TEXT_COLOR]);

        const chunks = [];

        for (const c of (cards || [])) {
            const cardId = c?.id;
            const tagline = String(c?.tagline ?? '');
            const link = String(c?.link ?? '');
            const cite = String(c?.cite ?? '');
            const content = String(c?.content ?? '');

            // Prefer saved card color, then live panel color, then neon default
            const cardColor = c?.highlightColor || (window.editingPanel?.selectedColors?.get(cardId)) || '#00FF00';
            window.currentExportColor = cardColor; // consumed inside renderRunsToHtml

            const taglineHtml = this.renderRunsToHtml(tagline, {
                defaultBold: true,
                defaultPt: SIZES.taglinePt,
            });

            const safeLink = this.escapeHtml(link);
            const linkHtml = `<a href="${safeLink}" style="${linkStyle}">${safeLink}</a>`;

            const citeHtml = `<span style="${citeStyle}">${this.escapeHtml(cite)}</span>`;

            const contentParas = this.splitPreserveEmpty(content).map(line => {
                if (line === '') return `<p style="${contentBlankStyle}"><br/></p>`;
                const lineHtml = this.renderRunsToHtml(line, {
                    defaultBold: false,
                    defaultPt: SIZES.textPt,
                });
                return `<p style="${contentParagraphStyle}">${lineHtml}</p>`;
            }).join('');

            const cardHtml = `
            <div style="${cardContainerStyle}">
                <p style="${taglinePStyle}">${taglineHtml}</p>
                <p style="${linkPStyle}">${linkHtml}</p>
                <p style="${spacerPStyle}"><br/></p>
                <p style="${citePStyle}">${citeHtml}</p>
                <p style="${spacerPStyle}"><br/></p>
                <div style="${contentWrapperStyle}">
                    ${contentParas}
                </div>
                <p style="${spacerPStyle}"><br/></p>
            </div>
        `;
            chunks.push(cardHtml);
        }

        delete window.currentExportColor;

        // IMPORTANT: wrap with Start/EndFragment so paste targets keep styles
        const fragmentInner = chunks.join('');
        const html =
            `<!DOCTYPE html>
<html><head><meta charset="utf-8"></head>
<body><!--StartFragment-->${fragmentInner}<!--EndFragment--></body>
</html>`.trim();

        return html;
    }


    buildClipboardPlain(cards) {
        const lines = [];
        for (const c of cards) {
            const tagline = String(c?.tagline ?? '');
            const link = String(c?.link ?? '');
            const cite = String(c?.cite ?? '');

            // Clean content of ALL HTML tags, including malformed ones
            let content = String(c?.content ?? '');

            // Step 1: Remove all highlight tags (case insensitive, with or without attributes)
            content = content.replace(/<\/?HL[^>]*>/gi, '');
            content = content.replace(/<\/?hl[^>]*>/gi, '');

            // Step 2: Remove span tags with highlight classes
            content = content.replace(/<span[^>]*class[^>]*highlight[^>]*>/gi, '');
            content = content.replace(/<span[^>]*style[^>]*background[^>]*>/gi, '');

            // Step 3: Remove all remaining HTML tags (including malformed ones)
            content = content.replace(/<[^>]*>/g, '');

            // Step 4: Clean up orphaned closing tags that might have been missed
            content = content.replace(/<\/[^>]*>/g, '');

            // Step 5: Handle malformed tags that don't close properly
            content = content.replace(/<[^<>]*$/, ''); // Remove incomplete tags at end
            content = content.replace(/^[^<>]*>/, ''); // Remove incomplete tags at start

            // Step 6: Decode HTML entities
            content = content.replace(/&amp;/g, '&');
            content = content.replace(/&lt;/g, '<');
            content = content.replace(/&gt;/g, '>');
            content = content.replace(/&quot;/g, '"');
            content = content.replace(/&#39;/g, "'");
            content = content.replace(/&nbsp;/g, ' ');

            // Step 7: Clean up extra whitespace and normalize line breaks
            content = content.replace(/\s+/g, ' ').trim();
            content = content.replace(/\n\s*\n/g, '\n'); // Remove excessive line breaks

            lines.push(tagline);
            lines.push(link);
            lines.push('');
            lines.push(cite);
            lines.push('');
            lines.push(content);
            lines.push('');
            lines.push('');
        }
        return lines.join('\n');
    }

    showToast(message, type = 'success', actionText = null, actionHandler = null) {
        const toastMessage = this.toast.querySelector('.toast-message');
        const toastIcon = this.toast.querySelector('.toast-icon');

        toastMessage.textContent = message;

        if (type === 'error') {
            toastIcon.innerHTML = `
                <path d="M10 18a8 8 0 100-16 8 8 0 000 16z" stroke="currentColor" stroke-width="1.5"/>
                <path d="M13 7l-6 6M7 7l6 6" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
            `;
            toastIcon.style.color = '#ef4444';
        } else {
            toastIcon.innerHTML = `
                <path d="M10 18a8 8 0 100-16 8 8 0 000 16z" stroke="currentColor" stroke-width="1.5"/>
                <path d="M6 10l2 2 6-6" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
            `;
            toastIcon.style.color = '#10b981';
        }
        // Action button (e.g., Undo)
        if (this.toastAction) {
            this.toastAction.style.display = actionText ? '' : 'none';
            this.toastAction.textContent = actionText || '';
            this.toastAction.onclick = null;
            if (actionText && typeof actionHandler === 'function') {
                this.toastAction.onclick = () => {
                    actionHandler();
                    this.toast.classList.remove('show');
                };
            }
        }

        this.toast.classList.add('show');

        clearTimeout(this._toastTimer);
        this._toastTimer = setTimeout(() => {
            this.toast.classList.remove('show');
        }, 4000);
    }

    // Calculate the average evaluation score for a group of cards
    calculateGroupScore(cards) {
        if (!cards || cards.length === 0) return -1;

        // Filter out cards without evaluation scores
        const evaluatedCards = cards.filter(c => c.evaluationScore !== undefined && c.evaluationScore !== null);

        if (evaluatedCards.length === 0) return -1; // Return -1 for not evaluated yet

        // Calculate average score
        const sum = evaluatedCards.reduce((acc, c) => acc + (c.evaluationScore || 0), 0);
        const avg = sum / evaluatedCards.length;

        // Round to nearest integer for display
        return Math.round(avg);
    }

    // Calculate average breakdown for a group of cards
    calculateGroupBreakdown(cards) {
        if (!cards || cards.length === 0) return null;

        // Filter out cards without evaluation breakdowns
        const evaluatedCards = cards.filter(c => c.evaluationBreakdown !== undefined && c.evaluationBreakdown !== null);

        if (evaluatedCards.length === 0) return null;

        // Calculate averages for each metric
        const credibilitySum = evaluatedCards.reduce((acc, c) => acc + (c.evaluationBreakdown.credibility?.score || 0), 0);
        const supportSum = evaluatedCards.reduce((acc, c) => acc + (c.evaluationBreakdown.support?.score || 0), 0);
        const contradictionsSum = evaluatedCards.reduce((acc, c) => acc + (c.evaluationBreakdown.contradictions?.score || 0), 0);

        const count = evaluatedCards.length;

        return {
            credibility: {
                score: (credibilitySum / count).toFixed(1),
                reasoning: evaluatedCards[0].evaluationBreakdown.credibility?.reasoning || ''
            },
            support: {
                score: (supportSum / count).toFixed(1),
                reasoning: evaluatedCards[0].evaluationBreakdown.support?.reasoning || ''
            },
            contradictions: {
                score: (contradictionsSum / count).toFixed(1),
                reasoning: evaluatedCards[0].evaluationBreakdown.contradictions?.reasoning || ''
            }
        };
    }

    // Evaluate a single card
    async evaluateCard(card) {
        if (!card || card.pending) return null;

        try {
            const response = await fetch('/api/evaluate', {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({
                    tagline: card.tagline,
                    cite: card.cite,
                    content: card.content,
                    link: card.link
                })
            });

            if (!response.ok) {
                console.error('Evaluation failed:', response.status);
                return null;
            }

            const data = await response.json();
            return {
                score: data.score,
                credibility: data.credibility,
                support: data.support,
                contradictions: data.contradictions
            };
        } catch (error) {
            console.error('Error evaluating card:', error);
            return null;
        }
    }

    // Evaluate all cards in a group
    async evaluateGroup(tagline, cards) {
        this.showToast('Evaluating evidence...', 'success');

        // Clear existing evaluation scores to show blank bars during re-evaluation
        cards.forEach(card => {
            const cardIndex = this.cards.findIndex(c => c.id === card.id);
            if (cardIndex >= 0) {
                delete this.cards[cardIndex].evaluationScore;
                delete this.cards[cardIndex].evaluationBreakdown;
            }
        });

        // Update UI to show blank bars
        this.persistCards();
        this.renderCuts();

        // Evaluate each card in parallel
        const evaluationPromises = cards.map(async (card) => {
            const evaluation = await this.evaluateCard(card);
            if (evaluation !== null) {
                // Update the card in the main cards array
                const cardIndex = this.cards.findIndex(c => c.id === card.id);
                if (cardIndex >= 0) {
                    this.cards[cardIndex].evaluationScore = evaluation.score;
                    this.cards[cardIndex].evaluationBreakdown = {
                        credibility: evaluation.credibility,
                        support: evaluation.support,
                        contradictions: evaluation.contradictions
                    };
                }
            }
        });

        await Promise.all(evaluationPromises);

        this.persistCards();
        this.renderCuts();
        this.showToast('Evidence evaluated', 'success');
    }

    // Auto-evaluate after card creation
    async autoEvaluateLatestCard() {
        if (this.cards.length === 0) return;

        const latestCard = this.cards[this.cards.length - 1];
        if (latestCard.pending || latestCard.evaluationScore !== undefined) return;

        const evaluation = await this.evaluateCard(latestCard);
        if (evaluation !== null) {
            latestCard.evaluationScore = evaluation.score;
            latestCard.evaluationBreakdown = {
                credibility: evaluation.credibility,
                support: evaluation.support,
                contradictions: evaluation.contradictions
            };
            this.persistCards();
            this.renderCuts();
        }
    }
}
