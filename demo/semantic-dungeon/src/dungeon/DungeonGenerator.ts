/**
 * Dungeon Generator
 * Creates a dungeon layout using BSP with latent room entities
 */

import { SeededRandom } from '../utils/SeededRandom';
import { BSPNode, BSPConfig, Rect } from './BSPNode';
import { getEventLog } from '../engine/EventLog';
import type { Entity } from '../types';

// =============================================================================
// Types
// =============================================================================

export interface DoorInfo {
    id: string;
    position: { x: number; y: number };
    direction: 'north' | 'south' | 'east' | 'west';
    connectedRoomId: string;
    state?: 'open' | 'closed' | 'locked';
}

export interface ObjectSlot {
    id: string;
    localPosition: { x: number; y: number };
    size: { width: number; height: number };
    objectType?: string;    // Shallow identity from room collapse
    entityId?: string;      // Reference to full ObjectEntity
}

export interface RoomEntity extends Entity {
    components: {
        // Geometry (deterministic)
        position: { x: number; y: number };
        dimensions: { width: number; height: number };
        neighbors: string[];
        doors: DoorInfo[];
        objectSlots: ObjectSlot[];
        isEntrance: boolean;

        // Semantics (latent until collapse)
        roomType?: string;
        theme?: string;
        description?: string;
        tags?: string[];

        [key: string]: unknown;
    };
}

export interface Corridor {
    start: { x: number; y: number };
    end: { x: number; y: number };
    horizontal: boolean;
}

export interface DungeonLayout {
    width: number;
    height: number;
    rooms: Map<string, RoomEntity>;
    corridors: Corridor[];
    entranceRoomId: string;
    goalRoomId: string; // Furthest room from entrance
    tiles: TileType[][];
}

export type TileType = 'void' | 'floor' | 'wall' | 'door';

// =============================================================================
// Dungeon Generator
// =============================================================================

export interface DungeonConfig {
    width: number;
    height: number;
    seed: string | number;
    bsp: BSPConfig;
    maxSplitDepth: number;
    objectSlotsPerRoom: { min: number; max: number };
}

const DEFAULT_DUNGEON_CONFIG: DungeonConfig = {
    width: 60,
    height: 40,
    seed: Date.now(),
    bsp: {
        minRoomSize: 6,
        maxRoomSize: 12,
        minRoomPadding: 1,
        splitVariance: 0.3
    },
    maxSplitDepth: 5,
    objectSlotsPerRoom: { min: 0, max: 3 }
};

export class DungeonGenerator {
    private config: DungeonConfig;
    private rng: SeededRandom;
    private eventLog = getEventLog();

    constructor(config: Partial<DungeonConfig> = {}) {
        this.config = { ...DEFAULT_DUNGEON_CONFIG, ...config };
        this.rng = new SeededRandom(this.config.seed);
    }

    /**
     * Generate a complete dungeon layout
     */
    generate(): DungeonLayout {
        // Step 1: BSP subdivision
        const root = new BSPNode({
            x: 0,
            y: 0,
            width: this.config.width,
            height: this.config.height
        });

        this.splitRecursive(root, 0);

        // Step 2: Create rooms in leaf nodes
        const leaves = root.getLeaves();
        for (const leaf of leaves) {
            leaf.createRoom(this.rng, this.config.bsp);
        }

        // Step 3: Create room entities
        const rooms = new Map<string, RoomEntity>();
        const bspRooms = leaves.filter(l => l.room !== null);

        for (let i = 0; i < bspRooms.length; i++) {
            const bspRoom = bspRooms[i].room!;
            const roomId = `room_${i}`;

            const room: RoomEntity = {
                id: roomId,
                state: 'latent',
                constraints: [],
                components: {
                    position: { x: bspRoom.x, y: bspRoom.y },
                    dimensions: { width: bspRoom.width, height: bspRoom.height },
                    neighbors: [],
                    doors: [],
                    objectSlots: this.createObjectSlots(roomId, bspRoom),
                    isEntrance: i === 0  // First room is entrance
                },
                createdAt: Date.now()
            };

            rooms.set(roomId, room);
        }

        // Step 4: Create corridors and establish neighbors
        const corridors = this.connectRooms(root, rooms);

        // Step 5: Add EGRESS constraint to entrance room
        const entranceRoomId = 'room_0';
        const entranceRoom = rooms.get(entranceRoomId)!;
        entranceRoom.constraints.push({
            key: 'adjacent_to',
            value: 'EGRESS',
            strength: 1.0,
            type: 'hard',
            sourceEventId: 'dungeon_generation'
        });
        entranceRoom.components.neighbors.push('EGRESS');

        // Step 6: Generate tile map
        const tiles = this.generateTileMap(rooms, corridors);

        // Step 7: Log creation events
        for (const room of rooms.values()) {
            this.eventLog.append({
                type: 'EntityCreated',
                entityId: room.id,
                initialConstraints: room.constraints
            });
        }

        // Step 6: Identify Goal Room (Furthest from entrance)
        const goalRoomId = this.findFurthestRoom(rooms, entranceRoomId);

        return {
            width: this.config.width,
            height: this.config.height,
            rooms,
            corridors,
            entranceRoomId,
            goalRoomId,
            tiles
        };
    }

