// Use relative API base so it works on Vercel and local server
const API_BASE = '';

// Helper function to convert hex to rgba
function hexToRgba(hex, alpha = 1) {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

class EditingPanel {
    constructor() {
        this.pickrInstances = new Map();
        this.activePanels = new Map();
        this.selectedColors = new Map(); // Store colors per card
        this.defaultColor = '#00FF00'; // Neon green to match Word document
        this.contentElements = new Map(); // Track content elements by cardId
        this.isSelecting = false; // Track if user is actively selecting text
        this.isDownloading = false; // Track if download is in progress
        this.setupGlobalListeners();
        // Load saved colors when panel is created
        setTimeout(() => this.loadSavedColors(), 100);
    }

    // ADD inside EditingPanel
    liftMarkerOutOfHighlight(marker, side /* 'before' | 'after' */) {
        // Move the marker out of any wrapping .highlight span so the insertion point is outside the highlight.
        while (marker.parentElement && marker.parentElement.classList.contains('highlight')) {
            const span = marker.parentElement;
            if (side === 'before') {
                span.parentNode.insertBefore(marker, span);
            } else {
                span.parentNode.insertBefore(marker, span.nextSibling);
            }
        }
    }


    safeInsertFragmentAtRange(range, fragment) {
        // Record children before insertion (DocumentFragment empties on insert)
        const insertedNodes = Array.from(fragment.childNodes);

        // If the range is inside a text node, split it and insert at the boundary
        const container = range.startContainer;
        const offset = range.startOffset;

        if (container.nodeType === Node.TEXT_NODE) {
            const parent = container.parentNode;
            const after = container.splitText(offset); // split text node at caret
            parent.insertBefore(fragment, after);
        } else {
            const parent = container;
            const refNode = parent.childNodes[offset] ?? null;
            parent.insertBefore(fragment, refNode);
        }

        // Return the nodes that landed in the DOM so callers can restore the selection
        return insertedNodes;
    }

    setupGlobalListeners() {
        // Click outside to close all panels (but not when selecting text)
        document.addEventListener('click', (e) => {
            // Don't close panels if clicking inside editable content, color picker, or action buttons
            if (!e.target.closest('.group-card') &&
                !e.target.closest('.pcr-app') &&
                !e.target.closest('.card-editing-panel') &&
                !e.target.closest('.cuts-footer') &&
                !e.target.closest('.action-buttons')) {

                // Check if there's an active text selection
                const selection = window.getSelection();
                if (selection.rangeCount > 0 && !selection.isCollapsed) {
                    // Don't close panels if user is actively selecting text
                    return;
                }

                this.hideAllPanels();
            }
        });

        // ESC key to close all panels
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                this.hideAllPanels();
            }
        });

        // Selection change listener
        document.addEventListener('selectionchange', () => {
            this.handleSelectionChange();
        });

        // Prevent panel closure during text selection
        document.addEventListener('selectstart', () => {
            this.isSelecting = true;
        });

        document.addEventListener('selectionend', () => {
            setTimeout(() => {
                this.isSelecting = false;
            }, 100);
        });
    }

    createEditingPanel(cardElement, cardId) {
        // Check if panel already exists
        const existingPanel = cardElement.querySelector('.card-editing-panel');
        if (existingPanel) {
            return existingPanel;
        }

        // Create panel HTML
        const panel = document.createElement('div');
        panel.className = 'card-editing-panel';
        panel.innerHTML = `
            <div class="editing-tools">
                <div class="color-picker-container" id="picker-${cardId}"></div>
                <button class="highlight-toggle" data-card-id="${cardId}">
                    Highlight
                </button>
            </div>
        `;

        // Insert after cite, before content
        const citeElement = cardElement.querySelector('.group-cite');
        if (citeElement) {
            citeElement.insertAdjacentElement('afterend', panel);
        } else {
            console.warn('Could not find .group-cite element to insert panel');
            return null;
        }

        // Setup highlight toggle button with mousedown to preserve selection
        const toggleBtn = panel.querySelector('.highlight-toggle');

        // Store the current selection before any mouse events
        let savedSelection = null;

        toggleBtn.addEventListener('mousedown', (e) => {
            e.preventDefault(); // Prevent focus loss and selection clearing
            e.stopPropagation();

            // Save the current selection
            const selection = window.getSelection();
            if (selection.rangeCount > 0) {
                savedSelection = selection.getRangeAt(0).cloneRange();
            }
        });

        toggleBtn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();

            // Restore selection if it was lost
            if (savedSelection) {
                const selection = window.getSelection();
                selection.removeAllRanges();
                selection.addRange(savedSelection);
            }

            this.handleHighlightToggle(toggleBtn, cardId);
        });

        // Initialize Pickr for this card with a small delay to ensure DOM is ready
        setTimeout(() => {
            this.initPickrForCard(cardId);
        }, 50);

        return panel;
    }

    initPickrForCard(cardId) {
        // Destroy existing pickr if it exists
        if (this.pickrInstances.has(cardId)) {
            try {
                this.pickrInstances.get(cardId).destroyAndRemove();
            } catch (e) {
                console.warn('Error destroying pickr:', e);
            }
            this.pickrInstances.delete(cardId);
        }

        // Check if the target element exists with retries
        const targetEl = document.querySelector(`#picker-${cardId}`);
        if (!targetEl) {
            console.warn(`Pickr target element #picker-${cardId} not found, retrying...`);
            console.log('Available picker elements:', Array.from(document.querySelectorAll('[id^="picker-"]')).map(el => el.id));
            console.log('Card element:', document.querySelector(`[data-card-id="${cardId}"]`));
            console.log('Panel element:', document.querySelector(`[data-card-id="${cardId}"] .card-editing-panel`));

            // Retry after a short delay in case DOM is still updating
            setTimeout(() => {
                const retryEl = document.querySelector(`#picker-${cardId}`);
                if (retryEl) {
                    this.initPickrForCard(cardId);
                } else {
                    console.error(`Failed to find Pickr target element #picker-${cardId} after retry`);
                    // Try to recreate the entire panel if the picker element is missing
                    const cardElement = document.querySelector(`[data-card-id="${cardId}"]`);
                    if (cardElement) {
                        console.log('Attempting to recreate panel for missing picker');
                        const existingPanel = cardElement.querySelector('.card-editing-panel');
                        if (existingPanel) {
                            existingPanel.remove();
                        }
                        const newPanel = this.createEditingPanel(cardElement, cardId);
                        if (newPanel) {
                            newPanel.classList.add('show');
                        }
                    }
                }
            }, 100);
            return;
        }

        // Check if element is in a hidden panel and make it visible temporarily for Pickr init
        const panel = targetEl.closest('.card-editing-panel');
        let wasHidden = false;
        if (panel && panel.style.display === 'none') {
            panel.style.display = '';
            wasHidden = true;
        }

        // Ensure the element is visible and in the DOM
        if (!targetEl.offsetParent && targetEl.style.display === 'none') {
            console.warn(`Pickr target element #picker-${cardId} is not visible, delaying initialization`);
            setTimeout(() => this.initPickrForCard(cardId), 150);
            return;
        }

        // Get saved color from card data or selected colors or default
        let savedColor = this.selectedColors.get(cardId) || this.defaultColor;
        if (window.cardCutterApp && window.cardCutterApp.cards) {
            const card = window.cardCutterApp.cards.find(c => c.id === cardId);
            if (card && card.highlightColor) {
                savedColor = card.highlightColor;
                this.selectedColors.set(cardId, savedColor);
            }
        }

        try {
            const pickr = Pickr.create({
                el: `#picker-${cardId}`,
                theme: 'nano',
                default: savedColor,
                swatches: [
                    '#00FF00',
                    '#FFFF00',
                    '#FF8000',
                    '#FF0080',
                    '#8000FF'
                ],
                components: {
                    preview: true,
                    opacity: true,
                    hue: true,
                    interaction: {
                        hex: false,
                        rgba: false,
                        hsla: false,
                        hsva: false,
                        cmyk: false,
                        input: true,
                        clear: false,
                        save: true
                    }
                }
            });

            pickr.on('save', (color) => {
                if (color) {
                    const hexColor = color.toHEXA().toString();
                    this.selectedColors.set(cardId, hexColor);
                    // Update the pickr button background
                    const button = document.querySelector(`#picker-${cardId} .pcr-button`);
                    if (button) {
                        button.style.background = hexColor;
                        button.style.color = hexColor;
                    }
                    // Update highlight spans in this card
                    this.updateHighlightColors(cardId, hexColor);
                    // Save color to card data for persistence
                    this.saveColorToCard(cardId, hexColor);
                    console.log(`Updated color for card ${cardId}: ${hexColor}`);
                }
                pickr.hide();
            });

            // Also update on color change (real-time preview)
            pickr.on('change', (color) => {
                if (color) {
                    const hexColor = color.toHEXA().toString();
                    const button = document.querySelector(`#picker-${cardId} .pcr-button`);
                    if (button) {
                        button.style.background = hexColor;
                        button.style.color = hexColor;
                    }
                    // Update highlight spans in real-time
                    this.updateHighlightColors(cardId, hexColor);
                }
            });

            // Set initial color when pickr is ready
            pickr.on('init', () => {
                const button = document.querySelector(`#picker-${cardId} .pcr-button`);
                if (button) {
                    button.style.background = savedColor;
                    button.style.color = savedColor;
                }
            });

            this.pickrInstances.set(cardId, pickr);

            // If we temporarily made the panel visible for initialization, hide it again
            if (wasHidden && panel) {
                panel.style.display = 'none';
            }
        } catch (e) {
            console.error(`Error creating Pickr for card ${cardId}:`, e);

            // If we temporarily made the panel visible for initialization, hide it again
            if (wasHidden && panel) {
                panel.style.display = 'none';
            }
        }
    }

    handleContentClick(contentElement) {
        const cardElement = contentElement.closest('.group-card');
        if (!cardElement) return;

        // Generate unique ID for this card
        const cardId = cardElement.dataset.cardId || `card-${Date.now()}`;
        cardElement.dataset.cardId = cardId;

        // Store content element reference
        this.contentElements.set(cardId, contentElement);

        // Make content editable
        contentElement.contentEditable = 'true';
        contentElement.spellcheck = false;

        // Hide other panels but keep this one active
        this.hideOtherPanels(cardId);

        // Check if panel already exists for this card
        let panel = this.activePanels.get(cardId);

        if (!panel) {
            // Only create panel if it doesn't exist
            console.log('Creating fresh panel for card:', cardId);
            panel = this.createEditingPanel(cardElement, cardId);

            // Add event listeners only when creating new panel
            this.setupContentEventListeners(contentElement, cardId);

            // Show panel with animation
            setTimeout(() => {
                if (panel) {
                    panel.classList.add('show');
                }
            }, 10);

            this.activePanels.set(cardId, panel);
        } else {
            // Panel exists, just ensure it's visible and functional
            console.log('Panel already exists for card:', cardId, 'ensuring visibility');
            panel.classList.add('show');

            // Verify Pickr instance is still functional
            if (!this.pickrInstances.has(cardId)) {
                console.log('Recreating missing Pickr instance');
                setTimeout(() => {
                    this.initPickrForCard(cardId);
                }, 50);
            }
        }

        // Focus the content
        contentElement.focus();
    }

    selectionHasAnyHighlight(range) {
        const nodes = this.getTextNodesInRange(range);
        if (!nodes.length) return false;

        return nodes.some(node => {
            let el = node.parentElement;
            while (el && !el.classList.contains('group-content')) {
                if (el.classList && el.classList.contains('highlight')) return true;
                el = el.parentElement;
            }
            return false;
        });
    }

    handleHighlightToggle(button, cardId) {
        const contentElement = this.contentElements.get(cardId);
        if (!contentElement) return;

        const selection = window.getSelection();
        if (!selection.rangeCount || selection.isCollapsed) return;

        const range = selection.getRangeAt(0);
        if (!contentElement.contains(range.commonAncestorContainer)) return;

        // If ANY of the selection is highlighted, clicking unhighlights the whole selection.
        // Otherwise it highlights the whole selection.
        const shouldRemove = this.selectionHasAnyHighlight(range);

        if (shouldRemove) {
            this.removeHighlightsFromSelection(range, contentElement, cardId);
            button.classList.remove('active');
        } else {
            this.addHighlightsToSelection(range, contentElement, cardId);
            button.classList.add('active');
        }

        setTimeout(() => this.updateButtonStateForSelection(cardId), 10);
    }

    updateHighlightColors(cardId, hexColor) {
        // Find the card element
        const cardElement = document.querySelector(`[data-card-id="${cardId}"]`);
        if (!cardElement) return;

        // Find all highlight spans in this card and update their background
        const highlightSpans = cardElement.querySelectorAll('.group-content .highlight');
        const colorOpacity = 0.3; // Same opacity used in renderCuts
        const rgbaColor = hexToRgba(hexColor, colorOpacity);

        highlightSpans.forEach(span => {
            span.style.background = `linear-gradient(180deg, transparent 50%, ${rgbaColor} 50%)`;
        });
    }

    saveColorToCard(cardId, hexColor) {
        // Find the card in the main app's cards array and save the color
        if (window.cardCutterApp && window.cardCutterApp.cards) {
            const card = window.cardCutterApp.cards.find(c => c.id === cardId);
            if (card) {
                card.highlightColor = hexColor;
                window.cardCutterApp.persistCards();
            }
        }
    }

    loadSavedColors() {
        // Load saved colors from card data
        if (window.cardCutterApp && window.cardCutterApp.cards) {
            window.cardCutterApp.cards.forEach(card => {
                if (card.id && card.highlightColor) {
                    this.selectedColors.set(card.id, card.highlightColor);
                }
            });
        }
    }

    hideAllPanels() {
        this.activePanels.forEach((panel, cardId) => {
            this.destroyPanelForCard(cardId);
        });
        this.activePanels.clear();
        this.contentElements.clear();
    }

    hideOtherPanels(keepCardId) {
        this.activePanels.forEach((panel, cardId) => {
            if (cardId !== keepCardId) {
                // Destroy other panels completely
                this.destroyPanelForCard(cardId);
            }
        });
    }

    hidePanelForCard(cardId) {
        const panel = this.activePanels.get(cardId);
        if (panel) {
            panel.classList.remove('show');
        }

        // Make content non-editable when closing panel
        const contentElement = this.contentElements.get(cardId);
        if (contentElement) {
            contentElement.contentEditable = 'false';
            // Save the edited content back to the card data
            this.saveContentChanges(cardId, contentElement);
        }

        // Only clean up Pickr instance if we're not in the middle of a download
        if (!this.isDownloading && this.pickrInstances.has(cardId)) {
            try {
                this.pickrInstances.get(cardId).destroyAndRemove();
            } catch (e) {
                console.warn('Error destroying pickr on panel close:', e);
            }
            this.pickrInstances.delete(cardId);
        }
    }

    destroyPanelForCard(cardId) {
        // Save content changes before destroying
        const contentElement = this.contentElements.get(cardId);
        if (contentElement) {
            contentElement.contentEditable = 'false';
            this.saveContentChanges(cardId, contentElement);
        }

        // Destroy Pickr instance completely
        if (this.pickrInstances.has(cardId)) {
            try {
                this.pickrInstances.get(cardId).destroyAndRemove();
            } catch (e) {
                console.warn('Error destroying pickr:', e);
            }
            this.pickrInstances.delete(cardId);
        }

        // Remove panel from DOM completely
        const panel = this.activePanels.get(cardId);
        if (panel) {
            panel.remove();
        }

        // Clear all references
        this.activePanels.delete(cardId);
        this.contentElements.delete(cardId);
    }

    setupContentEventListeners(contentElement, cardId) {
        // Destroy panel completely when content loses focus
        contentElement.addEventListener('blur', (e) => {
            setTimeout(() => {
                const selection = window.getSelection();
                if (selection.rangeCount > 0 && !selection.isCollapsed) {
                    // Keep panel open if there's an active selection
                    return;
                }
                // Don't close if user clicked on action buttons (download, copy, etc.)
                if (e.relatedTarget && (e.relatedTarget.closest('.cuts-footer') ||
                    e.relatedTarget.closest('.action-buttons') ||
                    e.relatedTarget.closest('.pcr-app'))) {
                    return;
                }
                // Only close if there's no selection and user clicked outside
                if (!e.relatedTarget || !e.relatedTarget.closest('.group-card')) {
                    this.destroyPanelForCard(cardId);
                }
            }, 10);
        });

        // Keep panel active during mouseup (after text selection)
        contentElement.addEventListener('mouseup', () => {
            const panel = this.activePanels.get(cardId);
            if (panel) {
                panel.classList.add('show');
            }
        });

        // Prevent panel closure when clicking on download/copy buttons
        document.addEventListener('click', (e) => {
            if (e.target.closest('.cuts-footer') || e.target.closest('.action-buttons')) {
                // Restore focus to the content element to keep panel active
                setTimeout(() => {
                    if (this.activePanels.has(cardId)) {
                        contentElement.focus();
                    }
                }, 10);
            }
        });

        // Update button state when selection changes
        contentElement.addEventListener('selectionchange', () => {
            this.updateButtonStateForSelection(cardId);
        });
    }

    handleSelectionChange() {
        // Check if we have any active panels
        if (this.activePanels.size === 0) return;

        // Get current selection
        const selection = window.getSelection();
        if (!selection.rangeCount) return;

        const range = selection.getRangeAt(0);

        // Find which card contains the selection
        for (const [cardId, contentElement] of this.contentElements.entries()) {
            if (contentElement && contentElement.contains(range.commonAncestorContainer)) {
                this.updateButtonStateForSelection(cardId);
                break;
            }
        }
    }

    updateButtonStateForSelection(cardId) {
        const button = document.querySelector(`.highlight-toggle[data-card-id="${cardId}"]`);
        if (!button) return;

        const selection = window.getSelection();
        if (!selection.rangeCount || selection.isCollapsed) {
            button.classList.remove('active');
            return;
        }

        const range = selection.getRangeAt(0);
        const contentElement = this.contentElements.get(cardId);
        if (!contentElement || !contentElement.contains(range.commonAncestorContainer)) {
            button.classList.remove('active');
            return;
        }

        const isEntirelyHighlighted = this.isSelectionEntirelyHighlighted(range);

        if (isEntirelyHighlighted) {
            button.classList.add('active');
        } else {
            button.classList.remove('active');
        }
    }

    isSelectionEntirelyHighlighted(range) {
        // Get all text nodes in the selection
        const textNodes = this.getTextNodesInRange(range);

        if (textNodes.length === 0) return false;

        // Check if all text nodes are within highlight spans
        return textNodes.every(node => {
            let parent = node.parentElement;
            while (parent && !parent.classList.contains('group-content')) {
                if (parent.classList && parent.classList.contains('highlight')) {
                    return true;
                }
                parent = parent.parentElement;
            }
            return false;
        });
    }

    getTextNodesInRange(range) {
        const textNodes = [];

        // Handle case where the selection is within a single text node
        if (range.startContainer === range.endContainer &&
            range.startContainer.nodeType === Node.TEXT_NODE) {
            return [range.startContainer];
        }

        // For more complex selections, use TreeWalker
        const container = range.commonAncestorContainer;
        const walker = document.createTreeWalker(
            container,
            NodeFilter.SHOW_TEXT,
            {
                acceptNode: (node) => {
                    // Create a range for this text node
                    const nodeRange = document.createRange();
                    nodeRange.selectNodeContents(node);

                    // Check if the node intersects with our selection
                    try {
                        // If ranges don't intersect, one will end before the other starts
                        if (range.compareBoundaryPoints(Range.END_TO_START, nodeRange) >= 0 ||
                            range.compareBoundaryPoints(Range.START_TO_END, nodeRange) <= 0) {
                            return NodeFilter.FILTER_REJECT;
                        }
                        return NodeFilter.FILTER_ACCEPT;
                    } catch (e) {
                        // Fallback: check if node is within the range bounds
                        if (range.intersectsNode && range.intersectsNode(node)) {
                            return NodeFilter.FILTER_ACCEPT;
                        }
                        return NodeFilter.FILTER_REJECT;
                    }
                }
            }
        );

        let node;
        while (node = walker.nextNode()) {
            textNodes.push(node);
        }

        // Fallback: if no nodes found but we have a valid range,
        // include the start and end containers if they're text nodes
        if (textNodes.length === 0) {
            if (range.startContainer.nodeType === Node.TEXT_NODE) {
                textNodes.push(range.startContainer);
            }
            if (range.endContainer !== range.startContainer &&
                range.endContainer.nodeType === Node.TEXT_NODE) {
                textNodes.push(range.endContainer);
            }
        }

        console.log('Found text nodes in range:', textNodes.length, textNodes.map(n => n.textContent));
        return textNodes;
    }

    // REPLACE: addHighlightsToSelection(range, contentElement, cardId)
    addHighlightsToSelection(range, contentElement, cardId) {
        const selectedColor = this.selectedColors.get(cardId) || this.defaultColor;
        const rgbaColor = hexToRgba(selectedColor, 0.3);

        // Work on a clone of current selection
        const cloned = range.cloneContents();
        const temp = document.createElement('div');
        temp.appendChild(cloned);

        // --- Key change: DO NOT flatten to textContent. ---
        // Instead, unwrap existing highlight spans then wrap text nodes individually.

        // 1) Unwrap any highlight spans inside the clone (preserve their children & structure)
        temp.querySelectorAll('.highlight').forEach(span => {
            while (span.firstChild) span.parentNode.insertBefore(span.firstChild, span);
            span.remove();
        });

        // 2) Wrap each TEXT node in a fresh highlight span
        const walker = document.createTreeWalker(temp, NodeFilter.SHOW_TEXT, null);
        const toWrap = [];
        while (walker.nextNode()) toWrap.push(walker.currentNode);

        toWrap.forEach(tn => {
            // Keep empty/whitespace-only nodes too (layout might matter)
            const span = document.createElement('span');
            span.className = 'highlight';
            span.style.background = `linear-gradient(180deg, transparent 50%, ${rgbaColor} 50%)`;
            span.textContent = tn.textContent;
            tn.parentNode.replaceChild(span, tn);
        });

        // Assemble fragment
        const frag = document.createDocumentFragment();
        while (temp.firstChild) frag.appendChild(temp.firstChild);

        // Replace selection safely
        range.deleteContents();
        range.collapse(true);
        const inserted = this.safeInsertFragmentAtRange(range, frag);

        // Merge adjacent highlights at boundaries
        this.mergeAdjacentHighlights(contentElement);
        contentElement.normalize();

        // Restore selection to show the result
        if (inserted.length) {
            const first = inserted[0];
            const last = inserted[inserted.length - 1];
            const sel = window.getSelection();
            sel.removeAllRanges();
            const newRange = document.createRange();
            newRange.setStartBefore(first);
            newRange.setEndAfter(last);
            sel.addRange(newRange);
        }

        // Persist to storage
        this.saveContentChanges(cardId, contentElement);
    }

    serializeContentToHL(contentElement) {
        let out = '';
        let inHL = false;

        const isBlock = (el) => {
            if (el.nodeType !== Node.ELEMENT_NODE) return false;
            const t = el.tagName;
            return t === 'P' || t === 'DIV' || t === 'LI';
        };

        const addNewline = (depth) => {
            // Close before newline so per-line rendering remains balanced
            if (inHL) {
                out += '</HL>\n';
                // Re-open if we are still inside a highlighted ancestor after the newline
                if (depth > 0) out += '<HL>';
            } else {
                out += '\n';
            }
        };

        const walk = (node, hlDepth) => {
            if (node.nodeType === Node.TEXT_NODE) {
                const text = node.nodeValue || '';
                if (!text) return;

                if (hlDepth > 0 && !inHL) {
                    out += '<HL>';
                    inHL = true;
                }
                if (hlDepth === 0 && inHL) {
                    out += '</HL>';
                    inHL = false;
                }

                out += text;
                return;
            }

            if (node.nodeType === Node.ELEMENT_NODE) {
                const el = node;
                const tag = el.tagName;

                if (tag === 'BR') {
                    addNewline(hlDepth);
                    return;
                }

                const adds = (el.classList && el.classList.contains('highlight')) ? 1 : 0;
                const newDepth = hlDepth + adds;

                // Walk children
                for (let child = el.firstChild; child; child = child.nextSibling) {
                    walk(child, newDepth);
                }

                // If this element started a highlight, close it on exit
                if (adds && inHL && hlDepth === 0) {
                    out += '</HL>';
                    inHL = false;
                }

                // Add a newline after block elements
                if (isBlock(el)) {
                    addNewline(newDepth);
                }
            }
        };

        // Walk the actual DOM (read-only)
        walk(contentElement, 0);

        // Close any open <HL> at the very end
        if (inHL) out += '</HL>';

        // Normalize line breaks (no triple+)
        out = out.replace(/\r\n?/g, '\n');
        out = out.replace(/\n{3,}/g, '\n\n');

        // Collapse adjacent/empty HL just in case
        out = out.replace(/<\/HL>\s*<HL>/g, '');
        out = out.replace(/<HL>\s*<\/HL>/g, '');

        return out.trim();
    }

    wrapTextNodesInHighlight(element, rgbaColor) {
        const childNodes = Array.from(element.childNodes);
        childNodes.forEach(node => {
            if (node.nodeType === Node.TEXT_NODE) {
                // Wrap all text nodes, including those with only whitespace
                // (they might be significant for layout)
                const span = document.createElement('span');
                span.className = 'highlight';
                span.style.background = `linear-gradient(180deg, transparent 50%, ${rgbaColor} 50%)`;
                span.textContent = node.textContent;

                // Insert the span and remove the original text node
                if (node.parentNode) {
                    node.parentNode.insertBefore(span, node);
                    node.parentNode.removeChild(node);
                }
            } else if (node.nodeType === Node.ELEMENT_NODE &&
                node.classList &&
                !node.classList.contains('highlight')) {
                // Recursively process element nodes that aren't already highlighted
                this.wrapTextNodesInHighlight(node, rgbaColor);
            }
        });
    }

    // REPLACE this method
    removeHighlightsFromSelection(range, contentElement, cardId) {
        // 1) Insert boundary markers at the current selection
        const START = document.createTextNode('\u2063'); // INVISIBLE SEPARATOR
        const END = document.createTextNode('\u2064'); // INVISIBLE PLUS

        const r = range.cloneRange();

        // Insert END first (at range end), then START at range start
        const endR = r.cloneRange();
        endR.collapse(false);
        endR.insertNode(END);

        const startR = r;
        startR.collapse(true);
        startR.insertNode(START);

        // 2) Define the middle range we want to unhighlight (between markers, exclusive)
        const mid = document.createRange();
        mid.setStartAfter(START);
        mid.setEndBefore(END);

        // 3) Extract the selected contents into a fragment
        const extracted = mid.extractContents();

        // 4) Unwrap any .highlight inside the extracted content
        const temp = document.createElement('div');
        temp.appendChild(extracted);
        temp.querySelectorAll('.highlight').forEach(span => {
            while (span.firstChild) span.parentNode.insertBefore(span.firstChild, span);
            span.remove();
        });

        // Build a clean fragment back
        const cleanFrag = document.createDocumentFragment();
        while (temp.firstChild) cleanFrag.appendChild(temp.firstChild);

        // 5) Move markers OUTSIDE any highlight spans so the insertion point is not wrapped
        this.liftMarkerOutOfHighlight(START, 'after');   // START sits after any left highlight
        this.liftMarkerOutOfHighlight(END, 'before');  // END   sits before any right highlight

        // 6) Insert the clean (unhighlighted) content back between markers
        END.parentNode.insertBefore(cleanFrag, END);

        // 7) Clean up: remove empty highlight spans & merge adjacent
        contentElement.querySelectorAll('.highlight').forEach(span => {
            if (!span.textContent) span.remove();
        });
        this.mergeAdjacentHighlights(contentElement);
        contentElement.normalize();

        // 8) Restore a visible selection around the newly inserted content
        const selRange = document.createRange();
        selRange.setStartAfter(START);
        selRange.setEndBefore(END);
        const sel = window.getSelection();
        sel.removeAllRanges();
        sel.addRange(selRange);

        // 9) Remove markers
        START.remove();
        END.remove();

        // 10) Persist back to storage (<HL> serializer handles it)
        this.saveContentChanges(cardId, contentElement);
    }

    mergeAdjacentHighlights(contentElement) {
        const highlights = contentElement.querySelectorAll('.highlight');

        highlights.forEach(highlight => {
            // Check next sibling
            let next = highlight.nextSibling;
            while (next && next.nodeType === Node.TEXT_NODE && !next.textContent.trim()) {
                next = next.nextSibling;
            }

            if (next && next.nodeType === Node.ELEMENT_NODE && next.classList && next.classList.contains('highlight')) {
                // Same background color check
                if (highlight.style.background === next.style.background) {
                    // Merge with next highlight
                    while (next.firstChild) {
                        highlight.appendChild(next.firstChild);
                    }
                    next.parentNode.removeChild(next);
                }
            }
        });
    }

    saveContentChanges(cardId, contentElement) {
        // Serialize edited DOM back to text + <HL> + \n (balanced, line-safe)
        const serialized = this.serializeContentToHL(contentElement);

        // Update the card data in the app
        if (window.cardCutterApp && window.cardCutterApp.cards) {
            const card = window.cardCutterApp.cards.find(c => c.id === cardId);
            if (card && card.content !== serialized) {
                card.content = serialized;
                window.cardCutterApp.persistCards();
                // No immediate re-render (avoid killing the active panel)
            }
        }
    }
}

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
        } catch { return false; }
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

                    let highlighted = (c.content || '').replace(/<HL>/g, `<span class="highlight" style="background: linear-gradient(180deg, transparent 50%, ${rgbaColor} 50%)">`);
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
        } catch {}
    }

    loadCards() {
        try {
            const raw = localStorage.getItem('cardsMemory');
            if (raw) this.cards = JSON.parse(raw) || [];
        } catch { this.cards = []; }

        // Check if we need to perform data migration
        const migrationVersion = this.getMigrationVersion();
        const currentVersion = 2; // Increment this when adding new migrations

        // Ensure each card has an id and clean up any malformed HL tags
        let changed = false;
        let migrationApplied = false;

        for (const c of this.cards) {
            if (!c.id) {
                c.id = `c_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
                changed = true;
            }

            // Always clean up HL tags if migration version is outdated
            if (c.content && typeof c.content === 'string') {
                const originalContent = c.content;
                const cleaned = this.cleanupStoredHighlightTags(c.content);

                if (cleaned !== originalContent) {
                    c.content = cleaned;
                    changed = true;
                    migrationApplied = true;
                    console.log(`Fixed formatting in card: ${c.cite || 'Untitled'}`);
                }

                // Additional checks for legacy issues
                if (migrationVersion < currentVersion) {
                    // Perform comprehensive legacy cleanup
                    const deepCleaned = this.performDeepCleanup(c.content);
                    if (deepCleaned !== c.content) {
                        c.content = deepCleaned;
                        changed = true;
                        migrationApplied = true;
                    }
                }
            }

            // Ensure highlight color is properly stored
            if (!c.highlightColor) {
                c.highlightColor = '#00FF00'; // Default color
                changed = true;
            }
        }

        // Update migration version if any migrations were applied
        if (migrationApplied || migrationVersion < currentVersion) {
            this.setMigrationVersion(currentVersion);
            console.log(`Migration completed. Updated ${this.cards.length} cards to version ${currentVersion}`);
        }

        if (changed) this.persistCards();
        if (this.cards.length > 0) {
            // If returning user with existing cards, show split layout without the enter animation
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
        // Comprehensive cleanup for all previous formatting issues
        let cleaned = content;

        // Step 0: Fix common legacy formatting issues
        cleaned = this.fixLegacyFormatting(cleaned);

        // Step 1: Remove nested HL tags by flattening them
        let prevCleaned;
        do {
            prevCleaned = cleaned;
            // Remove nested opening HL tags: <HL>text<HL>moretext</HL>text</HL> -> <HL>textmoretexttext</HL>
            cleaned = cleaned.replace(/<HL>([^<]*(?:<(?!\/?HL>)[^<]*)*)<HL>([^<]*(?:<(?!\/?HL>)[^<]*)*)<\/HL>([^<]*(?:<(?!\/?HL>)[^<]*)*)<\/HL>/gi, '<HL>$1$2$3</HL>');
            // Handle simpler nested cases
            cleaned = cleaned.replace(/<HL>([^<]*)<HL>/gi, '<HL>$1');
            cleaned = cleaned.replace(/<\/HL>([^<]*)<\/HL>/gi, '$1</HL>');
            // Handle triple+ nesting
            cleaned = cleaned.replace(/<HL>([^<]*(?:<(?!\/?HL>)[^<]*)*)<HL>([^<]*(?:<(?!\/?HL>)[^<]*)*)<HL>/gi, '<HL>$1$2');
        } while (cleaned !== prevCleaned);

        // Step 2: Merge adjacent HL tags
        cleaned = cleaned.replace(/<\/HL>\s*<HL>/gi, '');

        // Step 3: Remove empty HL tags
        cleaned = cleaned.replace(/<HL>\s*<\/HL>/gi, '');

        // Step 4: Ensure all HL tags are properly balanced
        const openTags = (cleaned.match(/<HL>/g) || []).length;
        const closeTags = (cleaned.match(/<\/HL>/g) || []).length;

        if (openTags > closeTags) {
            // Add missing closing tags
            for (let i = 0; i < openTags - closeTags; i++) {
                cleaned += '</HL>';
            }
        } else if (closeTags > openTags) {
            // Remove extra closing tags from the end
            for (let i = 0; i < closeTags - openTags; i++) {
                const lastCloseIndex = cleaned.lastIndexOf('</HL>');
                if (lastCloseIndex !== -1) {
                    cleaned = cleaned.substring(0, lastCloseIndex) + cleaned.substring(lastCloseIndex + 5);
                }
            }
        }

        // Step 5: Final validation and cleanup
        cleaned = this.finalValidation(cleaned);

        return cleaned;
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

        console.log('Legacy formatting fixes applied:', fixed !== content);
        return fixed;
    }

    finalValidation(content) {
        let validated = content;

        // Ensure no HL tags are inside words (split words properly)
        validated = validated.replace(/(\w)<HL>/gi, '$1 <HL>');
        validated = validated.replace(/<\/HL>(\w)/gi, '</HL> $1');

        // Fix multiple spaces that might have been introduced
        validated = validated.replace(/\s+/g, ' ');

        // Ensure HL tags don't contain only whitespace
        validated = validated.replace(/<HL>\s+<\/HL>/gi, '');

        // Remove any remaining malformed HTML that might interfere
        validated = validated.replace(/<\/?(?!HL\b)[^>]*>/gi, ''); // Remove any HTML tags except HL

        // Normalize line breaks and spacing
        validated = validated.replace(/\r\n/g, '\n');
        validated = validated.replace(/\r/g, '\n');

        // Remove excessive line breaks
        validated = validated.replace(/\n{3,}/g, '\n\n');

        // Trim excessive whitespace at start and end
        validated = validated.trim();

        return validated;
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

                console.log(`Card "${card.cite}" using color: ${color} (saved: ${card.highlightColor}, id: ${card.id})`);
                return {...card, highlightColor: color};
            });

            console.log('Sending cards with colors to API:', cardsWithColors);

            const response = await fetch(`${API_BASE}/api/download-docx-bulk`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
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
                            console.log('Recreating Pickr instance for card:', cardId);
                            window.editingPanel.initPickrForCard(cardId);
                        }
                    }
                }
            }, 100);
        }
    }

    // Build HTML that mirrors the Word doc formatting and copy to clipboard
    async handleCopyAll() {
        if (!this.cards.length) {
            this.showToast('No cards to copy', 'error');
            return;
        }
        try {
            const html = this.buildClipboardHtml(this.cards);
            const plaintext = this.buildClipboardPlain(this.cards);

            // Preferred modern API: write HTML + plain text
            if (navigator.clipboard && window.ClipboardItem) {
                const item = new ClipboardItem({
                    'text/html': new Blob([html], {type: 'text/html'}),
                    'text/plain': new Blob([plaintext], {type: 'text/plain'})
                });
                await navigator.clipboard.write([item]);
                this.showToast('Copied formatted cards to clipboard', 'success');
                return;
            }

            // Fallback to writeText (plain only)
            if (navigator.clipboard && navigator.clipboard.writeText) {
                await navigator.clipboard.writeText(plaintext);
                this.showToast('Copied cards (plain text) to clipboard', 'success');
                return;
            }

            // Legacy fallback using a hidden contentEditable element (copies HTML)
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
            if (ok) this.showToast('Copied formatted cards to clipboard', 'success');
            else throw new Error('execCommand copy failed');
        } catch (e) {
            console.error('Copy failed:', e);
            this.showToast('Failed to copy to clipboard', 'error');
        }
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
}

document.addEventListener('DOMContentLoaded', () => {
    const app = new CardCutterApp();
    app.loadCards();
    app.renderCuts();

    // Make app available globally for color persistence
    window.cardCutterApp = app;

    // Initialize editing panel globally
    window.editingPanel = new EditingPanel();
});





