/**
 * Class Generator - Fractal SSR for character class creation
 * Implements Phase 1: Class name selection, ability pool generation, level progression
 */

import { getOpenRouterSolver } from '../solver/OpenRouterSolver';
import { getEventLog } from '../engine/EventLog';
import { getAbilityHorizonQueue } from '../engine/AbilityHorizonQueue';
import type {
    Entity,
    Constraint,
    SolverRequest
} from '../types';
import { ABILITY_STAT_TYPES } from '../types';

// =============================================================================
// Level Progression Configuration
// =============================================================================

export const ABILITY_UNLOCK_LEVELS = [1, 3, 5, 7, 10] as const;
export const MAX_LEVEL = 10;

// Scaling factors by level
const LEVEL_SCALING: Record<number, { powerMultiplier: number; baseCooldown: number }> = {
    1: { powerMultiplier: 1.0, baseCooldown: 2 },
    3: { powerMultiplier: 1.3, baseCooldown: 3 },
    5: { powerMultiplier: 1.6, baseCooldown: 4 },
    7: { powerMultiplier: 2.0, baseCooldown: 5 },
    10: { powerMultiplier: 2.5, baseCooldown: 8 },
};

// =============================================================================
// Types
// =============================================================================

export interface AbilitySlot {
    unlockLevel: number;
    abilityId: string | null;
}

export interface ClassEntity extends Entity {
    components: {
        name?: string;
        description?: string;
        inheritedTags?: string[];
        playerDescription?: string;
        level?: number;
        abilitySlots?: AbilitySlot[];
        abilities?: AbilityData[];
        [key: string]: unknown;
    };
}

export interface AbilityData {
    name: string;
    category: 'offensive' | 'defensive' | 'utility';
    properties: Record<string, number | string>;
}

export interface AbilityEntity extends Entity {
    components: {
        name?: string;
        category?: 'offensive' | 'defensive' | 'utility';
        unlockLevel?: number;
        properties?: Record<string, number | string>;
        [key: string]: unknown;
    };
    parentClassId: string;
}

export interface AbilityOption {
    name: string;
    description: string;
    category: 'offensive' | 'defensive' | 'utility';
}

// =============================================================================
// Class Generator
// =============================================================================

export class ClassGenerator {
    private solver = getOpenRouterSolver();
    private eventLog = getEventLog();
    private horizonQueue = getAbilityHorizonQueue();

    private classEntity: ClassEntity | null = null;
    private abilities: Map<string, AbilityEntity> = new Map();

    /**
     * Generate class name suggestions from player description
     */
    async generateClassNames(playerDescription: string): Promise<string[]> {
        const requestId = `req_class_names_${Date.now()}`;

        const request: SolverRequest = {
            requestId,
            taskType: 'COLLAPSE_CLASS_NAMES',
            context: {
                playerDescription,
                instruction: 'Generate 3 unique, evocative class names that capture the essence of the description. Names should be 2-3 words, suitable for a fantasy RPG.'
            },
            constraints: {
                hard: [],
                soft: this.extractTagsFromDescription(playerDescription)
            },
            whitelist: {
                count: 3
            }
        };

        const response = await this.solver.solve(request);

        if (!response.success || !response.proposal) {
            console.error('[ClassGenerator] Failed to generate class names:', response.error);
            // Fallback names
            return ['Storm Warrior', 'Elemental Knight', 'Arcane Guardian'];
        }

        const names = response.proposal.class_names as string[]
            || response.proposal.classNames as string[]
            || response.proposal.names as string[];

        if (!Array.isArray(names) || names.length === 0) {
            console.error('[ClassGenerator] Invalid response format:', response.proposal);
            return ['Storm Warrior', 'Elemental Knight', 'Arcane Guardian'];
        }

        return names.slice(0, 3);
    }