    /**
     * Find the room furthest from the start room using BFS
     */
    private findFurthestRoom(rooms: Map<string, RoomEntity>, startRoomId: string): string {
        const queue: { id: string; distance: number }[] = [{ id: startRoomId, distance: 0 }];
        const visited = new Set<string>([startRoomId]);
        let furthestRoomId = startRoomId;
        let maxDistance = 0;

        while (queue.length > 0) {
            const current = queue.shift()!;

            if (current.distance > maxDistance) {
                maxDistance = current.distance;
                furthestRoomId = current.id;
            }

            const room = rooms.get(current.id);
            if (room) {
                for (const neighborId of room.components.neighbors) {
                    if (!visited.has(neighborId)) {
                        visited.add(neighborId);
                        queue.push({ id: neighborId, distance: current.distance + 1 });
                    }
                }
            }
        }

        return furthestRoomId;
    }

    /**
     * Recursively split BSP nodes
     */
    private splitRecursive(node: BSPNode, depth: number): void {
        if (depth >= this.config.maxSplitDepth) return;

        if (node.split(this.rng, this.config.bsp)) {
            if (node.left) this.splitRecursive(node.left, depth + 1);
            if (node.right) this.splitRecursive(node.right, depth + 1);
        }
    }

    /**
     * Create object slots within a room
     */
    private createObjectSlots(roomId: string, room: Rect): ObjectSlot[] {
        const count = this.rng.randomInt(
            this.config.objectSlotsPerRoom.min,
            this.config.objectSlotsPerRoom.max
        );

        const slots: ObjectSlot[] = [];
        const usedPositions = new Set<string>();

        for (let i = 0; i < count; i++) {
            // Try to find a valid position (not too close to walls)
            for (let attempt = 0; attempt < 10; attempt++) {
                const localX = this.rng.randomInt(1, room.width - 2);
                const localY = this.rng.randomInt(1, room.height - 2);
                const posKey = `${localX},${localY}`;

                if (!usedPositions.has(posKey)) {
                    usedPositions.add(posKey);
                    slots.push({
                        id: `${roomId}_slot_${i}`,
                        localPosition: { x: localX, y: localY },
                        size: { width: 1, height: 1 }
                    });
                    break;
                }
            }
        }

        return slots;
    }

    /**
     * Connect rooms with corridors and establish neighbor relationships
     */
    private connectRooms(root: BSPNode, rooms: Map<string, RoomEntity>): Corridor[] {
        const corridors: Corridor[] = [];

        // Connect rooms in BSP sibling order
        this.connectBSPSiblings(root, rooms, corridors);

        return corridors;
    }

    /**
     * Recursively connect BSP sibling rooms
     */
    private connectBSPSiblings(
        node: BSPNode,
        rooms: Map<string, RoomEntity>,
        corridors: Corridor[]
    ): Rect | null {
        if (node.isLeaf()) {
            return node.room;
        }

        const leftRoom = node.left ? this.connectBSPSiblings(node.left, rooms, corridors) : null;
        const rightRoom = node.right ? this.connectBSPSiblings(node.right, rooms, corridors) : null;

        if (leftRoom && rightRoom) {
            // Create corridor between left and right rooms
            const corridor = this.createCorridor(leftRoom, rightRoom);
            corridors.push(corridor);

            // Find room entities and establish neighbor relationship
            const leftRoomEntity = this.findRoomByRect(rooms, leftRoom);
            const rightRoomEntity = this.findRoomByRect(rooms, rightRoom);

            if (leftRoomEntity && rightRoomEntity) {
                // Add as neighbors
                if (!leftRoomEntity.components.neighbors.includes(rightRoomEntity.id)) {
                    leftRoomEntity.components.neighbors.push(rightRoomEntity.id);
                }
                if (!rightRoomEntity.components.neighbors.includes(leftRoomEntity.id)) {
                    rightRoomEntity.components.neighbors.push(leftRoomEntity.id);
                }

                // Create doors
                this.createDoorsForCorridor(leftRoomEntity, rightRoomEntity, corridor);
            }
        }

        // Return a representative room for this subtree (for parent connections)
        return leftRoom || rightRoom;
    }

