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
        const questObj = obj.constraints.find(c => c.key === 'quest_objective');
        const questContext = questObj ? `\n\nCRITICAL QUEST: "${questObj.value}"\nThis object MUST reflect this specific quest theme.` : '';

        const request: SolverRequest = {
            requestId: `collapse_object_type_${obj.id}_${Date.now()}`,
            taskType: 'COLLAPSE_OBJECT_TYPE',
            entityId: obj.id,
            context: {
                roomType,
                roomTheme,
                roomDescription,
                position: obj.components.localPosition,
                instruction: `This object exists in a ${roomType} (${roomTheme}). What IS this object? 

RULES:
- Be creative and contextual.
- Avoid generic dungeon clichés.${questContext}
- Just identify the type of object (e.g., 'cracked magma-shard', 'water-logged chest', 'floating ember').
- Respond with 2-3 tags for initial properties.`
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

        console.log(`[Object Type Collapse] ${obj.id} (in ${roomType}) -> ${obj.components.objectType}`);


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
 * Will regenerate if visualDesc was invalidated by an interaction
 */
export async function collapseObjectVisual(obj: ObjectEntity): Promise<string> {
    // Return cached if we have a visual description already
    if (obj.components.visualDesc) {
        return obj.components.visualDesc;
    }

    obj.state = 'collapsing';

    eventLog.append({
        type: 'CollapseStarted',
        entityId: obj.id
    });

    try {
        const objectType = obj.components.objectType || 'unknown object';
        const currentTags = obj.components.tags || [];
        const currentState = obj.components.interactionState || 'unknown';
        const lastInteraction = obj.components.interactionResult || null;

        const request: SolverRequest = {
            requestId: `collapse_object_visual_${obj.id}_${Date.now()}`,
            taskType: 'COLLAPSE_OBJECT_VISUAL',
            entityId: obj.id,
            context: {
                objectType,
                tags: currentTags,
                state: currentState,
                lastInteraction,
                instruction: `Describe what the player sees when looking at a "${objectType}".

RULES:
- Use SECOND PERSON: "You see...", "Before you lies...", "You notice..."
- Description must be SELF-CONTAINED.
- Current state: ${currentState}
- Current properties: ${currentTags.length > 0 ? currentTags.join(', ') : 'none'}
${lastInteraction ? `- IMPORTANT - This object was modified. What happened: "${lastInteraction}". Your description MUST reflect this specific change.` : ''}

Write 2-3 sentences describing what the player sees RIGHT NOW.`
            },
            constraints: {
                hard: [
                    ...obj.constraints,
                    { key: 'object_type', value: objectType, strength: 1.0, type: 'hard', sourceEventId: 'room_collapse' },
                    // Current state tags as constraints
                    ...currentTags.map(tag => ({
                        key: `current_state_${tag}`,
                        value: true,
                        strength: 1.0,
                        type: 'hard' as const,
                        sourceEventId: 'previous_interaction'
                    }))
                ],
                soft: []
            },
            whitelist: {
                requiredFields: ['visual_description', 'material', 'condition'],
                objectType: objectType
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
        const objectType = obj.components.objectType || 'object';
        const existingTags = obj.components.tags || [];
        const existingState = obj.components.interactionState || 'unknown';

        const request: SolverRequest = {
            requestId: `collapse_object_contents_${obj.id}_${Date.now()}`,
            taskType: 'COLLAPSE_OBJECT_CONTENTS',
            entityId: obj.id,
            context: {
                objectType,
                visualDesc: obj.components.visualDesc,
                existingTags,
                existingState,
                action,
                instruction: `The player attempts: "${action}" on a ${objectType}.

RULES:
- Use SECOND PERSON: "You...", "Your hands...", "You see..."
- Current object state: ${existingState}
- Current properties: ${existingTags.join(', ') || 'none'}

Generate:
1. result: What happens? Describe in second person. (2-3 sentences, e.g., "You strike the crystal and it shatters, sending shards flying. A faint hum fills the air as glowing dust settles around you.")
2. new_state: Single word/phrase for new state (e.g., "shattered", "opened", "activated")
3. new_tags: Array of tags for the object's new properties (e.g., ["shattered", "glowing_dust", "sharp_shards"])
4. contents: If something was revealed/found, list items (array of strings)

Be creative. Actions have consequences.`
            },
            constraints: {
                hard: [
                    ...obj.constraints,
                    { key: 'object_type', value: objectType, strength: 1.0, type: 'hard', sourceEventId: 'constraint' },
                    // Existing tags become constraints
                    ...existingTags.map(tag => ({
                        key: `previous_state_${tag}`,
                        value: true,
                        strength: 0.8,
                        type: 'soft' as const,
                        sourceEventId: 'previous_interaction'
                    }))
                ],
                soft: []
            },
            whitelist: {
                requiredFields: ['result', 'new_state', 'new_tags', 'contents'],
                objectType
            }
        };

        const response = await solver.solve(request);

        if (!response.success || !response.proposal) {
            throw new Error(response.error || 'LLM failed');
        }

        const proposal = response.proposal;

        obj.components.interactionResult = String(proposal.result || 'Nothing happens.');
        obj.components.interactionState = String(proposal.new_state || proposal.newState || 'changed') as ObjectEntity['components']['interactionState'];
        obj.components.contents = Array.isArray(proposal.contents)
            ? proposal.contents.map(String)
            : [];

        // Merge new tags with existing (these become constraints for future interactions)
        const newTags = Array.isArray(proposal.new_tags)
            ? proposal.new_tags.map(String)
            : [];
        obj.components.tags = [...new Set([...obj.components.tags, ...newTags])];

        // Invalidate visual description - next inspection will regenerate based on new state
        // This ensures "inspect after tip" shows "tilted chest" not "upright chest"
        obj.components.visualDesc = undefined;

        // Don't mark as fully collapsed - object can be interacted with again
        obj.state = 'latent';

        eventLog.append({
            type: 'CollapseCommitted',
            entityId: obj.id,
            components: {
                interactionResult: obj.components.interactionResult,
                interactionState: obj.components.interactionState,
                contents: obj.components.contents,
                newTags
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
