
import { ShopItem } from '../town/TownTypes';
import { PlayerState } from '../types';
import { getTownManager } from '../town/TownManager';
import { appState } from '../engine/AppStateManager';

interface ShopState {
    isOpen: boolean;
    npcId: string | null;
    shopParams: { name: string; type: string } | null;
    shopInventory: ShopItem[];
    // We treat player items as simple strings for now, or construct fake ShopItems for display
    selectedItem: ShopItem | string | null;
    viewMode: 'buy' | 'sell';
    message: string | null;
}

const state: ShopState = {
    isOpen: false,
    npcId: null,
    shopParams: null,
    shopInventory: [],
    selectedItem: null,
    viewMode: 'buy',
    message: null
};

let modalElement: HTMLElement | null = null;

export function initShopModal(): void {
    if (modalElement) return;

    modalElement = document.createElement('div');
    modalElement.id = 'shop-modal';
    modalElement.className = 'modal-overlay';
    modalElement.innerHTML = `
        <div class="modal-content shop-content" style="max-width: 950px; height: 700px; display:flex; flex-direction:column;">
            <div class="modal-header">
                <div style="display:flex; align-items:center; gap:15px;">
                    <h2 id="shop-title" style="margin:0;">Shop</h2>
                    <div class="shop-tabs">
                        <button id="tab-buy" class="shop-tab active">Buy</button>
                        <button id="tab-sell" class="shop-tab">Sell</button>
                    </div>
                </div>
                <div class="header-wealth" id="shop-player-wealth"></div>
                <button class="close-btn">&times;</button>
            </div>
            
            <div class="shop-layout" style="display: flex; flex: 1; overflow: hidden; gap: 20px; padding: 20px;">
                <!-- Left: List -->
                <div class="shop-panel" style="flex: 1; display: flex; flex-direction: column; background: var(--bg-inset); border-radius: 8px; padding: 10px;">
                    <h3 id="list-header">Wares</h3>
                    <div id="shop-list" class="item-list" style="flex: 1; overflow-y: auto;"></div>
                </div>

                <!-- Right: Details & Actions -->
                <div class="shop-details" style="width: 320px; display: flex; flex-direction: column; background: var(--bg-panel); border-radius: 8px; padding: 20px; border: 1px solid var(--border-subtle);">
                    <h3 id="shop-item-name" style="color: var(--accent-primary); margin-bottom: 5px;">Select an Item</h3>
                    <div id="shop-item-type" style="font-size: 0.8rem; color: var(--text-muted); margin-bottom: 15px;"></div>
                    
                    <div id="shop-item-desc" style="flex: 1; color: var(--text-secondary); font-style: italic; line-height: 1.5;">
                        Select an item to view details.
                    </div>

                    <div class="shop-actions" style="margin-top: 20px; border-top: 1px solid var(--border-subtle); padding-top: 15px;">
                        <div id="shop-item-cost" style="font-size: 1.2rem; font-weight: bold; color: var(--accent-warning); margin-bottom: 15px; text-align: right;"></div>
                        <button id="btn-action" class="btn primary" style="width: 100%; padding: 12px;" disabled>Buy</button>
                        <div id="shop-message" class="message-area" style="min-height: 20px; margin-top: 10px; font-size: 0.9rem; text-align: center;"></div>
                    </div>
                </div>
            </div>
        </div>
        <style>
            .shop-tabs { display: flex; gap: 10px; background: var(--bg-inset); padding: 5px; border-radius: 20px; }
            .shop-tab { background: transparent; border: none; color: var(--text-muted); padding: 5px 15px; cursor: pointer; border-radius: 15px; font-weight: bold; transition: all 0.2s; }
            .shop-tab.active { background: var(--accent-primary); color: white; }
            .shop-tab:hover:not(.active) { color: var(--text-primary); }
        </style>
    `;

    document.body.appendChild(modalElement);

    // Bind Controls
    modalElement.querySelector('.close-btn')?.addEventListener('click', closeShopModal);
    document.getElementById('tab-buy')?.addEventListener('click', () => setMode('buy'));
    document.getElementById('tab-sell')?.addEventListener('click', () => setMode('sell'));
    document.getElementById('btn-action')?.addEventListener('click', handleAction);

    // Bind Keyboard Close
    document.addEventListener('keydown', (e) => {
        if (!state.isOpen) return;
        if (e.key === 'Escape') closeShopModal();
    });
}

