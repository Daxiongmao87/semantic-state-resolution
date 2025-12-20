/**
 * Ability Horizon Queue - Pre-collapses ability pools ahead of player progression
 * Implements latency-hiding via lookahead buffer (horizon +2)
 */

import { getOpenRouterSolver } from '../solver/OpenRouterSolver';
import type { SolverRequest, Constraint } from '../types';
import { ABILITY_CATEGORIES } from '../types';

export interface AbilityOption {
    name: string;
    description: string;
    category: 'offensive' | 'defensive' | 'utility';
}

interface QueuedCollapse {
    level: number;
    status: 'pending' | 'collapsing' | 'collapsed' | 'failed';
    pool?: AbilityOption[];
    error?: string;
    promise?: Promise<AbilityOption[]>;
}

interface ClassContext {
    className: string;
    classDescription: string;
    constraints: Constraint[];
}

const LEVEL_SCALING: Record<number, { powerMultiplier: number; baseCooldown: number }> = {
    1: { powerMultiplier: 1.0, baseCooldown: 2 },
    3: { powerMultiplier: 1.3, baseCooldown: 3 },
    5: { powerMultiplier: 1.6, baseCooldown: 4 },
    7: { powerMultiplier: 2.0, baseCooldown: 5 },
    10: { powerMultiplier: 2.5, baseCooldown: 8 },
};

const ABILITY_UNLOCK_LEVELS = [1, 3, 5, 7, 10] as const;
const HORIZON_DEPTH = 2;

export class AbilityHorizonQueue {
    private solver = getOpenRouterSolver();
    private queue: Map<number, QueuedCollapse> = new Map();
    private classContext: ClassContext | null = null;
    private selectedAbilities: string[] = [];
    private listeners: Set<() => void> = new Set();

    /**
     * Initialize the queue with class context and start pre-collapsing
     */
    initialize(context: ClassContext): void {
        this.classContext = context;
        this.selectedAbilities = [];
        this.queue.clear();

        // Pre-collapse abilities for levels within horizon
        this.advanceHorizon(1);
    }

    /**
     * Advance the horizon window based on current level
     */
    advanceHorizon(currentLevel: number): void {
        if (!this.classContext) return;

        // Find which unlock levels are within horizon
        const currentIndex = ABILITY_UNLOCK_LEVELS.indexOf(
            currentLevel as typeof ABILITY_UNLOCK_LEVELS[number]
        );

        // If current level is not an unlock level, find the next one
        let startIndex = currentIndex >= 0 ? currentIndex :
            ABILITY_UNLOCK_LEVELS.findIndex(l => l > currentLevel);

        if (startIndex < 0) return; // Past all unlock levels

        // Queue levels within horizon
        for (let i = 0; i <= HORIZON_DEPTH && startIndex + i < ABILITY_UNLOCK_LEVELS.length; i++) {
            const level = ABILITY_UNLOCK_LEVELS[startIndex + i];
            this.ensureQueued(level);
        }
    }

    /**
     * Ensure a level's ability pool is queued for collapse
     */
    private ensureQueued(level: number): void {
        if (this.queue.has(level)) return;

        const entry: QueuedCollapse = {
            level,
            status: 'pending'
        };
        this.queue.set(level, entry);

        // Start collapse immediately
        this.collapseLevel(level);
    }

    /**
     * Collapse ability pool for a specific level
     */
    private async collapseLevel(level: number): Promise<void> {
        const entry = this.queue.get(level);
        if (!entry || !this.classContext) return;

        entry.status = 'collapsing';
        this.notifyListeners();

        const promise = this.generateAbilityPool(level);
        entry.promise = promise;

        try {
            const pool = await promise;
            entry.pool = pool;
            entry.status = 'collapsed';
            console.log(`[HorizonQueue] Level ${level} pool collapsed:`, pool.map(a => a.name));
        } catch (error) {
            entry.status = 'failed';
            entry.error = error instanceof Error ? error.message : String(error);
            console.error(`[HorizonQueue] Level ${level} collapse failed:`, error);
        }

        this.notifyListeners();
    }

