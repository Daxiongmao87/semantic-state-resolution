/**
 * Object Collapser - Handles progressive collapse of object entities
 */

import { getOpenRouterSolver } from '../solver/OpenRouterSolver';
import { getEventLog } from '../engine/EventLog';
import type { ObjectEntity } from './ObjectEntity';

import type { SolverRequest } from '../types';

const solver = getOpenRouterSolver();
const eventLog = getEventLog();

// =============================================================================
// Collapse Functions
// =============================================================================

export interface ObjectInteractionResult {
    message: string;
    generatedItems: string[];
    outcome: 'steady' | 'modified' | 'destroyed';
    newType?: string;
    newDescription?: string;
}

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

        const requiredObj = obj.constraints.find(c => c.key === 'required_object');

        let instruction = `This object exists in a ${roomType} (${roomTheme}). What IS this object? 

RULES:
- Be creative and contextual.
- Avoid generic dungeon clichés.${questContext}
- Just identify the type of object based on the room context.
- Respond with 2-3 tags for initial properties.`;

        if (requiredObj) {
            instruction = `CRITICAL OVERRIDE: This object MUST be the key quest item described as: "${requiredObj.value}".
You must generate this specific item.
Name it appropriately.
Tags should reflect its legendary or key status.`;
            console.log(`[ObjectCollapser] Forcing QUEST TARGET generation: ${requiredObj.value}`);
        }

        const request: SolverRequest = {
            requestId: `collapse_object_type_${obj.id}_${Date.now()}`,
            taskType: 'COLLAPSE_OBJECT_TYPE',
            entityId: obj.id,
            context: {
                roomType,
                roomTheme,
                roomDescription,
                position: obj.components.localPosition,
                instruction
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
- Use SECOND PERSON perspective.
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
): Promise<ObjectInteractionResult> {

    // We force re-evaluation every time to allow sequential interactions (hit twice -> break)
    obj.state = 'collapsing';

    eventLog.append({
        type: 'CollapseStarted',
        entityId: obj.id
    });

    try {
        const objectType = obj.components.objectType || 'object';
        const existingTags = obj.components.tags || [];
        const existingState = obj.components.interactionState || 'unknown';

        // Detailed semantic prompt
        const instruction = `
The player performs action "${action}" on "${objectType}".
Context: ${obj.components.visualDesc || 'A mysterious object'}.
State: ${existingState}
Tags: [${existingTags.join(', ')}].

SIMULATION TASK:
Analyze the physical and semantic consequences of this action.
SIMULATION TASK:
Analyze the physical and semantic consequences of this action.
1. Does it generate items? (Generate loose items if they are physically present or contained).
2. Does it change the object? (Mechanically, chemically, or magically alter state).
3. Be realistic. Extracting a sub-component should leave the remainder.

Output JSON:
{
    "message": "Narrative description of what happens (1-2 sentences).",
    "generated_items": ["List", "of", "items", "created/taken"],
    "outcome": "steady" (no change) OR "modified" (changed state) OR "destroyed" (removed),
    "new_type": "Name of the object AFTER modification (if outcome=modified)",
    "new_description": "Visual description of the object AFTER modification (if outcome=modified)"
}
`;

        const request: SolverRequest = {
            requestId: `collapse_object_contents_${obj.id}_${Date.now()}`,
            taskType: 'COLLAPSE_OBJECT_CONTENTS',
            entityId: obj.id,
            context: {
                objectType,
                action,
                instruction
            },
            constraints: { hard: [], soft: [] },
            whitelist: {
                requiredFields: ['message', 'generated_items', 'outcome'],
                explanation: "outcome must be steady, modified, or destroyed."
            }
        };

        const response = await solver.solve(request);

        if (!response.success || !response.proposal) {
            throw new Error(response.error || 'LLM failed');
        }

        const proposal = response.proposal;
        const result: ObjectInteractionResult = {
            message: String(proposal.message || 'Nothing happens.'),
            generatedItems: Array.isArray(proposal.generated_items) ? proposal.generated_items.map(String) : [],
            outcome: (proposal.outcome as 'steady' | 'modified' | 'destroyed') || 'steady',
            newType: proposal.new_type ? String(proposal.new_type) : undefined,
            newDescription: proposal.new_description ? String(proposal.new_description) : undefined
        };

        // Apply Modification Logic
        if (result.outcome === 'modified') {
            if (result.newType) obj.components.objectType = result.newType;
            if (result.newDescription) obj.components.visualDesc = result.newDescription;
            obj.components.interactionState = 'active';
        }

        obj.state = 'collapsed';
        obj.collapsedAt = Date.now();

        eventLog.append({
            type: 'CollapseCommitted',
            entityId: obj.id,
            components: {
                interactionResult: result.message,
                outcome: result.outcome,
                generatedItems: result.generatedItems
            },
            tags: obj.components.tags
        });

        return result;

    } catch (error) {
        console.error(`[ObjectCollapser] Contents collapse failed for ${obj.id}:`, error);

        obj.state = 'collapsed';
        return {
            message: 'Nothing happens.',
            generatedItems: [],
            outcome: 'steady'
        };
    }
}