function setMode(mode: 'buy' | 'sell'): void {
    state.viewMode = mode;
    state.selectedItem = null;
    state.message = null;

    document.getElementById('tab-buy')?.classList.toggle('active', mode === 'buy');
    document.getElementById('tab-sell')?.classList.toggle('active', mode === 'sell');
    document.getElementById('list-header')!.textContent = mode === 'buy' ? 'Wares' : 'Your Inventory';
    document.getElementById('btn-action')!.textContent = mode === 'buy' ? 'Buy' : 'Sell';

    renderList();
    updateDetails();
}

export async function openShopModal(npcId: string, shopName: string, shopType: string): Promise<void> {
    state.isOpen = true;
    state.npcId = npcId;
    state.shopParams = { name: shopName, type: shopType };
    state.selectedItem = null;
    state.message = null;
    state.viewMode = 'buy'; // Reset to buy mode

    if (modalElement) {
        modalElement.classList.add('open');
        document.getElementById('shop-title')!.textContent = shopName;

        // Reset tabs UI
        setMode('buy');

        // Show loading state
        const listEl = document.getElementById('shop-list');
        if (listEl) listEl.innerHTML = '<div class="loading">Loading wares...</div>';

        updateWealthDisplay();

        // Load inv
        const tm = getTownManager();
        state.shopInventory = await tm.getShopInventory(npcId);

        renderList();
    }
}

export function closeShopModal(): void {
    state.isOpen = false;
    if (modalElement) modalElement.classList.remove('open');
}

function updateWealthDisplay(): void {
    const el = document.getElementById('shop-player-wealth');
    if (el) {
        const tm = getTownManager();
        el.textContent = `Wealth: ${tm.formatCurrency(appState.getPlayerState()?.wealth || 0)}`;
    }
}

function renderList(): void {
    const listEl = document.getElementById('shop-list');
    if (!listEl) return;

    listEl.innerHTML = '';

    if (state.viewMode === 'buy') {
        renderBuyList(listEl);
    } else {
        renderSellList(listEl);
    }
}

function renderBuyList(container: HTMLElement): void {
    if (state.shopInventory.length === 0) {
        container.innerHTML = '<div class="empty">This shop is empty.</div>';
        return;
    }

    state.shopInventory.forEach(item => {
        const el = createItemRow(item.name, item.cost, (state.selectedItem as ShopItem)?.id === item.id, item.rarity);
        el.addEventListener('click', () => {
            state.selectedItem = item;
            state.message = null;
            renderList();
            updateDetails();
        });
        container.appendChild(el);
    });
}

function renderSellList(container: HTMLElement): void {
    const player = appState.getPlayerState();
    const inventory = player ? player.inventory : [];

    if (inventory.length === 0) {
        container.innerHTML = '<div class="empty">Your inventory is empty.</div>';
        return;
    }

    // simplistic: map strings to assumed rows
    // We treat index as ID for selection if duplicated strings?
    // Actually, let's just use string match for simplicity in this demo
    inventory.forEach((itemName, idx) => {
        // Mock cost/rarity for sell list
        const isSelected = state.selectedItem === itemName;
        const el = createItemRow(itemName, 10, isSelected, 'Common'); // Flat rate 10cp

        el.addEventListener('click', () => {
            state.selectedItem = itemName;
            state.message = null;
            renderList();
            updateDetails();
        });
        container.appendChild(el);
    });
}

