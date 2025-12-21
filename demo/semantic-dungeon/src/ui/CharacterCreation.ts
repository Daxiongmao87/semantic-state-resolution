import { appState } from '../engine/AppStateManager';
import { GameScreen } from '../GameTypes';
import { RaceData, ClassData } from '../types';
import { getCharacterCreator } from '../player/CharacterCreator';

export class CharacterCreation {
    private containerId: string;
    private creator = getCharacterCreator();

    // State
    private worldGenre: string = 'Dark Fantasy';
    private selectedRace: RaceData | null = null;
    private selectedClass: ClassData | null = null;

    // Cache
    private availableRaces: RaceData[] = [];
    private availableClasses: ClassData[] = [];

    constructor(containerId: string) {
        this.containerId = containerId;
        this.worldGenre = appState.getConfig().worldGenre || 'Dark Fantasy';
        this.init();
    }

    private async init() {
        this.renderLoading('Generating Races for ' + this.worldGenre + '...');
        try {
            this.availableRaces = await this.creator.generateRaces(this.worldGenre);
            this.renderRaceSelection();
        } catch (e) {
            this.renderError('Failed to generate races: ' + e);
        }
    }

    private renderLoading(msg: string) {
        const container = document.getElementById(this.containerId);
        if (!container) return;
        container.innerHTML = `
            <div class="panel center-content">
                <div class="spinner"></div>
                <p>${msg}</p>
            </div>
        `;
    }

    private renderError(msg: string) {
        const container = document.getElementById(this.containerId);
        if (!container) return;
        container.innerHTML = `
            <div class="panel center-content">
                <p class="status error">${msg}</p>
                <button id="retry-btn" class="btn secondary">Retry</button>
            </div>
        `;
        document.getElementById('retry-btn')?.addEventListener('click', () => this.init());
    }

    private renderRaceSelection() {
        const container = document.getElementById(this.containerId);
        if (!container) return;

        container.innerHTML = `
            <div class="panel">
                <h2>Select Race</h2>
                <p class="subtitle">World Context: ${this.worldGenre}</p>
                
                <div class="selection-list">
                    ${this.availableRaces.map((r, i) => `
                        <button class="selection-item race-option" data-index="${i}">
                            <span class="name">${r.name}</span>
                            <span class="description">${r.description}</span>
                            <div class="tags">
                                ${r.traits.map(t => `<span class="tag-utility">${t}</span>`).join('')}
                            </div>
                        </button>
                    `).join('')}
                </div>
                
                <div class="actions">
                    <button id="back-race-btn" class="btn secondary">Back to Menu</button>
                </div>
            </div>
        `;

        // Bind logic
        container.querySelectorAll('.race-option').forEach(btn => {
            btn.addEventListener('click', () => {
                const idx = parseInt(btn.getAttribute('data-index') || '0');
                this.selectedRace = this.availableRaces[idx];
                this.loadClasses();
            });
        });

        document.getElementById('back-race-btn')?.addEventListener('click', () => {
            appState.switchScreen(GameScreen.MainMenu);
        });
    }

    private async loadClasses() {
        if (!this.selectedRace) return;
        this.renderLoading(`Generating Classes for ${this.selectedRace.name}...`);

        try {
            this.availableClasses = await this.creator.generateClasses(this.worldGenre, this.selectedRace);
            this.renderClassSelection();
        } catch (e) {
            this.renderError('Failed to generate classes: ' + e);
        }
    }

    private renderClassSelection() {
        const container = document.getElementById(this.containerId);
        if (!container) return;

        container.innerHTML = `
            <div class="panel">
                <h2>Select Class</h2>
                <p class="subtitle">Race: ${this.selectedRace?.name}</p>
                
                <div class="selection-list">
                    ${this.availableClasses.map((c, i) => `
                        <button class="selection-item class-option" data-index="${i}">
                            <span class="name">${c.name}</span>
                            <span class="description">${c.description}</span>
                            <div class="tags">
                                ${c.abilities.map(a => `<span class="tag-offensive">${a}</span>`).join('')}
                            </div>
                        </button>
                    `).join('')}
                </div>

                <div class="actions">
                    <button id="back-class-btn" class="btn secondary">Back to Race</button>
                </div>
            </div>
        `;

        container.querySelectorAll('.class-option').forEach(btn => {
            btn.addEventListener('click', () => {
                const idx = parseInt(btn.getAttribute('data-index') || '0');
                this.selectedClass = this.availableClasses[idx];
                this.finishCreation();
            });
        });

        document.getElementById('back-class-btn')?.addEventListener('click', () => {
            this.renderRaceSelection();
        });
    }

    private finishCreation() {
        if (!this.selectedRace || !this.selectedClass) return;

        // Generate Stats
        const stats = this.creator.generateStartingAbilities();

        // Save Initial State
        const startingState = {
            // New Character Data
            name: "Hero", // TODO: Input name?
            race: this.selectedRace,
            class: this.selectedClass,
            abilities: stats,
            maxHp: 20,
            hp: 20,
            level: 1,
            // Defaults
            x: 0,
            y: 0,
            facing: 'north',
            currentRoomId: null,
            inventory: [],
            equipment: { head: null, chest: null, mainHand: null, offHand: null }
        };

        // We save this as the "New Game" state
        appState.saveGame({
            playerState: startingState
        });

        console.log('[CharacterCreation] Complete. Starting Game.');
        appState.switchScreen(GameScreen.Gameplay);
    }
}
