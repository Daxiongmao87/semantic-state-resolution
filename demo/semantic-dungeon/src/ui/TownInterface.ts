
import { appState } from '../engine/AppStateManager';
import { GameScreen } from '../GameTypes';
import { getTownManager } from '../town/TownManager';
import { getOpenRouterSolver } from '../solver/OpenRouterSolver';
import { openInventoryModal } from './InventoryModal';

export class TownInterface {
    private containerId: string;
    private container: HTMLElement | null = null;
    private currentView: 'main' | 'tavern' | 'shop' | 'gate' = 'main';
    private isReady: boolean = false;
    private keyListener: ((e: KeyboardEvent) => void) | null = null;
    private onStartDungeon: (rumor: any) => void;

    constructor(containerId: string, onStartDungeon: (rumor: any) => void) {
        this.containerId = containerId;
        this.onStartDungeon = onStartDungeon;
        this.container = document.getElementById(containerId);

        // Global key listener for Town
        this.keyListener = (e: KeyboardEvent) => {
            // Ignore if town is not visible
            if (appState.getCurrentScreen() !== GameScreen.Town && this.container?.style.display === 'none') return;
            // Ignore if typing in an input
            if (document.activeElement?.tagName === 'INPUT' || document.activeElement?.tagName === 'TEXTAREA') return;

            if (e.key.toLowerCase() === 'i') {
                this.openInventory();
            }
        };
        document.addEventListener('keydown', this.keyListener);
    }

    private openInventory(): void {
        const player = appState.getPlayerState();
        if (player) {
            openInventoryModal(player, () => {
                // On close, maybe refresh view if needed
                this.updateView();
            });
        }
    }

    public async init(): Promise<void> {
        if (!this.container) {
            this.container = document.createElement('div');
            this.container.id = this.containerId;
            document.getElementById('app')?.appendChild(this.container);
        }

        // Show loading state while town collapses
        this.container.innerHTML = `
            <div class="town-layout">
                <div class="town-loading">
                    <div class="spinner"></div>
                    <p>The town materializes from the semantic void...</p>
                </div>
            </div>
        `;

        // Collapse town (JIT generate location names)
        await getTownManager().collapseTown();

        this.isReady = true;
        this.render();
    }

    public deactivate(): void {
        if (this.keyListener) {
            document.removeEventListener('keydown', this.keyListener);
            this.keyListener = null;
        }
        if (this.container) {
            this.container.innerHTML = ''; // Clear content
        }
    }

    private render(): void {
        if (!this.container || !this.isReady) return;

        const tm = getTownManager();
        const townLocation = tm.getLocation('town');

        this.container.innerHTML = `
            <div class="town-layout">
                <header class="town-header">
                    <h1>${townLocation.name}</h1>
                    <div class="town-stats">
                        <button id="btn-town-inv" class="btn-icon" title="Inventory (I)">🎒</button>
                        <span>💰 ${tm.formatCurrency(tm.getWealth())}</span>
                        <span>Day: ${tm.getState().currentDay}</span>
                    </div>
                </header>
                
                <main class="town-viewport" id="town-viewport">
                    <!-- View Content Injected Here -->
                </main>

                <nav class="town-nav">
                    <button class="nav-btn" id="btn-tavern">🍺 ${tm.getLocation('tavern').name}</button>
                    <button class="nav-btn" id="btn-shop">⚔️ ${tm.getLocation('shop').name}</button>
                    <button class="nav-btn" id="btn-gate">🚪 ${tm.getLocation('gate').name}</button>
                    <button class="nav-btn secondary" id="btn-menu">Main Menu</button>
                </nav>
            </div>
        `;

        this.updateView();
        this.bindEvents();
    }

