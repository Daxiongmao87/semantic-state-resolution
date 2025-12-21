/**
 * Room Horizon Queue - Pre-collapses rooms at graph distance ≤2 from player
 */

import { getOpenRouterSolver } from '../solver/OpenRouterSolver';
import { getEventLog } from '../engine/EventLog';
import type { DungeonLayout, RoomEntity } from '../dungeon/DungeonGenerator';
import type { SolverRequest, Constraint } from '../types';
import { createObjectEntity, resetObjectIdCounter, type ObjectEntity } from '../entities/ObjectEntity';
import { collapseObjectType } from '../entities/ObjectCollapser';
import { getFallbackRoomResult } from './FallbackTable';

// =============================================================================
// Types
// =============================================================================

interface QueuedCollapse {
    roomId: string;
    depth: number;
    status: 'pending' | 'collapsing' | 'collapsed' | 'failed';
    promise?: Promise<void>;
}

interface RoomCollapseResult {
    roomType: string;
    theme: string;
    description: string;
    tags: string[];
    objectTypes: string[];
    implications?: { type: string; value: string; targetType: 'neighbor' | 'distant' }[];
}

// =============================================================================
// Room Horizon Queue
// =============================================================================

const HORIZON_DEPTH = 2;
const MAX_CONCURRENT = 1;
const MIN_DELAY_MS = 1000;  // Minimum delay between LLM calls

export class RoomHorizonQueue {
    private solver = getOpenRouterSolver();
    private eventLog = getEventLog();
    private layout: DungeonLayout | null = null;
    private queue: Map<string, QueuedCollapse> = new Map();
    private activeCollapses = 0;
    private lastCollapseTime = 0;
    private listeners: Set<() => void> = new Set();
    private questTags: string[] = [];
    private objectEntities: Map<string, ObjectEntity> = new Map();
    private roomTypeCounts: Map<string, number> = new Map();

    /**
     * Initialize with dungeon layout
     */
    initialize(layout: DungeonLayout, questTags: string[] = []): void {
        this.layout = layout;
        this.questTags = questTags;
        this.queue.clear();
        this.activeCollapses = 0;
        this.objectEntities.clear();
        this.roomTypeCounts.clear();
        resetObjectIdCounter();

        // Inject quest as hard constraint to all latent rooms
        // Inject constraints
        if (questTags.length > 0 && questTags[0]) {
            const mainQuest = questTags[0];
            const questConstraint: Constraint = {
                key: 'quest_objective',
                value: mainQuest,
                strength: 1.0,
                type: 'hard',
                sourceEventId: 'quest_start'
            };

            // 1. All rooms get general quest context
            for (const room of layout.rooms.values()) {
                room.constraints.push(questConstraint);
            }

            // 2. Goal room gets the SPECIFIC target constraint
            if (layout.goalRoomId) {
                const goalRoom = layout.rooms.get(layout.goalRoomId);
                if (goalRoom) {
                    const targetConstraint: Constraint = {
                        key: 'required_object',
                        value: mainQuest, // Passing full quest string, ObjectCollapser will extract/use it
                        strength: 1.0,
                        type: 'hard',
                        sourceEventId: 'quest_target_injection'
                    };
                    goalRoom.constraints.push(targetConstraint);

                    console.log(`[RoomHorizonQueue] Injected QUEST TARGET constraint into Goal Room: ${layout.goalRoomId}`);
                }
            }
        }
    }

    /**
     * Update horizon based on player's current room
     */
    advanceHorizon(currentRoomId: string): void {
        if (!this.layout) return;

        // BFS to find rooms within horizon depth
        const roomsToCollapse = this.getRoomsWithinDepth(currentRoomId, HORIZON_DEPTH);

        // Queue rooms for collapse
        for (const { roomId, depth } of roomsToCollapse) {
            this.ensureQueued(roomId, depth);
        }

        // Process queue
        this.processQueue();
    }

    /**
     * Get rooms within graph distance from a starting room
     */
    private getRoomsWithinDepth(
        startRoomId: string,
        maxDepth: number
    ): { roomId: string; depth: number }[] {
        if (!this.layout) return [];

        const result: { roomId: string; depth: number }[] = [];
        const visited = new Set<string>();
        const queue: { roomId: string; depth: number }[] = [{ roomId: startRoomId, depth: 0 }];

        while (queue.length > 0) {
            const { roomId, depth } = queue.shift()!;

            if (visited.has(roomId) || roomId === 'EGRESS') continue;
            visited.add(roomId);

            result.push({ roomId, depth });

            if (depth < maxDepth) {
                const room = this.layout.rooms.get(roomId);
                if (room) {
                    for (const neighborId of room.components.neighbors) {
                        if (!visited.has(neighborId) && neighborId !== 'EGRESS') {
                            queue.push({ roomId: neighborId, depth: depth + 1 });
                        }
                    }
                }
            }
        }

        return result;
    }

