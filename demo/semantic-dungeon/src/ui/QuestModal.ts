import { getQuestSearch, QuestOption } from '../dungeon/QuestSearch';
import { appState } from '../engine/AppStateManager';

export interface QuestResult {
    description: string;
    constraints: string[];
}

export function promptForQuest(): Promise<QuestResult> {
    return new Promise((resolve) => {
        // Create modal container
        const modalId = 'quest-modal';
        let modal = document.getElementById(modalId);

        if (modal) {
            modal.remove(); // Reset if exists
        }

        modal = document.createElement('div');
        modal.id = modalId;
        modal.className = 'modal-overlay open'; // Reuse existing modal styles

        modal.innerHTML = `
            <div class="modal-content">
                <div class="modal-header">
                    <h3>Select Your Path</h3>
                </div>
                <div class="modal-body" id="quest-body">
                    <div class="panel center-content">
                        <div class="spinner"></div>
                        <p>Consulting the threads of fate...</p>
                    </div>
                </div>
            </div>
        `;

        document.body.appendChild(modal);

        const renderError = (msg: string) => {
            const body = document.getElementById('quest-body');
            if (!body) return;
            body.innerHTML = `
                <div class="panel center-content">
                    <p class="status error">${msg}</p>
                    <button id="retry-quest-btn" class="btn secondary">Retry</button>
                </div>
            `;
            document.getElementById('retry-quest-btn')?.addEventListener('click', () => runGeneration());
        };

        const renderOptions = (quests: QuestOption[]) => {
            const body = document.getElementById('quest-body');
            if (!body) return;

            const save = appState.loadGame();
            const className = save?.playerState?.class?.name || 'Hero';

            body.innerHTML = `
                <p class="subtitle">Destiny awaits, ${className}...</p>
                <div class="selection-list">
                    ${quests.map((q, i) => `
                        <button class="selection-item quest-option" data-index="${i}">
                            <span class="name">${q.title}</span>
                            <span class="description">${q.description}</span>
                            <div class="tags">
                                <span class="tag-utility">${q.constraints.theme}</span>
                                <span class="tag-offensive">${q.constraints.objective}</span>
                            </div>
                        </button>
                    `).join('')}
                </div>
            `;

            body.querySelectorAll('.quest-option').forEach(btn => {
                btn.addEventListener('click', () => {
                    const idx = parseInt(btn.getAttribute('data-index') || '0');
                    const selected = quests[idx];

                    // Convert to QuestResult format
                    // Map constraints to string array "key:value"
                    const rules = Object.entries(selected.constraints).map(([k, v]) => `quest_${k}:${v}`);

                    modal?.classList.remove('open');
                    setTimeout(() => modal?.remove(), 300);

                    resolve({
                        description: `${selected.title}: ${selected.description}`,
                        constraints: rules
                    });
                });
            });
        };

        // Fetch Quests
        const runGeneration = async () => {
            const save = appState.loadGame();
            const config = appState.getConfig();
            const search = getQuestSearch();

            // Default context if missing (e.g. debug mode)
            const worldGenre = config.worldGenre || 'Dark Fantasy';
            // We use 'any' cast for playerState as it comes from JSON and might not match loose types perfectly 
            const playerContext = save?.playerState || { level: 1, race: { name: 'Unknown' }, class: { name: 'Adventurer' } };

            try {
                const options = await search.generateRandomQuests(worldGenre, playerContext);
                renderOptions(options);
            } catch (e) {
                renderError('Failed to weave destiny: ' + e);
            }
        };

        // Start
        runGeneration();
    });
}
