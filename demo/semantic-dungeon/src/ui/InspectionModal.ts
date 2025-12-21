/**
 * Inspection Modal - Modal UI for inspecting and interacting with tiles/objects
 */

import type { DungeonLayout } from '../dungeon/DungeonGenerator';
import { inspectTile, interactWithTile } from '../entities/TileCollapser';
import { getOpenRouterSolver } from '../solver/OpenRouterSolver';

// =============================================================================
// Modal State
// =============================================================================

interface ModalState {
    isOpen: boolean;
    x: number;
    y: number;
    layout: DungeonLayout | null;
    currentDescription: string;
    objectType: string | null;
    tileType: string;
    isLoading: boolean;
    history: string[];  // Previous interaction results for context
    suggestions: string[];  // AI-suggested actions
    suggestionsLoading: boolean;
}

const state: ModalState = {
    isOpen: false,
    x: 0,
    y: 0,
    layout: null,
    currentDescription: '',
    objectType: null,
    tileType: 'floor',
    isLoading: false,
    history: [],
    suggestions: [],
    suggestionsLoading: false
};

let modalElement: HTMLElement | null = null;
let onCloseCallback: (() => void) | null = null;
let onInventoryAddCallback: ((item: string) => void) | null = null;

// =============================================================================
// Modal API
// =============================================================================

/**
 * Open the inspection modal for a tile
 */
export async function openInspectionModal(
    layout: DungeonLayout,
    x: number,
    y: number,
    onClose?: () => void,
    onInventoryAdd?: (item: string) => void
): Promise<void> {
    state.layout = layout;
    state.x = x;
    state.y = y;
    state.isLoading = true;
    state.isOpen = true;
    state.history = [];
    state.suggestions = [];
    state.suggestionsLoading = false;
    onCloseCallback = onClose || null;
    onInventoryAddCallback = onInventoryAdd || null;

    // Create and show modal
    ensureModalExists();
    renderModal();

    // Initial inspection
    try {
        const result = await inspectTile(layout, x, y);
        state.currentDescription = result.description;
        state.objectType = result.objectType || null;
        state.tileType = result.tileType;
        state.isLoading = false;
        renderModal();

        // Fetch AI suggestions for actions
        fetchSuggestions();
    } catch (error) {
        state.currentDescription = 'Failed to inspect.';
        state.isLoading = false;
        renderModal();
    }
}

/**
 * Close the modal
 */
export function closeInspectionModal(): void {
    state.isOpen = false;
    if (modalElement) {
        modalElement.classList.remove('open');
    }
    if (onCloseCallback) {
        onCloseCallback();
    }
}

/**
 * Check if modal is open
 */
export function isModalOpen(): boolean {
    return state.isOpen;
}

// =============================================================================
// Modal Rendering
// =============================================================================

function ensureModalExists(): void {
    if (modalElement) return;

    modalElement = document.createElement('div');
    modalElement.id = 'inspection-modal';
    modalElement.className = 'modal-overlay';
    modalElement.innerHTML = `
        <div class="modal-content">
            <div class="modal-header">
                <h3 id="modal-title">Inspection</h3>
                <button class="modal-close" id="modal-close-btn">&times;</button>
            </div>
            <div class="modal-body">
                <div id="modal-description" class="modal-description"></div>
                <div id="modal-history" class="modal-history"></div>
            </div>
            <div class="modal-footer">
                <input type="text" 
                       id="modal-action-input" 
                       placeholder="What do you do? (e.g., 'open it', 'tip it over', 'examine closer')"
                       autocomplete="off"
                />
                <div id="modal-suggestions" class="modal-suggestions"></div>
                <div class="modal-actions">
                    <button id="modal-interact-btn" class="btn primary">Interact</button>
                    <button id="modal-close-action-btn" class="btn secondary">Close</button>
                </div>
            </div>
        </div>
    `;

    document.body.appendChild(modalElement);

    // Bind events
    document.getElementById('modal-close-btn')?.addEventListener('click', closeInspectionModal);
    document.getElementById('modal-close-action-btn')?.addEventListener('click', closeInspectionModal);
    document.getElementById('modal-interact-btn')?.addEventListener('click', handleInteract);

    // Enter key submits
    document.getElementById('modal-action-input')?.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            handleInteract();
        }
    });

    // Click overlay to close
    modalElement.addEventListener('click', (e) => {
        if (e.target === modalElement) {
            closeInspectionModal();
        }
    });

    // Escape to close
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && state.isOpen) {
            closeInspectionModal();
        }
    });
}