    /**
     * Ensure a room is queued for collapse
     */
    private ensureQueued(roomId: string, depth: number): void {
        if (!this.layout) return;

        const room = this.layout.rooms.get(roomId);
        if (!room) return;

        // Already collapsed
        if (room.state === 'collapsed') return;

        // Already in queue
        if (this.queue.has(roomId)) {
            // Update depth if closer
            const existing = this.queue.get(roomId)!;
            if (depth < existing.depth) {
                existing.depth = depth;
            }
            return;
        }

        this.queue.set(roomId, {
            roomId,
            depth,
            status: 'pending'
        });
    }

    /**
     * Process the queue, starting collapses up to max concurrent
     */
    private processQueue(): void {
        if (!this.layout) return;

        // Get pending items sorted by depth (closer = higher priority)
        const pending = Array.from(this.queue.values())
            .filter(q => q.status === 'pending')
            .sort((a, b) => a.depth - b.depth);

        // Check if we need to wait before starting another collapse
        const timeSinceLastCollapse = Date.now() - this.lastCollapseTime;
        if (timeSinceLastCollapse < MIN_DELAY_MS && this.lastCollapseTime > 0) {
            // Schedule next processing after delay
            setTimeout(() => this.processQueue(), MIN_DELAY_MS - timeSinceLastCollapse);
            return;
        }

        // Start collapses up to max concurrent
        for (const item of pending) {
            if (this.activeCollapses >= MAX_CONCURRENT) break;

            this.lastCollapseTime = Date.now();
            this.collapseRoom(item.roomId);
        }
    }

    /**
     * Collapse a room's semantics via LLM
     */
    private async collapseRoom(roomId: string): Promise<void> {
        if (!this.layout) return;

        const room = this.layout.rooms.get(roomId);
        if (!room) return;

        const queueItem = this.queue.get(roomId);
        if (!queueItem || queueItem.status !== 'pending') return;

        queueItem.status = 'collapsing';
        room.state = 'collapsing';
        this.activeCollapses++;
        this.notifyListeners();

        // Log collapse started
        this.eventLog.append({
            type: 'CollapseStarted',
            entityId: roomId
        });

        try {
            const result = await this.generateRoomSemantics(room);

            // Update Global History
            const count = this.roomTypeCounts.get(result.roomType) || 0;
            this.roomTypeCounts.set(result.roomType, count + 1);

            // Apply result to room
            room.components.roomType = result.roomType;
            room.components.theme = result.theme;
            room.components.description = result.description;
            room.components.tags = result.tags;

            // Assign types to object slots
            for (let i = 0; i < room.components.objectSlots.length; i++) {
                if (i < result.objectTypes.length) {
                    room.components.objectSlots[i].objectType = result.objectTypes[i];
                }
            }

            // Create proper ObjectEntity instances for each slot
            await this.createRoomObjects(room, result);

            // DETAILED LOGGING FOR DEBUGGING
            console.log(`[Room Collapse] ${roomId} -> ${result.roomType} (${result.theme})`);
            console.log(`[Room Objects] ${roomId} -> ${result.objectTypes.join(', ')}`);

            room.state = 'collapsed';
            room.collapsedAt = Date.now();
            queueItem.status = 'collapsed';

            // Log collapse committed
            this.eventLog.append({
                type: 'CollapseCommitted',
                entityId: roomId,
                components: room.components as Record<string, unknown>,
                tags: result.tags
            });

            // Propagate constraints to neighbors
            this.propagateConstraints(room, result);

            // Reverse Propagation (Implications)
            this.handleImplications(room, result);

            console.log(`[HorizonQueue] Room ${roomId} collapsed:`, result.roomType, result.theme);

        } catch (error) {
            console.error(`[HorizonQueue] Room ${roomId} collapse failed:`, error);

            // Fallback
            const fallback = this.getFallbackResult(room);
            room.components.roomType = fallback.roomType;
            room.components.theme = fallback.theme;
            room.components.description = fallback.description;
            room.components.tags = fallback.tags;

            room.state = 'collapsed';
            room.collapsedAt = Date.now();
            queueItem.status = 'collapsed';

            this.eventLog.append({
                type: 'CollapseFailed',
                entityId: roomId,
                reason: error instanceof Error ? error.message : String(error),
                fallbackUsed: true
            });
        }

        this.activeCollapses--;
        this.notifyListeners();

        // Continue processing queue
        this.processQueue();
    }

