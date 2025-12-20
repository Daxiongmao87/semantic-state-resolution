/**
 * Quest Modal - Prompts player for quest before dungeon generation
 */

// =============================================================================
// Modal State
// =============================================================================

let modalElement: HTMLElement | null = null;
let resolvePromise: ((quest: string) => void) | null = null;

// =============================================================================
// Modal API
// =============================================================================

/**
 * Show quest prompt modal and return the quest text
 */
export function promptForQuest(): Promise<string> {
    return new Promise((resolve) => {
        resolvePromise = resolve;
        ensureModalExists();
        showModal();
    });
}

// =============================================================================
// Modal Implementation
// =============================================================================

function ensureModalExists(): void {
    if (modalElement) return;

    modalElement = document.createElement('div');
    modalElement.id = 'quest-modal';
    modalElement.className = 'modal-overlay open';
    modalElement.innerHTML = `
        <div class="modal-content quest-modal">
            <div class="modal-header">
                <h3>Your Quest</h3>
            </div>
            <div class="modal-body">
                <p class="quest-prompt-text">What brings you to this dungeon?</p>
                <textarea 
                    id="quest-input" 
                    placeholder="e.g., Find the lost artifact of the ancients, Rescue the captured prince, Slay the dragon terrorizing the realm..."
                    rows="3"
                ></textarea>
            </div>
            <div class="modal-footer">
                <button id="quest-begin-btn" class="btn primary">Enter the Dungeon</button>
            </div>
        </div>
    `;

    document.body.appendChild(modalElement);

    // Bind events
    document.getElementById('quest-begin-btn')?.addEventListener('click', handleSubmit);

    // Enter key in textarea (with shift for newlines)
    document.getElementById('quest-input')?.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleSubmit();
        }
    });
}

function showModal(): void {
    if (!modalElement) return;
    modalElement.classList.add('open');

    // Clear and focus input
    const input = document.getElementById('quest-input') as HTMLTextAreaElement;
    if (input) {
        input.value = '';
        setTimeout(() => input.focus(), 100);
    }
}

function hideModal(): void {
    if (!modalElement) return;
    modalElement.classList.remove('open');
}

function handleSubmit(): void {
    const input = document.getElementById('quest-input') as HTMLTextAreaElement;
    const quest = input?.value.trim() || 'Explore the ancient dungeon';

    hideModal();

    if (resolvePromise) {
        resolvePromise(quest);
        resolvePromise = null;
    }
}
