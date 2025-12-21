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
    // FOV State
    private visitedTiles: Set<string> = new Set();
    private doorCache: Map<string, { state?: string }> = new Map();
    private visibleTiles: Set<string> = new Set();

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

        // Build Door Cache for fast lookups
        this.doorCache.clear();
        for (const room of layout.rooms.values()) {
            for (const door of room.components.doors) {
                this.doorCache.set(`${door.position.x},${door.position.y}`, door);
            }
        }
    }

    /**
     * Set player state
     */
    setPlayer(player: PlayerState): void {
        this.player = player;
        // visitedTiles handled in render()
    }

    /**
     * Mark a room as visited (for rendering)
     */
    /**
     * Mark a room as visited (Legacy / Logic helper)
     */
    markRoomVisited(_roomId: string): void {
        // No-op for rendering, logic handled by FOV
    }

    /**
     * Check if a tile allows light to pass
     */
    private isTransparent(x: number, y: number): boolean {
        if (!this.layout) return false;
        if (x < 0 || y < 0 || x >= this.layout.width || y >= this.layout.height) return false;

        const tile = this.layout.tiles[y][x];

        // Void and Walls block light
        if (tile === 'void' || tile === 'wall') return false;

        // Doors: transparent if open/broken
        if (tile === 'door') {
            const door = this.doorCache.get(`${x},${y}`);
            if (door) {
                return door.state === 'open' || door.state === 'broken' || door.state === 'smashed' || door.state === 'destroyed';
            }
            return false; // Default closed
        }

        return true; // Floors
    }

    /**
     * Calculate visible tiles from player position
     */
    private calculateFOV(px: number, py: number, radius: number): Set<string> {
        const visible = new Set<string>();
        visible.add(`${px},${py}`); // Player tile always visible

        for (let y = py - radius; y <= py + radius; y++) {
            for (let x = px - radius; x <= px + radius; x++) {
                // Check distance (Euclidean for rounder look, or Chebyshev for square)
                // Using Euclidean squared
                const distSq = (x - px) ** 2 + (y - py) ** 2;
                if (distSq > radius * radius) continue;

                if (this.hasLineOfSight(px, py, x, y)) {
                    visible.add(`${x},${y}`);
                }
            }
        }
        return visible;
    }

    /**
     * Bresenham-based Line of Sight
     */
    private hasLineOfSight(x0: number, y0: number, x1: number, y1: number): boolean {
        let dx = Math.abs(x1 - x0);
        let dy = Math.abs(y1 - y0);
        let sx = (x0 < x1) ? 1 : -1;
        let sy = (y0 < y1) ? 1 : -1;
        let err = dx - dy;

        let cx = x0;
        let cy = y0;

        while (true) {
            // If we reached the target, we have LOS
            if (cx === x1 && cy === y1) return true;

            // Check if current tile blocks light (AND is not the start point)
            if ((cx !== x0 || cy !== y0) && !this.isTransparent(cx, cy)) {
                return false;
            }

            let e2 = 2 * err;
            if (e2 > -dy) {
                err -= dy;
                cx += sx;
            }
            if (e2 < dx) {
                err += dx;
                cy += sy;
            }
        }
    }

    /**
     * Full render pass
     */
    render(): void {
        if (!this.layout || !this.player) return;

        const { width, height, tiles, rooms } = this.layout;
        const { tileSize, colors } = this.config;

        // 1. Calculate Field of Vision
        this.visibleTiles = this.calculateFOV(this.player.x, this.player.y, 3);

        // 2. Update Memory (Visited)
        for (const tileKey of this.visibleTiles) {
            this.visitedTiles.add(tileKey);
        }

        // Clear
        this.ctx.fillStyle = '#000000'; // Pure black void
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

        // Render loop
        for (let y = 0; y < height; y++) {
            for (let x = 0; x < width; x++) {
                const key = `${x},${y}`;
                const isVisible = this.visibleTiles.has(key);
                const isVisited = this.visitedTiles.has(key);

                // Optimization: Skip unvisited (Black)
                if (!isVisited) continue;

                // Draw base tile
                const tile = tiles[y][x];
                const px = x * tileSize;
                const py = y * tileSize;

                switch (tile) {
                    case 'void': continue;
                    case 'floor': this.ctx.fillStyle = colors.floor; break;
                    case 'wall': this.ctx.fillStyle = colors.wall; break;
                    case 'door': this.ctx.fillStyle = colors.door; break;
                }
                this.ctx.fillRect(px, py, tileSize, tileSize);

                // Apply Fog of War (Dimming) if visited but not visible
                if (!isVisible) {
                    this.ctx.fillStyle = 'rgba(0, 0, 0, 0.7)'; // 70% darkness
                    this.ctx.fillRect(px, py, tileSize, tileSize);
                }
            }
        }

        // Render objects (only in visited areas)
        for (const room of rooms.values()) {
            const roomPos = room.components.position;
            for (const slot of room.components.objectSlots) {
                const absX = roomPos.x + slot.localPosition.x;
                const absY = roomPos.y + slot.localPosition.y;
                const key = `${absX},${absY}`;

                // Only render if tile visited
                if (!this.visitedTiles.has(key)) continue;

                // Determine visibility for object
                const isVisible = this.visibleTiles.has(key);

                const px = absX * tileSize;
                const py = absY * tileSize;

                this.ctx.fillStyle = colors.objectSlot;
                this.ctx.fillRect(px + 2, py + 2, tileSize - 4, tileSize - 4);

                // Apply Fog to object too
                if (!isVisible) {
                    this.ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
                    this.ctx.fillRect(px + 2, py + 2, tileSize - 4, tileSize - 4);
                }
            }
        }

        // Render player (Always visible, on top)
        const px = this.player.x * tileSize;
        const py = this.player.y * tileSize;

        this.ctx.fillStyle = colors.player;
        this.ctx.beginPath();
        this.ctx.arc(px + tileSize / 2, py + tileSize / 2, tileSize / 3, 0, Math.PI * 2);
        this.ctx.fill();

        // Facing
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
