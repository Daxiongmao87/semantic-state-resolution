/**
 * Replay Test - V14 Fix
 * Verifies that Event Log replay produces identical game state
 * 
 * README §4.4: "The Event Log enables deterministic replay and traceability"
 */

import { getEventLog } from '../engine/EventLog';
import { projectCurrentState, type ProjectedGameState } from '../engine/StateProjection';

// =============================================================================
// Replay Test Functions
// =============================================================================

/**
 * Run a full replay test
 * 1. Capture current state from Event Log
 * 2. Export Event Log to JSON
 * 3. Clear Event Log
 * 4. Import Event Log from JSON
 * 5. Project state from imported events
 * 6. Compare original vs replayed state
 */
export function runReplayTest(): {
    success: boolean;
    originalState: ProjectedGameState;
    replayedState: ProjectedGameState;
    differences: string[];
} {
    const eventLog = getEventLog();

    // Step 1: Capture current state
    console.log('[ReplayTest] Step 1: Capturing current state...');
    const originalState = projectCurrentState();
    const originalEventCount = eventLog.getAll().length;

    // Step 2: Export events
    console.log('[ReplayTest] Step 2: Exporting events...');
    const exportedJson = eventLog.export();

    // Step 3: Clear event log
    console.log('[ReplayTest] Step 3: Clearing event log...');
    eventLog.clear();

    // Step 4: Import events
    console.log('[ReplayTest] Step 4: Importing events...');
    eventLog.import(exportedJson);
    const importedEventCount = eventLog.getAll().length;

    // Step 5: Project state from imported events
    console.log('[ReplayTest] Step 5: Projecting state from imported events...');
    const replayedState = projectCurrentState();

    // Step 6: Compare states
    console.log('[ReplayTest] Step 6: Comparing states...');
    const differences: string[] = [];

    // Check event count
    if (originalEventCount !== importedEventCount) {
        differences.push(`Event count mismatch: original=${originalEventCount}, replayed=${importedEventCount}`);
    }

    // Check room count
    if (originalState.rooms.size !== replayedState.rooms.size) {
        differences.push(`Room count mismatch: original=${originalState.rooms.size}, replayed=${replayedState.rooms.size}`);
    }

    // Check each room
    for (const [roomId, originalRoom] of originalState.rooms) {
        const replayedRoom = replayedState.rooms.get(roomId);
        if (!replayedRoom) {
            differences.push(`Room ${roomId} missing in replayed state`);
            continue;
        }

        if (originalRoom.state !== replayedRoom.state) {
            differences.push(`Room ${roomId} state mismatch: original=${originalRoom.state}, replayed=${replayedRoom.state}`);
        }

        // Check tags
        const originalTags = originalRoom.tags.sort().join(',');
        const replayedTags = replayedRoom.tags.sort().join(',');
        if (originalTags !== replayedTags) {
            differences.push(`Room ${roomId} tags mismatch: original=[${originalTags}], replayed=[${replayedTags}]`);
        }
    }

    // Check object count
    if (originalState.objects.size !== replayedState.objects.size) {
        differences.push(`Object count mismatch: original=${originalState.objects.size}, replayed=${replayedState.objects.size}`);
    }

    // Check player state
    if (originalState.player && replayedState.player) {
        if (originalState.player.position.x !== replayedState.player.position.x ||
            originalState.player.position.y !== replayedState.player.position.y) {
            differences.push(`Player position mismatch: original=(${originalState.player.position.x},${originalState.player.position.y}), replayed=(${replayedState.player.position.x},${replayedState.player.position.y})`);
        }
    } else if (originalState.player !== replayedState.player) {
        differences.push(`Player state mismatch: original exists=${!!originalState.player}, replayed exists=${!!replayedState.player}`);
    }

    const success = differences.length === 0;

    console.log(`[ReplayTest] ${success ? '✅ PASSED' : '❌ FAILED'}`);
    if (!success) {
        console.log('[ReplayTest] Differences:', differences);
    }

    return {
        success,
        originalState,
        replayedState,
        differences
    };
}

/**
 * Quick replay verification - just checks if export/import produces same event count
 */
export function quickReplayCheck(): boolean {
    const eventLog = getEventLog();
    const originalCount = eventLog.getAll().length;
    const exported = eventLog.export();
    eventLog.clear();
    eventLog.import(exported);
    const importedCount = eventLog.getAll().length;
    return originalCount === importedCount;
}

/**
 * Get replay statistics
 */
export function getReplayStats(): {
    eventCount: number;
    roomsCollapsed: number;
    playerMoves: number;
    constraintsInjected: number;
} {
    const eventLog = getEventLog();
    const events = eventLog.getAll();

    return {
        eventCount: events.length,
        roomsCollapsed: events.filter(e => e.type === 'CollapseCommitted').length,
        playerMoves: events.filter(e => e.type === 'PlayerMoved').length,
        constraintsInjected: events.filter(e => e.type === 'ConstraintInjected').length
    };
}

/**
 * Export current game session for later replay
 */
export function exportSession(): string {
    const eventLog = getEventLog();
    return eventLog.export();
}

/**
 * Import a saved session
 */
export function importSession(json: string): void {
    const eventLog = getEventLog();
    eventLog.import(json);
}