    /**
     * Generate ability pool via LLM
     */
    private async generateAbilityPool(level: number): Promise<AbilityOption[]> {
        if (!this.classContext) {
            throw new Error('Class context not set');
        }

        const scaling = LEVEL_SCALING[level] || LEVEL_SCALING[1];
        const requestId = `req_horizon_${level}_${Date.now()}`;

        const request: SolverRequest = {
            requestId,
            taskType: 'COLLAPSE_ABILITY_POOL',
            context: {
                className: this.classContext.className,
                classDescription: this.classContext.classDescription,
                level,
                powerMultiplier: scaling.powerMultiplier,
                baseCooldown: scaling.baseCooldown,
                existingAbilities: this.selectedAbilities,
                instruction: `Generate 3 unique abilities for a level ${level} ${this.classContext.className}. 
Each ability should have a name, short description (1 sentence), and category.
Higher level abilities should be more powerful but have longer cooldowns.
Avoid abilities too similar to existing ones: ${this.selectedAbilities.join(', ') || 'none yet'}.
Include a mix of categories if possible.`
            },
            constraints: {
                hard: this.classContext.constraints,
                soft: []
            },
            whitelist: {
                categories: [...ABILITY_CATEGORIES],
                count: 3
            }
        };

        const response = await this.solver.solve(request);

        if (!response.success || !response.proposal) {
            console.warn('[HorizonQueue] LLM failed, using fallback');
            return this.getFallbackAbilities(level);
        }

        const abilities = response.proposal.abilities as AbilityOption[]
            || response.proposal.pool as AbilityOption[];

        if (!Array.isArray(abilities) || abilities.length === 0) {
            console.warn('[HorizonQueue] Invalid format, using fallback');
            return this.getFallbackAbilities(level);
        }

        return abilities.slice(0, 3).map(a => ({
            name: String(a.name || 'Unknown Ability'),
            description: String(a.description || 'A mysterious ability.'),
            category: ABILITY_CATEGORIES.includes(a.category as typeof ABILITY_CATEGORIES[number])
                ? a.category
                : 'utility'
        }));
    }

    /**
     * Get ability pool for a level - returns immediately if cached, waits if collapsing
     */
    async getAbilityPool(level: number): Promise<AbilityOption[]> {
        const entry = this.queue.get(level);

        if (!entry) {
            // Not queued yet, collapse now
            this.ensureQueued(level);
            return this.getAbilityPool(level); // Recurse to wait on promise
        }

        switch (entry.status) {
            case 'collapsed':
                return entry.pool!;

            case 'collapsing':
                // Wait for in-progress collapse
                if (entry.promise) {
                    return entry.promise;
                }
                throw new Error('Collapsing but no promise');

            case 'failed':
                // Retry once
                entry.status = 'pending';
                this.collapseLevel(level);
                if (entry.promise) {
                    return entry.promise;
                }
                return this.getFallbackAbilities(level);

            case 'pending':
                // Should be collapsing soon, wait a tick and check again
                await new Promise(resolve => setTimeout(resolve, 100));
                return this.getAbilityPool(level);
        }
    }

    /**
     * Check if a level's pool is ready (already collapsed)
     */
    isReady(level: number): boolean {
        const entry = this.queue.get(level);
        return entry?.status === 'collapsed';
    }

    /**
     * Get current queue status for debugging
     */
    getStatus(): { level: number; status: string }[] {
        return Array.from(this.queue.entries()).map(([level, entry]) => ({
            level,
            status: entry.status
        }));
    }

    /**
     * Record that an ability was selected (affects future pool generation)
     */
    recordSelection(abilityName: string): void {
        this.selectedAbilities.push(abilityName);
    }

    /**
     * Subscribe to queue status changes
     */
    subscribe(listener: () => void): () => void {
        this.listeners.add(listener);
        return () => this.listeners.delete(listener);
    }

    private notifyListeners(): void {
        for (const listener of this.listeners) {
            try {
                listener();
            } catch (e) {
                console.error('[HorizonQueue] Listener error:', e);
            }
        }
    }

    /**
     * Reset the queue
     */
    reset(): void {
        this.queue.clear();
        this.classContext = null;
        this.selectedAbilities = [];
    }

    private getFallbackAbilities(level: number): AbilityOption[] {
        const scaling = LEVEL_SCALING[level] || LEVEL_SCALING[1];
        return [
            { name: `Power Strike Lv${level}`, description: `A powerful attack (${scaling.powerMultiplier}x damage).`, category: 'offensive' },
            { name: `Guard Stance Lv${level}`, description: `Defensive posture reducing damage taken.`, category: 'defensive' },
            { name: `Quick Step Lv${level}`, description: `Enhanced mobility for tactical advantage.`, category: 'utility' }
        ];
    }
}

// Singleton
let queueInstance: AbilityHorizonQueue | null = null;

export function getAbilityHorizonQueue(): AbilityHorizonQueue {
    if (!queueInstance) {
        queueInstance = new AbilityHorizonQueue();
    }
    return queueInstance;
}