    /**
     * Create a corridor between two rooms
     */
    private createCorridor(roomA: Rect, roomB: Rect): Corridor {
        // Get center points
        const centerA = {
            x: roomA.x + Math.floor(roomA.width / 2),
            y: roomA.y + Math.floor(roomA.height / 2)
        };
        const centerB = {
            x: roomB.x + Math.floor(roomB.width / 2),
            y: roomB.y + Math.floor(roomB.height / 2)
        };

        // L-shaped corridor: horizontal then vertical (or vice versa)
        if (this.rng.chance(0.5)) {
            // Horizontal first
            return {
                start: centerA,
                end: centerB,
                horizontal: true
            };
        } else {
            // Vertical first
            return {
                start: centerA,
                end: centerB,
                horizontal: false
            };
        }
    }

    /**
     * Find room entity by its rect bounds
     */
    private findRoomByRect(rooms: Map<string, RoomEntity>, rect: Rect): RoomEntity | undefined {
        for (const room of rooms.values()) {
            const pos = room.components.position;
            const dim = room.components.dimensions;
            if (pos.x === rect.x && pos.y === rect.y &&
                dim.width === rect.width && dim.height === rect.height) {
                return room;
            }
        }
        return undefined;
    }

    /**
     * Create door entries for connected rooms
     */
    private createDoorsForCorridor(
        roomA: RoomEntity,
        roomB: RoomEntity,
        corridor: Corridor
    ): void {
        // Find where corridor intersects with each room's walls
        const doorA = this.findCorridorRoomIntersection(corridor, roomA);
        const doorB = this.findCorridorRoomIntersection(corridor, roomB);

        if (doorA) {
            roomA.components.doors.push({
                id: `door_${roomA.id}_${roomB.id}`,
                position: doorA.position,
                direction: doorA.direction,
                connectedRoomId: roomB.id,
                state: 'closed'
            });
        }

        if (doorB) {
            roomB.components.doors.push({
                id: `door_${roomB.id}_${roomA.id}`,
                position: doorB.position,
                direction: this.oppositeDirection(doorB.direction),
                connectedRoomId: roomA.id,
                state: 'closed'
            });
        }
    }

    /**
     * Find where a corridor intersects a room's walls
     */
    private findCorridorRoomIntersection(
        corridor: Corridor,
        room: RoomEntity
    ): { position: { x: number; y: number }; direction: 'north' | 'south' | 'east' | 'west' } | null {
        const pos = room.components.position;
        const dim = room.components.dimensions;

        // Get corridor path points
        const points = this.getCorridorPath(corridor);

        // Find the first point that crosses into/out of the room
        for (const point of points) {
            // Check if point is on room boundary
            const onNorth = point.y === pos.y && point.x >= pos.x && point.x < pos.x + dim.width;
            const onSouth = point.y === pos.y + dim.height - 1 && point.x >= pos.x && point.x < pos.x + dim.width;
            const onWest = point.x === pos.x && point.y >= pos.y && point.y < pos.y + dim.height;
            const onEast = point.x === pos.x + dim.width - 1 && point.y >= pos.y && point.y < pos.y + dim.height;

            if (onNorth) return { position: point, direction: 'north' };
            if (onSouth) return { position: point, direction: 'south' };
            if (onWest) return { position: point, direction: 'west' };
            if (onEast) return { position: point, direction: 'east' };
        }

        return null;
    }

