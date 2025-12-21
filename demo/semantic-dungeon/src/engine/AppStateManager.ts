import { GameScreen, GameSaveData, GameConfig } from '../GameTypes';
import { getEventLog } from './EventLog';

export class AppStateManager {
    private currentScreen: GameScreen = GameScreen.MainMenu;
    private config: GameConfig = {};
    private containers: Record<GameScreen, string> = {
        [GameScreen.MainMenu]: 'main-menu',
        [GameScreen.CharacterCreation]: 'class-generator',
        [GameScreen.QuestSelection]: 'quest-selection',
        [GameScreen.WorldContext]: 'world-context',
        [GameScreen.Gameplay]: 'dungeon-container'
    };

    private listeners: ((screen: GameScreen) => void)[] = [];

    constructor() {
        this.initializeContainers();
    }

    public subscribe(callback: (screen: GameScreen) => void) {
        this.listeners.push(callback);
    }

    private initializeContainers() {
        // Ensure all containers exist (create placeholder if missing for new screens)
        Object.entries(this.containers).forEach(([_screen, id]) => {
            if (!document.getElementById(id)) {
                this.createContainer(id);
            }
        });
    }

    private createContainer(id: string) {
        const div = document.createElement('div');
        div.id = id;
        div.className = 'screen-container';
        div.style.display = 'none';
        document.getElementById('app')?.appendChild(div);
    }

    public switchScreen(screen: GameScreen) {
        console.log(`[AppState] Switching to ${screen}`);

        // Hide all
        Object.values(this.containers).forEach(id => {
            const el = document.getElementById(id);
            if (el) el.style.display = 'none';
        });

        // Show target
        const targetId = this.containers[screen];
        const targetEl = document.getElementById(targetId);
        if (targetEl) {
            targetEl.style.display = 'block';
        }

        this.currentScreen = screen;

        // Notify listeners
        this.listeners.forEach(listener => listener(screen));
    }

    public setConfig(config: Partial<GameConfig>) {
        this.config = { ...this.config, ...config };
    }

    public getConfig(): GameConfig {
        return this.config;
    }

    public saveGame(data: any) {
        const eventLog = getEventLog(); // Singleton
        const saveData: GameSaveData = {
            timestamp: Date.now(),
            screen: this.currentScreen,
            worldGenre: this.config.worldGenre,
            eventLog: JSON.parse(eventLog.export()),
            ...data
        };
        localStorage.setItem('swfc_save', JSON.stringify(saveData));
        console.log('[AppState] Game Saved');
    }

    public loadGame(): GameSaveData | null {
        const json = localStorage.getItem('swfc_save');
        if (!json) return null;
        try {
            const data = JSON.parse(json) as GameSaveData;

            // Rehydrate EventLog if present
            if (data.eventLog) {
                const eventLog = getEventLog();
                eventLog.import(JSON.stringify(data.eventLog));
                console.log(`[AppState] Rehydrated ${eventLog.length} events from log.`);
            }

            return data;
        } catch (e) {
            console.error('Failed to load save', e);
            return null;
        }
    }
}

export const appState = new AppStateManager();