    /**
     * Generate room semantics via LLM
     */
    private async generateRoomSemantics(room: RoomEntity): Promise<RoomCollapseResult> {
        if (!this.layout) throw new Error('No layout');

        // Build neighbor context
        const neighbors: Record<string, unknown>[] = [];
        for (const neighborId of room.components.neighbors) {
            if (neighborId === 'EGRESS') {
                neighbors.push({
                    id: 'EGRESS',
                    state: 'collapsed',
                    type: 'outside_world',
                    description: 'The exit to the surface'
                });
            } else {
                const neighbor = this.layout.rooms.get(neighborId);
                if (neighbor) {
                    neighbors.push({
                        id: neighborId,
                        state: neighbor.state,
                        type: neighbor.components.roomType || 'unknown',
                        theme: neighbor.components.theme || 'unknown'
                    });
                }
            }
        }

        // Build chronological context from event log
        const recentEvents = this.eventLog.tail(10).map(e => ({
            type: e.type,
            entityId: 'entityId' in e ? e.entityId : undefined
        }));

        const questContext = this.questTags.length > 0 && this.questTags[0]
            ? `\n\nCRITICAL CONTEXT: THE PLAYER'S QUEST IS: "${this.questTags[0]}"\nEverything in this room MUST reflect or relate to this quest. Avoid all generic dungeon cliches.`
            : '';

        // Build History Context
        const historyContext = Array.from(this.roomTypeCounts.entries())
            .map(([type, count]) => `${type}: ${count}`)
            .join(', ');

        const historyInstruction = historyContext
            ? `\n\nGLOBAL HISTORY (Existing Rooms): [${historyContext}]\nANTI-REPETITION RULE: You MUST avoid generating room types that have already been generated frequently, unless thematically essential (e.g. 'barracks' might appear twice). If 'torture_chamber' count > 0, DO NOT generate another.`
            : '';

        const request: SolverRequest = {
            requestId: `collapse_room_${room.id}_${Date.now()}`,
            taskType: 'COLLAPSE_ROOM',
            entityId: room.id,
            context: {
                isEntrance: room.components.isEntrance,
                dimensions: room.components.dimensions,
                objectSlotCount: room.components.objectSlots.length,
                neighbors,
                questTags: this.questTags,
                recentEvents,
                instruction: room.components.isEntrance
                    ? `This is the dungeon entrance. Create a unique threshold room that serves as a transition into this specific quest-driven dungeon.${questContext}`
                    : `Create a unique dungeon room. 
${historyInstruction}

CRITICAL VARIETY RULE: Check the neighboring rooms. You must generate a *different* type of room. If neighbors are 'throne_room', you must NOT create a 'throne_room'. Instead, create a supporting room (e.g., 'scullery', 'guard_post', 'secret_passage', 'torture_chamber').

REVERSE PROPAGATION (Implications):
If this room contains a logical dependency (e.g., a Locked Door, a Missing Statue Head, a Cryptic Map), you MUST generate an 'implication'.
- Example: "Locked Door" -> implies "Key" exists in a DISTANT room.
- Example: "Altar missing an Idol" -> implies "Golden Idol" exists in a DISTANT room.

Generate ${room.components.objectSlots.length} distinct objects.
Generate visible_object_names as a list of Title Case strings (max 3 words). NO descriptions.`
            },
            constraints: {
                hard: room.constraints,
                soft: []
            },
            // Schema requirements only - no content examples that could override quest context
            whitelist: {
                // Schema requirements - structure is strict, content is open
                requiredFields: ['room_type', 'theme', 'description', 'visible_object_names', 'tags', 'implications'],
                objectCount: room.components.objectSlots.length,
                explanation: "visible_object_names must be an array of Title Case strings (max 3 words). NO descriptions. 'implications' is a hidden array for internal logic."
            }
        };

        const response = await this.solver.solve(request);

        if (!response.success || !response.proposal) {
            throw new Error(response.error || 'LLM failed');
        }

        const proposal = response.proposal;

        return {
            roomType: String(proposal.room_type || proposal.roomType || 'chamber'),
            theme: String(proposal.theme || 'ancient'),
            description: String(proposal.description || 'A mysterious room.'),
            tags: Array.isArray(proposal.tags) ? proposal.tags.map(String) : [],
            objectTypes: this.extractObjectTypes(proposal),
            implications: Array.isArray(proposal.implications) ? proposal.implications as any[] : []
        };
    }