    private updateView(): void {
        const viewport = document.getElementById('town-viewport');
        if (!viewport) return;

        const tm = getTownManager();

        switch (this.currentView) {
            case 'main':
                const townLoc = tm.getLocation('town');
                viewport.innerHTML = `
                    <div class="location-view">
                        <h2>${townLoc.name}</h2>
                        <p class="location-desc">${townLoc.description}</p>
                        
                        <div id="action-response" class="action-response"></div>
                        
                        <div class="action-suggestions">
                            <span class="suggestions-label">Suggestions:</span>
                            <button class="suggestion-btn" data-action="Look around the area">Look Around</button>
                            <button class="suggestion-btn" data-action="Listen to nearby conversations">Eavesdrop</button>
                            <button class="suggestion-btn" data-action="Examine the notice board">Check Notices</button>
                        </div>

                        <div class="action-input-container">
                            <input type="text" id="town-action-input" class="town-action-input" placeholder="What do you do?" />
                            <button id="town-action-submit" class="action-submit-btn">Do It</button>
                        </div>
                    </div>
                `;
                break;
            case 'tavern':
                const tavernLoc = tm.getLocation('tavern');
                const sleepCost = 10; // 1 silver (10 copper)
                const canAffordSleep = tm.hasWealth(sleepCost);
                viewport.innerHTML = `
                    <div class="location-view">
                        <h2>${tavernLoc.name}</h2>
                        <p class="location-desc">${tavernLoc.description}</p>
                        <div class="town-status-bar">
                             <span class="day-counter">Day ${tm.getState().currentDay}</span>
                             <span class="wealth-display">💰 ${tm.formatCurrency(tm.getWealth())}</span>
                        </div>
                        
                        <div id="action-response" class="action-response"></div>
                        
                        <div class="action-suggestions">
                            <span class="suggestions-label">Suggestions:</span>
                            <button class="suggestion-btn" data-action="Talk to someone here">Talk to Someone</button>
                            <button class="suggestion-btn" data-action="Look around the room">Look Around</button>
                        </div>

                        <div class="action-input-container">
                            <input type="text" id="town-action-input" class="town-action-input" placeholder="What do you do? (e.g., 'I scan the room for interesting people')" />
                            <button id="town-action-submit" class="action-submit-btn">Do It</button>
                        </div>

                        <div class="tavern-actions">
                            <button class="action-btn primary" id="act-sleep" ${!canAffordSleep ? 'disabled' : ''}>
                                🛏️ Sleep Here (${tm.formatCurrency(sleepCost)})
                            </button>
                            <button class="action-btn secondary" id="act-leave">Leave</button>
                        </div>
                        ${!canAffordSleep ? '<p class="no-funds-warning">You cannot afford a room tonight.</p>' : ''}
                    </div>
                `;
                break;
            case 'shop':
                const shopLoc = tm.getLocation('shop');
                viewport.innerHTML = `
                    <div class="location-view">
                        <h2>${shopLoc.name}</h2>
                        <p class="location-desc">${shopLoc.description}</p>
                        
                        <div id="action-response" class="action-response"></div>
                        
                        <div class="action-suggestions">
                            <span class="suggestions-label">Suggestions:</span>
                            <button class="suggestion-btn" data-action="Browse the wares">Browse Wares</button>
                            <button class="suggestion-btn" data-action="Sell some items">Sell Items</button>
                            <button class="suggestion-btn" data-action="Ask about rare items">Ask About Rarities</button>
                        </div>

                        <div class="action-input-container">
                            <input type="text" id="town-action-input" class="town-action-input" placeholder="What do you do?" />
                            <button id="town-action-submit" class="action-submit-btn">Do It</button>
                        </div>

                        <button class="action-btn secondary" id="act-leave">Leave</button>
                    </div>
                `;
                break;
            case 'gate':
                // Dynamic rendering of rumors from TownManager
                const gateLoc = tm.getLocation('gate');
                const rumors = tm.getState().activeRumors;
                const rumorList = rumors.length > 0
                    ? rumors.map(r => `
                        <div class="rumor-card">
                            <h3>${r.title || 'Unknown Rumor'}</h3>
                            <p>${r.description}</p>
                            <div class="rumor-meta">
                                <span class="tag-difficulty ${r.difficulty}">${r.difficulty}</span>
                                <span class="tag-location">${r.location}</span>
                            </div>
                            <button class="action-btn primary act-embark" data-id="${r.id}">Embark</button>
                        </div>
                    `).join('')
                    : `<p class="empty-state">You have no leads. Talk to people in the Tavern to hear rumors.</p>`;

                viewport.innerHTML = `
                    <div class="location-view">
                        <h2>${gateLoc.name}</h2>
                        <p class="location-desc">${gateLoc.description}</p>
                        
                        <div id="action-response" class="action-response"></div>
                        
                        <div class="rumor-list">
                            ${rumorList}
                        </div>
                        
                        <div class="action-input-container">
                            <input type="text" id="town-action-input" class="town-action-input" placeholder="What do you do?" />
                            <button id="town-action-submit" class="action-submit-btn">Do It</button>
                        </div>
                        
                        <button class="action-btn secondary" id="act-leave">Back</button>
                    </div>
                `;
                break;
        }

        // Re-bind dynamic events in viewport
        this.bindViewEvents();
    }

