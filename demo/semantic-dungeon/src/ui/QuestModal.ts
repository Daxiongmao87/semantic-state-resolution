/**
 * Quest Modal - Prompts player for quest before dungeon generation
 */

import { getOpenRouterSolver } from '../solver/OpenRouterSolver';

// =============================================================================
// Modal State
// =============================================================================

let modalElement: HTMLElement | null = null;
let resolvePromise: ((quest: string) => void) | null = null;
let suggestions: string[] = [];
let suggestionsLoading = false;

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
        fetchQuestSuggestions();
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
                <div id="quest-suggestions" class="modal-suggestions"></div>
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

    // Number keys for quick select (when not in textarea)
    window.addEventListener('keydown', (e) => {
        if (!modalElement?.classList.contains('open')) return;
        const input = document.getElementById('quest-input');
        if (document.activeElement === input) return;

        const num = parseInt(e.key);
        if (num >= 1 && num <= 3 && suggestions.length >= num) {
            e.preventDefault();
            const textarea = document.getElementById('quest-input') as HTMLTextAreaElement;
            if (textarea) {
                textarea.value = suggestions[num - 1];
                // Auto-submit
                handleSubmit();
            }
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

// =============================================================================
// Quest Suggestions
// =============================================================================

async function fetchQuestSuggestions(): Promise<void> {
    suggestionsLoading = true;
    renderQuestSuggestions();

    try {
        const solver = getOpenRouterSolver();
        const response = await solver.solve({
            requestId: `quest_suggestions_${Date.now()}`,
            taskType: 'SUGGEST_QUESTS',
            entityId: 'quest_prompt',
            context: {
                instruction: `Generate exactly 3 unique and compelling fantasy dungeon quest ideas. Each should be a single sentence describing the player's goal. Be creative and varied - include different motivations (treasure, rescue, revenge, mystery, etc.). Return ONLY a JSON object with a "suggestions" array of 3 strings.`
            },
            constraints: { hard: [], soft: [] },
            whitelist: {
                requiredFields: ['suggestions'],
                maxSuggestions: 3
            }
        });

        if (response.success && response.proposal?.suggestions) {
            const sug = response.proposal.suggestions;
            if (Array.isArray(sug)) {
                suggestions = sug.slice(0, 3).map(s => String(s).trim());
            }
        } else {
            suggestions = [
                'Find the legendary sword of the fallen king',
                'Rescue the imprisoned wizard before the ritual',
                'Discover what happened to the missing expedition'
            ];
        }
    } catch (error) {
        console.warn('[QuestModal] Failed to fetch suggestions:', error);
        suggestions = [
            'Seek the ancient artifact of power',
            'Avenge your fallen mentor',
            'Uncover the secrets of the forgotten temple'
        ];
    }

    suggestionsLoading = false;
    renderQuestSuggestions();
}

function renderQuestSuggestions(): void {
    const container = document.getElementById('quest-suggestions');
    if (!container) return;

    if (suggestionsLoading) {
        container.innerHTML = '<span class="suggestions-loading">Generating quest ideas...</span>';
        return;
    }

    if (suggestions.length === 0) {
        container.innerHTML = '';
        return;
    }

    container.innerHTML = suggestions
        .map((s, i) => `<button class="suggestion-btn" data-index="${i}" tabindex="0"><span class="kbd-hint">${i + 1}</span>${s}</button>`)
        .join('');

    // Bind click and keyboard events
    container.querySelectorAll('.suggestion-btn').forEach(btn => {
        btn.addEventListener('click', () => selectQuestSuggestion(btn as HTMLElement));

        btn.addEventListener('keydown', (e) => {
            const event = e as KeyboardEvent;
            if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                selectQuestSuggestion(btn as HTMLElement);
            }
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

function selectQuestSuggestion(btn: HTMLElement): void {
    const textarea = document.getElementById('quest-input') as HTMLTextAreaElement;
    if (textarea) {
        const text = btn.textContent?.replace(/^[1-3]/, '').trim() || '';
        textarea.value = text;
        // Auto-submit
        handleSubmit();
    }
}
