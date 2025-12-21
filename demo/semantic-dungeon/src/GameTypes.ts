import { PlayerState } from './types';

export enum GameScreen {
    MainMenu = 'main_menu',
    CharacterCreation = 'character_creation',
    QuestSelection = 'quest_selection',
    WorldContext = 'world_context',
    Gameplay = 'gameplay'
}

export interface GameSaveData {
    timestamp: number;
    screen: GameScreen;
    playerData?: any; // Legacy
    playerState?: PlayerState; // Core State
    quest?: string;
    worldGenre?: string;
    eventLog?: any[]; // Serialized Event Log
}

export interface GameConfig {
    worldGenre?: string;
    difficulty?: 'normal' | 'hard';
}
