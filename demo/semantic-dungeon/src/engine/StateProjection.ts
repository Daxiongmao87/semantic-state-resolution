/**
 * State Projection - Projects current game state from Event Log
 * Implements §4.4 (Event Sourcing - "Game World is merely its current projection")
 * 
 * V8 Fix: The Event Log should be the Source of Truth, not the DungeonLayout object
 */

import type {
    SSREvent,
    CollapseCommittedEvent,
    DeltaAppliedEvent,
    PlayerMovedEvent,
    ConstraintInjectedEvent,
    Constraint
} from '../types';
import { getEventLog } from './EventLog';

// =============================================================================
// Projected State Types
// =============================================================================

export interface ProjectedRoomState {
    id: string;
    state: 'latent' | 'collapsing' | 'collapsed';
    components: Record<string, unknown>;
    tags: string[];
    constraints: Constraint[];
}

export interface ProjectedPlayerState {
    position: { x: number; y: number };
    facing: string;
}

export interface ProjectedGameState {
    rooms: Map<string, ProjectedRoomState>;
    objects: Map<string, Record<string, unknown>>;
    player: ProjectedPlayerState | null;
    entityConstraints: Map<string, Constraint[]>;
}

// =============================================================================
// State Projection Functions
// =============================================================================

/**
 * Project the current game state from the Event Log
 * This is the canonical way to derive state from events
 */
export function projectCurrentState(events?: readonly SSREvent[]): ProjectedGameState {
    const eventLog = getEventLog();
    const allEvents = events ?? eventLog.getAll();

    const state: ProjectedGameState = {
        rooms: new Map(),
        objects: new Map(),
        player: null,
        entityConstraints: new Map()
    };

    for (const event of allEvents) {
        applyEventToState(state, event);
    }

    return state;
}

/**
 * Apply a single event to the projected state
 */
function applyEventToState(state: ProjectedGameState, event: SSREvent): void {
    switch (event.type) {
        case 'EntityCreated': {
            // Create entity with initial constraints
            const entityId = event.entityId;

            if (entityId.startsWith('room_')) {
                state.rooms.set(entityId, {
                    id: entityId,
                    state: 'latent',
                    components: {},
                    tags: [],
                    constraints: [...event.initialConstraints]
                });
            } else if (entityId.startsWith('obj_')) {
                state.objects.set(entityId, {
                    id: entityId,
                    state: 'latent'
                });
            }

            state.entityConstraints.set(entityId, [...event.initialConstraints]);
            break;
        }

        case 'CollapseStarted': {
            const room = state.rooms.get(event.entityId);
            if (room) {
                room.state = 'collapsing';
            }
            break;
        }

        case 'CollapseCommitted': {
            const collapseEvent = event as CollapseCommittedEvent;
            const entityId = collapseEvent.entityId;

            if (entityId.startsWith('room_')) {
                const existing = state.rooms.get(entityId);
                state.rooms.set(entityId, {
                    id: entityId,
                    state: 'collapsed',
                    components: { ...collapseEvent.components },
                    tags: [...collapseEvent.tags],
                    constraints: existing?.constraints ?? []
                });
            } else if (entityId.startsWith('obj_')) {
                const existing = state.objects.get(entityId) ?? {};
                state.objects.set(entityId, {
                    ...existing,
                    ...collapseEvent.components,
                    tags: collapseEvent.tags,
                    state: 'collapsed'
                });
            }
            break;
        }

        case 'DeltaApplied': {
            const deltaEvent = event as DeltaAppliedEvent;
            const entityId = deltaEvent.entityId;

            // Apply delta to room or object
            const room = state.rooms.get(entityId);
            if (room) {
                applyDelta(room.components, deltaEvent);
            }

            const obj = state.objects.get(entityId);
            if (obj) {
                applyDelta(obj, deltaEvent);
            }
            break;
        }

        case 'ConstraintInjected': {
            const constraintEvent = event as ConstraintInjectedEvent;
            const existingConstraints = state.entityConstraints.get(constraintEvent.targetEntityId) ?? [];
            existingConstraints.push(constraintEvent.constraint);
            state.entityConstraints.set(constraintEvent.targetEntityId, existingConstraints);

            // Also update room's constraints if it's a room
            const room = state.rooms.get(constraintEvent.targetEntityId);
            if (room) {
                room.constraints.push(constraintEvent.constraint);
            }
            break;
        }

        case 'PlayerMoved': {
            const moveEvent = event as PlayerMovedEvent;
            state.player = {
                position: { ...moveEvent.position },
                facing: moveEvent.facing
            };
            break;
        }

        case 'ConstraintObsoleted': {
            // Remove the obsoleted constraint from entity
            const constraints = state.entityConstraints.get(event.targetEntityId);
            if (constraints) {
                const index = constraints.findIndex(c => c.key === event.constraintKey);
                if (index !== -1) {
                    constraints.splice(index, 1);
                }
            }
            break;
        }

        case 'ConstraintContradicted': {
            // Handle contradiction - for now just log
            // The resolution field indicates what was done
            console.log(`[StateProjection] Constraint contradicted: ${event.constraintKey}, resolution: ${event.resolution}`);
            break;
        }

        case 'CollapseFailed': {
            // Mark entity as failed, record fallback usage
            const room = state.rooms.get(event.entityId);
            if (room) {
                room.components.collapseFailed = true;
                room.components.failureReason = event.reason;
                room.components.fallbackUsed = event.fallbackUsed;
            }
            break;
        }
    }
}