    /**
     * Extract object types from proposal with proper type handling
     */
    private extractObjectTypes(proposal: Record<string, unknown>): string[] {
        // Look for the semantically named field first
        const objects = proposal.visible_object_names || proposal.objects || proposal.objectTypes;
        if (!Array.isArray(objects)) return [];

        return objects.map((o: unknown) => {
            if (typeof o === 'string') return o; // Trust the LLM to follow "visible_object_names" instruction
            if (typeof o === 'object' && o !== null && 'type' in o) {
                return String((o as { type: unknown }).type);
            }
            return 'Chest'; // Fallback
        });
    }

    /**
     * Propagate constraints to neighboring rooms
     */
    private propagateConstraints(room: RoomEntity, result: RoomCollapseResult): void {
        if (!this.layout) return;

        for (const neighborId of room.components.neighbors) {
            if (neighborId === 'EGRESS') continue;

            const neighbor = this.layout.rooms.get(neighborId);
            if (!neighbor || neighbor.state === 'collapsed') continue;

            // Inject theme-based soft constraints
            const constraint: Constraint = {
                key: `adjacent_${result.theme}`,
                value: true,
                strength: 0.7,
                type: 'soft',
                sourceEventId: `collapse_${room.id}`
            };

            neighbor.constraints.push(constraint);

            this.eventLog.append({
                type: 'ConstraintInjected',
                targetEntityId: neighborId,
                constraint
            });
        }
    }

    /**
     * Create proper ObjectEntity instances for room's object slots
     */
    private async createRoomObjects(room: RoomEntity, result: RoomCollapseResult): Promise<void> {
        for (let i = 0; i < room.components.objectSlots.length; i++) {
            const slot = room.components.objectSlots[i];

            // Create full ObjectEntity
            const objEntity = createObjectEntity(
                room.id,
                room.components.position,
                slot.localPosition,
                slot.size,
                room.constraints
            );

            // Set initial type from room collapse result
            if (i < result.objectTypes.length && result.objectTypes[i]) {
                objEntity.components.objectType = result.objectTypes[i];
                // Type already assigned from room collapse - don't re-collapse
                objEntity.state = 'latent';
            } else {
                // No type from room - generate via LLM
                await collapseObjectType(
                    objEntity,
                    result.roomType,
                    result.theme,
                    result.description
                );
            }

            // Store the entity
            this.objectEntities.set(objEntity.id, objEntity);

            // Also store reference in the slot
            slot.entityId = objEntity.id;

            // Log creation
            this.eventLog.append({
                type: 'EntityCreated',
                entityId: objEntity.id,
                initialConstraints: objEntity.constraints
            });
        }
    }

    /**
     * Get all object entities in a room
     */
    getObjectsInRoom(roomId: string): ObjectEntity[] {
        return Array.from(this.objectEntities.values())
            .filter(obj => obj.components.roomId === roomId);
    }

    /**
     * Get object entity by ID
     */
    getObjectEntity(objectId: string): ObjectEntity | undefined {
        return this.objectEntities.get(objectId);
    }

    /**
     * Fallback for when LLM fails
     * V7 Fix: Uses hash-indexed deterministic selection per §4.3.1
     */
    private getFallbackResult(room: RoomEntity): RoomCollapseResult {
        const hardConstraints = room.constraints.filter(c => c.type === 'hard');
        const result = getFallbackRoomResult(
            room.id,
            hardConstraints,
            room.components.objectSlots.length,
            room.components.isEntrance
        );

        return result;
    }

    /**
     * Check if a room is collapsed
     */
    isRoomCollapsed(roomId: string): boolean {
        if (!this.layout) return false;
        const room = this.layout.rooms.get(roomId);
        return room?.state === 'collapsed';
    }

    /**
     * Wait for a room to be collapsed (for blocking observation)
     */
    async waitForCollapse(roomId: string): Promise<void> {
        if (!this.layout) return;

        const room = this.layout.rooms.get(roomId);
        if (!room || room.state === 'collapsed') return;

        // Ensure it's in the queue with highest priority
        this.ensureQueued(roomId, 0);
        this.processQueue();

        // Wait for collapse
        return new Promise((resolve) => {
            const checkInterval = setInterval(() => {
                if (this.isRoomCollapsed(roomId)) {
                    clearInterval(checkInterval);
                    resolve();
                }
            }, 100);
        });
    }

