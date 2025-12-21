/**
 * Inventory Modal - UI for managing inventory and equipment
 */

import { PlayerState, EquipmentSlots } from '../types';
import { InventoryManager } from '../player/InventoryManager';
import { getOpenRouterSolver } from '../solver/OpenRouterSolver';

interface InventoryState {
    isOpen: boolean;
    player: PlayerState | null;
    selectedItemIndex: number | null;
    message: string | null;
    descriptionCache: Map<string, string>;
}

const state: InventoryState = {
    isOpen: false,
    player: null,
    selectedItemIndex: null,
    message: null,
    descriptionCache: new Map()
};

let modalElement: HTMLElement | null = null;
let onCloseCallback: (() => void) | null = null;

export function initInventoryModal(): void {
    if (modalElement) return;

    modalElement = document.createElement('div');
    modalElement.id = 'inventory-modal';
    modalElement.className = 'modal-overlay';
    modalElement.innerHTML = `
        <div class="modal-content inventory-content">
            <div class="modal-header">
                <h2>Inventory</h2>
                <button class="close-btn">&times;</button>
            </div>
            
            <div class="inventory-layout">
                <!-- Left: Equipment -->
                <div class="equipment-panel">
                    <h3>Equipment</h3>
                    <div class="equipment-grid">
                        <div class="equip-slot" data-slot="head">
                            <span class="slot-label">Head</span>
                            <div class="slot-item" id="slot-head">Empty</div>
                        </div>
                        <div class="equip-slot" data-slot="chest">
                            <span class="slot-label">Chest</span>
                            <div class="slot-item" id="slot-chest">Empty</div>
                        </div>
                        <div class="equip-slot" data-slot="mainHand">
                            <span class="slot-label">Main Hand</span>
                            <div class="slot-item" id="slot-mainHand">Empty</div>
                        </div>
                        <div class="equip-slot" data-slot="offHand">
                            <span class="slot-label">Off Hand</span>
                            <div class="slot-item" id="slot-offHand">Empty</div>
                        </div>
                    </div>
                </div>

                <!-- Right: Backpack -->
                <div class="backpack-panel">
                    <h3>Backpack</h3>
                    <div id="backpack-list" class="item-list"></div>
                    
                    <div class="item-actions">
                        <div id="inventory-message" class="message-area"></div>
                        <div class="action-buttons">
                            <button id="btn-equip" class="btn secondary" disabled>Equip</button>
                            <button id="btn-use" class="btn secondary" disabled>Use</button>
                            <button id="btn-inspect" class="btn secondary" disabled>Inspect</button>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    `;

    document.body.appendChild(modalElement);

    // Bind Close
    modalElement.querySelector('.close-btn')?.addEventListener('click', closeInventoryModal);

    // Bind Actions
    document.getElementById('btn-equip')?.addEventListener('click', handleEquip);
    document.getElementById('btn-use')?.addEventListener('click', handleUse);
    document.getElementById('btn-inspect')?.addEventListener('click', handleInspect);

    // Bind Equipment Slot Clicks (Unequip)
    modalElement.querySelectorAll('.equip-slot').forEach(slot => {
        slot.addEventListener('click', () => {
            const slotName = slot.getAttribute('data-slot') as keyof EquipmentSlots;
            handleUnequip(slotName);
        });
    });
}

export function openInventoryModal(player: PlayerState, onClose: () => void): void {
    if (!modalElement) initInventoryModal();

    state.isOpen = true;
    state.player = player; // Reference to live player state
    state.selectedItemIndex = null;
    state.message = null;
    onCloseCallback = onClose;

    modalElement?.classList.add('open');
    render();
}

export function closeInventoryModal(): void {
    if (!state.isOpen) return;
    state.isOpen = false;
    modalElement?.classList.remove('open');
    if (onCloseCallback) onCloseCallback();
}

function render(): void {
    if (!state.player || !modalElement) return;

    // Render Equipment
    const eq = state.player.equipment;
    updateSlot('head', eq.head);
    updateSlot('chest', eq.chest);
    updateSlot('mainHand', eq.mainHand);
    updateSlot('offHand', eq.offHand);

    // Render Backpack
    const list = document.getElementById('backpack-list');
    if (list) {
        list.innerHTML = '';
        state.player.inventory.forEach((item, index) => {
            const div = document.createElement('div');
            div.className = `backpack-item ${state.selectedItemIndex === index ? 'selected' : ''}`;
            div.textContent = formatItemName(item);
            div.onclick = () => selectItem(index);
            list.appendChild(div);
        });
    }

    // Update Message
    const msgEl = document.getElementById('inventory-message');
    if (msgEl) msgEl.textContent = state.message || '';

    // Update Buttons
    const hasSelection = state.selectedItemIndex !== null;
    (document.getElementById('btn-equip') as HTMLButtonElement).disabled = !hasSelection;
    (document.getElementById('btn-use') as HTMLButtonElement).disabled = !hasSelection;
    (document.getElementById('btn-inspect') as HTMLButtonElement).disabled = !hasSelection;
}

function updateSlot(slot: string, item: string | null): void {
    const el = document.getElementById(`slot-${slot}`);
    if (el) {
        el.textContent = item ? formatItemName(item) : 'Empty';
        el.className = `slot-item ${item ? 'filled' : 'empty'}`;
    }
}

function formatItemName(name: string): string {
    return name.split('_')
        .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
        .join(' ');
}

function selectItem(index: number): void {
    state.selectedItemIndex = index;
    state.message = null;
    render();
}

function handleEquip(): void {
    if (!state.player || state.selectedItemIndex === null) return;

    const result = InventoryManager.equipItem(state.player, state.selectedItemIndex);
    state.message = result.message;
    if (result.success) {
        state.selectedItemIndex = null;
    }
    render();
}

function handleUnequip(slot: keyof EquipmentSlots): void {
    if (!state.player) return;

    // Only unequip if there is an item
    if (!state.player.equipment[slot]) return;

    const result = InventoryManager.unequipItem(state.player, slot);
    state.message = result.message;
    render();
}

function handleUse(): void {
    if (!state.player || state.selectedItemIndex === null) return;

    const result = InventoryManager.useItem(state.player, state.selectedItemIndex);
    state.message = result.message;
    if (result.success) {
        state.selectedItemIndex = null;
    }
    render();
}

async function handleInspect(): Promise<void> {
    if (!state.player || state.selectedItemIndex === null) return;
    const item = state.player.inventory[state.selectedItemIndex];

    // Check Cache
    if (state.descriptionCache.has(item)) {
        state.message = state.descriptionCache.get(item)!;
        render();
        return;
    }

    // Indicate Loading
    state.message = "Inspecting...";
    render();

    try {
        const solver = getOpenRouterSolver();
        const response = await solver.solve({
            requestId: `inspect_item_${Date.now()}`,
            taskType: 'GENERATE_DESCRIPTION',
            entityId: item,
            context: {
                instruction: `Describe the specific item '${item}'. It is currently in the player's inventory.
Focus on its appearance, condition, and any unique qualities.
Keep the description concise (1-2 sentences).
Do NOT mention game stats.
Context: Dark Fantasy Dungeon.`
            },
            constraints: { hard: [], soft: [] },
            whitelist: {
                requiredFields: ['description']
            }
        });

        if (response.success && response.proposal?.description) {
            const desc = response.proposal.description as string;
            state.descriptionCache.set(item, desc);
            state.message = desc;
        } else {
            state.message = `It appears to be a ${item}.`;
        }
    } catch (error) {
        console.error('Inspection failed:', error);
        state.message = `It appears to be a ${item}.`;
    }
    render();
}
