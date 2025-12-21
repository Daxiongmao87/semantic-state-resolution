/**
 * Dungeon Renderer - Canvas 2D rendering for the dungeon
 */

import type { DungeonLayout } from '../dungeon/DungeonGenerator';
import type { PlayerState } from '../types';

export interface RendererConfig {
    tileSize: number;
    colors: {
        void: string;
        floor: string;
        wall: string;
        door: string;
        player: string;
        objectSlot: string;
        roomOverlay: string;
        latentRoom: string;
    };
}

const DEFAULT_CONFIG: RendererConfig = {
    tileSize: 12,
    colors: {
        void: '#0a0a0f',
        floor: '#2a2a3e',
        wall: '#4a4a5e',
        door: '#8b5cf6',
        player: '#10b981',
        objectSlot: '#f59e0b',
        roomOverlay: 'rgba(139, 92, 246, 0.1)',
        latentRoom: 'rgba(100, 100, 100, 0.3)'
    }
};



export class DungeonRenderer {
    private canvas: HTMLCanvasElement;
    private ctx: CanvasRenderingContext2D;
    private config: RendererConfig;
    private layout: DungeonLayout | null = null;
    private player: PlayerState | null = null;
    private visitedRooms: Set<string> = new Set();

    constructor(canvasId: string, config: Partial<RendererConfig> = {}) {
        const canvas = document.getElementById(canvasId) as HTMLCanvasElement;
        if (!canvas) throw new Error(`Canvas ${canvasId} not found`);

        this.canvas = canvas;
        const ctx = canvas.getContext('2d');
        if (!ctx) throw new Error('Could not get 2d context');

        this.ctx = ctx;
        this.config = { ...DEFAULT_CONFIG, ...config };
    }

    /**
     * Set the dungeon layout to render
     */
    setLayout(layout: DungeonLayout): void {
        this.layout = layout;

        // Resize canvas to fit dungeon
        this.canvas.width = layout.width * this.config.tileSize;
        this.canvas.height = layout.height * this.config.tileSize;
    }

    /**
     * Set player state
     */
    setPlayer(player: PlayerState): void {
        this.player = player;
        if (player.currentRoomId) {
            this.visitedRooms.add(player.currentRoomId);
        }
    }

    /**
     * Mark a room as visited (for rendering)
     */
    markRoomVisited(roomId: string): void {
        this.visitedRooms.add(roomId);
    }

    /**
     * Full render pass
     */
    render(): void {
        if (!this.layout) return;

        const { width, height, tiles, rooms } = this.layout;
        const { tileSize, colors } = this.config;

        // Clear
        this.ctx.fillStyle = colors.void;
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

        // Render tiles
        for (let y = 0; y < height; y++) {
            for (let x = 0; x < width; x++) {
                const tile = tiles[y][x];
                const px = x * tileSize;
                const py = y * tileSize;

                // Check if this tile is in a visited room or corridor
                const roomId = this.getRoomAtTile(x, y);
                const isVisible = roomId === null || this.visitedRooms.has(roomId);

                if (!isVisible && tile !== 'void') {
                    // Latent room - show as fog
                    this.ctx.fillStyle = colors.latentRoom;
                    this.ctx.fillRect(px, py, tileSize, tileSize);
                    continue;
                }

                switch (tile) {
                    case 'void':
                        // Already cleared to void color
                        break;
                    case 'floor':
                        this.ctx.fillStyle = colors.floor;
                        this.ctx.fillRect(px, py, tileSize, tileSize);
                        break;
                    case 'wall':
                        this.ctx.fillStyle = colors.wall;
                        this.ctx.fillRect(px, py, tileSize, tileSize);
                        break;
                    case 'door':
                        this.ctx.fillStyle = colors.door;
                        this.ctx.fillRect(px, py, tileSize, tileSize);
                        break;
                }
            }
        }

        // Render object slots (in visited rooms only)
        for (const room of rooms.values()) {
            if (!this.visitedRooms.has(room.id)) continue;

            const roomPos = room.components.position;
            for (const slot of room.components.objectSlots) {
                const px = (roomPos.x + slot.localPosition.x) * tileSize;
                const py = (roomPos.y + slot.localPosition.y) * tileSize;

                this.ctx.fillStyle = colors.objectSlot;
                this.ctx.fillRect(
                    px + 2, py + 2,
                    tileSize - 4, tileSize - 4
                );
            }
        }

        // Render player
        if (this.player) {
            const px = this.player.x * tileSize;
            const py = this.player.y * tileSize;

            this.ctx.fillStyle = colors.player;
            this.ctx.beginPath();
            this.ctx.arc(
                px + tileSize / 2,
                py + tileSize / 2,
                tileSize / 3,
                0, Math.PI * 2
            );
            this.ctx.fill();

            // Facing indicator
            const facingOffset = {
                north: { x: 0, y: -tileSize / 3 },
                south: { x: 0, y: tileSize / 3 },
                east: { x: tileSize / 3, y: 0 },
                west: { x: -tileSize / 3, y: 0 }
            };
            const offset = facingOffset[this.player.facing];

            this.ctx.beginPath();
            this.ctx.arc(
                px + tileSize / 2 + offset.x,
                py + tileSize / 2 + offset.y,
                tileSize / 6,
                0, Math.PI * 2
            );
            this.ctx.fill();
        }
    }

    /**
     * Find which room contains a tile position
     */
    private getRoomAtTile(x: number, y: number): string | null {
        if (!this.layout) return null;

        for (const room of this.layout.rooms.values()) {
            const pos = room.components.position;
            const dim = room.components.dimensions;

            if (x >= pos.x && x < pos.x + dim.width &&
                y >= pos.y && y < pos.y + dim.height) {
                return room.id;
            }
        }

        return null; // Corridor or void
    }

    /**
     * Convert canvas coordinates to tile coordinates
     */
    canvasToTile(canvasX: number, canvasY: number): { x: number; y: number } {
        return {
            x: Math.floor(canvasX / this.config.tileSize),
            y: Math.floor(canvasY / this.config.tileSize)
        };
    }

    /**
     * Get player's current room ID based on position
     */
    getPlayerRoom(): string | null {
        if (!this.player) return null;
        return this.getRoomAtTile(this.player.x, this.player.y);
    }
}
