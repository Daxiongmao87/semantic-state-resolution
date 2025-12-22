import { appState } from '../engine/AppStateManager';
import { GameScreen } from '../GameTypes';

export class PauseMenu {
    private overlayId = 'pause-menu-overlay';
    private isOpen = false;

    constructor() {
        this.createOverlay();
        this.bindGlobalInput();
    }

    private createOverlay() {
        if (document.getElementById(this.overlayId)) return;

        const overlay = document.createElement('div');
        overlay.id = this.overlayId;
        overlay.style.display = 'none';
        overlay.innerHTML = `
            <div class="pause-menu">
                <h2>Paused</h2>
                <button id="pm-resume" class="btn primary">Resume</button>
                <button id="pm-save" class="btn secondary">Save Game</button>
                <button id="pm-exit" class="btn danger">Exit to Main Menu</button>
                <div id="pm-status" class="status-text"></div>
            </div>
        `;
        document.body.appendChild(overlay);

        // Bind buttons
        document.getElementById('pm-resume')?.addEventListener('click', () => this.toggle(false));
        document.getElementById('pm-save')?.addEventListener('click', () => this.handleSave());
        document.getElementById('pm-exit')?.addEventListener('click', () => this.handleExit());
    }

    private bindGlobalInput() {
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                const currentScreen = appState.getCurrentScreen();

                // Close if open
                if (this.isOpen) {
                    this.toggle(false);
                    return;
                }

                // Open if in Gameplay
                if (currentScreen === GameScreen.Gameplay) {
                    this.toggle(true);
                }
            }
        });
    }

    public toggle(open: boolean) {
        const overlay = document.getElementById(this.overlayId);
        if (!overlay) return;

        this.isOpen = open;
        overlay.style.display = open ? 'flex' : 'none';

        // Clear status
        const status = document.getElementById('pm-status');
        if (status) status.textContent = '';
    }

    private handleSave() {
        appState.saveGame({});
        const status = document.getElementById('pm-status');
        if (status) {
            status.textContent = 'Game Saved!';
            status.style.color = 'var(--accent-success)';
            setTimeout(() => {
                this.toggle(false);
            }, 1000);
        }
    }

    private handleExit() {
        this.toggle(false);
        appState.switchScreen(GameScreen.MainMenu);
    }
}
