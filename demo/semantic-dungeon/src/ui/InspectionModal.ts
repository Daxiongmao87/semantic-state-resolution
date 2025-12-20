/**
 * Inspection Modal - Modal UI for inspecting and interacting with tiles/objects
 */

import type { DungeonLayout } from '../dungeon/DungeonGenerator';
import { inspectTile, interactWithTile } from '../entities/TileCollapser';

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
    history: []
};

let modalElement: HTMLElement | null = null;
let onCloseCallback: (() => void) | null = null;

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
    onClose?: () => void
): Promise<void> {
    state.layout = layout;
    state.x = x;
    state.y = y;
    state.isLoading = true;
    state.isOpen = true;
    state.history = [];
    onCloseCallback = onClose || null;

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
        if (state.objectType) {
            titleEl.textContent = state.objectType;
        } else {
            titleEl.textContent = state.tileType.charAt(0).toUpperCase() + state.tileType.slice(1);
        }
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

        // Clear input
        if (inputEl) inputEl.value = '';

        renderModal();

    } catch (error) {
        console.error('[InspectionModal] Interact failed:', error);
        state.currentDescription = 'Something went wrong.';
        state.isLoading = false;
        renderModal();
    }
}
