
export interface Rumor {
    id: string;
    title: string;
    description: string;
    // The Latent Seed Constraints
    constraints: string[];
    difficulty: 'easy' | 'medium' | 'hard';
    location: string; // e.g., "The Whispering Caves"
    discovered: boolean;
    /** Day when this rumor was discovered */
    discoveredOnDay?: number;
    /** How many days before the rumor goes stale (undefined = permanent) */
    ttlDays?: number;
}

/**
 * A fact with temporal scope - knows when it was collapsed and when it expires.
 * Strength decays over time: 1.0 = hard constraint, < 0.5 = soft, 0 = expired
 * Expired facts become "historical memory" - NPC remembers but it no longer constrains the world.
 */
export interface TemporalFact {
    value: any;
    /** The day this fact was collapsed/established */
    collapsedOnDay: number;
    /** Days until full expiration (undefined = permanent) */
    ttlDays?: number;
    /** 
     * Current strength: 1.0 = definite/hard, 0.5 = uncertain/soft, 0 = expired
     * Decays linearly over TTL. Permanent facts stay at 1.0.
     */
    strength: number;
    /** If true, fact is now historical memory (no longer constrains world) */
    expired?: boolean;
    /** Day when this fact expired (if expired) */
    expiredOnDay?: number;
}

export type Disposition = 'Hostile' | 'Cold' | 'Neutral' | 'Friendly' | 'Trusting';

export interface NPC {
    id: string;
    archetype: string; // "Barkeep", "Merchant", "Mercenary"
    /**
     * Progressive collapse - facts accumulate as revealed in narration.
     * Each fact has temporal metadata for TTL pruning.
     * e.g., { name: { value: "Grimshaw", collapsedOnDay: 1 }, mood: { value: "angry", collapsedOnDay: 3, ttlDays: 1 } }
     */
    /**
     * Progressive collapse - facts accumulate as revealed in narration.
     * Each fact has temporal metadata for TTL pruning.
     * e.g., { name: { value: "Grimshaw", collapsedOnDay: 1 }, mood: { value: "angry", collapsedOnDay: 3, ttlDays: 1 } }
     */
    collapsedFacts: Record<string, TemporalFact>;
    /** Semantic disposition towards the player */
    disposition: Disposition;
    // What they know (latent until revealed)
    knowledge: Rumor[];
    // Dialogue history
    history: ChatMessage[];
}

export interface ChatMessage {
    sender: 'player' | 'npc';
    text: string;
    timestamp: number;
}

/** Dynamically generated location data */
export interface TownLocation {
    id: 'town' | 'tavern' | 'shop' | 'gate';
    name: string;
    description: string;
    /** Progressive collapse - additional details as discovered */
    collapsedFacts: Record<string, TemporalFact>;
}

export type TownEventType =
    | 'LOCATION_COLLAPSED'
    | 'NPC_FACT_COLLAPSED'
    | 'RUMOR_DISCOVERED'
    | 'ACTION_PERFORMED'
    | 'DAY_ADVANCED'
    | 'FACTS_PRUNED'
    | 'DAY_EVENTS_COLLAPSED'
    | 'NPC_ARRIVED'
    | 'NPC_DEPARTED'
    | 'NPC_DISPOSITION_CHANGE';

/** Event log entry for SSR compliance */
export interface TownEvent {
    id: string;
    timestamp: number;
    day: number;
    type: TownEventType;
    entityId: string;
    data: Record<string, any>;
}

/**
 * A temporal event that occurs when day advances.
 * These are JIT collapsed to create an evolving world.
 */
export interface DayEvent {
    type: 'npc_arrives' | 'npc_departs' | 'new_rumor' | 'location_change' | 'world_event';
    description: string;
    /** For npc_arrives: the archetype of the new NPC */
    archetype?: string;
    /** For npc_departs: the NPC id leaving */
    npcId?: string;
    /** For new_rumor: the rumor data */
    rumor?: Partial<Rumor>;
    /** For location_change: which location and what changed */
    locationId?: string;
    locationChange?: string;
    /** For world_event: flavor text about world changes */
    worldEvent?: string;
}

/**
 * Currency display names - collapsed per world theme.
 * Mechanical ratios: 1 gold = 10 silver = 100 copper
 */
export interface CurrencyNames {
    gold: string;    // e.g., "Gold Coin", "Crown", "Sovereign"
    silver: string;  // e.g., "Silver Coin", "Shilling", "Gear"
    copper: string;  // e.g., "Copper Coin", "Penny", "Cog"
}

export interface TownState {
    npcs: NPC[];
    activeRumors: Rumor[];
    currentDay: number;
    /** Collapsed currency display names */
    currencyNames: CurrencyNames;
    /** Dynamically generated location names/descriptions */
    locations: TownLocation[];
    /** Has the town been collapsed (generated)? */
    isCollapsed: boolean;
    /** Event log - source of truth for all state changes */
    eventLog: TownEvent[];
    /** Events that happened on each day (indexed by day number) */
    dayEvents: Record<number, DayEvent[]>;
}

/** Standard currency names fallback */
export const DEFAULT_CURRENCY: CurrencyNames = {
    gold: 'Gold Coin',
    silver: 'Silver Coin',
    copper: 'Copper Coin'
};

/** Currency conversion ratios */
export const CURRENCY = {
    COPPER_PER_SILVER: 10,
    COPPER_PER_GOLD: 100
};
