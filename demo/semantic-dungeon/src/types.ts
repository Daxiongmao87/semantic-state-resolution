/**
 * SWFC Core Type Definitions
 * Based on README.md §3 and SPEC.md §9
 */

// =============================================================================
// Entity State Machine (§3.2)
// =============================================================================

export type EntityState = 'latent' | 'collapsing' | 'collapsed';

export interface Entity {
    id: string;
    state: EntityState;
    constraints: Constraint[];
    components: Record<string, unknown>;
    createdAt: number;
    collapsedAt?: number;
}

// =============================================================================
// Constraint System (§4.2)
// =============================================================================

export interface Constraint {
    key: string;
    value: unknown;
    strength: number;       // 0.0 - 1.0
    type: 'hard' | 'soft';
    sourceEventId: string;
    ttl?: number;           // Time-to-live in game ticks
}

export const STRENGTH_THRESHOLD = 0.15;

// =============================================================================
// Event Sourcing (§4.4)
// =============================================================================

export type SWFCEvent =
    | EntityCreatedEvent
    | CollapseStartedEvent
    | CollapseCommittedEvent
    | CollapseFailedEvent
    | ConstraintInjectedEvent
    | ConstraintObsoletedEvent
    | ConstraintContradictedEvent
    | DeltaAppliedEvent
    | PlayerMovedEvent;

export interface EntityCreatedEvent {
    type: 'EntityCreated';
    eventId: string;
    timestamp: number;
    entityId: string;
    initialConstraints: Constraint[];
}

export interface CollapseStartedEvent {
    type: 'CollapseStarted';
    eventId: string;
    timestamp: number;
    entityId: string;
}

export interface CollapseCommittedEvent {
    type: 'CollapseCommitted';
    eventId: string;
    timestamp: number;
    entityId: string;
    components: Record<string, unknown>;
    tags: string[];
}

export interface CollapseFailedEvent {
    type: 'CollapseFailed';
    eventId: string;
    timestamp: number;
    entityId: string;
    reason: string;
    fallbackUsed: boolean;
}

export interface ConstraintInjectedEvent {
    type: 'ConstraintInjected';
    eventId: string;
    timestamp: number;
    targetEntityId: string;
    constraint: Constraint;
}

/**
 * V13 Fix: Event emitted when a constraint is marked obsolete
 * Per §4.2 Pruning Policy
 */
export interface ConstraintObsoletedEvent {
    type: 'ConstraintObsoleted';
    eventId: string;
    timestamp: number;
    constraintKey: string;
    targetEntityId: string;
    reason: 'canonical_conflict' | 'ttl_expired' | 'strength_decay' | 'manual';
    sourceEventId?: string; // Original constraint injection event
}

/**
 * V13 Fix: Event emitted when two constraints contradict each other
 * Per §4.2 Pruning Policy
 */
export interface ConstraintContradictedEvent {
    type: 'ConstraintContradicted';
    eventId: string;
    timestamp: number;
    constraintKey: string;
    targetEntityId: string;
    conflictingConstraints: [string, string]; // Two constraint source event IDs
    resolution: 'kept_first' | 'kept_second' | 'both_obsoleted';
}

export interface DeltaAppliedEvent {
    type: 'DeltaApplied';
    eventId: string;
    timestamp: number;
    entityId: string;
    op: 'set' | 'add' | 'remove';
    path: string;
    value: unknown;
}

export interface PlayerMovedEvent {
    type: 'PlayerMoved';
    eventId: string;
    timestamp: number;
    position: { x: number; y: number };
    facing: string;
}

// =============================================================================
// Solver Interface (§4.3)
// =============================================================================

export interface SolverRequest {
    requestId: string;
    taskType: string;
    entityId?: string;
    context: Record<string, unknown>;
    constraints: {
        hard: Constraint[];
        soft: Constraint[];
    };
    whitelist: Record<string, unknown>;
}

export interface SolverResponse {
    requestId: string;
    success: boolean;
    proposal?: Record<string, unknown>;
    error?: string;
}

// =============================================================================
// Component Types (SPEC.md §9)
// =============================================================================

// Room Components
export interface RoomComponents {
    position: { x: number; y: number };
    dimensions: { width: number; height: number };
    neighbors: string[];
    doors: DoorInfo[];
    roomType?: string;
    theme?: string;
    description?: string;
    objects?: string[];
    monsters?: string[];
    tags?: string[];
}

export interface DoorInfo {
    position: { x: number; y: number };
    direction: 'north' | 'south' | 'east' | 'west';
    connectedRoomId: string;
    state?: 'open' | 'closed' | 'locked';
}

// Object Components
export interface ObjectComponents {
    position: { x: number; y: number };
    roomId: string;
    objectType?: string;
    visualDesc?: string;
    contents?: string[];
    interactionState?: string;
}

// Monster Components
export interface MonsterComponents {
    position: { x: number; y: number };
    roomId: string;
    monsterType?: string;
    description?: string;
    behavior?: string;
    stats?: { health: number; damage: number; speed: string };
    tags?: string[];
}

// Player Components
export interface PlayerComponents {
    position: { x: number; y: number };
    facing: 'north' | 'south' | 'east' | 'west';
    currentRoomId?: string;
    className?: string;
    abilities?: AbilityComponents[];
}

// Class Generation Components
export interface ClassComponents {
    name: string;
    description: string;
    inheritedTags: string[];
    abilities: AbilityComponents[];
    [key: string]: unknown;
}

export interface AbilityComponents {
    name: string;
    category: 'offensive' | 'defensive' | 'utility';
    properties: Record<string, number | string>;
    [key: string]: unknown;
}

// Quest Components
export interface QuestComponents {
    questType: string;
    objective: string;
    targetName?: string;
    targetDescription?: string;
    lore?: string;
    tags: string[];
}

// Open-ended types (removed whitelists to maximize LLM creativity)
export type RoomType = string;
export type RoomTheme = string;
export type ObjectType = string;
export type MonsterType = string;
export type InteractionAction = string;
export type QuestType = string;
export const ABILITY_CATEGORIES = ['offensive', 'defensive', 'utility'] as const;
export const ABILITY_STAT_TYPES = [
    'damage', 'range', 'aoe', 'duration', 'cooldown',
    'chains', 'stun_chance', 'element', 'defense', 'reflect_chance',
    'heal', 'shield', 'speed_bonus'
] as const;

export type AbilityCategory = typeof ABILITY_CATEGORIES[number];

// =============================================================================
// Game State Types
// =============================================================================

export interface PlayerState {
    x: number;
    y: number;
    facing: 'north' | 'south' | 'east' | 'west';
    currentRoomId: string | null;
    inventory: string[];
}
