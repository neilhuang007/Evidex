// EditingPanel.js - Handles text editing and highlighting functionality
import {hexToRgba} from './utils.js';

export class EditingPanel {
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

        return textNodes;
    }

    // Position-based highlight addition - preserves text integrity
    addHighlightsToSelection(range, contentElement, cardId) {
        const selectedColor = this.selectedColors.get(cardId) || this.defaultColor;
        const rgbaColor = hexToRgba(selectedColor, 0.3);

        // Step 1: Convert current DOM to position-based representation
        const positionData = this.domToPositionData(contentElement);

        // Step 2: Get selection boundaries in absolute text positions
        const selectionBounds = this.getSelectionBounds(range, contentElement);
        if (!selectionBounds) return;

        // Step 3: Add new highlight range to position data
        positionData.highlights.push({
            start: selectionBounds.start,
            end: selectionBounds.end,
            color: `linear-gradient(180deg, transparent 50%, ${rgbaColor} 50%)`
        });

        // Step 4: Merge overlapping/adjacent highlights
        positionData.highlights = this.mergeHighlightRanges(positionData.highlights);

        // Step 5: Rebuild DOM from position data
        this.rebuildDOMFromPositions(contentElement, positionData);

        // Step 6: Restore selection to original positions
        this.restoreSelectionByPositions(contentElement, selectionBounds.start, selectionBounds.end);

        // Step 7: Save changes
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

    // Position-based highlight removal - preserves text integrity
    removeHighlightsFromSelection(range, contentElement, cardId) {
        // Step 1: Convert current DOM to position-based representation
        const positionData = this.domToPositionData(contentElement);

        // Step 2: Get selection boundaries in absolute text positions
        const selectionBounds = this.getSelectionBounds(range, contentElement);
        if (!selectionBounds) return;

        // Step 3: Remove highlights that overlap with selection
        positionData.highlights = this.removeHighlightRange(
            positionData.highlights,
            selectionBounds.start,
            selectionBounds.end
        );

        // Step 4: Rebuild DOM from position data
        this.rebuildDOMFromPositions(contentElement, positionData);

        // Step 5: Restore selection to original positions
        this.restoreSelectionByPositions(contentElement, selectionBounds.start, selectionBounds.end);

        // Step 6: Save changes
        this.saveContentChanges(cardId, contentElement);
    }

    // Convert DOM content to position-based data structure
    domToPositionData(contentElement) {
        const highlights = [];
        let plainText = '';
        let currentPos = 0;

        const processNode = (node) => {
            if (node.nodeType === Node.TEXT_NODE) {
                plainText += node.textContent;
                currentPos += node.textContent.length;
            } else if (node.nodeType === Node.ELEMENT_NODE) {
                if (node.classList && node.classList.contains('highlight')) {
                    // Mark start of highlight
                    const startPos = currentPos;
                    const color = node.style.background || 'linear-gradient(180deg, transparent 50%, rgba(0, 255, 0, 0.3) 50%)';

                    // Process children to get text
                    for (let child of node.childNodes) {
                        processNode(child);
                    }

                    // Mark end of highlight
                    highlights.push({
                        start: startPos,
                        end: currentPos,
                        color: color
                    });
                } else {
                    // Process children of non-highlight elements
                    for (let child of node.childNodes) {
                        processNode(child);
                    }
                }
            }
        };

        // Process all children
        for (let child of contentElement.childNodes) {
            processNode(child);
        }

        return {text: plainText, highlights};
    }

    // Get selection boundaries as absolute text positions
    getSelectionBounds(range, contentElement) {
        const text = contentElement.textContent || '';

        // Clone range to avoid modifying original
        const tempRange = range.cloneRange();

        // Get start position
        const startRange = document.createRange();
        startRange.selectNodeContents(contentElement);
        startRange.setEnd(tempRange.startContainer, tempRange.startOffset);
        const startPos = startRange.toString().length;

        // Get end position
        const endRange = document.createRange();
        endRange.selectNodeContents(contentElement);
        endRange.setEnd(tempRange.endContainer, tempRange.endOffset);
        const endPos = endRange.toString().length;

        return {start: startPos, end: endPos};
    }

    // Merge overlapping or adjacent highlight ranges
    mergeHighlightRanges(highlights) {
        if (highlights.length === 0) return [];

        // Sort by start position
        highlights.sort((a, b) => a.start - b.start);

        const merged = [];
        let current = {...highlights[0]};

        for (let i = 1; i < highlights.length; i++) {
            const next = highlights[i];

            // Check if ranges overlap or are adjacent (same color)
            if (current.end >= next.start && current.color === next.color) {
                // Merge ranges
                current.end = Math.max(current.end, next.end);
            } else {
                // No overlap, save current and move to next
                merged.push(current);
                current = {...next};
            }
        }

        merged.push(current);
        return merged;
    }

    // Remove highlight ranges that overlap with selection
    removeHighlightRange(highlights, selStart, selEnd) {
        const result = [];

        for (const hl of highlights) {
            // No overlap - keep entire highlight
            if (hl.end <= selStart || hl.start >= selEnd) {
                result.push(hl);
            }
            // Partial overlap - split highlight
            else {
                // Keep part before selection
                if (hl.start < selStart) {
                    result.push({
                        start: hl.start,
                        end: selStart,
                        color: hl.color
                    });
                }
                // Keep part after selection
                if (hl.end > selEnd) {
                    result.push({
                        start: selEnd,
                        end: hl.end,
                        color: hl.color
                    });
                }
            }
        }

        return result;
    }

    // Rebuild DOM from position-based data
    rebuildDOMFromPositions(contentElement, positionData) {
        const {text, highlights} = positionData;

        // Handle empty text case
        if (!text || text.length === 0) {
            contentElement.innerHTML = '';
            return;
        }

        // Sort highlights by start position
        const sortedHighlights = [...highlights].sort((a, b) => a.start - b.start);

        // Merge overlapping highlights with same color
        const merged = [];
        for (let hl of sortedHighlights) {
            if (merged.length === 0) {
                merged.push({...hl});
            } else {
                const last = merged[merged.length - 1];
                if (last.end >= hl.start && last.color === hl.color) {
                    // Merge overlapping/adjacent
                    last.end = Math.max(last.end, hl.end);
                } else {
                    merged.push({...hl});
                }
            }
        }

        // Build DOM fragments
        const fragments = [];
        let lastPos = 0;

        for (let hl of merged) {
            // Validate bounds to prevent out-of-range errors
            const start = Math.max(0, Math.min(hl.start, text.length));
            const end = Math.max(start, Math.min(hl.end, text.length));

            // Skip invalid highlights
            if (start >= end) continue;

            // Add text before highlight
            if (start > lastPos) {
                const beforeText = text.substring(lastPos, start);
                if (beforeText) {
                    fragments.push(document.createTextNode(beforeText));
                }
            }

            // Add highlighted text
            const hlText = text.substring(start, end);
            if (hlText) {
                const span = document.createElement('span');
                span.className = 'highlight';
                span.style.background = hl.color;
                span.textContent = hlText;
                fragments.push(span);
            }

            lastPos = end;
        }

        // Add remaining text after last highlight
        if (lastPos < text.length) {
            const remainingText = text.substring(lastPos);
            if (remainingText) {
                fragments.push(document.createTextNode(remainingText));
            }
        }

        // If no fragments were created but we have text, add it as plain text
        // This handles the case where all highlights were removed
        if (fragments.length === 0 && text) {
            fragments.push(document.createTextNode(text));
        }

        // Clear and rebuild DOM with new structure
        contentElement.innerHTML = '';
        fragments.forEach(frag => contentElement.appendChild(frag));
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
