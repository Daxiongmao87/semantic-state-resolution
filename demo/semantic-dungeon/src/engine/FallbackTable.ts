/**
 * Fallback Table - Deterministic fallback selection per §4.3.1
 * Uses Hash(Entity_ID + Hard_Constraints + Ruleset_Version) % Table_Size
 */

import type { Constraint } from '../types';

// =============================================================================
// Ruleset Version (increment when fallback tables change)
// =============================================================================

export const RULESET_VERSION = '1.0.0';

// =============================================================================
// Fallback Tables
// =============================================================================

const FALLBACK_ROOM_TYPES = [
    'chamber',
    'corridor',
    'alcove',
    'storage_room',
    'guard_post',
    'antechamber',
    'passage',
    'cell'
] as const;

const FALLBACK_ROOM_THEMES = [
    'ancient',
    'dusty',
    'damp',
    'cold',
    'dark',
    'quiet',
    'abandoned',
    'crumbling'
] as const;

const FALLBACK_OBJECT_TYPES = [
    'Chest',
    'Crate',
    'Barrel',
    'Sack',
    'Debris',
    'Rubble',
    'Bones',
    'Old Furniture'
] as const;

const FALLBACK_TILE_DESCRIPTIONS: Record<string, string[]> = {
    floor: [
        'Worn stone tiles cover the floor.',
        'Dusty flagstones crunch underfoot.',
        'The floor is cold and slightly damp.',
        'Cracked tiles reveal packed earth beneath.',
        'Smooth stone, polished by centuries of passage.'
    ],
    wall: [
        'Rough-hewn stone blocks form the wall.',
        'Ancient masonry, stained by age.',
        'Cold, damp stone stretches upward.',
        'Cracks spider through the mortar.',
        'Weathered bricks, some crumbling.'
    ],
    door: [
        'A heavy wooden door, iron-bound.',
        'An old door, its hinges rusted.',
        'A thick oaken door blocks the way.',
        'A reinforced portal stands here.',
        'A creaking door of aged timber.'
    ],
    void: [
        'Impenetrable darkness.',
        'Nothing but shadow.',
        'Empty void.',
        'Absolute darkness.',
        'The abyss.'
    ]
};

// =============================================================================
// Hash Function
// =============================================================================

/**
 * Simple hash function for strings
 * Returns a positive 32-bit integer
 */
function hashString(str: string): number {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
        const char = str.charCodeAt(i);
        hash = ((hash << 5) - hash) + char;
        hash = hash & hash; // Convert to 32bit integer
    }
    return Math.abs(hash);
}

/**
 * Build a deterministic hash key from entity and constraints
 */
function buildHashKey(
    entityId: string,
    hardConstraints: Constraint[],
    rulesetVersion: string = RULESET_VERSION
): string {
    const constraintStr = hardConstraints
        .map(c => `${c.key}:${JSON.stringify(c.value)}`)
        .sort()
        .join('|');

    return `${entityId}|${constraintStr}|${rulesetVersion}`;
}

// =============================================================================
// Fallback Selectors
// =============================================================================

/**
 * Get deterministic fallback room type
 */
export function getFallbackRoomType(
    entityId: string,
    hardConstraints: Constraint[]
): string {
    const key = buildHashKey(entityId, hardConstraints);
    const hash = hashString(key);
    const index = hash % FALLBACK_ROOM_TYPES.length;
    return FALLBACK_ROOM_TYPES[index];
}

/**
 * Get deterministic fallback room theme
 */
export function getFallbackRoomTheme(
    entityId: string,
    hardConstraints: Constraint[]
): string {
    const key = buildHashKey(entityId, hardConstraints);
    const hash = hashString(key + '_theme'); // Different salt for theme
    const index = hash % FALLBACK_ROOM_THEMES.length;
    return FALLBACK_ROOM_THEMES[index];
}

/**
 * Get deterministic fallback object type
 */
export function getFallbackObjectType(
    entityId: string,
    hardConstraints: Constraint[]
): string {
    const key = buildHashKey(entityId, hardConstraints);
    const hash = hashString(key);
    const index = hash % FALLBACK_OBJECT_TYPES.length;
    return FALLBACK_OBJECT_TYPES[index];
}

/**
 * Get deterministic fallback tile description
 */
export function getFallbackTileDescription(
    tileType: string,
    x: number,
    y: number
): string {
    const descriptions = FALLBACK_TILE_DESCRIPTIONS[tileType] || FALLBACK_TILE_DESCRIPTIONS.floor;
    const key = `tile_${tileType}_${x}_${y}`;
    const hash = hashString(key);
    const index = hash % descriptions.length;
    return descriptions[index];
}

/**
 * Get deterministic fallback room description
 */
export function getFallbackRoomDescription(
    roomType: string,
    theme: string
): string {
    // Generate a description based on the room type and theme
    const descriptors: Record<string, string> = {
        chamber: 'A modest chamber',
        corridor: 'A narrow passage',
        alcove: 'A small alcove',
        storage_room: 'A cluttered storage room',
        guard_post: 'An old guard post',
        antechamber: 'A waiting area',
        passage: 'A winding passage',
        cell: 'A cramped cell'
    };

    const atmospheres: Record<string, string> = {
        ancient: 'bearing the weight of ages.',
        dusty: 'thick with dust and cobwebs.',
        damp: 'with moisture dripping from the walls.',
        cold: 'unnaturally cold.',
        dark: 'shrouded in shadow.',
        quiet: 'eerily silent.',
        abandoned: 'long forgotten.',
        crumbling: 'with walls showing signs of decay.'
    };

    const base = descriptors[roomType] || 'A room';
    const atmosphere = atmospheres[theme] || 'awaits exploration.';

    return `${base}, ${atmosphere}`;
}

/**
 * Complete fallback result for room collapse
 */
export interface FallbackRoomResult {
    roomType: string;
    theme: string;
    description: string;
    tags: string[];
    objectTypes: string[];
}

export function getFallbackRoomResult(
    entityId: string,
    hardConstraints: Constraint[],
    objectSlotCount: number,
    isEntrance: boolean = false
): FallbackRoomResult {
    if (isEntrance) {
        return {
            roomType: 'entrance_hall',
            theme: 'ancient',
            description: 'The entrance to the dungeon. Light filters in from outside.',
            tags: ['entrance', 'threshold'],
            objectTypes: []
        };
    }

    const roomType = getFallbackRoomType(entityId, hardConstraints);
    const theme = getFallbackRoomTheme(entityId, hardConstraints);
    const description = getFallbackRoomDescription(roomType, theme);

    // Generate object types based on slot count
    const objectTypes: string[] = [];
    for (let i = 0; i < objectSlotCount; i++) {
        const objKey = `${entityId}_obj_${i}`;
        const hash = hashString(objKey);
        const index = hash % FALLBACK_OBJECT_TYPES.length;
        objectTypes.push(FALLBACK_OBJECT_TYPES[index]);
    }

    return {
        roomType,
        theme,
        description,
        tags: [theme],
        objectTypes
    };
}
