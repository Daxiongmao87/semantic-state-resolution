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
import { getFallbackTileDescription } from '../engine/FallbackTable';

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

export interface MechanicsLog {
    skill: string;
    difficultyClass: number;
    roll: number;
    modifier: number;
    total: number;
    outcome: 'success' | 'failure';
    reasoning: string;
}

export interface InspectionResult {
    success: boolean;
    tileType: TileType;
    description: string;
    objectType?: string;
    isObject: boolean;
    wasAlreadyCollapsed: boolean;
    semanticAction?: 'pickup' | 'unlock' | 'open' | 'other';
    item?: string; // Legacy support
    items?: string[]; // V2 Semantic Generation
    outcome?: 'steady' | 'modified' | 'destroyed';
    generatedItems?: string[];
    mechanics?: MechanicsLog;
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

    // If it's a door, check state
    let finalDescription = description;
    if (tileType === 'door') {
        const door = room?.components.doors.find(d => d.position.x === x && d.position.y === y);
        if (door) {
            const state = door.state || 'closed';
            finalDescription += ` It is ${state}.`;
        }
    }

    return {
        success: true,
        tileType,
        description: finalDescription,
        isObject: false,
        wasAlreadyCollapsed: false
    };
}

/**
 * Interact with a tile (e.g., open a door, use an object)
 */
import { getActionArbiter } from '../engine/ActionArbiter';
import type { PlayerState } from '../types';

/**
 * Interact with a tile (e.g., open a door, use an object)
 */
