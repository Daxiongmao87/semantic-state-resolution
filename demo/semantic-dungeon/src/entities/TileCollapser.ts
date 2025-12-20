/**
 * Tile Collapser - Collapses any tile on inspection
 * Every tile is a latent entity until inspected
 */

import { getOpenRouterSolver } from '../solver/OpenRouterSolver';
import { getEventLog } from '../engine/EventLog';
import type { DungeonLayout, RoomEntity, TileType } from '../dungeon/DungeonGenerator';
import type { SolverRequest } from '../types';
import { getRoomHorizonQueue } from '../engine/RoomHorizonQueue';
import { collapseObjectVisual, collapseObjectContents } from './ObjectCollapser';

const solver = getOpenRouterSolver();
const eventLog = getEventLog();

// =============================================================================
// Tile Description Cache
// =============================================================================

interface TileDescription {
    tileType: TileType;
    description: string;
    details?: string;
    collapsedAt: number;
}

// Cache of collapsed tile descriptions (key: "x,y")
const tileDescriptions: Map<string, TileDescription> = new Map();

/**
 * Clear tile cache (for new dungeon)
 */
export function clearTileCache(): void {
    tileDescriptions.clear();
}

/**
 * Get cached tile description
 */
export function getTileDescription(x: number, y: number): TileDescription | undefined {
    return tileDescriptions.get(`${x},${y}`);
}

// =============================================================================
// Inspection
// =============================================================================

export interface InspectionResult {
    success: boolean;
    tileType: TileType;
    description: string;
    objectType?: string;
    isObject: boolean;
    wasAlreadyCollapsed: boolean;
}

/**
 * Inspect a tile at the given position
 * Returns a description based on what's there
 */
export async function inspectTile(
    layout: DungeonLayout,
    x: number,
    y: number
): Promise<InspectionResult> {
    // Bounds check
    if (y < 0 || y >= layout.tiles.length || x < 0 || x >= layout.tiles[0].length) {
        return {
            success: false,
            tileType: 'void',
            description: 'There is nothing there.',
            isObject: false,
            wasAlreadyCollapsed: false
        };
    }

    const tileType = layout.tiles[y][x];
    const tileKey = `${x},${y}`;

    // Check if already collapsed
    const cached = tileDescriptions.get(tileKey);
    if (cached) {
        return {
            success: true,
            tileType: cached.tileType,
            description: cached.description,
            isObject: false,
            wasAlreadyCollapsed: true
        };
    }

    // Find which room this tile is in
    const room = findRoomContainingTile(layout, x, y);

    // Check for object at this position
    const horizonQueue = getRoomHorizonQueue();
    if (room) {
        const objects = horizonQueue.getObjectsInRoom(room.id);
        const objectHere = objects.find(obj =>
            obj.components.position.x === x && obj.components.position.y === y
        );

        if (objectHere) {
            // Collapse object visual if needed
            const description = await collapseObjectVisual(objectHere);

            return {
                success: true,
                tileType,
                description,
                objectType: objectHere.components.objectType,
                isObject: true,
                wasAlreadyCollapsed: false
            };
        }
    }

    // No object - collapse the tile itself
    const description = await collapseTile(layout, x, y, tileType, room);

    // Cache it
    tileDescriptions.set(tileKey, {
        tileType,
        description,
        collapsedAt: Date.now()
    });

    return {
        success: true,
        tileType,
        description,
        isObject: false,
        wasAlreadyCollapsed: false
    };
}

/**
 * Interact with a tile (e.g., open a door, use an object)
 */
export async function interactWithTile(
    layout: DungeonLayout,
    x: number,
    y: number,
    action: string = 'use'
): Promise<InspectionResult> {
    // Bounds check
    if (y < 0 || y >= layout.tiles.length || x < 0 || x >= layout.tiles[0].length) {
        return {
            success: false,
            tileType: 'void',
            description: 'There is nothing there to interact with.',
            isObject: false,
            wasAlreadyCollapsed: false
        };
    }

    const tileType = layout.tiles[y][x];
    const room = findRoomContainingTile(layout, x, y);

    // Check for object at this position
    const horizonQueue = getRoomHorizonQueue();
    if (room) {
        const objects = horizonQueue.getObjectsInRoom(room.id);
        const objectHere = objects.find(obj =>
            obj.components.position.x === x && obj.components.position.y === y
        );

        if (objectHere) {
            // Collapse object contents
            const description = await collapseObjectContents(objectHere, action);

            return {
                success: true,
                tileType,
                description,
                objectType: objectHere.components.objectType,
                isObject: true,
                wasAlreadyCollapsed: false
            };
        }
    }

    // No object - interact with the tile itself (door, wall, floor)
    const description = await interactWithTileType(layout, x, y, tileType, room, action);

    return {
        success: true,
        tileType,
        description,
        isObject: false,
        wasAlreadyCollapsed: false
    };
}

// =============================================================================
// Tile Collapse
// =============================================================================

/**
 * Find which room contains a tile
 */
function findRoomContainingTile(layout: DungeonLayout, x: number, y: number): RoomEntity | null {
    for (const room of layout.rooms.values()) {
        const pos = room.components.position;
        const dim = room.components.dimensions;

        if (x >= pos.x && x < pos.x + dim.width &&
            y >= pos.y && y < pos.y + dim.height) {
            return room;
        }
    }
    return null;
}

/**
 * Collapse a tile's description via LLM
 */