function createItemRow(name: string, cost: number, isSelected: boolean, rarity: string): HTMLElement {
    const itemEl = document.createElement('div');
    itemEl.className = 'shop-item-row';
    itemEl.style.cssText = `
        padding: 12px;
        border-bottom: 1px solid var(--border-subtle);
        cursor: pointer;
        display: flex;
        justify-content: space-between;
        align-items: center;
        transition: background 0.1s;
    `;

    if (isSelected) {
        itemEl.style.background = 'var(--bg-hover)';
        itemEl.style.borderLeft = '4px solid var(--accent-primary)';
        itemEl.style.paddingLeft = '8px'; // Adjust for border
    }

    const nameSpan = document.createElement('span');
    nameSpan.textContent = name;
    nameSpan.style.fontWeight = '500';
    if (rarity === 'Rare') nameSpan.style.color = 'var(--accent-secondary)';
    if (rarity === 'Legendary') nameSpan.style.color = 'var(--accent-warning)';

    const costSpan = document.createElement('span');
    costSpan.textContent = `${cost} cp`;
    costSpan.style.color = 'var(--text-muted)';
    costSpan.style.fontSize = '0.9rem';

    itemEl.appendChild(nameSpan);
    itemEl.appendChild(costSpan);
    return itemEl;
}

function updateDetails(): void {
    const nameEl = document.getElementById('shop-item-name');
    const typeEl = document.getElementById('shop-item-type');
    const descEl = document.getElementById('shop-item-desc');
    const costEl = document.getElementById('shop-item-cost');
    const btnAction = document.getElementById('btn-action') as HTMLButtonElement;
    const msgEl = document.getElementById('shop-message');

    if (msgEl) {
        msgEl.textContent = state.message || '';
        msgEl.className = state.message ? (state.message.includes('Sold') || state.message.includes('Bought') ? 'message-area success' : 'message-area') : 'message-area';
    }

    if (!state.selectedItem) {
        if (nameEl) nameEl.textContent = 'Select an Item';
        if (typeEl) typeEl.textContent = '';
        if (descEl) descEl.textContent = state.viewMode === 'buy' ? 'Browse wares to see details.' : 'Select an item to sell.';
        if (costEl) costEl.textContent = '';
        if (btnAction) btnAction.disabled = true;
        return;
    }

    const tm = getTownManager();

    if (state.viewMode === 'buy') {
        const item = state.selectedItem as ShopItem;
        if (nameEl) {
            nameEl.textContent = item.name;
            nameEl.style.color = item.rarity === 'Legendary' ? 'var(--accent-warning)' : 'var(--accent-primary)';
        }
        if (typeEl) typeEl.textContent = `${item.rarity} • ${item.tags.join(', ')}`;
        if (descEl) descEl.textContent = item.description;

        if (costEl) {
            costEl.textContent = `Cost: ${tm.formatCurrency(item.cost)}`;
            const canAfford = appState.hasWealth(item.cost);
            costEl.style.color = canAfford ? 'var(--accent-warning)' : 'var(--accent-danger)';
            if (btnAction) btnAction.disabled = !canAfford;
        }
    } else {
        // Sell Mode
        const itemName = state.selectedItem as string;
        if (nameEl) {
            nameEl.textContent = itemName;
            nameEl.style.color = 'var(--text-primary)';
        }
        if (typeEl) typeEl.textContent = 'Inventory Item';
        if (descEl) descEl.textContent = 'A valuable possession. Are you sure you want to part with it?';

        // Mock sell value
        const sellValue = 10;
        if (costEl) {
            costEl.textContent = `Sell Value: ${tm.formatCurrency(sellValue)}`;
            costEl.style.color = 'var(--accent-success)';
            if (btnAction) btnAction.disabled = false;
        }
    }
}

function handleAction(): void {
    if (!state.selectedItem || !state.npcId) return;

    const tm = getTownManager();
    let result: { success: boolean; message: string };

    if (state.viewMode === 'buy') {
        const item = state.selectedItem as ShopItem;
        result = tm.buyItem(state.npcId, item.id);
    } else {
        const itemName = state.selectedItem as string;
        result = tm.sellItem(state.npcId, itemName);
    }

    state.message = result.message;

    if (result.success) {
        state.selectedItem = null;
        updateWealthDisplay();
        renderList();
        updateDetails();
    } else {
        updateDetails();
    }
}
