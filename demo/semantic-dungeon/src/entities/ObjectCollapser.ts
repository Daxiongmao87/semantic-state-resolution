/**
 * Object Collapser - Handles progressive collapse of object entities
 */

import { getOpenRouterSolver } from '../solver/OpenRouterSolver';
import { getEventLog } from '../engine/EventLog';
import type { ObjectEntity } from './ObjectEntity';
import { getObjectCollapseLevel } from './ObjectEntity';
import type { SolverRequest } from '../types';

const solver = getOpenRouterSolver();
const eventLog = getEventLog();

// =============================================================================
// Collapse Functions
// =============================================================================

/**
 * Collapse object type (called when room collapses)
 * This is a "shallow" collapse - we know WHAT it is, not the details
 */
export async function collapseObjectType(
    obj: ObjectEntity,
    roomType: string,
    roomTheme: string,
    roomDescription: string
): Promise<void> {
    if (obj.state === 'collapsed' && obj.components.objectType) {
        return; // Already has type
    }

    obj.state = 'collapsing';

    eventLog.append({
        type: 'CollapseStarted',
        entityId: obj.id
    });

    try {
        const request: SolverRequest = {
            requestId: `collapse_object_type_${obj.id}_${Date.now()}`,
            taskType: 'COLLAPSE_OBJECT_TYPE',
            entityId: obj.id,
            context: {
                roomType,
                roomTheme,
                roomDescription,
                position: obj.components.localPosition,
                instruction: `This object exists in a ${roomType} (${roomTheme}). What IS this object? Don't describe it in detail yet - just identify what type of object it is. Be creative and contextual. Consider: what would naturally exist in this room? It could be furniture, a container, debris, something alive, something magical, machinery, remains, etc.`
            },
            constraints: {
                hard: obj.constraints,
                soft: []
            },
            whitelist: {
                requiredFields: ['object_type', 'initial_state', 'tags']
            }
        };

        const response = await solver.solve(request);

        if (!response.success || !response.proposal) {
            throw new Error(response.error || 'LLM failed');
        }

        const proposal = response.proposal;

        obj.components.objectType = String(proposal.object_type || proposal.objectType || 'unknown object');
        obj.components.interactionState = String(proposal.initial_state || proposal.state || 'unknown') as ObjectEntity['components']['interactionState'];
        obj.components.tags = Array.isArray(proposal.tags) ? proposal.tags.map(String) : [];

        // Stay in 'latent' state - type is known but not fully collapsed
        obj.state = 'latent';

        eventLog.append({
            type: 'CollapseCommitted',
            entityId: obj.id,
            components: { objectType: obj.components.objectType },
            tags: obj.components.tags
        });

    } catch (error) {
        console.error(`[ObjectCollapser] Type collapse failed for ${obj.id}:`, error);

        // Fallback
        obj.components.objectType = 'mysterious object';
        obj.components.interactionState = 'unknown';
        obj.components.tags = ['unknown'];
        obj.state = 'latent';

        eventLog.append({
            type: 'CollapseFailed',
            entityId: obj.id,
            reason: error instanceof Error ? error.message : String(error),
            fallbackUsed: true
        });
    }
}

/**
 * Collapse visual description (called when player examines)
 */
