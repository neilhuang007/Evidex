// Use relative API base so it works on Vercel and local server
const API_BASE = '';

class DynamicOrbs {
    constructor() {
        this.container = document.querySelector('.background-gradient');
        this.colorPalettes = [
            ['#818cf8', '#c084fc'],
            ['#60a5fa', '#34d399'],
            ['#fbbf24', '#fb7185'],
            ['#a78bfa', '#ec4899'],
            ['#f472b6', '#8b5cf6'],
            ['#06b6d4', '#3b82f6'],
            ['#10b981', '#6366f1'],
            ['#f59e0b', '#ef4444'],
            ['#84cc16', '#22d3ee'],
            ['#e879f9', '#7c3aed']
        ];
        this.orbCount = 6;
        this.init();
    }

    init() {
        this.container.innerHTML = '';
        for (let i = 0; i < this.orbCount; i++) {
            this.createOrb(i);
        }
    }

    getRandomValue(min, max) {
        return Math.random() * (max - min) + min;
    }

    createOrb(index) {
        const orb = document.createElement('div');
        orb.className = 'dynamic-orb';
        
        const size = this.getRandomValue(250, 500);
        const colors = this.colorPalettes[Math.floor(Math.random() * this.colorPalettes.length)];
        const duration = this.getRandomValue(8, 15);
        const delay = this.getRandomValue(0, 5);
        
        const startX = this.getRandomValue(-20, 100);
        const startY = this.getRandomValue(-20, 100);
        
        orb.style.width = `${size}px`;
        orb.style.height = `${size}px`;
        orb.style.background = `linear-gradient(${this.getRandomValue(0, 360)}deg, ${colors[0]} 0%, ${colors[1]} 100%)`;
        orb.style.left = `${startX}%`;
        orb.style.top = `${startY}%`;
        orb.style.animationDuration = `${duration}s`;
        orb.style.animationDelay = `${delay}s`;
        orb.style.animationName = `moveOrb${(index % 4) + 1}`;
        
        this.container.appendChild(orb);
    }
}

class CardCutterApp {
    constructor() {
        this.urlInput = document.getElementById('url-input');
        this.claimInput = document.getElementById('claim-input');
        this.cutButton = document.getElementById('cut-button');
        this.mainRoot = document.getElementById('main-root');
        this.containerEl = document.querySelector('.container');
        this.titleEl = document.querySelector('.title');
        this.cutsList = document.getElementById('cuts-list');
        this.downloadAllButton = document.getElementById('download-all-button');
        this.cutsPanel = document.getElementById('cuts-panel');
        this.inputCard = document.querySelector('.input-card');
        this.toast = document.getElementById('toast');
        this.toastAction = document.getElementById('toast-action');
        
        this.currentData = null;
        this.lastDeleted = null; // { type: 'card'|'group', card?, index?, items?: [card,index][] }
        this.cards = []; // in-memory list of all cut cards
        this._isSplit = false;
        this.init();
    }
    
    init() {
        new DynamicOrbs();
        
        this.cutButton.addEventListener('click', () => this.handleCutCards());
        this.downloadAllButton.addEventListener('click', () => this.handleDownloadAll());
        
        this.urlInput.addEventListener('input', () => {
            this.validateInputs();
            this.updateHintState(this.urlInput);
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
        const tempId = `c_${Date.now()}_${Math.random().toString(36).slice(2,8)}`;
        const wasEmpty = this.cards.length === 0;
        const pendingCard = { id: tempId, tagline: claim, link: url, cite: '', content: '', pending: true };
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
                body: JSON.stringify({ link: url, tagline: claim })
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
            const card = {
                id: tempId,
                tagline: claim,
                link: url,
                cite: data.cite || '',
                content: data.content || '',
                pending: false
            };
            this.currentData = card;
            const idx = this.cards.findIndex(c => c.id === tempId);
            if (idx >= 0) this.cards[idx] = card; else this.cards.push(card);
            this.persistCards();
            this.renderCuts();
            this.showToast('Card added to memory', 'success');
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
            
            // Now switch layouts smoothly
            requestAnimationFrame(() => {
                // Switch to two-column layout
                if (this.mainRoot) {
                    this.mainRoot.classList.remove('main-content');
                    this.mainRoot.classList.add('main-split');
                }
                if (this.containerEl) {
                    this.containerEl.classList.add('is-split');
                }
                
                // Add upward flow animation to container
                if (animated && this.containerEl) {
                    this.containerEl.classList.add('flow-up');
                    setTimeout(() => {
                        if (this.containerEl) this.containerEl.classList.remove('flow-up');
                    }, D618);
                }
                
                // Reveal the cuts panel with a smooth slide-in
                if (this.cutsPanel) {
                    this.cutsPanel.style.display = '';
                    requestAnimationFrame(() => {
                        if (this.cutsPanel) {
                            void this.cutsPanel.offsetWidth;
                            this.cutsPanel.classList.add('show');
                        }
                    });
                }
            });

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
                this.lastDeleted = { type: 'group', tagline, items: removedPairs };
                this.showToast('Deleted group', 'success', 'Undo', () => {
                    // Reinsert items at original indexes
                    removedPairs.sort((a,b)=>a[1]-b[1]).forEach(([card, idx]) => {
                        const pos = Math.min(idx, this.cards.length);
                        this.cards.splice(pos, 0, card);
                    });
                    this.persistCards();
                    this.renderCuts();
                });
            });
            header.appendChild(title);
            header.appendChild(del);

            const body = document.createElement('div');
            body.className = 'group-body';

            list.forEach((c, idx) => {
                const item = document.createElement('div');
                item.className = 'group-card';
                const cite = document.createElement('div');
                cite.className = 'group-cite';
                cite.textContent = c.pending ? 'Processing…' : (c.cite || '');
                const para = document.createElement('div');
                para.className = 'group-content';
                if (c.pending) {
                    para.innerHTML = `<div class="mini-loading"><div class="spinner"></div><span>Processing…</span></div>`;
                } else {
                    let highlighted = (c.content || '').replace(/<HL>/g, '<span class="highlight">').replace(/<\/HL>/g, '</span>');
                    para.innerHTML = highlighted;
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
        } catch {}
    }

    loadCards() {
        try {
            const raw = localStorage.getItem('cardsMemory');
            if (raw) this.cards = JSON.parse(raw) || [];
        } catch { this.cards = []; }
        // Ensure each card has an id for robust per-card deletion
        let changed = false;
        for (const c of this.cards) {
            if (!c.id) { c.id = `c_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`; changed = true; }
        }
        if (changed) this.persistCards();
        if (this.cards.length > 0) {
            // If returning user with existing cards, show split layout without the enter animation
            this.switchToSplitLayout(false);
        }
    }

    async handleDownloadAll() {
        if (!this.cards.length) {
            this.showToast('No cards to download', 'error');
            return;
        }
        try {
            const response = await fetch(`${API_BASE}/api/download-docx-bulk`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ cards: this.cards })
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
        }
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
}

document.addEventListener('DOMContentLoaded', () => {
    const app = new CardCutterApp();
    app.loadCards();
    app.renderCuts();
});