    /**
     * Create the class entity with selected name
     */
    selectClassName(playerDescription: string, selectedName: string): ClassEntity {
        const entityId = `class_${Date.now()}`;
        const inheritedTags = this.extractTagsFromDescription(playerDescription);

        this.classEntity = {
            id: entityId,
            state: 'collapsed',
            constraints: inheritedTags,
            components: {
                name: selectedName,
                description: playerDescription,
                inheritedTags: inheritedTags.map(c => String(c.value)),
                playerDescription,
                level: 1,
                abilitySlots: ABILITY_UNLOCK_LEVELS.map(level => ({
                    unlockLevel: level,
                    abilityId: null
                })),
                abilities: []
            },
            createdAt: Date.now(),
            collapsedAt: Date.now()
        };

        // Log the event
        this.eventLog.append({
            type: 'CollapseCommitted',
            entityId,
            components: this.classEntity.components as Record<string, unknown>,
            tags: inheritedTags.map(c => String(c.value))
        });

        // Initialize horizon queue to pre-collapse ability pools
        this.horizonQueue.initialize({
            className: selectedName,
            classDescription: playerDescription,
            constraints: inheritedTags
        });

        return this.classEntity;
    }

    /**
     * Generate ability pool for current level - uses horizon queue for caching
     */
    async generateAbilityPool(level: number): Promise<AbilityOption[]> {
        if (!this.classEntity) {
            throw new Error('Class not created yet');
        }

        if (!ABILITY_UNLOCK_LEVELS.includes(level as typeof ABILITY_UNLOCK_LEVELS[number])) {
            throw new Error(`Level ${level} does not unlock an ability`);
        }

        // Use horizon queue - will return cached pool if available, or wait for collapse
        return this.horizonQueue.getAbilityPool(level);
    }

    /**
     * Check if ability pool is ready (pre-collapsed)
     */
    isAbilityPoolReady(level: number): boolean {
        return this.horizonQueue.isReady(level);
    }

    /**
     * Get horizon queue status for debugging
     */
    getHorizonStatus(): { level: number; status: string }[] {
        return this.horizonQueue.getStatus();
    }

    /**
     * Select an ability from the pool
     */
    async selectAbility(level: number, option: AbilityOption): Promise<AbilityEntity> {
        if (!this.classEntity) {
            throw new Error('Class not created yet');
        }

        const entityId = `ability_${Date.now()}`;

        // Create ability entity (shallow collapse - no properties yet)
        const ability: AbilityEntity = {
            id: entityId,
            state: 'collapsed',
            constraints: [
                ...this.classEntity.constraints,
                { key: 'class_name', value: this.classEntity.components.name, strength: 1.0, type: 'hard', sourceEventId: this.classEntity.id },
                { key: 'unlock_level', value: level, strength: 1.0, type: 'hard', sourceEventId: 'level_system' },
                { key: 'category', value: option.category, strength: 1.0, type: 'hard', sourceEventId: entityId }
            ],
            components: {
                name: option.name,
                category: option.category,
                unlockLevel: level,
                // Properties will be collapsed later when ability is first used
            },
            parentClassId: this.classEntity.id,
            createdAt: Date.now(),
            collapsedAt: Date.now()
        };

        this.abilities.set(entityId, ability);

        // Update class entity's ability slots
        const slot = this.classEntity.components.abilitySlots?.find(s => s.unlockLevel === level);
        if (slot) {
            slot.abilityId = entityId;
        }

        // Add to class's ability list
        if (!this.classEntity.components.abilities) {
            this.classEntity.components.abilities = [];
        }
        this.classEntity.components.abilities.push({
            name: option.name,
            category: option.category,
            properties: {} // Will be filled on deep collapse
        });

        // Record selection in horizon queue (affects future pool generation)
        this.horizonQueue.recordSelection(option.name);

        // Log the event
        this.eventLog.append({
            type: 'CollapseCommitted',
            entityId,
            components: ability.components as Record<string, unknown>,
            tags: [option.category, `level_${level}`]
        });

        return ability;
    }

