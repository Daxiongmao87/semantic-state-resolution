/**
 * SSR Demo Entry Point
 * Supports two modes: Class Generation and Dungeon Exploration
 */

import './styles.css';
import { getOpenRouterSolver } from './solver/OpenRouterSolver';
import { CharacterCreation } from './ui/CharacterCreation';
import { DungeonGenerator, type DungeonLayout } from './dungeon/DungeonGenerator';
import { DungeonRenderer } from './renderer/DungeonRenderer';
import type { PlayerState } from './types';
import { PlayerController } from './player/PlayerController';
import { getRoomHorizonQueue } from './engine/RoomHorizonQueue';
import { getEventLog } from './engine/EventLog';
import { clearTileCache } from './entities/TileCollapser';
import { openInspectionModal, isModalOpen } from './ui/InspectionModal';
import { openInventoryModal } from './ui/InventoryModal';
import { promptForQuest, QuestResult } from './ui/QuestModal';
import { appState } from './engine/AppStateManager';
import { MainMenu } from './ui/MainMenu';
import { PauseMenu } from './ui/PauseMenu';
import { GameScreen } from './GameTypes';
import { TownInterface } from './ui/TownInterface';

let dungeonLayout: DungeonLayout | null = null;
let dungeonRenderer: DungeonRenderer | null = null;
let playerController: PlayerController | null = null;
let currentQuest: QuestResult | null = null;

async function init(): Promise<void> {
    console.log('=== SSR Demo ===');

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

    // Initialize State Machine
    setupStateHandling();

    // Initialize UI Components
    new MainMenu('main-menu');
    new PauseMenu();

    // Start at Main Menu
    appState.switchScreen(GameScreen.MainMenu);
}

async function generateDungeon(quest: QuestResult): Promise<void> {
    console.log('[Dungeon] Generating with quest:', quest.description);
    currentQuest = quest;

    // Show loading overlay
    const overlay = document.getElementById('loading-overlay');
    if (overlay) overlay.classList.remove('hidden');

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

    // Initialize horizon with structured constraints
    const horizonQueue = getRoomHorizonQueue();
    const constraints = [...quest.constraints, `Quest: ${quest.description}`];
    horizonQueue.initialize(dungeonLayout, constraints);

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
        },
        onInventoryToggle: () => {
            if (playerController) {
                playerController.setInputEnabled(false);
                openInventoryModal(playerController.getPlayer(), () => {
                    playerController?.setInputEnabled(true);
                });
            }
        }
    });

    // Disable input during initial load (prevent 'Enter' leakage)
    playerController.setInputEnabled(false);

    // Initial render
    dungeonRenderer.setPlayer(playerController.getPlayer());
    dungeonRenderer.markRoomVisited(dungeonLayout.entranceRoomId);

    // Trigger initial horizon collapse
    horizonQueue.advanceHorizon(dungeonLayout.entranceRoomId);

    // Wait for the first room to collapse (JIT Loading)
    await waitForRoomCollapse(dungeonLayout.entranceRoomId);

    dungeonRenderer.render();
    updateRoomInfo();
    updateHorizonStatus();

    // Hide loading overlay and enable input
    if (overlay) overlay.classList.add('hidden');
    playerController.setInputEnabled(true);
}

// function moved to top level scope
function setupStateHandling() {
    appState.subscribe((screen: GameScreen) => {
        console.log(`[Main] Screen changed to: ${screen}`);

        // Cleanup previous screens
        const app = document.getElementById('app');
        if (app) app.innerHTML = ''; // Brutal clear for now, fine for demo

        switch (screen) {
            case GameScreen.CharacterCreation:
                initClassMode();
                break;
            case GameScreen.Town:
                initTownMode();
                break;
            case GameScreen.Gameplay:
                initDungeonMode();
                break;
            case GameScreen.MainMenu:
                new MainMenu('main-menu');
                break;
        }
    });

}

function initTownMode(): void {
    console.log('[Mode] Switching to Town');
    const town = new TownInterface('town-container', (rumor: any) => {
        console.log('[Town] Starting dungeon from rumor:', rumor);
        // Store the rumor as the current quest
        currentQuest = {
            description: rumor.description,
            constraints: rumor.constraints || []
        };
        appState.switchScreen(GameScreen.Gameplay);
    });
    town.init();
}

// ... initClassMode ...
function initClassMode(): void {
    let container = document.getElementById('class-generator');
    if (!container) {
        container = document.createElement('div');
        container.id = 'class-generator';
        document.getElementById('app')?.appendChild(container);
    }
    container.innerHTML = '';
    new CharacterCreation('class-generator');
}

function initDungeonMode(): void {
    console.log('[Mode] Switching to Dungeon Exploration');

    // Hide class container if it exists
    const classContainer = document.getElementById('class-generator');
    if (classContainer) classContainer.style.display = 'none';

    // Create or show dungeon container
    let dungeonContainer = document.getElementById('dungeon-container');
    if (dungeonContainer) {
        dungeonContainer.remove(); // Force reset to clean state (fix "Canvas not found")
    }

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
                    <button id="inventory-btn" class="btn secondary">Inventory (I)</button>
                    <button id="new-dungeon-btn" class="btn secondary">New Dungeon</button>
                </div>
            </div>
        </div>
    `;
    document.getElementById('app')!.appendChild(dungeonContainer);

    // Bind new dungeon button
    document.getElementById('new-dungeon-btn')?.addEventListener('click', async () => {
        const quest = await promptForQuest();
        generateDungeon(quest);
    });

    // Bind inventory button
    document.getElementById('inventory-btn')?.addEventListener('click', () => {
        if (playerController) {
            playerController.setInputEnabled(false);
            openInventoryModal(playerController.getPlayer(), () => {
                playerController?.setInputEnabled(true);
            });
        }
    });

    // Always check if we need to generate a dungeon (e.g. New Game or Refresh)
    if (!dungeonLayout) {
        if (currentQuest) {
            console.log('[Dungeon] Using quest from town/rumor:', currentQuest);
            generateDungeon(currentQuest);
            currentQuest = null;
        } else {
            promptForQuest().then(quest => {
                generateDungeon(quest);
            });
        }
    }
}



/**
 * Poll until a room is fully collapsed
 */
async function waitForRoomCollapse(roomId: string): Promise<void> {
    if (!dungeonLayout) return;
    const room = dungeonLayout.rooms.get(roomId);
    if (!room) return;

    let attempts = 0;
    while (room.state !== 'collapsed' && attempts < 100) { // 10s timeout
        await new Promise(r => setTimeout(r, 100));
        attempts++;
    }
    if (attempts >= 100) {
        console.warn(`[Dungeon] Timed out waiting for ${roomId} to collapse`);
    }
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
        playerController?.getPlayer().inventory || [],
        playerController?.getPlayer()!, // Pass full player state (with ! assertion as we checked controller exists above? No, controller is optional check? Handle safely)
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
    console.error('[SSR] Init failed:', error);
    const statusEl = document.getElementById('connection-status');
    if (statusEl) {
        statusEl.textContent = `✗ Init failed: ${error.message}`;
        statusEl.className = 'status error';
    }
});