    /**
     * Get queue status for debugging
     */
    getQueueStatus(): { roomId: string; depth: number; status: string }[] {
        return Array.from(this.queue.values()).map(q => ({
            roomId: q.roomId,
            depth: q.depth,
            status: q.status
        }));
    }

    /**
     * Subscribe to status changes
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
     * Public API to inject Reverse Propagation Constraints
     * Used by TileCollapser for Lazy Door keys, etc.
     */
    public injectReversePropagationConstraint(sourceRoomId: string, type: string, value: string): void {
        if (!this.layout) return;

        // Find a latent room far away (Depth > 2)
        const candidates = this.findDistantLatentRooms(sourceRoomId, 3);

        if (candidates.length > 0) {
            // Pick random candidate
            const targetId = candidates[Math.floor(Math.random() * candidates.length)];
            const targetRoom = this.layout.rooms.get(targetId);

            if (targetRoom) {
                const constraint: Constraint = {
                    key: type, // Use passed type (e.g. 'required_object')
                    value: value,
                    strength: 1.0,
                    type: 'hard',
                    sourceEventId: `reverse_prop_${sourceRoomId}_${Date.now()}`
                };

                targetRoom.constraints.push(constraint);

                this.eventLog.append({
                    type: 'ConstraintInjected',
                    targetEntityId: targetId,
                    constraint
                });

                console.log(`[Reverse Propagation] Injected '${value}' into room ${targetId} (Source: ${sourceRoomId})`);
            }
        } else {
            console.warn(`[Reverse Propagation] Failed to find target for '${value}' from ${sourceRoomId}`);
        }
    }

    /**
     * Handle Reverse Propagation (Implications)
     * See README.md Section 7.2
     */
    private handleImplications(room: RoomEntity, result: RoomCollapseResult): void {
        if (!this.layout || !result.implications || result.implications.length === 0) return;

        for (const impl of result.implications) {
            if (impl.targetType === 'distant') {
                // innovative: Find a latent room far away (Depth > 2)
                // We use a simple strategy: Find all latent rooms, filter by distance from current room
                const candidates = this.findDistantLatentRooms(room.id, 3);

                if (candidates.length > 0) {
                    // Pick random candidate
                    const targetId = candidates[Math.floor(Math.random() * candidates.length)];
                    const targetRoom = this.layout.rooms.get(targetId);

                    if (targetRoom) {
                        const constraint: Constraint = {
                            key: impl.type, // e.g., 'required_object'
                            value: impl.value, // e.g., 'Rusty Key'
                            strength: 1.0,
                            type: 'hard',
                            sourceEventId: `implication_${room.id}`
                        };

                        targetRoom.constraints.push(constraint);

                        this.eventLog.append({
                            type: 'ConstraintInjected',
                            targetEntityId: targetId,
                            constraint
                        });

                        console.log(`[Reverse Propagation] Injected '${impl.value}' into room ${targetId} (Source: ${room.id} - ${result.roomType})`);
                    }
                }
            }
        }
    }

    /**
     * Helper to find distant latent rooms
     */
    private findDistantLatentRooms(startRoomId: string, minDistance: number): string[] {
        if (!this.layout) return [];

        const candidates: string[] = [];
        const queue: { id: string, dist: number }[] = [{ id: startRoomId, dist: 0 }];
        const visited = new Set<string>([startRoomId]);

        while (queue.length > 0) {
            const { id, dist } = queue.shift()!;

            if (dist >= minDistance) {
                const room = this.layout.rooms.get(id);
                if (room && room.state === 'latent') {
                    candidates.push(id);
                }
            }

            const room = this.layout.rooms.get(id);
            if (room) {
                for (const neighborId of room.components.neighbors) {
                    if (neighborId !== 'EGRESS' && !visited.has(neighborId)) {
                        visited.add(neighborId);
                        queue.push({ id: neighborId, dist: dist + 1 });
                    }
                }
            }
        }

        return candidates;
    }
}

// Singleton
let queueInstance: RoomHorizonQueue | null = null;

export function getRoomHorizonQueue(): RoomHorizonQueue {
    if (!queueInstance) {
        queueInstance = new RoomHorizonQueue();
    }
    return queueInstance;
}