export async function interactWithTile(
    layout: DungeonLayout,
    x: number,
    y: number,
    action: string = 'use',
    inventory: string[],
    playerState: PlayerState | null // Added
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

    // Arbitration Phase
    // Arbitration Phase
    let arbitrationContext = "";
    let arbitrationOutcome = "success"; // default
    let mechanicsLog: MechanicsLog | undefined = undefined;

    if (playerState) {
        const arbiter = getActionArbiter();
        const targetDesc = `${tileType} in ${room?.components.roomType || 'dungeon'}`;

        try {
            const judgment = await arbiter.arbitrate(action, targetDesc, playerState);

            if (judgment.checkRequired) {
                // Perform Skill Check
                const skillName = judgment.skill?.toLowerCase() || 'luck';
                const dc = judgment.dc || 10;

                // Get modifier from player stats
                // Simple mapping for now:
                // Athletics -> STR, Acrobatics/Stealth -> DEX, Others -> INT/WIS
                let mod = 0;
                const stats = playerState.abilities;
                if (stats) {
                    if (['athletics'].includes(skillName)) mod = Math.floor((stats.str - 10) / 2);
                    else if (['acrobatics', 'stealth', 'sleight_of_hand'].includes(skillName)) mod = Math.floor((stats.dex - 10) / 2);
                    else mod = Math.floor((stats.int - 10) / 2); // Default to INT for others
                }

                // Roll D20
                const roll = Math.floor(Math.random() * 20) + 1;
                const total = roll + mod;
                const success = total >= dc;

                arbitrationOutcome = success ? "success" : "failure";

                // Construct Log
                mechanicsLog = {
                    skill: judgment.skill || 'Check',
                    difficultyClass: dc,
                    roll: roll,
                    modifier: mod,
                    total: total,
                    outcome: success ? 'success' : 'failure',
                    reasoning: judgment.reasoning
                };

                arbitrationContext = `
                SKILL CHECK: ${judgment.skill} (DC ${dc})
                ROLL: ${roll} + ${mod} = ${total}
                OUTCOME: ${success ? "SUCCESS" : "FAILURE"}
                Arbiter Reasoning: ${judgment.reasoning}
                `;
            } else {
                arbitrationContext = `Action considered trivial. Reasoning: ${judgment.reasoning}`;
            }
        } catch (e) {
            console.warn("Arbitration failed, proceeding with default physics.", e);
        }
    }

    // Check for object at this position
    const horizonQueue = getRoomHorizonQueue();
    if (room) {
        const objects = horizonQueue.getObjectsInRoom(room.id);
        const objectHere = objects.find(obj =>
            obj.components.position.x === x && obj.components.position.y === y
        );

        if (objectHere) {
            // Inject Arbitration Context into Action for Object Collapser
            // Note: recursive structure needs update or we pass context via string hack?
            // Ideally we pass 'arbitrationOutcome' to collapseObjectContents
            // For now, prepend to action string as hint? Or update ObjectCollapser signature.
            // Let's prepend context to action for now to avoid breaking ObjectCollapser signature yet.
            const augmentedAction = `[Outcome: ${arbitrationOutcome}] ${action}. Context: ${arbitrationContext}`;

            // V2 Semantic Interaction
            const result = await collapseObjectContents(objectHere, augmentedAction);

            let semanticAction: 'pickup' | 'other' | undefined = undefined;
            const generatedItems = result.generatedItems || [];

            if (generatedItems.length > 0) {
                semanticAction = 'pickup';
            }

            if (result.outcome === 'destroyed') {
                if (room) {
                    horizonQueue.removeObjectFromRoom(room.id, objectHere.id);
                    tileDescriptions.delete(`${x},${y}`);
                }
            }

            return {
                success: true,
                tileType,
                description: result.message,
                objectType: objectHere.components.objectType as string,
                isObject: true,
                wasAlreadyCollapsed: false,
                semanticAction: semanticAction,
                item: generatedItems[0],
                items: generatedItems,
                outcome: result.outcome,
                generatedItems: result.generatedItems,
                mechanics: mechanicsLog // Added
            };
        }
    }

    // No object - interact with the tile itself
    // Pass original inventory, original action
    const interaction = await interactWithTileType(layout, x, y, tileType, room, action, inventory);

    const generatedItems = interaction.items || [];
    let semanticAction: 'pickup' | 'other' | undefined = undefined;

    if (generatedItems.length > 0) {
        semanticAction = 'pickup';
    }

    return {
        success: true,
        tileType,
        description: interaction.message, // Raw message
        isObject: false,
        wasAlreadyCollapsed: false,
        semanticAction,
        item: generatedItems[0],
        items: generatedItems
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
        const questContext = questObj ? `\n\nCRITICAL QUEST: "${questObj.value}"\nEnsure the description reflects this specific quest's theme or atmospheric elements.` : '';

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

interface TileInteractionResult {
    message: string;
    items: string[];
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
    action: string,
    inventory: string[]
): Promise<TileInteractionResult> {
    const roomContext = room ? {
        roomType: room.components.roomType || 'unknown chamber',
        theme: room.components.theme || 'ancient'
    } : {
        roomType: 'corridor',
        theme: 'dungeon'
    };

    // Special handling for Doors
    if (tileType === 'door') {
        const msg = await handleDoorInteraction(room, x, y, action, inventory);
        return { message: msg, items: [] };
    }

    try {
        const request: SolverRequest = {
            requestId: `interact_tile_${x}_${y}_${Date.now()}`,
            taskType: 'INTERACT_TILE',
            entityId: `tile_${x}_${y}`,
            context: {
                tileType,
                action,
                room: roomContext,
                instruction: `The player tries to "${action}" this ${tileType}.
PHYSICS VALIDATION: 
- REJECT interactions that violate the physical integrity of the base structure or architecture.
- ALLOW harvesting surface features IF they are present in the narrative description.
- ALLOW interacting with fixtures or added details.

Output JSON:
{
    "message": "Narrative result (1-2 sentences). Explain failure if rejected.",
    "items": ["Any", "Items", "Harvested"]
}`
            },
            constraints: { hard: [], soft: [] },
            whitelist: { requiredFields: ['message', 'items'] }
        };

        const response = await solver.solve(request);

        if (!response.success || !response.proposal) {
            throw new Error(response.error || 'LLM failed');
        }

        return {
            message: String(response.proposal.message || 'Nothing happens.'),
            items: Array.isArray(response.proposal.items) ? response.proposal.items.map(String) : []
        };

    } catch (error) {
        console.error(`[TileCollapser] Interact failed for tile ${x},${y}:`, error);
        return { message: getInteractFallback(tileType, action), items: [] };
    }
}

/**
 * Special handler for Door interactions (Lazy Evaluation)
 */
async function handleDoorInteraction(
    room: RoomEntity | null,
    x: number,
    y: number,
    action: string,
    inventory: string[]
): Promise<string> {
    if (!room) return "The door is jammed.";

    const door = room.components.doors.find(d => d.position.x === x && d.position.y === y);
    if (!door) return "The door is jammed.";

    // Lazy Collapse: Determine if Locked or Unlocked
    eventLog.append({
        type: 'CollapseStarted',
        entityId: `door_${x}_${y}`
    });

    try {
        // We ask LLM to decide state
        const request: SolverRequest = {
            requestId: `start_door_${x}_${y}_${Date.now()}`,
            taskType: 'COLLAPSE_DOOR',
            entityId: `door_${x}_${y}`,
            context: {
                roomType: room.components.roomType,
                theme: room.components.theme,
                action,
                doorState: door.state,
                inventory: inventory.join(', '),
                instruction: `Entity: Door (State: ${door.state})
Context: ${room.components.roomType} (${room.components.theme}).
Player Inventory: [${inventory.join(', ')}]
User Action: "${action}"

SIMULATION TASK:
1. Analyze the Action + Current State + Inventory. 
2. Determine the RESULTING State.
   - Passive (look, check) -> State remains '${door.state}'.
   - Manipulation (open) -> If 'closed', changing to 'open' (80%) or 'locked' (20%).
   - Closing (close) -> If 'open', change to 'closed'.
   - Destruction (kick) -> If successful, 'broken' (treat as open). If fail, 'closed'.
   - Locking (lock) -> ONLY if player has the specific key in inventory, change to 'locked'.

PHYSICS/THEME VALIDATION:
- "Looting" a door is impossible -> State remains '${door.state}'. Describe failure.
- "Locked" state implies a specific key is needed. Player MUST have key to lock it.`
            },
            constraints: { hard: [], soft: [] },
            whitelist: {
                requiredFields: ['new_state', 'message'],
                explanation: "new_state must be 'locked', 'open', 'closed', or 'broken'. key_name required ONLY if locked. message is description."
            }
        };

        const response = await solver.solve(request);
        if (!response.success || !response.proposal) throw new Error("LLM failed decision");

        const newState = String(response.proposal.new_state).toLowerCase();
        const message = String(response.proposal.message);
        const keyName = String(response.proposal.key_name || 'Key');

        // SWFC: Semantic state categories - not hardcoded behavior, but semantic groupings
        // The LLM proposes a state, we categorize it for game mechanics
        const TRAVERSABLE_STATES = ['open', 'broken', 'ajar', 'smashed', 'destroyed', 'unlocked'];
        const BLOCKED_STATES = ['closed', 'shut', 'sealed'];
        const LOCKED_STATES = ['locked', 'barred', 'magically_sealed', 'warded'];

        // Validate against semantic whitelist
        const allValidStates = [...TRAVERSABLE_STATES, ...BLOCKED_STATES, ...LOCKED_STATES];
        if (!allValidStates.includes(newState)) {
            console.warn(`[SWFC] LLM proposed unknown door state: "${newState}", defaulting to current`);
            return message;
        }

        // Apply semantic state - store the LLM's actual proposed state
        door.state = newState as 'open' | 'closed' | 'locked';

        // Handle side effects based on semantic category, not exact string
        if (LOCKED_STATES.includes(newState)) {
            // Validate: Does player have the key?
            const hasKey = inventory.some(item => item.toLowerCase() === keyName.toLowerCase());

            // Hard Constraint: Cannot lock without key
            if (!hasKey) {
                console.warn(`[SWFC] Rejected 'locked' state - Player missing key: ${keyName}`);
                return `You attempt to lock the door, but you realize you don't have the ${keyName}.`;
            }

            // Reverse Propagation for any locked-category state
            getRoomHorizonQueue().injectReversePropagationConstraint(room.id, 'required_object', keyName);

            eventLog.append({
                type: 'CollapseCommitted',
                entityId: `door_${x}_${y}`,
                components: { state: newState, requiredKey: keyName },
                tags: ['locked', newState]
            });
            return message + ` (Requires: ${keyName})`;
        }

        // Log the state change
        eventLog.append({
            type: 'CollapseCommitted',
            entityId: `door_${x}_${y}`,
            components: { state: newState },
            tags: TRAVERSABLE_STATES.includes(newState) ? ['traversable', newState] : ['blocked', newState]
        });

        return message;

    } catch (e) {
        console.error("Door collapse failed", e);
        // Fallback: It opens
        door.state = 'open';
        return "The door opens with a heavy creak.";
    }
}

/**
 * Fallback descriptions
 * V7 Fix: Uses hash-indexed deterministic selection
 */
function getFallbackDescription(tileType: TileType, x: number = 0, y: number = 0): string {
    return getFallbackTileDescription(tileType, x, y);
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