function renderModal(): void {
    if (!modalElement) return;

    // Show/hide
    if (state.isOpen) {
        modalElement.classList.add('open');
    } else {
        modalElement.classList.remove('open');
        return;
    }

    // Title
    const titleEl = document.getElementById('modal-title');
    if (titleEl) {
        let title = '';
        if (state.objectType) {
            title = state.objectType;
        } else {
            title = state.tileType;
        }

        // Format: replace underscores with spaces and capitalize words
        title = title.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
        titleEl.textContent = title;
    }

    // Description
    const descEl = document.getElementById('modal-description');
    if (descEl) {
        if (state.isLoading) {
            descEl.innerHTML = `
                <div class="loading-state">
                    <div class="spinner"></div>
                    <span>Inspecting...</span>
                </div>
            `;
        } else {
            descEl.innerHTML = `<p>${state.currentDescription}</p>`;
        }
    }

    // History
    const historyEl = document.getElementById('modal-history');
    if (historyEl) {
        if (state.history.length > 0) {
            historyEl.innerHTML = `
                <div class="history-header">Previous interactions:</div>
                ${state.history.map(h => `<div class="history-item">${h}</div>`).join('')}
            `;
        } else {
            historyEl.innerHTML = '';
        }
    }

    // Disable input while loading
    const inputEl = document.getElementById('modal-action-input') as HTMLInputElement;
    const interactBtn = document.getElementById('modal-interact-btn') as HTMLButtonElement;
    if (inputEl) inputEl.disabled = state.isLoading;
    if (interactBtn) interactBtn.disabled = state.isLoading;

    // Focus input
    if (!state.isLoading && inputEl) {
        setTimeout(() => inputEl.focus(), 100);
    }
}

// =============================================================================
// Interaction Handler
// =============================================================================

async function handleInteract(): Promise<void> {
    if (!state.layout || state.isLoading) return;

    const inputEl = document.getElementById('modal-action-input') as HTMLInputElement;
    const action = inputEl?.value.trim();

    if (!action) return;

    // Add current description to history before new interaction
    if (state.currentDescription) {
        state.history.push(`> ${action}`);
    }

    state.isLoading = true;
    renderModal();

    try {
        const result = await interactWithTile(state.layout, state.x, state.y, action);

        // Update state with result
        state.currentDescription = result.description;
        state.isLoading = false;

        // Handle Semantic Actions (Loot)
        if (result.semanticAction === 'pickup' && result.item && onInventoryAddCallback) {
            onInventoryAddCallback(result.item);
            state.history.push(`> You picked up: ${result.item}`);
            state.currentDescription += `\n(Added to Inventory: ${result.item})`;

            // Should we close the modal? Or remove the object from view?
            // Ideally we'd remove the object from the dungeon data, but for now just visual feedback.
        }

        // Clear input
        if (inputEl) inputEl.value = '';

        // Fetch new suggestions based on updated state
        fetchSuggestions();

        renderModal();

    } catch (error) {
        console.error('[InspectionModal] Interact failed:', error);
        state.currentDescription = 'Something went wrong.';
        state.isLoading = false;
        renderModal();
    }
}

// =============================================================================
// AI Suggestions
// =============================================================================

/**
 * Fetch AI-generated action suggestions
 */
