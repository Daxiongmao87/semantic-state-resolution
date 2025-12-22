import { GameScreen, GameSaveData, GameConfig } from '../GameTypes';
import { getEventLog } from './EventLog';
import { PlayerState } from '../types';

export class AppStateManager {
    private currentScreen: GameScreen = GameScreen.MainMenu;
    private config: GameConfig = {};
    /** Shared player state - single source of truth across all screens */
    private playerState: PlayerState | null = null;
    private containers: Record<GameScreen, string> = {
        [GameScreen.MainMenu]: 'main-menu',
        [GameScreen.CharacterCreation]: 'class-generator',
        [GameScreen.QuestSelection]: 'quest-selection',
        [GameScreen.WorldContext]: 'world-context',
        [GameScreen.Town]: 'town-container',
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

    public getCurrentScreen(): GameScreen {
        return this.currentScreen;
    }

    public setConfig(config: Partial<GameConfig>) {
        this.config = { ...this.config, ...config };
    }

    public getConfig(): GameConfig {
        return this.config;
    }

    /** Get the shared player state */
    public getPlayerState(): PlayerState | null {
        return this.playerState;
    }

    /** Set/update the shared player state */
    public setPlayerState(state: PlayerState) {
        this.playerState = state;
    }

    /** Get player wealth (in copper). Returns 0 if no player. */
    public getWealth(): number {
        return this.playerState?.wealth ?? 0;
    }

    /** Spend wealth (in copper). Returns true if successful. */
    public spendWealth(amount: number): boolean {
        if (!this.playerState || this.playerState.wealth < amount) return false;
        this.playerState.wealth -= amount;
        return true;
    }

    /** Add wealth (in copper). */
    public addWealth(amount: number): void {
        if (!this.playerState) return;
        this.playerState.wealth = (this.playerState.wealth || 0) + amount;
        // this.notifyListeners(); // notifyListeners is not defined in the original document.
    }

    public addToInventory(item: string): void {
        if (!this.playerState) return;
        this.playerState.inventory.push(item);
        // this.notifyListeners(); // notifyListeners is not defined in the original document.
    }

    /** Check if player can afford a cost */
    public hasWealth(amount: number): boolean {
        return (this.playerState?.wealth ?? 0) >= amount;
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
        localStorage.setItem('SSR_save', JSON.stringify(saveData));
        console.log('[AppState] Game Saved');
    }

    public loadGame(): GameSaveData | null {
        const json = localStorage.getItem('SSR_save');
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
    public startQuest(questData: any) {
        // TODO: Store active quest data properly
        console.log('[AppState] Starting quest:', questData);
        this.switchScreen(GameScreen.Gameplay);
    }
}

export const appState = new AppStateManager();