    /**
     * Collapse ability properties (deep collapse - when ability is first used)
     */
    async collapseAbilityProperties(abilityId: string): Promise<AbilityEntity> {
        const ability = this.abilities.get(abilityId);
        if (!ability) {
            throw new Error(`Ability ${abilityId} not found`);
        }

        if (ability.components.properties && Object.keys(ability.components.properties).length > 0) {
            // Already collapsed
            return ability;
        }

        const level = ability.components.unlockLevel || 1;
        const scaling = LEVEL_SCALING[level] || LEVEL_SCALING[1];

        const requestId = `req_props_${Date.now()}`;
        const request: SolverRequest = {
            requestId,
            taskType: 'COLLAPSE_ABILITY_PROPERTIES',
            entityId: abilityId,
            context: {
                abilityName: ability.components.name,
                category: ability.components.category,
                className: this.classEntity?.components.name,
                level,
                powerMultiplier: scaling.powerMultiplier,
                baseCooldown: scaling.baseCooldown,
                instruction: `Generate numeric properties for ${ability.components.name}.
This is a ${ability.components.category} ability for a level ${level} character.
Power should scale with level (multiplier: ${scaling.powerMultiplier}x).
Cooldown should be around ${scaling.baseCooldown} turns (higher for powerful abilities).
Use appropriate stats for the category.`
            },
            constraints: {
                hard: ability.constraints,
                soft: []
            },
            whitelist: {
                statTypes: [...ABILITY_STAT_TYPES]
            }
        };

        const response = await this.solver.solve(request);

        let properties: Record<string, number | string>;

        if (!response.success || !response.proposal) {
            console.error('[ClassGenerator] Failed to generate properties:', response.error);
            properties = this.getFallbackProperties(ability.components.category || 'utility', level);
        } else {
            properties = response.proposal.properties as Record<string, number | string>
                || response.proposal as Record<string, number | string>;
        }

        // Update ability
        ability.components.properties = properties;

        // Update in class's ability list
        const classAbility = this.classEntity?.components.abilities?.find(
            a => a.name === ability.components.name
        );
        if (classAbility) {
            classAbility.properties = properties;
        }

        // Log delta
        this.eventLog.append({
            type: 'DeltaApplied',
            entityId: abilityId,
            op: 'set',
            path: '/components/properties',
            value: properties
        });

        return ability;
    }

    /**
     * Level up the character
     */
    levelUp(): number {
        if (!this.classEntity) {
            throw new Error('Class not created yet');
        }

        const currentLevel = this.classEntity.components.level || 1;
        if (currentLevel >= MAX_LEVEL) {
            return currentLevel;
        }

        const newLevel = currentLevel + 1;
        this.classEntity.components.level = newLevel;

        // Advance horizon to pre-collapse upcoming ability pools
        this.horizonQueue.advanceHorizon(newLevel);

        this.eventLog.append({
            type: 'DeltaApplied',
            entityId: this.classEntity.id,
            op: 'set',
            path: '/components/level',
            value: newLevel
        });

        return newLevel;
    }

    /**
     * Check if current level unlocks an ability
     */
    canUnlockAbility(): boolean {
        if (!this.classEntity) return false;

        const level = this.classEntity.components.level || 1;
        const slot = this.classEntity.components.abilitySlots?.find(
            s => s.unlockLevel === level && s.abilityId === null
        );

        return !!slot;
    }

    /**
     * Get current class state
     */
    getClassEntity(): ClassEntity | null {
        return this.classEntity;
    }

    /**
     * Get all abilities
     */
    getAbilities(): AbilityEntity[] {
        return Array.from(this.abilities.values());
    }

    /**
     * Reset for new character
     */
    reset(): void {
        this.classEntity = null;
        this.abilities.clear();
    }

    // =============================================================================
    // Private Helpers
    // =============================================================================

    private extractTagsFromDescription(description: string): Constraint[] {
        // Simple keyword extraction - could be enhanced with NLP
        const keywords = description.toLowerCase()
            .split(/\s+/)
            .filter(word => word.length > 3)
            .filter(word => !['that', 'with', 'from', 'this', 'have', 'been'].includes(word));

        return keywords.map((keyword, i) => ({
            key: `tag_${i}`,
            value: keyword,
            strength: 0.8,
            type: 'soft' as const,
            sourceEventId: 'description_extraction'
        }));
    }

    private getFallbackProperties(category: string, level: number): Record<string, number | string> {
        const scaling = LEVEL_SCALING[level] || LEVEL_SCALING[1];
        const base = {
            cooldown: scaling.baseCooldown
        };

        switch (category) {
            case 'offensive':
                return { ...base, damage: Math.round(20 * scaling.powerMultiplier), range: 2 };
            case 'defensive':
                return { ...base, defense: Math.round(15 * scaling.powerMultiplier), duration: 3 };
            case 'utility':
                return { ...base, speed_bonus: Math.round(10 * scaling.powerMultiplier), duration: 2 };
            default:
                return base;
        }
    }
}

// Singleton
let generatorInstance: ClassGenerator | null = null;

export function getClassGenerator(): ClassGenerator {
    if (!generatorInstance) {
        generatorInstance = new ClassGenerator();
    }
    return generatorInstance;
}
