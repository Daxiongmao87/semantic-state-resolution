import { getOpenRouterSolver } from '../solver/OpenRouterSolver';

export interface QuestOption {
    title: string;
    description: string;
    constraints: Record<string, string>;
}

export class QuestSearch {
    private solver = getOpenRouterSolver();

    /**
     * Search for quests based on query and context
     */
    async searchQuests(query: string, worldGenre: string): Promise<QuestOption[]> {
        const result = await this.solver.solve({
            requestId: `quest_${Date.now()}`,
            taskType: 'generate_quests',
            context: {
                worldGenre,
                userQuery: query,
                schema: {
                    type: "object",
                    properties: {
                        quests: {
                            type: "array",
                            items: {
                                type: "object",
                                properties: {
                                    title: { type: "string" },
                                    description: { type: "string" },
                                    theme: { type: "string", description: "Semantic theme (e.g., 'fire', 'undead')" },
                                    objective: { type: "string", description: "Core objective (e.g., 'kill_boss')" }
                                },
                                required: ["title", "description", "theme", "objective"]
                            },
                            minItems: 3,
                            maxItems: 3
                        }
                    },
                    required: ["quests"]
                }
            },
            constraints: {
                hard: [
                    { key: 'world_genre', value: worldGenre, strength: 1.0, type: 'hard', sourceEventId: 'quest_search' },
                    { key: 'query_relevance', value: query, strength: 1.0, type: 'hard', sourceEventId: 'quest_search' }
                ],
                soft: []
            },
            whitelist: {}
        });

        if (result.success && result.proposal && Array.isArray(result.proposal.quests)) {
            return result.proposal.quests.map((q: any) => ({
                title: q.title,
                description: q.description,
                constraints: {
                    theme: q.theme,
                    objective: q.objective
                }
            }));
        }

        // Fallback
        return [
            {
                title: 'Into the Unknown',
                description: 'Explore the depths and survive.',
                constraints: { theme: 'dark', objective: 'survive' }
            },
            {
                title: 'The Lost Artifact',
                description: 'Recover a relic from a bygone era.',
                constraints: { theme: 'ancient', objective: 'recover' }
            },
            {
                title: 'Clear the Nest',
                description: 'Eliminate a threat to the surface.',
                constraints: { theme: 'beast', objective: 'exterminate' }
            }
        ];
    }

    /**
     * Generate random quests based on player context
     */
    async generateRandomQuests(worldGenre: string, playerContext: any): Promise<QuestOption[]> {
        const race = playerContext?.race?.name || 'Unknown';
        const className = playerContext?.class?.name || 'Unknown';

        const result = await this.solver.solve({
            requestId: `quest_gen_${Date.now()}`,
            taskType: 'generate_quests',
            context: {
                worldGenre,
                player: { race, class: className, level: playerContext?.level || 1 },
                instruction: "Generate 3 distinct, dangerous quests suitable for this character's level and background.",
                schema: {
                    type: "object",
                    properties: {
                        quests: {
                            type: "array",
                            items: {
                                type: "object",
                                properties: {
                                    title: { type: "string" },
                                    description: { type: "string" },
                                    theme: { type: "string", description: "Semantic theme (e.g., 'fire', 'undead')" },
                                    objective: { type: "string", description: "Core objective (e.g., 'kill_boss')" }
                                },
                                required: ["title", "description", "theme", "objective"]
                            },
                            minItems: 3,
                            maxItems: 3
                        }
                    },
                    required: ["quests"]
                }
            },
            constraints: {
                hard: [
                    { key: 'world_genre', value: worldGenre, strength: 1.0, type: 'hard', sourceEventId: 'quest_gen' },
                    { key: 'player_class', value: className, strength: 0.8, type: 'hard', sourceEventId: 'quest_gen' }
                ],
                soft: []
            },
            whitelist: {}
        });

        if (result.success && result.proposal && Array.isArray(result.proposal.quests)) {
            return result.proposal.quests.map((q: any) => ({
                title: q.title,
                description: q.description,
                constraints: {
                    theme: q.theme,
                    objective: q.objective
                }
            }));
        }

        // Fallback
        return [
            {
                title: 'Rats in the Cellar',
                description: 'Classic reliable work for a newbie.',
                constraints: { theme: 'vermin', objective: 'exterminate' }
            },
            {
                title: 'The Haunted Crypt',
                description: 'Restless spirits disturb the peace.',
                constraints: { theme: 'undead', objective: 'purify' }
            },
            {
                title: 'Bandit Camp',
                description: 'Stolen goods need returning.',
                constraints: { theme: 'humanoid', objective: 'retrieve' }
            }
        ];
    }
}

let questSearchInstance: QuestSearch | null = null;
export function getQuestSearch(): QuestSearch {
    if (!questSearchInstance) {
        questSearchInstance = new QuestSearch();
    }
    return questSearchInstance;
}