    private bindEvents(): void {
        document.getElementById('btn-tavern')?.addEventListener('click', () => {
            this.currentView = 'tavern';
            this.updateView();
        });
        document.getElementById('btn-shop')?.addEventListener('click', () => {
            this.currentView = 'shop';
            this.updateView();
        });
        document.getElementById('btn-gate')?.addEventListener('click', () => {
            this.currentView = 'gate';
            this.updateView();
        });
        document.getElementById('btn-menu')?.addEventListener('click', () => {
            // Go back to main menu
            appState.switchScreen(GameScreen.MainMenu);
        });

        // Inventory Button
        document.getElementById('btn-town-inv')?.addEventListener('click', () => {
            this.openInventory();
        });
    }

    private bindViewEvents(): void {
        // Shared 'Leave' button returns to main view
        document.querySelectorAll('#act-leave').forEach(btn => {
            btn.addEventListener('click', () => {
                this.currentView = 'main';
                this.updateView();
            });
        });

        // Sleep at Tavern - advances the day and collapses overnight events
        document.getElementById('act-sleep')?.addEventListener('click', async () => {
            const tm = getTownManager();
            const sleepCost = 10; // 1 silver (10 copper)

            // Check and deduct cost
            if (!tm.spendWealth(sleepCost)) {
                const responseEl = document.getElementById('action-response');
                if (responseEl) {
                    responseEl.innerHTML = `<div class="action-error">You cannot afford a room.</div>`;
                }
                return;
            }

            const oldDay = tm.getState().currentDay;

            // Show loading
            const responseEl = document.getElementById('action-response');
            if (responseEl) {
                responseEl.innerHTML = `<div class="action-result loading">Night falls... the world shifts...</div>`;
            }

            // Advance day (async - collapses overnight events)
            const dayEvents = await tm.advanceDay();
            const newDay = tm.getState().currentDay;

            // Show what happened
            if (responseEl) {
                let eventsHtml = '';
                if (dayEvents.length > 0) {
                    eventsHtml = dayEvents.map(e =>
                        `<div class="day-event ${e.type}">📜 ${e.description}</div>`
                    ).join('');
                } else {
                    eventsHtml = '<div class="day-event quiet">The night passes uneventfully.</div>';
                }

                responseEl.innerHTML = `
                    <div class="action-result night-summary">
                        <h4>Dawn of Day ${newDay}</h4>
                        ${eventsHtml}
                    </div>
                `;
            }

            // Refresh view to show new day
            this.updateView();
            console.log(`[Town] Advanced from Day ${oldDay} to Day ${newDay}, ${dayEvents.length} events occurred`);
        });

        // === Free-Form Action Input Handling ===
        const actionInput = document.getElementById('town-action-input') as HTMLInputElement;
        const submitBtn = document.getElementById('town-action-submit');

        // Suggestion buttons fill the input
        document.querySelectorAll('.suggestion-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const action = btn.getAttribute('data-action');
                if (action && actionInput) {
                    actionInput.value = action;
                    this.handleFreeFormAction(action);
                }
            });
        });

        // Submit button
        submitBtn?.addEventListener('click', () => {
            if (actionInput && actionInput.value.trim()) {
                this.handleFreeFormAction(actionInput.value.trim());
            }
        });

        // Enter key submits
        actionInput?.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && actionInput.value.trim()) {
                this.handleFreeFormAction(actionInput.value.trim());
            }
        });

        // Embark Logic for dynamic rumors
        document.querySelectorAll('.act-embark').forEach(btn => {
            btn.addEventListener('click', () => {
                const id = btn.getAttribute('data-id');
                const rumor = getTownManager().getState().activeRumors.find(r => r.id === id);
                if (rumor) {
                    this.onStartDungeon(rumor);
                }
            });
        });
    }

    /**
     * Handle free-form natural language action via LLM
     */
    private async handleFreeFormAction(action: string): Promise<void> {
        const responseEl = document.getElementById('action-response');
        const inputEl = document.getElementById('town-action-input') as HTMLInputElement;
        const submitBtn = document.getElementById('town-action-submit') as HTMLButtonElement;

        if (!responseEl) return;

        // Show loading state
        responseEl.innerHTML = '<div class="action-loading"><div class="spinner"></div> Interpreting...</div>';
        if (submitBtn) submitBtn.disabled = true;
        if (inputEl) inputEl.disabled = true;

        const tm = getTownManager();

        // Get dynamic location name
        const location = tm.getLocation(this.currentView === 'main' ? 'town' : this.currentView as 'tavern' | 'shop' | 'gate');

        // Get collapsed NPC data for this location (if any)
        const npcs = tm.getState().npcs;
        const locationNPC = npcs.find(n =>
            (this.currentView === 'tavern' && n.archetype === 'Barkeep') ||
            (this.currentView === 'shop' && n.archetype === 'Merchant')
        );

        // Build established facts context to prevent retcons
        let establishedFacts = '';
        if (locationNPC) {
            establishedFacts = `
ESTABLISHED FACTS (DO NOT CONTRADICT):
- There is a ${locationNPC.archetype} here named "${locationNPC.collapsedFacts.name?.value || 'Unknown'}"
- Their personality: ${locationNPC.collapsedFacts.personality?.value || 'Unknown'}
- Description: ${locationNPC.collapsedFacts.description?.value || 'Unknown'}
`;
            establishedFacts += `- Disposition towards you: ${locationNPC.disposition} (State: Hostile <-> Cold <-> Neutral <-> Friendly <-> Trusting)\n`;
        }

        // Get player profile for skill checks
        const player = appState.getPlayerState();
        let playerProfile = "Unknown Wanderer";
        if (player) {
            const stats = player.abilities || { str: 0, dex: 0, con: 0, int: 0, wis: 0, cha: 0 };
            playerProfile = `
            Name: ${player.name || 'Hero'}
            Race: ${player.race?.name || 'Human'} (${player.race?.traits?.join(', ') || 'None'})
            Class: ${player.class?.name || 'Adventurer'}
            Stats:
            STR: ${stats.str} (Mod: ${Math.floor((stats.str - 10) / 2)
                })
        DEX: ${stats.dex}
        CON: ${stats.con}
        INT: ${stats.int}
        WIS: ${stats.wis}
        CHA: ${stats.cha} (Mod: ${Math.floor((stats.cha - 10) / 2)
                })
`;
        }

        try {
            const solver = getOpenRouterSolver();
            const response = await solver.solve({
                requestId: `town_action_${Date.now()} `,
                taskType: 'TOWN_ACTION',
                entityId: `town_${this.currentView} `,
                context: {
                    location: location.name,
                    locationDescription: location.description,
                    action: action,
                    establishedFacts: establishedFacts,
                    playerProfile: playerProfile,
                    townState: {
                        wealth: tm.formatCurrency(tm.getWealth()),
                        day: tm.getState().currentDay,
                        activeRumors: tm.getState().activeRumors.length
                    },
                    currencyNames: tm.getState().currencyNames,
                    instruction: `You are a narrative game master for a dark fantasy roguelike.

The player is at: ${location.name}
${establishedFacts}

PLAYER PROFILE:
${playerProfile}

The player says / does: "${action}"

Stats are D & D - like(10 = average, 15 = strong).Use these to judge success!
    - High CHA: Persuasion / Deception works better.
- Disposition: If 'Hostile', persuasion is harder.If 'Friendly', easier.

    CRITICAL:
1. Do not contradict established facts.
2. If player tries something requiring skill, check their relevant stat.
3. If player behavior would change the NPC's opinion, propose a 'disposition_shift'.

Respond with JSON:
1. "description" - Narrative response(2 - 4 sentences).
2. "collapsed_facts" - (optional) New facts.
3. "new_rumor" - (optional) Rumor details.
4. "effects" - (optional) Game state changes:
- "wealth_change": number
    - "items_gained": string[]
        - "items_lost": string[]
            - "disposition_shift": "Improve" | "Worsen"(Should the NPC like the player more or less ?)

Example: Buying a round -> disposition_shift: "Improve".
    Example: Insulting them -> disposition_shift: "Worsen".`
                },
                constraints: { hard: [], soft: [] },
                whitelist: {
                    requiredFields: ['description'],
                    optionalFields: ['new_rumor', 'collapsed_facts', 'effects'],
                    // explanation: 'description is the narrative response. effects are game state changes.' // Removed to save tokens/clean up
                }
            });

            if (response.success && response.proposal) {
                const desc = String(response.proposal.description || 'Nothing happens.');
                responseEl.innerHTML = `< div class="action-result" > ${desc} </div>`;

                // ===== SSR: Store collapsed facts from LLM response =====
                const collapsedFacts = response.proposal.collapsed_facts as Record<string, Record<string, any>> | undefined;
                if (collapsedFacts) {
                    for (const [archetype, facts] of Object.entries(collapsedFacts)) {
                        const npc = tm.getNPCByArchetype(archetype);
                        if (npc) {
                            tm.appendNPCFacts(npc.id, facts);
                        }
                    }
                }

                // ===== Apply effects (wealth/inventory changes) =====
                // ===== Apply effects (wealth/inventory changes) =====
                const effects = response.proposal.effects as {
                    wealth_change?: number;
                    items_gained?: string[];
                    items_lost?: string[];
                    disposition_shift?: 'Improve' | 'Worsen';
                } | undefined;

                if (effects) {
                    let effectsHtml = '';

                    // Wealth changes
                    if (effects.wealth_change && effects.wealth_change !== 0) {
                        if (effects.wealth_change > 0) {
                            tm.addWealth(effects.wealth_change);
                            effectsHtml += `<div class="effect-gained">💰 +${tm.formatCurrency(effects.wealth_change)}</div>`;
                        } else {
                            const cost = Math.abs(effects.wealth_change);
                            if (tm.hasWealth(cost)) {
                                tm.spendWealth(cost);
                                effectsHtml += `<div class="effect-spent">💸 -${tm.formatCurrency(cost)}</div>`;
                            } else {
                                effectsHtml += `<div class="effect-failed">💸 Not enough coin!</div>`;
                            }
                        }
                    }

                    // Items gained
                    if (effects.items_gained && effects.items_gained.length > 0) {
                        const playerState = appState.getPlayerState();
                        if (playerState) {
                            for (const item of effects.items_gained) {
                                playerState.inventory.push(item);
                                effectsHtml += `<div class="effect-gained">📦 Received: ${item}</div>`;
                            }
                        }
                    }

                    // Items lost
                    if (effects.items_lost && effects.items_lost.length > 0) {
                        const playerState = appState.getPlayerState();
                        if (playerState) {
                            for (const item of effects.items_lost) {
                                const idx = playerState.inventory.indexOf(item);
                                if (idx !== -1) {
                                    playerState.inventory.splice(idx, 1);
                                    effectsHtml += `<div class="effect-spent">📤 Lost: ${item}</div>`;
                                }
                            }
                        }
                    }

                    // Disposition Shift
                    if (effects.disposition_shift && locationNPC) {
                        tm.updateNPCDisposition(locationNPC.id, effects.disposition_shift as 'Improve' | 'Worsen');
                        const newDisp = tm.getState().npcs.find(n => n.id === locationNPC.id)?.disposition;
                        // Visualize the shift (e.g. log message or color change) -> for now log it
                        if (newDisp) {
                            const shiftIcon = effects.disposition_shift === 'Improve' ? '💚' : '💔';
                            effectsHtml += `<div class="effect-disp">relationship: ${shiftIcon} ${newDisp}</div>`;
                        }
                    }

                    if (effectsHtml) {
                        responseEl.innerHTML += `<div class="action-effects">${effectsHtml}</div>`;
                        // Refresh display to show updated wealth
                        this.updateView();
                    }
                }

                // Handle new rumor if discovered
                if (response.proposal.new_rumor) {
                    const rumorData = response.proposal.new_rumor as any;
                    tm.addRumor({
                        id: `rumor_${Date.now()}`,
                        title: rumorData.title || 'A Whispered Lead',
                        description: rumorData.description || desc,
                        difficulty: rumorData.difficulty || 'medium',
                        location: rumorData.location || 'Unknown Depths',
                        constraints: [],
                        discovered: true
                    });
                    tm.logEvent('RUMOR_DISCOVERED', `rumor_${Date.now()}`, rumorData);
                    responseEl.innerHTML += `<div class="rumor-discovered">📜 New rumor discovered! Check the Gate.</div>`;
                }
            } else {
                responseEl.innerHTML = '<div class="action-result">The world offers no response.</div>';
            }

            if (submitBtn) submitBtn.disabled = false;
            if (inputEl) {
                inputEl.disabled = false;
                inputEl.focus();
            }

        } catch (error) {
            console.error('[Town] Action failed:', error);
            responseEl.innerHTML = '<div class="action-error">The semantic void swallows your words.</div>';
        } finally {
            if (submitBtn) submitBtn.disabled = false;
            if (inputEl) {
                inputEl.disabled = false;
                inputEl.value = '';
                inputEl.focus();
            }
        }
    }

    public destroy(): void {
        if (this.container) {
            this.container.remove();
        }
    }
}
