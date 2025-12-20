/**
 * Seeded Random Number Generator
 * Simple LCG (Linear Congruential Generator)
 */

export class SeededRandom {
    private seed: number;

    constructor(seed: number | string) {
        this.seed = typeof seed === 'string' ? this.hashString(seed) : seed;
    }

    private hashString(str: string): number {
        let hash = 0;
        for (let i = 0; i < str.length; i++) {
            const char = str.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash = hash & hash; // Convert to 32bit integer
        }
        return Math.abs(hash);
    }

    /**
     * Returns a random float in [0, 1)
     */
    random(): number {
        // LCG parameters (same as glibc)
        this.seed = (this.seed * 1103515245 + 12345) & 0x7fffffff;
        return this.seed / 0x7fffffff;
    }

    /**
     * Returns a random integer in [min, max]
     */
    randomInt(min: number, max: number): number {
        return Math.floor(this.random() * (max - min + 1)) + min;
    }

    /**
     * Returns a random float in [min, max)
     */
    randomFloat(min: number, max: number): number {
        return this.random() * (max - min) + min;
    }

    /**
     * Returns true with given probability
     */
    chance(probability: number): boolean {
        return this.random() < probability;
    }

    /**
     * Pick random element from array
     */
    pick<T>(array: T[]): T {
        return array[this.randomInt(0, array.length - 1)];
    }

    /**
     * Shuffle array in place
     */
    shuffle<T>(array: T[]): T[] {
        for (let i = array.length - 1; i > 0; i--) {
            const j = this.randomInt(0, i);
            [array[i], array[j]] = [array[j], array[i]];
        }
        return array;
    }
}
