import { appState } from '../engine/AppStateManager';
import { GameScreen } from '../GameTypes';

export class MainMenu {
    private containerId: string;

    constructor(containerId: string) {
        this.containerId = containerId;
        this.render();
        this.bindEvents();
    }

    private render() {
        const container = document.getElementById(this.containerId);
        if (!container) return;

        container.innerHTML = `
            <div class="main-menu">
                <div class="menu-content">
                    <h1>Semantic Dungeon</h1>
                    <p class="subtitle">Just-In-Time Procedural Reality</p>
                    
                    <div class="menu-form">
                        <label for="world-genre">World Context (Genre)</label>
                        <input type="text" id="world-genre" placeholder="e.g. Dark Fantasy, Cyberpunk, Eldritch Horror" value="Dark Fantasy">
                        <p class="hint">This context defines reality.</p>
                    </div>

                    <div class="menu-actions">
                        <button id="btn-new-game" class="btn primary large">New Game</button>
                        <button id="btn-load-game" class="btn secondary large" disabled>Load Game</button>
                    </div>

                    <div id="save-info" class="save-status"></div>
                </div>
            </div>
        `;

        // Check for save
        const saved = appState.loadGame();
        const loadBtn = document.getElementById('btn-load-game') as HTMLButtonElement;
        const saveInfo = document.getElementById('save-info');

        if (saved && loadBtn && saveInfo) {
            loadBtn.disabled = false;
            saveInfo.textContent = `Found Save: ${new Date(saved.timestamp).toLocaleString()} (${saved.worldGenre || 'Unknown'})`;
        }
    }

    private bindEvents() {
        const newGameBtn = document.getElementById('btn-new-game');
        const loadGameBtn = document.getElementById('btn-load-game');
        const genreInput = document.getElementById('world-genre') as HTMLInputElement;

        newGameBtn?.addEventListener('click', () => {
            const genre = genreInput.value.trim() || 'Dark Fantasy';
            console.log(`[MainMenu] Starting New Game: ${genre}`);

            appState.setConfig({ worldGenre: genre });
            appState.switchScreen(GameScreen.CharacterCreation);
        });

        loadGameBtn?.addEventListener('click', () => {
            const saved = appState.loadGame();
            if (saved) {
                console.log('[MainMenu] Loading Game...');
                appState.setConfig({ worldGenre: saved.worldGenre });
                // TODO: Rehydrate Event Log
                appState.switchScreen(GameScreen.Gameplay);
            }
        });
    }
}
