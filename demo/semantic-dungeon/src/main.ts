/**
 * SWFC Demo Entry Point
 * Supports two modes: Class Generation and Dungeon Exploration
 */

import { getOpenRouterSolver } from './solver/OpenRouterSolver';
import { ClassGeneratorUI } from './ui/ClassGeneratorUI';
import { DungeonGenerator, type DungeonLayout } from './dungeon/DungeonGenerator';
import { DungeonRenderer } from './renderer/DungeonRenderer';
import type { PlayerState } from './types';
import { PlayerController } from './player/PlayerController';
import { getRoomHorizonQueue } from './engine/RoomHorizonQueue';
import { getEventLog } from './engine/EventLog';
import { clearTileCache } from './entities/TileCollapser';
import { openInspectionModal, isModalOpen } from './ui/InspectionModal';
import { promptForQuest } from './ui/QuestModal';
import './styles.css';

type DemoMode = 'class' | 'dungeon';

let currentMode: DemoMode = 'class';
let dungeonLayout: DungeonLayout | null = null;
let dungeonRenderer: DungeonRenderer | null = null;
let playerController: PlayerController | null = null;

async function init(): Promise<void> {
    console.log('=== SWFC Demo ===');

    // Test OpenRouter connection first
    const solver = getOpenRouterSolver();
    const status = await solver.testConnection();

    const statusEl = document.getElementById('connection-status')!;

    if (status.connected && !status.error) {
        statusEl.textContent = `✓ OpenRouter Connected (${status.latency}ms)`;
        statusEl.className = 'status success';
    } else if (status.connected) {
        statusEl.textContent = `⚠ Connected but: ${status.error}`;
        statusEl.className = 'status warning';
    } else {
        statusEl.textContent = `✗ OpenRouter Offline: ${status.error}`;
        statusEl.className = 'status error';
    }

    // Setup mode toggle
    setupModeToggle();

    // Initialize in class mode by default
    initClassMode();
}

function setupModeToggle(): void {
    const container = document.getElementById('app')!;

    // Create mode toggle UI
    const toggleHtml = `
        <div class="mode-toggle">
            <button id="mode-class" class="btn ${currentMode === 'class' ? 'primary' : 'secondary'}">Class Generation</button>
            <button id="mode-dungeon" class="btn ${currentMode === 'dungeon' ? 'primary' : 'secondary'}">Dungeon Exploration</button>
        </div>
    `;

    // Insert after header
    const header = container.querySelector('.header-bar');
    if (header) {
        header.insertAdjacentHTML('afterend', toggleHtml);
    }

    // Bind toggle events
    document.getElementById('mode-class')?.addEventListener('click', () => {
        if (currentMode !== 'class') {
            currentMode = 'class';
            updateModeButtons();
            initClassMode();
        }
    });

    document.getElementById('mode-dungeon')?.addEventListener('click', () => {
        if (currentMode !== 'dungeon') {
            currentMode = 'dungeon';
            updateModeButtons();
            initDungeonMode();
        }
    });
}

function updateModeButtons(): void {
    const classBtn = document.getElementById('mode-class');
    const dungeonBtn = document.getElementById('mode-dungeon');

    if (classBtn) {
        classBtn.className = `btn ${currentMode === 'class' ? 'primary' : 'secondary'}`;
    }
    if (dungeonBtn) {
        dungeonBtn.className = `btn ${currentMode === 'dungeon' ? 'primary' : 'secondary'}`;
    }
}

function initClassMode(): void {
    console.log('[Mode] Switching to Class Generation');

    const container = document.getElementById('class-generator')!;
    container.style.display = 'block';

    const dungeonContainer = document.getElementById('dungeon-container');
    if (dungeonContainer) {
        dungeonContainer.style.display = 'none';
    }

    // Initialize Class Generator UI (only once)
    if (!container.hasChildNodes()) {
        new ClassGeneratorUI('class-generator');
    }
}

function initDungeonMode(): void {
    console.log('[Mode] Switching to Dungeon Exploration');

    const classContainer = document.getElementById('class-generator')!;
    classContainer.style.display = 'none';

    // Create or show dungeon container
    let dungeonContainer = document.getElementById('dungeon-container');
    if (!dungeonContainer) {
        dungeonContainer = document.createElement('div');
        dungeonContainer.id = 'dungeon-container';
        dungeonContainer.innerHTML = `
            <div class="dungeon-ui">
                <div class="dungeon-view">
                    <canvas id="dungeon-canvas"></canvas>
                </div>
                <div class="dungeon-sidebar">
                    <div class="panel">
                        <h3>Room Info</h3>
                        <div id="room-info">
                            <p class="empty">Enter a room to see its details.</p>
                        </div>
                    </div>
                    <div class="panel">
                        <h3>Inspection</h3>
                        <div id="inspection-result">
                            <p class="empty">Press E to inspect what's in front of you.</p>
                        </div>
                    </div>
                    <div class="panel">
                        <h3>Horizon Queue</h3>
                        <div id="horizon-status"></div>
                    </div>
                    <div class="panel">
                        <h3>Event Log</h3>
                        <div id="dungeon-events" class="log-content"></div>
                    </div>
                    <div class="actions">
                        <button id="new-dungeon-btn" class="btn secondary">New Dungeon</button>
                    </div>
                </div>
            </div>
        `;
        document.getElementById('app')!.appendChild(dungeonContainer);

        // Prompt for quest then generate dungeon
        promptForQuest().then(quest => {
            generateDungeon(quest);
        });

        // Bind new dungeon button
        document.getElementById('new-dungeon-btn')?.addEventListener('click', async () => {
            const quest = await promptForQuest();
            generateDungeon(quest);
        });
    } else {
        dungeonContainer.style.display = 'block';
    }
}

