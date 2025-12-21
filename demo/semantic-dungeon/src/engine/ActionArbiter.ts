import { getOpenRouterSolver } from '../solver/OpenRouterSolver';
import { PlayerState } from '../types';
import { appState } from './AppStateManager';

export interface ArbitrationResult {
    checkRequired: boolean;
    skill?: string;
    dc?: number;
    reasoning: string; // "The door is rusted shut"
    narrative_outcome?: string; // Optional pre-roll flavor
}

export class ActionArbiter {
    private solver = getOpenRouterSolver();

    async arbitrate(
        actionDescription: string,
        targetDescription: string,
        playerCtx: PlayerState
    ): Promise<ArbitrationResult> {
        const globalConfig = appState.getConfig();

        const str = playerCtx.abilities?.str ?? 10;
        const dex = playerCtx.abilities?.dex ?? 10;
        const int = playerCtx.abilities?.int ?? 10;

        const prompt = `
        Role: Dungeon Master Arbiter.
        Task: Analyze a player's interaction with an object and determine if a Skill Check is required.
        
        Context:
        - World Genre: ${globalConfig.worldGenre}
        - Player Action: "${actionDescription}"
        - Target Object: "${targetDescription}"
        - Player Stats: STR ${str}, DEX ${dex}, INT ${int}
        
        Rules:
        1. If the action is trivial (e.g. "Look at", "Touch"), checkRequired = false.
        2. If the action has a chance of failure (e.g. "Bash", "Pick Lock", "Decipher"), checkRequired = true.
        3. Determine the most relevant D&D 5e-style Skill (Athletics, Acrobatics, Stealth, Investigation, etc.).
        4. Set a DC (Difficulty Class) between 5 (Easy) and 30 (Impossible) based on the Object's semantic nature.
        5. Provide brief reasoning.

        Output JSON Schema:
        {
            "check_required": boolean,
            "skill": stringOrNull,
            "dc": numberOrNull,
            "reasoning": string
        }
        `;

        const result = await this.solver.solve({
            requestId: `arbiter_${Date.now()}`,
            taskType: 'arbitrate_action',
            context: {
                prompt_body: prompt,
                target: targetDescription // Moved to context
            },
            constraints: { // valid structure
                hard: [],
                soft: []
            },
            whitelist: {}
        });

        if (result.success && result.proposal) {
            const p = result.proposal;
            return {
                checkRequired: Boolean(p.check_required),
                skill: typeof p.skill === 'string' ? p.skill : undefined,
                dc: typeof p.dc === 'number' ? p.dc : undefined,
                reasoning: String(p.reasoning)
            };
        }

        // Fallback: Assume trivial success if LLM fails
        return {
            checkRequired: false,
            reasoning: "The action succeeds without effort."
        };
    }
}

// Singleton helper
let arbiterInstance: ActionArbiter | null = null;
export function getActionArbiter(): ActionArbiter {
    if (!arbiterInstance) {
        arbiterInstance = new ActionArbiter();
    }
    return arbiterInstance;
}
