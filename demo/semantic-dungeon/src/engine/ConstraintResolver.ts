/**
 * Constraint Resolver - Resolves constraint conflicts per §6 Conflict Resolution
 * Precedence: Canonical > Hard > Soft > LLM
 */

import type { Constraint, ConstraintObsoletedEvent, ConstraintContradictedEvent } from '../types';

export interface ResolvedConstraints {
    resolved: Constraint[];
    obsoleted: ConstraintObsoletedEvent[];
    contradicted: ConstraintContradictedEvent[];
}

/**
 * Resolve constraints against canonical state
 * Per §6: If a Hard Constraint violates Canonical State, mark it as "Obsolete"
 * @param constraints - Constraints to resolve
 * @param canonicalState - Current collapsed state of the entity
 * @param entityId - The entity these constraints apply to
 * @returns Resolved constraints and any obsolescence/contradiction events
 */
export function resolveConstraints(
    constraints: Constraint[],
    canonicalState: Record<string, unknown>,
    entityId: string
): ResolvedConstraints {
    const resolved: Constraint[] = [];
    const obsoleted: ConstraintObsoletedEvent[] = [];
    const contradicted: ConstraintContradictedEvent[] = [];

    const seenKeys = new Map<string, Constraint>();

    for (const constraint of constraints) {
        const canonicalValue = canonicalState[constraint.key];

        // Check if constraint conflicts with canonical state
        if (canonicalValue !== undefined) {
            const canonicalStr = JSON.stringify(canonicalValue);
            const constraintStr = JSON.stringify(constraint.value);

            if (canonicalStr !== constraintStr) {
                // Canonical takes precedence - mark constraint as obsolete
                const obsoleteEvent: ConstraintObsoletedEvent = {
                    type: 'ConstraintObsoleted',
                    eventId: `obsolete_${Date.now()}_${Math.random().toString(36).slice(2)}`,
                    timestamp: Date.now(),
                    constraintKey: constraint.key,
                    targetEntityId: entityId,
                    reason: 'canonical_conflict',
                    sourceEventId: constraint.sourceEventId
                };

                obsoleted.push(obsoleteEvent);
                // Note: Caller is responsible for appending to EventLog
                continue;
            }
        }

        // Check for conflicts with other constraints
        const existingConstraint = seenKeys.get(constraint.key);
        if (existingConstraint) {
            // Two constraints for same key
            const existingStr = JSON.stringify(existingConstraint.value);
            const newStr = JSON.stringify(constraint.value);

            if (existingStr !== newStr) {
                // Conflict! Apply precedence rules
                const winner = resolveConflict(existingConstraint, constraint);

                const contradictEvent: ConstraintContradictedEvent = {
                    type: 'ConstraintContradicted',
                    eventId: `contradict_${Date.now()}_${Math.random().toString(36).slice(2)}`,
                    timestamp: Date.now(),
                    constraintKey: constraint.key,
                    targetEntityId: entityId,
                    conflictingConstraints: [
                        existingConstraint.sourceEventId,
                        constraint.sourceEventId
                    ],
                    resolution: winner === existingConstraint ? 'kept_first' : 'kept_second'
                };

                contradicted.push(contradictEvent);
                // Note: Caller is responsible for appending to EventLog

                // Replace with winner if new constraint won
                if (winner === constraint) {
                    const index = resolved.indexOf(existingConstraint);
                    if (index !== -1) {
                        resolved.splice(index, 1);
                    }
                    resolved.push(constraint);
                    seenKeys.set(constraint.key, constraint);
                }
                // If existing won, we just don't add the new one
                continue;
            }
        }

        resolved.push(constraint);
        seenKeys.set(constraint.key, constraint);
    }

    return { resolved, obsoleted, contradicted };
}

/**
 * Resolve conflict between two constraints
 * Precedence: Hard > Soft, then by strength
 */
function resolveConflict(a: Constraint, b: Constraint): Constraint {
    // Hard constraints beat soft constraints
    if (a.type === 'hard' && b.type === 'soft') return a;
    if (a.type === 'soft' && b.type === 'hard') return b;

    // Same type - higher strength wins
    if (a.strength !== b.strength) {
        return a.strength > b.strength ? a : b;
    }

    // Same strength - keep the first one (stable)
    return a;
}

/**
 * Filter constraints to only keep the highest precedence for each key
 * Returns constraints sorted by precedence
 */
export function deduplicateConstraints(constraints: Constraint[]): Constraint[] {
    const byKey = new Map<string, Constraint>();

    for (const constraint of constraints) {
        const existing = byKey.get(constraint.key);

        if (!existing) {
            byKey.set(constraint.key, constraint);
        } else {
            const winner = resolveConflict(existing, constraint);
            byKey.set(constraint.key, winner);
        }
    }

    // Sort by precedence: hard before soft, then by strength
    return Array.from(byKey.values()).sort((a, b) => {
        if (a.type === 'hard' && b.type === 'soft') return -1;
        if (a.type === 'soft' && b.type === 'hard') return 1;
        return b.strength - a.strength;
    });
}
