/**
 * BSP (Binary Space Partition) Node
 * Used for recursive dungeon subdivision
 */

import { SeededRandom } from '../utils/SeededRandom';

export interface Rect {
    x: number;
    y: number;
    width: number;
    height: number;
}

export interface BSPConfig {
    minRoomSize: number;    // Minimum room dimension (default: 6)
    maxRoomSize: number;    // Maximum room dimension (default: 12)
    minRoomPadding: number; // Padding from partition edge (default: 1)
    splitVariance: number;  // How much split can deviate from center (default: 0.3)
}

const DEFAULT_CONFIG: BSPConfig = {
    minRoomSize: 6,
    maxRoomSize: 12,
    minRoomPadding: 1,
    splitVariance: 0.3
};

export class BSPNode {
    bounds: Rect;
    room: Rect | null = null;
    left: BSPNode | null = null;
    right: BSPNode | null = null;

    constructor(bounds: Rect) {
        this.bounds = bounds;
    }

    /**
     * Check if this is a leaf node (has a room, no children)
     */
    isLeaf(): boolean {
        return this.left === null && this.right === null;
    }

    /**
     * Recursively split the node
     */
    split(rng: SeededRandom, config: BSPConfig = DEFAULT_CONFIG): boolean {
        // Already split
        if (!this.isLeaf()) return false;

        // Determine split direction
        // Prefer splitting the longer dimension
        const splitHorizontal = this.bounds.width > this.bounds.height
            ? rng.chance(0.75)
            : rng.chance(0.25);

        const maxSize = splitHorizontal ? this.bounds.width : this.bounds.height;

        // Can we split and still have rooms above min size?
        if (maxSize <= config.minRoomSize * 2 + config.minRoomPadding * 2) {
            return false;
        }

        // Calculate split position with variance
        const minSplit = config.minRoomSize + config.minRoomPadding;
        const maxSplit = maxSize - config.minRoomSize - config.minRoomPadding;

        // Center-biased split
        const center = (minSplit + maxSplit) / 2;
        const variance = (maxSplit - minSplit) * config.splitVariance;
        const splitPos = Math.floor(rng.randomFloat(center - variance, center + variance));

        if (splitHorizontal) {
            // Split vertically (left/right children)
            this.left = new BSPNode({
                x: this.bounds.x,
                y: this.bounds.y,
                width: splitPos,
                height: this.bounds.height
            });
            this.right = new BSPNode({
                x: this.bounds.x + splitPos,
                y: this.bounds.y,
                width: this.bounds.width - splitPos,
                height: this.bounds.height
            });
        } else {
            // Split horizontally (top/bottom children)
            this.left = new BSPNode({
                x: this.bounds.x,
                y: this.bounds.y,
                width: this.bounds.width,
                height: splitPos
            });
            this.right = new BSPNode({
                x: this.bounds.x,
                y: this.bounds.y + splitPos,
                width: this.bounds.width,
                height: this.bounds.height - splitPos
            });
        }

        return true;
    }

    /**
     * Create a room within this leaf node's bounds
     */
    createRoom(rng: SeededRandom, config: BSPConfig = DEFAULT_CONFIG): Rect | null {
        if (!this.isLeaf()) return null;

        // Room size: random within bounds, respecting min/max
        const maxWidth = Math.min(config.maxRoomSize, this.bounds.width - config.minRoomPadding * 2);
        const maxHeight = Math.min(config.maxRoomSize, this.bounds.height - config.minRoomPadding * 2);

        if (maxWidth < config.minRoomSize || maxHeight < config.minRoomSize) {
            return null;
        }

        const roomWidth = rng.randomInt(config.minRoomSize, maxWidth);
        const roomHeight = rng.randomInt(config.minRoomSize, maxHeight);

        // Position room randomly within bounds
        const roomX = rng.randomInt(
            this.bounds.x + config.minRoomPadding,
            this.bounds.x + this.bounds.width - roomWidth - config.minRoomPadding
        );
        const roomY = rng.randomInt(
            this.bounds.y + config.minRoomPadding,
            this.bounds.y + this.bounds.height - roomHeight - config.minRoomPadding
        );

        this.room = { x: roomX, y: roomY, width: roomWidth, height: roomHeight };
        return this.room;
    }

    /**
     * Get all leaf nodes
     */
    getLeaves(): BSPNode[] {
        if (this.isLeaf()) {
            return [this];
        }

        const leaves: BSPNode[] = [];
        if (this.left) leaves.push(...this.left.getLeaves());
        if (this.right) leaves.push(...this.right.getLeaves());
        return leaves;
    }

    /**
     * Get all rooms (from leaf nodes)
     */
    getRooms(): Rect[] {
        return this.getLeaves()
            .filter(leaf => leaf.room !== null)
            .map(leaf => leaf.room!);
    }
}
