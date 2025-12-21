/**
 * Event Log - Append-only event store for SSR
 * Implements §4.4 Event Sourcing
 */

import type { SSREvent } from '../types';

export class EventLog {
    private events: SSREvent[] = [];
    private listeners: Set<(event: SSREvent) => void> = new Set();

    /**
     * Generate a unique event ID
     */
    private generateEventId(): string {
        return `evt_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    }

    /**
     * Append an event to the log
     */
    append(
        eventData: { type: SSREvent['type'] } & Record<string, unknown>
    ): SSREvent {
        const event = {
            ...eventData,
            eventId: this.generateEventId(),
            timestamp: Date.now()
        } as SSREvent;

        this.events.push(event);

        // Notify listeners
        for (const listener of this.listeners) {
            try {
                listener(event);
            } catch (error) {
                console.error('[EventLog] Listener error:', error);
            }
        }

        return event;
    }

    /**
     * Get all events
     */
    getAll(): readonly SSREvent[] {
        return this.events;
    }

    /**
     * Get events for a specific entity
     */
    getForEntity(entityId: string): SSREvent[] {
        return this.events.filter(event => {
            if ('entityId' in event) return event.entityId === entityId;
            if ('targetEntityId' in event) return event.targetEntityId === entityId;
            return false;
        });
    }

    /**
     * Get events by type
     */
    getByType<T extends SSREvent['type']>(type: T): Extract<SSREvent, { type: T }>[] {
        return this.events.filter(event => event.type === type) as Extract<SSREvent, { type: T }>[];
    }

    /**
     * Get the last N events
     */
    tail(n: number): SSREvent[] {
        return this.events.slice(-n);
    }

    /**
     * Subscribe to new events
     */
    subscribe(listener: (event: SSREvent) => void): () => void {
        this.listeners.add(listener);
        return () => this.listeners.delete(listener);
    }

    /**
     * Get event count
     */
    get length(): number {
        return this.events.length;
    }

    /**
     * Clear all events (for testing)
     */
    clear(): void {
        this.events = [];
    }

    /**
     * Export events as JSON (for debugging/persistence)
     */
    export(): string {
        return JSON.stringify(this.events, null, 2);
    }

    /**
     * Import events from JSON (for replay)
     */
    import(json: string): void {
        const imported = JSON.parse(json) as SSREvent[];
        this.events = imported;
    }
}

// Singleton instance
let eventLogInstance: EventLog | null = null;

export function getEventLog(): EventLog {
    if (!eventLogInstance) {
        eventLogInstance = new EventLog();
    }
    return eventLogInstance;
}
