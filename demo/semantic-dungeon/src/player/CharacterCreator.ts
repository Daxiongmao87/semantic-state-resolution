import { getOpenRouterSolver } from '../solver/OpenRouterSolver';
import { RaceData, ClassData, AbilityScores } from '../types';

export class CharacterCreator {
    private solver = getOpenRouterSolver();

    /**
     * Generate 3 Semantic Races based on World Genre
     */
    async generateRaces(worldGenre: string): Promise<RaceData[]> {
        const result = await this.solver.solve({
            requestId: `race_${Date.now()}`,
            taskType: 'generate_races',
            context: {
                worldGenre: worldGenre,
                schema: {
                    type: "object",
                    properties: {
                        races: {
                            type: "array",
                            items: {
                                type: "object",
                                properties: {
                                    name: { type: "string", description: "Name of the race (e.g., High Elf, Cyber-Orc)" },
                                    description: { type: "string", description: "Brief lore description" },
                                    traits: {
                                        type: "array",
                                        items: { type: "string" },
                                        description: "List of 2-3 racial traits"
                                    }
                                },
                                required: ["name", "description", "traits"]
                            },
                            minItems: 3,
                            maxItems: 3
                        }
                    },
                    required: ["races"]
                }
            },
            constraints: {
                hard: [
                    { key: 'world_genre', value: worldGenre, strength: 1.0, type: 'hard', sourceEventId: 'creation' },
                    { key: 'count', value: 3, strength: 1.0, type: 'hard', sourceEventId: 'creation' }
                ],
                soft: []
            },
            whitelist: {}
        });

        if (result.success && result.proposal && Array.isArray(result.proposal.races)) {
            return result.proposal.races as RaceData[];
        }

        // Fallback
        return [
            { name: 'Human', description: 'Adaptable and resilient.', traits: ['Versatile'] },
            { name: 'Drifter', description: 'A wanderer of the wastes.', traits: ['Scavenger'] },
            { name: 'Construct', description: 'A machine soul.', traits: ['Living Construct'] }
        ];
    }

    /**
     * Generate 3 Semantic Classes based on World Genre and Race
     */
    async generateClasses(worldGenre: string, race: RaceData): Promise<ClassData[]> {
        const result = await this.solver.solve({
            requestId: `class_${Date.now()}`,
            taskType: 'generate_classes',
            context: {
                worldGenre: worldGenre,
                race: race.name,
                schema: {
                    type: "object",
                    properties: {
                        classes: {
                            type: "array",
                            items: {
                                type: "object",
                                properties: {
                                    name: { type: "string", description: "Class name" },
                                    description: { type: "string" },
                                    abilities: {
                                        type: "array",
                                        items: { type: "string" },
                                        description: "List of 3 starting ability names"
                                    }
                                },
                                required: ["name", "description", "abilities"]
                            },
                            minItems: 3,
                            maxItems: 3
                        }
                    },
                    required: ["classes"]
                }
            },
            constraints: {
                hard: [
                    { key: 'world_genre', value: worldGenre, strength: 1.0, type: 'hard', sourceEventId: 'creation' },
                    { key: 'race', value: race.name, strength: 1.0, type: 'hard', sourceEventId: 'creation' }
                ],
                soft: []
            },
            whitelist: {}
        });

        if (result.success && result.proposal && Array.isArray(result.proposal.classes)) {
            return result.proposal.classes as ClassData[];
        }

        return [
            { name: 'Warrior', description: 'A master of arms.', abilities: ['Strike', 'Block', 'Charge'] },
            { name: 'Rogue', description: 'Shadow and silence.', abilities: ['Stab', 'Hide', 'Dash'] },
            { name: 'Sage', description: 'Knowledge is power.', abilities: ['Bolt', 'Heal', 'Ward'] }
        ];
    }

    /**
     * Generate Starting Stats (Standard Array)
     */
    generateStartingAbilities(): AbilityScores {
        // Standard Array: 15, 14, 13, 12, 10, 8
        // For now, return a balanced set.
        // In a real UI, user would assign these.
        return {
            str: 15,
            dex: 14,
            con: 13,
            int: 12,
            wis: 10,
            cha: 8
        };
    }
}

let characterCreatorInstance: CharacterCreator | null = null;
export function getCharacterCreator(): CharacterCreator {
    if (!characterCreatorInstance) {
        characterCreatorInstance = new CharacterCreator();
    }
    return characterCreatorInstance;
}