/**
 * Apply a delta operation to a state object
 */
function applyDelta(target: Record<string, unknown>, delta: DeltaAppliedEvent): void {
    const pathParts = delta.path.split('/').filter(p => p.length > 0);

    if (pathParts.length === 0) {
        return;
    }

    // Navigate to parent
    let current: Record<string, unknown> = target;
    for (let i = 0; i < pathParts.length - 1; i++) {
        const part = pathParts[i];
        if (!(part in current)) {
            current[part] = {};
        }
        current = current[part] as Record<string, unknown>;
    }

    const lastKey = pathParts[pathParts.length - 1];

    switch (delta.op) {
        case 'set':
            current[lastKey] = delta.value;
            break;
        case 'add':
            if (!Array.isArray(current[lastKey])) {
                current[lastKey] = [];
            }
            (current[lastKey] as unknown[]).push(delta.value);
            break;
        case 'remove':
            if (Array.isArray(current[lastKey])) {
                const arr = current[lastKey] as unknown[];
                const idx = arr.indexOf(delta.value);
                if (idx !== -1) {
                    arr.splice(idx, 1);
                }
            } else {
                delete current[lastKey];
            }
            break;
    }
}

/**
 * Get the projected state for a specific room
 */
export function getRoomState(roomId: string): ProjectedRoomState | undefined {
    const state = projectCurrentState();
    return state.rooms.get(roomId);
}

/**
 * Get all collapsed rooms
 */
export function getCollapsedRooms(): ProjectedRoomState[] {
    const state = projectCurrentState();
    return Array.from(state.rooms.values()).filter(r => r.state === 'collapsed');
}

/**
 * Verify state consistency between projected state and direct state
 * Used for debugging and testing
 */
export function verifyStateConsistency(
    projected: ProjectedGameState,
    direct: { rooms: Map<string, unknown>; player: { x: number; y: number } }
): { consistent: boolean; differences: string[] } {
    const differences: string[] = [];

    // Check player position
    if (projected.player && direct.player) {
        if (projected.player.position.x !== direct.player.x ||
            projected.player.position.y !== direct.player.y) {
            differences.push(`Player position mismatch: projected=(${projected.player.position.x},${projected.player.position.y}) vs direct=(${direct.player.x},${direct.player.y})`);
        }
    }

    // Check room count
    if (projected.rooms.size !== direct.rooms.size) {
        differences.push(`Room count mismatch: projected=${projected.rooms.size} vs direct=${direct.rooms.size}`);
    }

    return {
        consistent: differences.length === 0,
        differences
    };
}