let currentQuest: string = '';

function generateDungeon(quest: string): void {
    console.log('[Dungeon] Generating new dungeon with quest:', quest);
    currentQuest = quest;

    // Clear tile cache from previous dungeon
    clearTileCache();

    // Generate layout
    const generator = new DungeonGenerator({
        width: 60,
        height: 40,
        seed: `dungeon_${Date.now()}`
    });

    dungeonLayout = generator.generate();
    console.log(`[Dungeon] Generated ${dungeonLayout.rooms.size} rooms`);

    // Initialize renderer
    dungeonRenderer = new DungeonRenderer('dungeon-canvas');
    dungeonRenderer.setLayout(dungeonLayout);

    // Initialize horizon queue with quest as constraint
    const horizonQueue = getRoomHorizonQueue();
    horizonQueue.initialize(dungeonLayout, [currentQuest]);

    // Subscribe to queue updates
    horizonQueue.subscribe(() => {
        updateHorizonStatus();
        updateDungeonEvents();
    });

    // Initialize player controller
    playerController = new PlayerController(dungeonLayout, {
        onMove: (player: PlayerState) => {
            dungeonRenderer?.setPlayer(player);
            dungeonRenderer?.render();
            updateRoomInfo();
        },
        onRoomEnter: (roomId: string, _previousRoomId: string | null) => {
            console.log(`[Player] Entered room: ${roomId}`);
            dungeonRenderer?.markRoomVisited(roomId);
            horizonQueue.advanceHorizon(roomId);
            updateRoomInfo();
        },
        onRoomExit: (roomId: string) => {
            console.log(`[Player] Left room: ${roomId}`);
        },
        onInspect: (x: number, y: number) => {
            handleInspection(x, y);
        }
    });

    // Initial render
    dungeonRenderer.setPlayer(playerController.getPlayer());
    dungeonRenderer.markRoomVisited(dungeonLayout.entranceRoomId);

    // Trigger initial horizon collapse
    horizonQueue.advanceHorizon(dungeonLayout.entranceRoomId);

    dungeonRenderer.render();
    updateRoomInfo();
    updateHorizonStatus();
}

function updateRoomInfo(): void {
    const infoEl = document.getElementById('room-info');
    if (!infoEl || !dungeonLayout || !playerController) return;

    const player = playerController.getPlayer();
    const roomId = player.currentRoomId;

    if (!roomId) {
        infoEl.innerHTML = '<p class="empty">In corridor</p>';
        return;
    }

    const room = dungeonLayout.rooms.get(roomId);
    if (!room) {
        infoEl.innerHTML = '<p class="empty">Unknown room</p>';
        return;
    }

    const isCollapsed = room.state === 'collapsed';

    infoEl.innerHTML = `
        <div class="room-details">
            <div class="room-id">${roomId}</div>
            <div class="room-state ${room.state}">${room.state}</div>
            ${isCollapsed ? `
                <div class="room-type">${room.components.roomType || 'unknown'}</div>
                <div class="room-theme">${room.components.theme || 'unknown'}</div>
                <div class="room-desc">${room.components.description || ''}</div>
                ${room.components.objectSlots && room.components.objectSlots.length > 0 ? `
                    <div class="room-objects">
                        <strong>Objects:</strong>
                        ${room.components.objectSlots.map(s => s.objectType || '?').join(', ')}
                    </div>
                ` : ''}
            ` : `
                <div class="room-waiting">
                    <div class="spinner"></div>
                    <span>Collapsing...</span>
                </div>
            `}
        </div>
    `;
}

function updateHorizonStatus(): void {
    const statusEl = document.getElementById('horizon-status');
    if (!statusEl) return;

    const horizonQueue = getRoomHorizonQueue();
    const status = horizonQueue.getQueueStatus();

    if (status.length === 0) {
        statusEl.innerHTML = '<p class="empty">Queue empty</p>';
        return;
    }

    statusEl.innerHTML = status.map(s => `
        <div class="queue-item ${s.status}">
            <span class="room">${s.roomId}</span>
            <span class="depth">d${s.depth}</span>
            <span class="status">${s.status}</span>
        </div>
    `).join('');
}

function updateDungeonEvents(): void {
    const eventsEl = document.getElementById('dungeon-events');
    if (!eventsEl) return;

    const eventLog = getEventLog();
    const events = eventLog.tail(10);

    eventsEl.innerHTML = events.map(e => `
        <div class="log-entry">
            <span class="type">${e.type}</span>
            <span class="id">${'entityId' in e ? e.entityId : ''}</span>
        </div>
    `).join('');
}

async function handleInspection(x: number, y: number): Promise<void> {
    if (!dungeonLayout) return;

    // Don't open if modal already open
    if (isModalOpen()) return;

    // Disable player input while modal is open
    playerController?.setInputEnabled(false);

    // Open the inspection modal
    await openInspectionModal(
        dungeonLayout,
        x,
        y,
        () => {
            // Re-enable input when modal closes
            playerController?.setInputEnabled(true);
            updateDungeonEvents();
        },
        (item: string) => {
            // Handle inventory add
            playerController?.addToInventory(item);
        }
    );
}

init().catch(error => {
    console.error('[SWFC] Init failed:', error);
    const statusEl = document.getElementById('connection-status');
    if (statusEl) {
        statusEl.textContent = `✗ Init failed: ${error.message}`;
        statusEl.className = 'status error';
    }
});
