/**
 * Player Controller - Handles input and movement
 */

import type { DungeonLayout, TileType } from '../dungeon/DungeonGenerator';
import type { PlayerState } from '../renderer/DungeonRenderer';
import { getEventLog } from '../engine/EventLog';

export type Direction = 'north' | 'south' | 'east' | 'west';

export interface PlayerControllerCallbacks {
    onMove: (player: PlayerState) => void;
    onRoomEnter: (roomId: string, previousRoomId: string | null) => void;
    onRoomExit: (roomId: string) => void;
    onInspect?: (x: number, y: number) => void;
}

export class PlayerController {
    private layout: DungeonLayout;
    private player: PlayerState;
    private callbacks: PlayerControllerCallbacks;
    private eventLog = getEventLog();
    private inputEnabled = true;

    constructor(
        layout: DungeonLayout,
        callbacks: PlayerControllerCallbacks
    ) {
        this.layout = layout;
        this.callbacks = callbacks;

        // Initialize player at entrance room center
        const entranceRoom = layout.rooms.get(layout.entranceRoomId)!;
        const pos = entranceRoom.components.position;
        const dim = entranceRoom.components.dimensions;

        this.player = {
            x: pos.x + Math.floor(dim.width / 2),
            y: pos.y + Math.floor(dim.height / 2),
            facing: 'south',
            currentRoomId: layout.entranceRoomId
        };

        // Log initial position
        this.eventLog.append({
            type: 'PlayerMoved',
            position: { x: this.player.x, y: this.player.y },
            facing: this.player.facing
        });

        // Notify room enter
        this.callbacks.onRoomEnter(layout.entranceRoomId, null);

        // Bind keyboard input
        this.bindInput();
    }

    /**
     * Get current player state
     */
    getPlayer(): PlayerState {
        return { ...this.player };
    }

    /**
     * Enable/disable input (for loading screens, etc.)
     */
    setInputEnabled(enabled: boolean): void {
        this.inputEnabled = enabled;
    }

    /**
     * Bind keyboard events
     */
    private bindInput(): void {
        window.addEventListener('keydown', (e) => {
            if (!this.inputEnabled) return;

            let direction: Direction | null = null;

            switch (e.key) {
                case 'ArrowUp':
                case 'w':
                case 'W':
                    direction = 'north';
                    break;
                case 'ArrowDown':
                case 's':
                case 'S':
                    direction = 'south';
                    break;
                case 'ArrowLeft':
                case 'a':
                case 'A':
                    direction = 'west';
                    break;
                case 'ArrowRight':
                case 'd':
                case 'D':
                    direction = 'east';
                    break;
                case 'e':
                case 'E':
                    e.preventDefault();
                    this.inspect();
                    return;
            }

            if (direction) {
                e.preventDefault();
                this.move(direction);
            }
        });
    }

    /**
     * Inspect the tile in front of the player
     */
    inspect(): void {
        const target = this.getInteractionTile();
        if (target && this.callbacks.onInspect) {
            this.callbacks.onInspect(target.x, target.y);
        }
    }

    /**
     * Attempt to move in a direction
     */
    move(direction: Direction): boolean {
        const delta = {
            north: { x: 0, y: -1 },
            south: { x: 0, y: 1 },
            west: { x: -1, y: 0 },
            east: { x: 1, y: 0 }
        };

        // Always update facing
        this.player.facing = direction;

        const newX = this.player.x + delta[direction].x;
        const newY = this.player.y + delta[direction].y;

        // Check bounds
        if (newX < 0 || newX >= this.layout.width ||
            newY < 0 || newY >= this.layout.height) {
            this.callbacks.onMove(this.getPlayer());
            return false;
        }

        // Check tile walkability
        const tile = this.layout.tiles[newY][newX];
        if (!this.isWalkable(tile)) {
            this.callbacks.onMove(this.getPlayer());
            return false;
        }

        // Move player
        const previousRoomId = this.player.currentRoomId;
        this.player.x = newX;
        this.player.y = newY;

        // Check for room change
        const newRoomId = this.getRoomAtPosition(newX, newY);

        if (newRoomId !== previousRoomId) {
            if (previousRoomId) {
                this.callbacks.onRoomExit(previousRoomId);
            }
            this.player.currentRoomId = newRoomId;
            if (newRoomId) {
                this.callbacks.onRoomEnter(newRoomId, previousRoomId);
            }
        }

        // Log movement
        this.eventLog.append({
            type: 'PlayerMoved',
            position: { x: this.player.x, y: this.player.y },
            facing: this.player.facing
        });

        this.callbacks.onMove(this.getPlayer());
        return true;
    }

    /**
     * Check if a tile is walkable
     */
    private isWalkable(tile: TileType): boolean {
        return tile === 'floor' || tile === 'door';
    }

    /**
     * Get room ID at a position
     */
    private getRoomAtPosition(x: number, y: number): string | null {
        for (const room of this.layout.rooms.values()) {
            const pos = room.components.position;
            const dim = room.components.dimensions;

            if (x >= pos.x && x < pos.x + dim.width &&
                y >= pos.y && y < pos.y + dim.height) {
                return room.id;
            }
        }
        return null;
    }

    /**
     * Get the interaction tile (tile player is facing)
     */
    getInteractionTile(): { x: number; y: number } | null {
        const delta = {
            north: { x: 0, y: -1 },
            south: { x: 0, y: 1 },
            west: { x: -1, y: 0 },
            east: { x: 1, y: 0 }
        };

        const targetX = this.player.x + delta[this.player.facing].x;
        const targetY = this.player.y + delta[this.player.facing].y;

        if (targetX < 0 || targetX >= this.layout.width ||
            targetY < 0 || targetY >= this.layout.height) {
            return null;
        }

        return { x: targetX, y: targetY };
    }
}
