/**
 * Object Entity - Full ECS entity for dungeon objects with progressive collapse
 */

import type { Entity, Constraint } from '../types';

// =============================================================================
// Object Entity
// =============================================================================

export interface ObjectComponents {
    // Geometry (deterministic from room generation)
    position: { x: number; y: number };      // World position
    localPosition: { x: number; y: number }; // Position within room
    roomId: string;
    size: { width: number; height: number };

    // Collapse Level 1: Room collapse (type known)
    objectType?: string;

    // Collapse Level 2: Inspect (visual details known)
    visualDesc?: string;
    material?: string;
    condition?: string;

    // Collapse Level 3: Interact (contents/effects known)
    contents?: string[];
    interactionResult?: string;

    // State
    interactionState: 'unknown' | 'closed' | 'open' | 'destroyed' | 'dormant' | 'active';

    // Tags (semantic properties)
    tags: string[];

    [key: string]: unknown;
}

export interface ObjectEntity extends Entity {
    components: ObjectComponents;
}

// =============================================================================
// Collapse Levels
// =============================================================================

export type ObjectCollapseLevel = 'type' | 'visual' | 'contents';

/**
 * Determine what collapse level an object has reached
 */
export function getObjectCollapseLevel(obj: ObjectEntity): ObjectCollapseLevel {
    if (obj.components.contents !== undefined || obj.components.interactionResult !== undefined) {
        return 'contents';
    }
    if (obj.components.visualDesc !== undefined) {
        return 'visual';
    }
    return 'type';
}

/**
 * Check if object needs collapse for a given action
 */
export function needsCollapseFor(obj: ObjectEntity, action: 'examine' | 'interact'): boolean {
    const level = getObjectCollapseLevel(obj);

    if (action === 'examine') {
        return level === 'type'; // Needs visual collapse
    }
    if (action === 'interact') {
        return level !== 'contents'; // Needs contents collapse
    }
    return false;
}

// =============================================================================
// Factory
// =============================================================================

let objectIdCounter = 0;

/**
 * Create a new object entity from a room's object slot
 */
export function createObjectEntity(
    roomId: string,
    roomPosition: { x: number; y: number },
    localPosition: { x: number; y: number },
    size: { width: number; height: number },
    roomConstraints: Constraint[]
): ObjectEntity {
    const id = `object_${objectIdCounter++}`;

    // Inherit constraints from parent room
    const constraints: Constraint[] = roomConstraints.map(c => ({
        ...c,
        sourceEventId: `inherited_from_${roomId}`
    }));

    return {
        id,
        state: 'latent',
        constraints,
        components: {
            position: {
                x: roomPosition.x + localPosition.x,
                y: roomPosition.y + localPosition.y
            },
            localPosition,
            roomId,
            size,
            interactionState: 'unknown',
            tags: []
        },
        createdAt: Date.now()
    };
}

/**
 * Reset the object ID counter (for new dungeons)
 */
export function resetObjectIdCounter(): void {
    objectIdCounter = 0;
}
