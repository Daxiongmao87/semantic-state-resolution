/**
 * Room Horizon Queue - Pre-collapses rooms at graph distance ≤2 from player
 */

import { getOpenRouterSolver } from '../solver/OpenRouterSolver';
import { getEventLog } from '../engine/EventLog';
import type { DungeonLayout, RoomEntity } from '../dungeon/DungeonGenerator';
import type { SolverRequest, Constraint } from '../types';
import { createObjectEntity, resetObjectIdCounter, type ObjectEntity } from '../entities/ObjectEntity';
import { collapseObjectType } from '../entities/ObjectCollapser';

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

    /**
     * Initialize with dungeon layout
     */
    initialize(layout: DungeonLayout, questTags: string[] = []): void {
        this.layout = layout;
        this.questTags = questTags;
        this.queue.clear();
        this.activeCollapses = 0;
        this.objectEntities.clear();
        resetObjectIdCounter();
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
            ? `\n\nPLAYER'S QUEST: "${this.questTags[0]}"\nThis dungeon should feel relevant to the quest. Room themes, objects, and atmosphere should subtly support or relate to the quest goal.`
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
                    ? `This is the dungeon entrance, adjacent to the outside world. Create a unique threshold room that makes sense as a transition from the surface.${questContext}`
                    : `Create a unique dungeon room. Consider the neighboring rooms' themes for coherence. Be creative - this could be anything from a flooded crypt to an abandoned alchemist's lab. Generate ${room.components.objectSlots.length} distinct objects that fit the room's character.${questContext}`
            },
            constraints: {
                hard: room.constraints,
                soft: []
            },
            // Schema requirements only - no content examples that could override quest context
            whitelist: {
                requiredFields: ['room_type', 'theme', 'description', 'objects', 'tags'],
                objectCount: room.components.objectSlots.length
                // No examples - let quest context drive creativity
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
            objectTypes: this.extractObjectTypes(proposal)
        };
    }

    /**
     * Extract object types from proposal with proper type handling
     */
    private extractObjectTypes(proposal: Record<string, unknown>): string[] {
        const objects = proposal.objects || proposal.objectTypes;
        if (!Array.isArray(objects)) return [];

        return objects.map((o: unknown) => {
            if (typeof o === 'string') return o;
            if (typeof o === 'object' && o !== null && 'type' in o) {
                return String((o as { type: unknown }).type);
            }
            return 'chest';
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
     */
    private getFallbackResult(room: RoomEntity): RoomCollapseResult {
        const isEntrance = room.components.isEntrance;

        return {
            roomType: isEntrance ? 'entrance_hall' : 'chamber',
            theme: 'ancient',
            description: isEntrance
                ? 'The entrance to the dungeon, light filtering in from outside.'
                : 'A dusty chamber with crumbling walls.',
            tags: isEntrance ? ['entrance', 'threshold'] : ['empty'],
            objectTypes: []
        };
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
}

// Singleton
let queueInstance: RoomHorizonQueue | null = null;

export function getRoomHorizonQueue(): RoomHorizonQueue {
    if (!queueInstance) {
        queueInstance = new RoomHorizonQueue();
    }
    return queueInstance;
}