    /**
     * Get all points along a corridor path
     */
    private getCorridorPath(corridor: Corridor): { x: number; y: number }[] {
        const { start, end, horizontal } = corridor;
        const points: { x: number; y: number }[] = [];

        if (horizontal) {
            // Horizontal then vertical
            const midX = end.x;

            // Horizontal segment
            const minX = Math.min(start.x, midX);
            const maxX = Math.max(start.x, midX);
            for (let x = minX; x <= maxX; x++) {
                points.push({ x, y: start.y });
            }

            // Vertical segment
            const minY = Math.min(start.y, end.y);
            const maxY = Math.max(start.y, end.y);
            for (let y = minY; y <= maxY; y++) {
                points.push({ x: midX, y });
            }
        } else {
            // Vertical then horizontal
            const midY = end.y;

            // Vertical segment
            const minY = Math.min(start.y, midY);
            const maxY = Math.max(start.y, midY);
            for (let y = minY; y <= maxY; y++) {
                points.push({ x: start.x, y });
            }

            // Horizontal segment
            const minX = Math.min(start.x, end.x);
            const maxX = Math.max(start.x, end.x);
            for (let x = minX; x <= maxX; x++) {
                points.push({ x, y: midY });
            }
        }

        return points;
    }

    /**
     * Get opposite direction
     */
    private oppositeDirection(dir: 'north' | 'south' | 'east' | 'west'): 'north' | 'south' | 'east' | 'west' {
        const opposite = { north: 'south', south: 'north', east: 'west', west: 'east' } as const;
        return opposite[dir];
    }

    /**
     * Generate tile map from rooms and corridors
     */
    private generateTileMap(
        rooms: Map<string, RoomEntity>,
        corridors: Corridor[]
    ): TileType[][] {
        // Initialize with void
        const tiles: TileType[][] = [];
        for (let y = 0; y < this.config.height; y++) {
            tiles[y] = [];
            for (let x = 0; x < this.config.width; x++) {
                tiles[y][x] = 'void';
            }
        }

        // Carve rooms
        for (const room of rooms.values()) {
            const pos = room.components.position;
            const dim = room.components.dimensions;

            for (let y = pos.y; y < pos.y + dim.height; y++) {
                for (let x = pos.x; x < pos.x + dim.width; x++) {
                    if (y >= 0 && y < this.config.height && x >= 0 && x < this.config.width) {
                        // Walls on edges, floor inside
                        const isEdge = y === pos.y || y === pos.y + dim.height - 1 ||
                            x === pos.x || x === pos.x + dim.width - 1;
                        tiles[y][x] = isEdge ? 'wall' : 'floor';
                    }
                }
            }
        }

        // Carve corridors
        for (const corridor of corridors) {
            this.carveCorridor(tiles, corridor);
        }

        // Place doors
        for (const room of rooms.values()) {
            for (const door of room.components.doors) {
                const { x, y } = door.position;
                if (y >= 0 && y < this.config.height && x >= 0 && x < this.config.width) {
                    tiles[y][x] = 'door';
                }
            }
        }

        return tiles;
    }

    /**
     * Carve a corridor into the tile map
     */
    private carveCorridor(tiles: TileType[][], corridor: Corridor): void {
        const { start, end, horizontal } = corridor;

        // Helper to carve a single tile (replaces void or wall)
        const carve = (x: number, y: number): void => {
            if (y >= 0 && y < tiles.length && x >= 0 && x < tiles[0].length) {
                // Only carve void or wall tiles (don't overwrite existing floor or door)
                if (tiles[y][x] === 'void' || tiles[y][x] === 'wall') {
                    tiles[y][x] = 'floor';
                }
            }
        };

        if (horizontal) {
            // Horizontal then vertical
            const midX = end.x;

            // Horizontal segment
            const minX = Math.min(start.x, midX);
            const maxX = Math.max(start.x, midX);
            for (let x = minX; x <= maxX; x++) {
                carve(x, start.y);
            }

            // Vertical segment
            const minY = Math.min(start.y, end.y);
            const maxY = Math.max(start.y, end.y);
            for (let y = minY; y <= maxY; y++) {
                carve(midX, y);
            }
        } else {
            // Vertical then horizontal
            const midY = end.y;

            // Vertical segment
            const minY = Math.min(start.y, midY);
            const maxY = Math.max(start.y, midY);
            for (let y = minY; y <= maxY; y++) {
                carve(start.x, y);
            }

            // Horizontal segment
            const minX = Math.min(start.x, end.x);
            const maxX = Math.max(start.x, end.x);
            for (let x = minX; x <= maxX; x++) {
                carve(x, midY);
            }
        }
    }
}