async function collapseTile(
    _layout: DungeonLayout,
    x: number,
    y: number,
    tileType: TileType,
    room: RoomEntity | null
): Promise<string> {
    // Log
    eventLog.append({
        type: 'CollapseStarted',
        entityId: `tile_${x}_${y}`
    });

    try {
        const roomContext = room ? {
            roomType: room.components.roomType || 'unknown chamber',
            theme: room.components.theme || 'ancient',
            description: room.components.description || ''
        } : {
            roomType: 'corridor',
            theme: 'dungeon',
            description: 'A narrow passage'
        };

        const questObj = room?.constraints.find(c => c.key === 'quest_objective');
        const questContext = questObj ? `\n\nCRITICAL QUEST: "${questObj.value}"\nEnsure the description reflects this specific quest's theme (e.g. if fire quest, mention scorch marks or heat; if water quest, mention dampness or puddles).` : '';

        let instruction: string;
        switch (tileType) {
            case 'floor':
                instruction = `Describe this section of floor in a ${roomContext.roomType} (${roomContext.theme}). What does the floor look like here? Are there cracks, stains, debris, patterns, inscriptions? 1-2 sentences of evocative detail.${questContext}`;
                break;
            case 'wall':
                instruction = `Describe this section of wall in a ${roomContext.roomType} (${roomContext.theme}). What does the wall look like? Stonework, bricks, natural rock? Any carvings, moss, damage, torch sconces, hidden crevices? 1-2 sentences of evocative detail.${questContext}`;
                break;
            case 'door':
                instruction = `Describe this door leading out of a ${roomContext.roomType} (${roomContext.theme}). What is it made of? What condition? Any markings, locks, damage? 1-2 sentences of evocative detail.${questContext}`;
                break;
            case 'void':
                instruction = `The player looks into the darkness beyond the dungeon walls. What do they see or sense? 1-2 sentences of evocative, ominous detail.${questContext}`;
                break;
            default:
                instruction = `Describe what the player sees when examining this area. 1-2 sentences.${questContext}`;
        }

        const request: SolverRequest = {
            requestId: `collapse_tile_${x}_${y}_${Date.now()}`,
            taskType: 'COLLAPSE_TILE',
            entityId: `tile_${x}_${y}`,
            context: {
                tileType,
                position: { x, y },
                room: roomContext,
                instruction
            },
            constraints: {
                hard: [],
                soft: []
            },
            whitelist: {
                requiredFields: ['description']
            }
        };

        const response = await solver.solve(request);

        if (!response.success || !response.proposal) {
            throw new Error(response.error || 'LLM failed');
        }

        const description = String(response.proposal.description || getFallbackDescription(tileType));

        eventLog.append({
            type: 'CollapseCommitted',
            entityId: `tile_${x}_${y}`,
            components: { description, tileType },
            tags: []
        });

        return description;

    } catch (error) {
        console.error(`[TileCollapser] Failed for tile ${x},${y}:`, error);

        eventLog.append({
            type: 'CollapseFailed',
            entityId: `tile_${x}_${y}`,
            reason: error instanceof Error ? error.message : String(error),
            fallbackUsed: true
        });

        return getFallbackDescription(tileType);
    }
}

/**
 * Interact with a tile type
 */
async function interactWithTileType(
    _layout: DungeonLayout,
    x: number,
    y: number,
    tileType: TileType,
    room: RoomEntity | null,
    action: string
): Promise<string> {
    const roomContext = room ? {
        roomType: room.components.roomType || 'unknown chamber',
        theme: room.components.theme || 'ancient'
    } : {
        roomType: 'corridor',
        theme: 'dungeon'
    };

    try {
        const request: SolverRequest = {
            requestId: `interact_tile_${x}_${y}_${Date.now()}`,
            taskType: 'INTERACT_TILE',
            entityId: `tile_${x}_${y}`,
            context: {
                tileType,
                action,
                room: roomContext,
                instruction: `The player tries to "${action}" this ${tileType}. What happens? If the action makes sense, describe the result. If it doesn't make sense, describe why it fails or what happens instead. 1-2 sentences.`
            },
            constraints: { hard: [], soft: [] },
            whitelist: { requiredFields: ['result'] }
        };

        const response = await solver.solve(request);

        if (!response.success || !response.proposal) {
            throw new Error(response.error || 'LLM failed');
        }

        return String(response.proposal.result || 'Nothing happens.');

    } catch (error) {
        console.error(`[TileCollapser] Interact failed for tile ${x},${y}:`, error);
        return getInteractFallback(tileType, action);
    }
}

/**
 * Fallback descriptions
 */
function getFallbackDescription(tileType: TileType): string {
    switch (tileType) {
        case 'floor':
            return 'Worn stone tiles, cold underfoot.';
        case 'wall':
            return 'Solid stone blocks, old but sturdy.';
        case 'door':
            return 'A heavy wooden door, weathered by age.';
        case 'void':
            return 'Impenetrable darkness stretches beyond.';
        default:
            return 'You see nothing remarkable.';
    }
}

function getInteractFallback(tileType: TileType, action: string): string {
    switch (tileType) {
        case 'wall':
            return action === 'push' ? 'The wall doesn\'t budge.' : 'You touch cold stone.';
        case 'floor':
            return 'Your hand meets solid ground.';
        case 'door':
            return 'The door creaks but holds.';
        default:
            return 'Nothing happens.';
    }
}