export async function collapseObjectVisual(obj: ObjectEntity): Promise<string> {
    if (getObjectCollapseLevel(obj) !== 'type') {
        return obj.components.visualDesc || 'You see nothing special.';
    }

    obj.state = 'collapsing';

    eventLog.append({
        type: 'CollapseStarted',
        entityId: obj.id
    });

    try {
        const request: SolverRequest = {
            requestId: `collapse_object_visual_${obj.id}_${Date.now()}`,
            taskType: 'COLLAPSE_OBJECT_VISUAL',
            entityId: obj.id,
            context: {
                objectType: obj.components.objectType,
                tags: obj.components.tags,
                state: obj.components.interactionState,
                instruction: `Describe this ${obj.components.objectType} in vivid detail. What does it look like? What material is it made of? What condition is it in? Are there any notable features, markings, damage, or peculiarities? Write 2-3 sentences of evocative description.`
            },
            constraints: {
                hard: obj.constraints,
                soft: []
            },
            whitelist: {
                requiredFields: ['visual_description', 'material', 'condition']
            }
        };

        const response = await solver.solve(request);

        if (!response.success || !response.proposal) {
            throw new Error(response.error || 'LLM failed');
        }

        const proposal = response.proposal;

        obj.components.visualDesc = String(proposal.visual_description || proposal.description || 'You see nothing special.');
        obj.components.material = String(proposal.material || 'unknown');
        obj.components.condition = String(proposal.condition || 'unknown');

        // Now partially collapsed
        obj.state = 'latent';

        eventLog.append({
            type: 'CollapseCommitted',
            entityId: obj.id,
            components: {
                visualDesc: obj.components.visualDesc,
                material: obj.components.material,
                condition: obj.components.condition
            },
            tags: obj.components.tags
        });

        return obj.components.visualDesc;

    } catch (error) {
        console.error(`[ObjectCollapser] Visual collapse failed for ${obj.id}:`, error);

        obj.components.visualDesc = `A ${obj.components.objectType || 'mysterious object'} sits here.`;
        obj.state = 'latent';

        eventLog.append({
            type: 'CollapseFailed',
            entityId: obj.id,
            reason: error instanceof Error ? error.message : String(error),
            fallbackUsed: true
        });

        return obj.components.visualDesc;
    }
}

/**
 * Collapse contents/interaction result (called when player interacts)
 */
export async function collapseObjectContents(
    obj: ObjectEntity,
    action: string
): Promise<string> {
    if (getObjectCollapseLevel(obj) === 'contents') {
        return obj.components.interactionResult || 'Nothing happens.';
    }

    obj.state = 'collapsing';

    eventLog.append({
        type: 'CollapseStarted',
        entityId: obj.id
    });

    try {
        const request: SolverRequest = {
            requestId: `collapse_object_contents_${obj.id}_${Date.now()}`,
            taskType: 'COLLAPSE_OBJECT_CONTENTS',
            entityId: obj.id,
            context: {
                objectType: obj.components.objectType,
                visualDesc: obj.components.visualDesc,
                tags: obj.components.tags,
                currentState: obj.components.interactionState,
                action,
                instruction: `The player attempts to "${action}" this ${obj.components.objectType}. What happens? If it's a container, what's inside? If it's interactive, what effect does the action have? If the action doesn't make sense for this object, describe why it fails. Be creative and consequential.`
            },
            constraints: {
                hard: obj.constraints,
                soft: []
            },
            whitelist: {
                requiredFields: ['result', 'new_state', 'contents']
            }
        };

        const response = await solver.solve(request);

        if (!response.success || !response.proposal) {
            throw new Error(response.error || 'LLM failed');
        }

        const proposal = response.proposal;

        obj.components.interactionResult = String(proposal.result || 'Nothing happens.');
        obj.components.interactionState = String(proposal.new_state || proposal.newState || 'open') as ObjectEntity['components']['interactionState'];
        obj.components.contents = Array.isArray(proposal.contents)
            ? proposal.contents.map(String)
            : [];

        // Now fully collapsed
        obj.state = 'collapsed';
        obj.collapsedAt = Date.now();

        eventLog.append({
            type: 'CollapseCommitted',
            entityId: obj.id,
            components: {
                interactionResult: obj.components.interactionResult,
                interactionState: obj.components.interactionState,
                contents: obj.components.contents
            },
            tags: obj.components.tags
        });

        return obj.components.interactionResult;

    } catch (error) {
        console.error(`[ObjectCollapser] Contents collapse failed for ${obj.id}:`, error);

        obj.components.interactionResult = 'Nothing happens.';
        obj.components.contents = [];
        obj.state = 'collapsed';
        obj.collapsedAt = Date.now();

        eventLog.append({
            type: 'CollapseFailed',
            entityId: obj.id,
            reason: error instanceof Error ? error.message : String(error),
            fallbackUsed: true
        });

        return obj.components.interactionResult;
    }
}
