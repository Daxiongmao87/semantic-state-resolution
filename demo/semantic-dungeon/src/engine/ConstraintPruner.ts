/**
 * Constraint Pruner - Prunes soft constraints per §4.2 Pruning Policy
 * - Soft constraints dropped when strength < STRENGTH_THRESHOLD (0.15)
 * - Constraints with expired TTL are removed
 */

import type { Constraint } from '../types';
import { STRENGTH_THRESHOLD } from '../types';

export interface PruneResult {
    kept: Constraint[];
    pruned: Constraint[];
    reasons: Map<Constraint, string>;
}

/**
 * Prune constraints based on strength and TTL
 * @param constraints - Array of constraints to prune
 * @param currentTime - Current timestamp (defaults to Date.now())
 * @returns Object with kept constraints, pruned constraints, and reasons
 */
export function pruneConstraints(
    constraints: Constraint[],
    currentTime: number = Date.now()
): PruneResult {
    const kept: Constraint[] = [];
    const pruned: Constraint[] = [];
    const reasons = new Map<Constraint, string>();

    for (const constraint of constraints) {
        let shouldPrune = false;
        let reason = '';

        // Hard constraints are never pruned by strength/TTL (only by ConstraintObsoleted event)
        if (constraint.type === 'hard') {
            kept.push(constraint);
            continue;
        }

        // Prune weak soft constraints
        if (constraint.strength < STRENGTH_THRESHOLD) {
            shouldPrune = true;
            reason = `strength (${constraint.strength}) < threshold (${STRENGTH_THRESHOLD})`;
        }

        // Prune expired TTL
        // Note: TTL is in game ticks, but for now we use ms since we don't have tick tracking
        // This should be updated when a proper tick system is implemented
        if (constraint.ttl !== undefined) {
            // Assuming constraint has a createdAt timestamp
            // If not present, we can't check TTL expiration
            const createdAt = (constraint as unknown as { createdAt?: number }).createdAt;
            if (createdAt !== undefined) {
                const age = currentTime - createdAt;
                const ttlMs = constraint.ttl * 1000; // Convert seconds to ms (assuming ttl is in seconds)

                if (age > ttlMs) {
                    shouldPrune = true;
                    reason = `TTL expired (age: ${age}ms, ttl: ${ttlMs}ms)`;
                }
            }
        }

        if (shouldPrune) {
            pruned.push(constraint);
            reasons.set(constraint, reason);
        } else {
            kept.push(constraint);
        }
    }

    return { kept, pruned, reasons };
}

/**
 * Decay constraint strengths over time
 * Soft constraints gradually weaken as they age
 * @param constraints - Array of constraints
 * @param decayRate - How much to reduce strength per call (default: 0.05)
 * @returns Updated constraints (mutates in place for efficiency)
 */
export function decayConstraintStrengths(
    constraints: Constraint[],
    decayRate: number = 0.05
): Constraint[] {
    for (const constraint of constraints) {
        // Only decay soft constraints
        if (constraint.type === 'soft') {
            constraint.strength = Math.max(0, constraint.strength - decayRate);
        }
    }

    return constraints;
}

/**
 * Check if a new constraint conflicts with canonical state
 * Returns true if the constraint should be marked as obsolete
 */
export function constraintConflictsWithCanonical(
    constraint: Constraint,
    canonicalState: Record<string, unknown>
): boolean {
    const canonicalValue = canonicalState[constraint.key];

    // No conflict if canonical doesn't have this key
    if (canonicalValue === undefined) {
        return false;
    }

    // Conflict if values differ
    return JSON.stringify(canonicalValue) !== JSON.stringify(constraint.value);
}

/**
 * Sort constraints by precedence per §6
 * Order: Canonical > Hard > Soft > LLM (soft with low strength)
 * Returns a new sorted array
 */
export function sortByPrecedence(constraints: Constraint[]): Constraint[] {
    return [...constraints].sort((a, b) => {
        // Hard constraints before soft
        if (a.type === 'hard' && b.type === 'soft') return -1;
        if (a.type === 'soft' && b.type === 'hard') return 1;

        // Within same type, higher strength first
        return b.strength - a.strength;
    });
}
