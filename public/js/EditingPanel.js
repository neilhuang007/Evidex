// EditingPanel.js - Handles text editing and highlighting functionality
import {hexToRgba} from './utils.js';

export class EditingPanel {
    constructor() {
        this.pickrInstances = new Map();
        this.activePanels = new Map();
        this.selectedColors = new Map(); // Store colors per card
        this.defaultColor = '#00FF00'; // Neon green to match Word document
        this.contentElements = new Map(); // Track content elements by cardId
        this.initializedContentElements = new WeakSet();
        this.isSelecting = false; // Track if user is actively selecting text
        this.isDownloading = false; // Track if download is in progress
        this.setupGlobalListeners();
        // Load saved colors when panel is created
        setTimeout(() => this.loadSavedColors(), 100);
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
            panel.classList.add('show');

            // Verify Pickr instance is still functional
            if (!this.pickrInstances.has(cardId)) {
                setTimeout(() => {
                    this.initPickrForCard(cardId);
                }, 50);
            }
        }

        // Focus the content
        contentElement.focus();
    }

    handleHighlightToggle(button, cardId) {
        const contentElement = this.contentElements.get(cardId);
        if (!contentElement) return;

        const selection = window.getSelection();
        if (!selection.rangeCount || selection.isCollapsed) return;

        const range = selection.getRangeAt(0);
        if (!contentElement.contains(range.commonAncestorContainer)) return;

        // A mixed selection becomes fully highlighted. Toggle off only when every
        // selected character is already highlighted.
        const shouldRemove = this.isSelectionEntirelyHighlighted(range);

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
        if (this.initializedContentElements.has(contentElement)) return;
        this.initializedContentElements.add(contentElement);

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

        // Selection state is handled by the single document listener installed
        // in setupGlobalListeners().
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
        const contentElement = this.getContentRootForRange(range);
        if (!contentElement) return false;

        const bounds = this.getSelectionBounds(range, contentElement);
        if (!bounds || bounds.start === bounds.end) return false;

        const segments = this.getTextSegments(contentElement, bounds.start, bounds.end);
        return segments.length > 0 && segments.every(({node}) =>
            Boolean(this.findHighlightAncestor(node, contentElement))
        );
    }

    // Mutate only the selected text nodes. This preserves surrounding markup and
    // avoids rebuilding the entire editable element for every toggle.
    addHighlightsToSelection(range, contentElement, cardId) {
        const selectionBounds = this.getSelectionBounds(range, contentElement);
        if (!selectionBounds || selectionBounds.start === selectionBounds.end) return;

        const selectedColor = this.selectedColors.get(cardId) || this.defaultColor;
        const rgbaColor = hexToRgba(selectedColor, 0.3);
        const background = `linear-gradient(180deg, transparent 50%, ${rgbaColor} 50%)`;
        const segments = this.getTextSegments(
            contentElement,
            selectionBounds.start,
            selectionBounds.end
        ).reverse();
        const createdHighlights = [];

        for (const segment of segments) {
            if (this.findHighlightAncestor(segment.node, contentElement)) continue;
            const selectedNode = this.isolateTextSegment(
                segment.node,
                segment.startOffset,
                segment.endOffset
            );
            const span = document.createElement('span');
            span.className = 'highlight';
            span.style.background = background;
            selectedNode.parentNode.insertBefore(span, selectedNode);
            span.appendChild(selectedNode);
            createdHighlights.push(span);
        }

        this.mergeCreatedHighlights(createdHighlights);
        this.restoreSelectionByPositions(contentElement, selectionBounds.start, selectionBounds.end);
        this.saveContentChanges(cardId, contentElement);
    }

    removeHighlightsFromSelection(range, contentElement, cardId) {
        const selectionBounds = this.getSelectionBounds(range, contentElement);
        if (!selectionBounds || selectionBounds.start === selectionBounds.end) return;

        const segments = this.getTextSegments(
            contentElement,
            selectionBounds.start,
            selectionBounds.end
        ).reverse();

        for (const segment of segments) {
            if (!this.findHighlightAncestor(segment.node, contentElement)) continue;
            let selectedBranch = this.isolateTextSegment(
                segment.node,
                segment.startOffset,
                segment.endOffset
            );
            let highlight = this.findHighlightAncestor(selectedBranch, contentElement);
            while (highlight) {
                selectedBranch = this.liftBranchOutOfHighlight(selectedBranch, highlight);
                highlight = this.findHighlightAncestor(selectedBranch, contentElement);
            }
        }

        this.normalizeHighlightDom(contentElement);
        this.restoreSelectionByPositions(contentElement, selectionBounds.start, selectionBounds.end);
        this.saveContentChanges(cardId, contentElement);
    }

    getContentRootForRange(range) {
        let container = range.commonAncestorContainer;
        if (container.nodeType === Node.TEXT_NODE) container = container.parentElement;
        return container?.closest?.('.group-content') || null;
    }

    getSelectionBounds(range, contentElement) {
        const containsBoundary = (node) => node === contentElement || contentElement.contains(node);
        if (!containsBoundary(range.startContainer) || !containsBoundary(range.endContainer)) {
            return null;
        }

        const offsetTo = (container, offset) => {
            const prefix = document.createRange();
            prefix.selectNodeContents(contentElement);
            prefix.setEnd(container, offset);
            return prefix.toString().length;
        };

        return {
            start: offsetTo(range.startContainer, range.startOffset),
            end: offsetTo(range.endContainer, range.endOffset)
        };
    }

    getTextSegments(contentElement, start, end) {
        const segments = [];
        const walker = document.createTreeWalker(contentElement, NodeFilter.SHOW_TEXT);
        let position = 0;
        let node;

        while ((node = walker.nextNode())) {
            const length = node.nodeValue?.length || 0;
            const nodeEnd = position + length;
            const overlapStart = Math.max(start, position);
            const overlapEnd = Math.min(end, nodeEnd);

            if (overlapStart < overlapEnd) {
                segments.push({
                    node,
                    startOffset: overlapStart - position,
                    endOffset: overlapEnd - position
                });
            }

            position = nodeEnd;
            if (position >= end) break;
        }

        return segments;
    }

    findHighlightAncestor(node, contentElement) {
        let parent = node.parentElement;
        while (parent && parent !== contentElement) {
            if (parent.classList.contains('highlight')) return parent;
            parent = parent.parentElement;
        }
        return null;
    }

    isolateTextSegment(node, startOffset, endOffset) {
        if (endOffset < node.length) node.splitText(endOffset);
        return startOffset > 0 ? node.splitText(startOffset) : node;
    }

    liftBranchOutOfHighlight(branch, highlight) {
        let selectedBranch = branch;

        // Preserve inline formatting by cloning each formatting ancestor around
        // the selected branch before splitting the highlight itself.
        while (selectedBranch.parentNode && selectedBranch.parentNode !== highlight) {
            const parent = selectedBranch.parentNode;
            const grandparent = parent.parentNode;
            if (!grandparent) return selectedBranch;

            const before = parent.cloneNode(false);
            const selected = parent.cloneNode(false);
            const after = parent.cloneNode(false);
            let seenSelected = false;

            for (const child of Array.from(parent.childNodes)) {
                if (child === selectedBranch) {
                    seenSelected = true;
                    selected.appendChild(child);
                } else if (seenSelected) {
                    after.appendChild(child);
                } else {
                    before.appendChild(child);
                }
            }

            const replacements = [];
            if (before.hasChildNodes()) replacements.push(before);
            replacements.push(selected);
            if (after.hasChildNodes()) replacements.push(after);
            parent.replaceWith(...replacements);
            selectedBranch = selected;
        }

        if (selectedBranch.parentNode !== highlight || !highlight.parentNode) {
            return selectedBranch;
        }

        const beforeHighlight = highlight.cloneNode(false);
        const afterHighlight = highlight.cloneNode(false);
        let seenSelected = false;
        for (const child of Array.from(highlight.childNodes)) {
            if (child === selectedBranch) {
                seenSelected = true;
            } else if (seenSelected) {
                afterHighlight.appendChild(child);
            } else {
                beforeHighlight.appendChild(child);
            }
        }

        const replacements = [];
        if (beforeHighlight.hasChildNodes()) replacements.push(beforeHighlight);
        replacements.push(selectedBranch);
        if (afterHighlight.hasChildNodes()) replacements.push(afterHighlight);
        highlight.replaceWith(...replacements);
        return selectedBranch;
    }

    mergeCreatedHighlights(highlights) {
        const matches = (left, right) =>
            left?.nodeType === Node.ELEMENT_NODE &&
            right?.nodeType === Node.ELEMENT_NODE &&
            left.classList.contains('highlight') &&
            right.classList.contains('highlight') &&
            left.style.cssText === right.style.cssText;

        for (const created of highlights) {
            if (!created.isConnected) continue;
            let highlight = created;
            const previous = highlight.previousSibling;
            if (matches(previous, highlight)) {
                previous.append(...highlight.childNodes);
                highlight.remove();
                highlight = previous;
            }

            const next = highlight.nextSibling;
            if (matches(highlight, next)) {
                highlight.append(...next.childNodes);
                next.remove();
            }
        }
    }

    normalizeHighlightDom(contentElement) {
        // Flatten legacy nested highlights before merging direct siblings.
        const nested = Array.from(contentElement.querySelectorAll('.highlight .highlight')).reverse();
        for (const highlight of nested) highlight.replaceWith(...highlight.childNodes);

        for (const highlight of Array.from(contentElement.querySelectorAll('.highlight'))) {
            if (!highlight.textContent && !highlight.querySelector('br')) {
                highlight.remove();
                continue;
            }

            let next = highlight.nextSibling;
            while (next?.nodeType === Node.ELEMENT_NODE &&
                next.classList.contains('highlight') &&
                next.style.cssText === highlight.style.cssText) {
                const following = next.nextSibling;
                highlight.append(...next.childNodes);
                next.remove();
                next = following;
            }
        }

        contentElement.normalize();
    }

    serializeContentToHL(contentElement) {
        const runs = [];
        const append = (text, highlighted) => {
            if (!text) return;
            const previous = runs[runs.length - 1];
            if (previous && previous.highlighted === highlighted) {
                previous.text += text;
            } else {
                runs.push({text, highlighted});
            }
        };
        const appendBreak = (dedupe = false) => {
            const previous = runs[runs.length - 1];
            if (dedupe && previous?.text.endsWith('\n')) return;
            append('\n', false);
        };

        const walk = (node, highlighted = false, isRoot = false) => {
            if (node.nodeType === Node.TEXT_NODE) {
                append(node.nodeValue || '', highlighted);
                return;
            }
            if (node.nodeType !== Node.ELEMENT_NODE) return;

            if (node.tagName === 'BR') {
                appendBreak();
                return;
            }

            const nextHighlighted = highlighted || node.classList.contains('highlight');
            for (const child of node.childNodes) walk(child, nextHighlighted);

            if (!isRoot && ['DIV', 'P', 'LI'].includes(node.tagName)) appendBreak(true);
        };

        walk(contentElement, false, true);
        return runs.map(run => run.highlighted
            ? `<HL>${run.text}</HL>`
            : run.text
        ).join('');
    }

    // Restore selection by absolute text positions
    restoreSelectionByPositions(contentElement, startPos, endPos) {
        const textNodes = [];
        const walker = document.createTreeWalker(
            contentElement,
            NodeFilter.SHOW_TEXT,
            null
        );

        let node;
        while (node = walker.nextNode()) {
            textNodes.push(node);
        }

        if (textNodes.length === 0) return;

        // Find nodes and offsets for start and end positions
        let currentPos = 0;
        let startNode = null, startOffset = 0;
        let endNode = null, endOffset = 0;

        for (const textNode of textNodes) {
            const nodeLength = textNode.textContent.length;
            const nodeEnd = currentPos + nodeLength;

            // Find start position
            if (startNode === null && startPos >= currentPos && startPos <= nodeEnd) {
                startNode = textNode;
                startOffset = startPos - currentPos;
            }

            // Find end position
            if (endNode === null && endPos >= currentPos && endPos <= nodeEnd) {
                endNode = textNode;
                endOffset = endPos - currentPos;
            }

            currentPos = nodeEnd;

            // Stop if both found
            if (startNode && endNode) break;
        }

        // Set selection if we found valid positions
        if (startNode && endNode) {
            try {
                const range = document.createRange();
                range.setStart(startNode, startOffset);
                range.setEnd(endNode, endOffset);

                const selection = window.getSelection();
                selection.removeAllRanges();
                selection.addRange(range);
            } catch (e) {
                console.warn('Could not restore selection:', e);
            }
        }
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