async function fetchSuggestions(): Promise<void> {
    if (!state.layout) return;

    state.suggestionsLoading = true;
    renderSuggestions();

    try {
        const solver = getOpenRouterSolver();
        const response = await solver.solve({
            requestId: `suggestions_${state.x}_${state.y}_${Date.now()}`,
            taskType: 'SUGGEST_ACTIONS',
            entityId: `tile_${state.x}_${state.y}`,
            context: {
                description: state.currentDescription,
                objectType: state.objectType,
                tileType: state.tileType,
                history: state.history.slice(-3),
                instruction: `Given this scene description, suggest exactly 3 short action phrases (2-4 words each) that a player could take. Return ONLY a JSON object with a "suggestions" array of 3 strings. Example: {"suggestions": ["examine closer", "tip it over", "search underneath"]}`
            },
            constraints: { hard: [], soft: [] },
            whitelist: {
                requiredFields: ['suggestions'],
                maxSuggestions: 3
            }
        });

        if (response.success && response.proposal?.suggestions) {
            const suggestions = response.proposal.suggestions;
            if (Array.isArray(suggestions)) {
                state.suggestions = suggestions.slice(0, 3).map(s => String(s).trim());
            }
        } else {
            state.suggestions = ['look closer', 'touch it', 'step back'];
        }
    } catch (error) {
        console.warn('[InspectionModal] Failed to fetch suggestions:', error);
        state.suggestions = ['examine', 'interact', 'leave'];
    }

    state.suggestionsLoading = false;
    renderSuggestions();
}

/**
 * Render suggestions buttons
 */
function renderSuggestions(): void {
    const container = document.getElementById('modal-suggestions');
    if (!container) return;

    if (state.suggestionsLoading) {
        container.innerHTML = '<span class="suggestions-loading">Getting ideas...</span>';
        return;
    }

    if (state.suggestions.length === 0) {
        container.innerHTML = '';
        return;
    }

    // Add tabindex for keyboard navigation, show number hints
    container.innerHTML = state.suggestions
        .map((s, i) => `<button class="suggestion-btn" data-index="${i}" tabindex="0"><span class="kbd-hint">${i + 1}</span>${s}</button>`)
        .join('');

    // Bind click events
    container.querySelectorAll('.suggestion-btn').forEach(btn => {
        btn.addEventListener('click', () => selectSuggestion(btn as HTMLElement));

        // Enter/Space to select when focused
        btn.addEventListener('keydown', (e) => {
            const event = e as KeyboardEvent;
            if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                selectSuggestion(btn as HTMLElement);
            }
            // Arrow key navigation
            if (event.key === 'ArrowRight' || event.key === 'ArrowDown') {
                event.preventDefault();
                const next = btn.nextElementSibling as HTMLElement;
                if (next) next.focus();
            }
            if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') {
                event.preventDefault();
                const prev = btn.previousElementSibling as HTMLElement;
                if (prev) prev.focus();
            }
        });
    });
}

/**
 * Select a suggestion and auto-submit
 */
function selectSuggestion(btn: HTMLElement): void {
    const inputEl = document.getElementById('modal-action-input') as HTMLInputElement;
    if (inputEl) {
        // Remove the kbd-hint text from the button content
        const text = btn.textContent?.replace(/^[1-3]/, '').trim() || '';
        inputEl.value = text;
        // Auto-submit
        handleInteract();
    }
}

/**
 * Handle global keyboard shortcuts for the modal
 */
function handleModalKeyboard(e: KeyboardEvent): void {
    if (!state.isOpen) return;

    // Escape to close
    if (e.key === 'Escape') {
        closeInspectionModal();
        return;
    }

    // Number keys 1-3 to quickly select suggestions (only when not typing)
    const inputEl = document.getElementById('modal-action-input') as HTMLInputElement;
    if (document.activeElement !== inputEl) {
        const num = parseInt(e.key);
        if (num >= 1 && num <= 3 && state.suggestions.length >= num) {
            e.preventDefault();
            if (inputEl) {
                inputEl.value = state.suggestions[num - 1];
                // Auto-submit
                handleInteract();
            }
        }
    }
}

// Register global keyboard handler
if (typeof window !== 'undefined') {
    window.addEventListener('keydown', handleModalKeyboard);
}
