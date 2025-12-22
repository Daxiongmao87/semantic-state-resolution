
import { TownState, NPC, Rumor, TownLocation, TownEvent, DayEvent, DEFAULT_CURRENCY, CURRENCY, Disposition } from './TownTypes';
import { getOpenRouterSolver } from '../solver/OpenRouterSolver';
import { appState } from '../engine/AppStateManager';

class TownManager {
    private state: TownState = {
        npcs: [],
        activeRumors: [],
        currentDay: 1,
        currencyNames: { ...DEFAULT_CURRENCY },
        locations: [],
        isCollapsed: false,
        eventLog: [],
        dayEvents: {}
    };

    private solver = getOpenRouterSolver();
    private collapsingPromise: Promise<void> | null = null;

    constructor() {
        // Load state if exists? For now, transient.
    }

    public getState(): TownState {
        return this.state;
    }

    /**
     * Get a location's data. If not collapsed, returns placeholder.
     */
    public getLocation(id: 'town' | 'tavern' | 'shop' | 'gate'): TownLocation {
        const found = this.state.locations.find(l => l.id === id);
        if (found) return found;

        // Fallback - should not happen after collapse
        return { id, name: 'Loading...', description: 'The world is forming...', collapsedFacts: {} };
    }

    /**
     * Format a copper amount using collapsed currency names.
     * Returns something like "2 Crowns, 5 Shillings" or "50 Copper Coins"
     */
    public formatCurrency(copperAmount: number): string {
        const gold = Math.floor(copperAmount / CURRENCY.COPPER_PER_GOLD);
        const remainder = copperAmount % CURRENCY.COPPER_PER_GOLD;
        const silver = Math.floor(remainder / CURRENCY.COPPER_PER_SILVER);
        const copper = remainder % CURRENCY.COPPER_PER_SILVER;

        const parts: string[] = [];
        const names = this.state.currencyNames;

        if (gold > 0) parts.push(`${gold} ${names.gold}${gold !== 1 ? 's' : ''}`);
        if (silver > 0) parts.push(`${silver} ${names.silver}${silver !== 1 ? 's' : ''}`);
        if (copper > 0 || parts.length === 0) parts.push(`${copper} ${names.copper}${copper !== 1 ? 's' : ''}`);

        return parts.join(', ');
    }

    public updateNPCDisposition(npcId: string, shift: 'Improve' | 'Worsen'): void {
        const npc = this.state.npcs.find(n => n.id === npcId);
        if (!npc) return;

        const states: Disposition[] = ['Hostile', 'Cold', 'Neutral', 'Friendly', 'Trusting'];
        const currentIdx = states.indexOf(npc.disposition);

        if (currentIdx === -1) {
            npc.disposition = 'Neutral'; // Fix invalid state
            return;
        }

        let newIdx = currentIdx;
        if (shift === 'Improve') {
            newIdx = Math.min(states.length - 1, currentIdx + 1);
        } else if (shift === 'Worsen') {
            newIdx = Math.max(0, currentIdx - 1);
        }

        if (newIdx !== currentIdx) {
            const oldState = npc.disposition;
            npc.disposition = states[newIdx];
            this.logEvent('NPC_DISPOSITION_CHANGE', npc.id, { from: oldState, to: npc.disposition, reason: shift });
            console.log(`[TownManager] NPC ${npc.id} disposition shifted: ${oldState} -> ${npc.disposition}`);
        }
    }

    /**
     * Check if player can afford a cost (in copper)
     * Delegates to unified appState player wealth
     */
    public hasWealth(copperCost: number): boolean {
        return appState.hasWealth(copperCost);
    }

    /**
     * Spend wealth (in copper). Returns true if successful.
     * Delegates to unified appState player wealth
     */
    public spendWealth(copperCost: number): boolean {
        return appState.spendWealth(copperCost);
    }

    /**
     * Add wealth (in copper).
     * Delegates to unified appState player wealth
     */
    public addWealth(copperAmount: number): void {
        appState.addWealth(copperAmount);
    }

    /**
     * Get current player wealth (in copper)
     */
    public getWealth(): number {
        return appState.getWealth();
    }

    /**
     * Log an event to the event log (SSR source of truth)
     */
    public logEvent(type: TownEvent['type'], entityId: string, data: Record<string, any>): void {
        const event: TownEvent = {
            id: `event_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
            timestamp: Date.now(),
            day: this.state.currentDay,
            type,
            entityId,
            data
        };
        this.state.eventLog.push(event);
        console.log(`[Town Event] Day ${this.state.currentDay} - ${type}:`, entityId, data);
    }

    /**
     * Append facts to an NPC's collapsedFacts (incremental collapse)
     * @param ttlDays - Days until fact expires (undefined = permanent)
     */
    public appendNPCFacts(npcId: string, facts: Record<string, any>, ttlDays?: number): void {
        const npc = this.state.npcs.find(n => n.id === npcId);
        if (npc) {
            for (const [key, value] of Object.entries(facts)) {
                npc.collapsedFacts[key] = {
                    value,
                    collapsedOnDay: this.state.currentDay,
                    ttlDays,
                    strength: 1.0
                };
            }
            this.logEvent('NPC_FACT_COLLAPSED', npcId, facts);
        }
    }

    /**
     * Append facts to a location's collapsedFacts (incremental collapse)
     */
    public appendLocationFacts(locationId: string, facts: Record<string, any>, ttlDays?: number): void {
        const loc = this.state.locations.find(l => l.id === locationId);
        if (loc) {
            for (const [key, value] of Object.entries(facts)) {
                loc.collapsedFacts[key] = {
                    value,
                    collapsedOnDay: this.state.currentDay,
                    ttlDays,
                    strength: 1.0
                };
            }
            this.logEvent('NPC_FACT_COLLAPSED', locationId, facts);
        }
    }

    /**
     * Get an NPC by archetype, or return null if not yet collapsed
     */
    public getNPCByArchetype(archetype: string): NPC | null {
        return this.state.npcs.find(n => n.archetype === archetype) || null;
    }

    /**
     * Helper to get a fact's value (unwraps TemporalFact)
     */
    public getFactValue(facts: Record<string, any>, key: string): any {
        const fact = facts[key];
        return fact?.value ?? fact; // Support both TemporalFact and legacy raw values
    }

    /**
     * Collapse what events occur during the night (JIT temporal generation).
     * Returns events that shape the next day.
     */
    private async collapseDayEvents(): Promise<DayEvent[]> {
        const worldGenre = appState.getConfig()?.worldGenre || 'Dark Fantasy';

        // Build context from current state
        const npcSummary = this.state.npcs.map(n =>
            `${n.archetype}: ${n.collapsedFacts.name?.value || 'Unknown'}`
        ).join(', ');

        const rumorSummary = this.state.activeRumors
            .filter(r => r.discovered)
            .map(r => r.title)
            .join(', ') || 'None';

        // Recent events for context
        const recentEvents = this.state.eventLog
            .slice(-10)
            .map(e => `Day ${e.day}: ${e.type} - ${e.entityId}`)
            .join('\n');

        try {
            const result = await this.solver.solve({
                requestId: `day_events_${Date.now()}`,
                taskType: 'COLLAPSE_DAY_EVENTS',
                entityId: 'world',
                context: {
                    worldGenre,
                    currentDay: this.state.currentDay,
                    presentNPCs: npcSummary || 'Barkeep, Merchant',
                    activeRumors: rumorSummary,
                    recentHistory: recentEvents,
                    instruction: `The night passes in this ${worldGenre} town. Day ${this.state.currentDay} begins.
                    
What happened overnight? Generate 0-2 events. Possibilities:
- A traveler arrives (new NPC with archetype like "Traveler", "Bard", "Mercenary")
- Someone leaves town
- A new rumor spreads
- Something changes in the town (weather, mood, a building)
- Or nothing notable happens

Keep it grounded. Not every night is eventful.

Output JSON: { "events": [ { "type": "npc_arrives|npc_departs|new_rumor|location_change|world_event", "description": "...", ... } ] }
If npc_arrives: include "archetype"
If new_rumor: include "rumor": { "title": "...", "description": "...", "location": "...", "difficulty": "easy|medium|hard" }`
                },
                whitelist: { requiredFields: ['events'] },
                constraints: { hard: [], soft: [] }
            });

            if (result.success && result.proposal) {
                const data = result.proposal as any;
                return (data.events || []) as DayEvent[];
            }
        } catch (error) {
            console.error('[Town] Failed to collapse day events:', error);
        }

        return []; // Fallback: nothing happened
    }

    /**
     * Apply a day event to the town state
     */
    private async applyDayEvent(event: DayEvent): Promise<void> {
        switch (event.type) {
            case 'npc_arrives':
                if (event.archetype) {
                    console.log(`[Town] New arrival: ${event.archetype}`);
                    await this.generateNPC(event.archetype, 'tavern');
                    this.logEvent('NPC_ARRIVED', event.archetype, { description: event.description });
                }
                break;

            case 'npc_departs':
                // For now, just mark in log - could remove NPC
                console.log(`[Town] Someone left: ${event.description}`);
                this.logEvent('NPC_DEPARTED', event.npcId || 'unknown', { description: event.description });
                break;

            case 'new_rumor':
                if (event.rumor) {
                    const rumor: Rumor = {
                        id: `rumor_${Date.now()}`,
                        title: event.rumor.title || 'A Whispered Tale',
                        description: event.rumor.description || event.description,
                        location: event.rumor.location || 'Unknown',
                        difficulty: event.rumor.difficulty || 'medium',
                        constraints: [],
                        discovered: true,
                        discoveredOnDay: this.state.currentDay,
                        ttlDays: 7
                    };
                    this.addRumor(rumor);
                }
                break;

            case 'location_change':
            case 'world_event':
                // Just log as flavor - could add to location facts
                console.log(`[Town] ${event.type}: ${event.description}`);
                break;
        }
    }

    /**
     * Advance the day (sleeping at tavern). Decays fact strengths, marks expired facts,
     * and collapses new day events (JIT temporal generation).
     */
    public async advanceDay(): Promise<DayEvent[]> {
        this.state.currentDay++;
        this.logEvent('DAY_ADVANCED', 'world', { newDay: this.state.currentDay });

        const expiredFacts: string[] = [];

        // Decay NPC facts
        for (const npc of this.state.npcs) {
            for (const [key, fact] of Object.entries(npc.collapsedFacts)) {
                if (fact.ttlDays !== undefined && !fact.expired) {
                    const age = this.state.currentDay - fact.collapsedOnDay;
                    const newStrength = Math.max(0, 1.0 - (age / fact.ttlDays));
                    fact.strength = newStrength;

                    if (newStrength <= 0) {
                        // Mark as historical memory instead of deleting
                        fact.expired = true;
                        fact.expiredOnDay = this.state.currentDay;
                        expiredFacts.push(`${npc.archetype}.${key}`);
                    }
                }
            }
        }

        // Decay location facts
        for (const loc of this.state.locations) {
            for (const [key, fact] of Object.entries(loc.collapsedFacts)) {
                if (fact.ttlDays !== undefined && !fact.expired) {
                    const age = this.state.currentDay - fact.collapsedOnDay;
                    const newStrength = Math.max(0, 1.0 - (age / fact.ttlDays));
                    fact.strength = newStrength;

                    if (newStrength <= 0) {
                        // Mark as historical memory instead of deleting
                        fact.expired = true;
                        fact.expiredOnDay = this.state.currentDay;
                        expiredFacts.push(`${loc.id}.${key}`);
                    }
                }
            }
        }

        // Mark stale rumors as expired (but keep them for memory)
        for (const r of this.state.activeRumors) {
            if (r.ttlDays !== undefined && r.discoveredOnDay !== undefined) {
                const age = this.state.currentDay - r.discoveredOnDay;
                if (age > r.ttlDays) {
                    expiredFacts.push(`rumor:${r.id}`);
                }
            }
        }

        if (expiredFacts.length > 0) {
            this.logEvent('FACTS_PRUNED', 'world', { expired: expiredFacts });
            console.log(`[Town] Day ${this.state.currentDay}: ${expiredFacts.length} facts became historical memory`);
        }

        // === JIT Temporal Collapse: What happened overnight? ===
        const dayEvents = await this.collapseDayEvents();

        // Store events for this day
        this.state.dayEvents[this.state.currentDay] = dayEvents;

        // Apply events to state
        for (const event of dayEvents) {
            await this.applyDayEvent(event);
        }

        if (dayEvents.length > 0) {
            this.logEvent('DAY_EVENTS_COLLAPSED', 'world', { events: dayEvents });
            console.log(`[Town] Day ${this.state.currentDay}: ${dayEvents.length} events occurred overnight`);
        }

        return dayEvents;
    }

    /**
     * Collapse the town - JIT generate all location names based on world genre
     */
    public async collapseTown(): Promise<void> {
        if (this.state.isCollapsed) return;
        if (this.collapsingPromise) return this.collapsingPromise;

        this.collapsingPromise = this.doCollapseTown();
        await this.collapsingPromise;
        this.collapsingPromise = null;
    }

    private async doCollapseTown(): Promise<void> {
        console.log('[Town] Collapsing town...');

        const worldGenre = appState.getConfig()?.worldGenre || 'Dark Fantasy';

        try {
            const result = await this.solver.solve({
                requestId: `collapse_town_${Date.now()}`,
                taskType: 'COLLAPSE_TOWN',
                entityId: 'town',
                context: {
                    worldGenre,
                    instruction: `Generate names and brief descriptions for a town in a ${worldGenre} setting.
                    
The town has 4 locations:
1. town - The main town/settlement (give it a unique name)
2. tavern - The local tavern/inn
3. shop - A general store or supplies shop
4. gate - The exit point to the wilderness

For each location, provide a name that fits the ${worldGenre} genre and a one-sentence atmospheric description.

Also, provide thematic currency names for this world (gold/silver/copper coin equivalents).

Output JSON with format:
{
  "town": { "name": "...", "description": "..." },
  "tavern": { "name": "...", "description": "..." },
  "shop": { "name": "...", "description": "..." },
  "gate": { "name": "...", "description": "..." },
  "currency": { "gold": "...", "silver": "...", "copper": "..." }
}

Example currency for Dark Fantasy: { "gold": "Crown", "silver": "Shilling", "copper": "Penny" }
Use "Gold Coin", "Silver Coin", "Copper Coin" if nothing thematic fits.`
                },
                constraints: { hard: [], soft: [] },
                whitelist: {
                    requiredFields: ['town', 'tavern', 'shop', 'gate'],
                    optionalFields: ['currency'],
                    explanation: 'Each location must have name and description'
                }
            });

            if (result.success && result.proposal) {
                const data = result.proposal as any;

                this.state.locations = [
                    { id: 'town', name: data.town?.name || 'The Settlement', description: data.town?.description || 'A town.', collapsedFacts: {} },
                    { id: 'tavern', name: data.tavern?.name || 'The Tavern', description: data.tavern?.description || 'A drinking hole.', collapsedFacts: {} },
                    { id: 'shop', name: data.shop?.name || 'The Shop', description: data.shop?.description || 'A store.', collapsedFacts: {} },
                    { id: 'gate', name: data.gate?.name || 'The Gate', description: data.gate?.description || 'The exit.', collapsedFacts: {} }
                ];

                // Collapse currency names
                if (data.currency) {
                    this.state.currencyNames = {
                        gold: data.currency.gold || DEFAULT_CURRENCY.gold,
                        silver: data.currency.silver || DEFAULT_CURRENCY.silver,
                        copper: data.currency.copper || DEFAULT_CURRENCY.copper
                    };
                    console.log('[Town] Currency:', this.state.currencyNames);
                }

                // Log events
                this.logEvent('LOCATION_COLLAPSED', 'town', { name: this.state.locations[0].name });
                this.logEvent('LOCATION_COLLAPSED', 'tavern', { name: this.state.locations[1].name });
                this.logEvent('LOCATION_COLLAPSED', 'shop', { name: this.state.locations[2].name });
                this.logEvent('LOCATION_COLLAPSED', 'gate', { name: this.state.locations[3].name });

                this.state.isCollapsed = true;
                console.log('[Town] Collapsed:', this.state.locations);
            } else {
                throw new Error('LLM failed to generate town');
            }
        } catch (error) {
            console.error('[Town] Collapse failed, using fallbacks:', error);
            // Deterministic fallback
            this.state.locations = [
                { id: 'town', name: 'The Settlement', description: 'A small town at the edge of the known world.', collapsedFacts: {} },
                { id: 'tavern', name: 'The Weary Traveler', description: 'Smoke and conversation fill the dim interior.', collapsedFacts: {} },
                { id: 'shop', name: 'General Goods', description: 'Dusty shelves hold mysterious wares.', collapsedFacts: {} },
                { id: 'gate', name: 'The Northern Gate', description: 'Beyond lies the unknown.', collapsedFacts: {} }
            ];
            this.state.isCollapsed = true;
        }
    }

    public async getNPCAtLocation(location: 'tavern' | 'shop'): Promise<NPC> {
        // Check if we already have an NPC for this location AND day?
        // For simplicity, let's keep one persistent NPC per location for now,
        // or generate a new one if the list is empty.

        const archetype = location === 'tavern' ? 'Barkeep' : 'Merchant';
        const existing = this.state.npcs.find(n => n.archetype === archetype);

        if (existing) {
            return existing;
        }

        // Generate JIT
        return await this.generateNPC(archetype, location);
    }

    public addRumor(rumor: Rumor) {
        if (!this.state.activeRumors.find(r => r.id === rumor.id)) {
            this.state.activeRumors.push(rumor);
            console.log(`[Town] New Rumor Discovered: ${rumor.title}`);
        }
    }

    private async generateNPC(archetype: string, location: string): Promise<NPC> {
        console.log(`[Town] JIT Generating NPC for ${location}...`);

        const worldGenre = appState.getConfig()?.worldGenre || 'Dark Fantasy';

        // 1. Generate NPC Persona
        const result = await this.solver.solve({
            requestId: `gen_npc_${Date.now()}`,
            taskType: 'GENERATE_NPC',
            entityId: 'town_npc',
            context: {
                archetype,
                location,
                worldGenre,
                instruction: `Create a unique NPC for the ${location} in a ${worldGenre} setting. 
                They should have a distinct personality and potentially know a secret rumor about a dungeon.
                Output JSON with: name, description, personality, rumor (optional).`
            },
            whitelist: { requiredFields: ['name', 'description', 'personality'] },
            constraints: { hard: [], soft: [] }
        });

        if (!result.success || !result.proposal) {
            throw new Error('Failed to generate NPC');
        }

        const data = result.proposal as any;

        // 2. Create Rumor Constraint Set if they have one
        const rumorRaw = data.rumor as any;
        let knownRumors: Rumor[] = [];

        if (rumorRaw) {
            const rumor: Rumor = {
                id: `rumor_${Date.now()}`,
                title: rumorRaw.title || 'A Mysterious Rumor',
                description: rumorRaw.description || 'Something interesting...',
                location: rumorRaw.location || 'Unknown',
                difficulty: rumorRaw.difficulty || 'medium',
                constraints: rumorRaw.constraints || ['theme:unknown'],
                discovered: false
            };
            knownRumors.push(rumor);
        }

        // 3. Create NPC with collapsedFacts (SSR-compliant progressive structure)
        // Core identity facts are permanent (no ttlDays)
        const npc: NPC = {
            id: `npc_${Date.now()}`,
            archetype,
            collapsedFacts: {
                name: { value: data.name || 'Unnamed NPC', collapsedOnDay: this.state.currentDay, strength: 1.0 },
                description: { value: data.description || 'A mysterious figure.', collapsedOnDay: this.state.currentDay, strength: 1.0 },
                personality: { value: data.personality || 'Neutral', collapsedOnDay: this.state.currentDay, strength: 1.0 }
            },
            disposition: 'Neutral', // Default state
            knowledge: knownRumors,
            history: []
        };

        this.state.npcs.push(npc);
        this.logEvent('NPC_FACT_COLLAPSED', npc.id, npc.collapsedFacts);
        return npc;
    }

    public async chatWithNPC(npcId: string, message: string): Promise<{ text: string; newRumor?: Rumor }> {
        const npc = this.state.npcs.find(n => n.id === npcId);
        if (!npc) throw new Error('NPC not found');

        // Add user message to history
        npc.history.push({ sender: 'player', text: message, timestamp: Date.now() });

        // Construct context
        // We include the "Secret Knowledge" in the system prompt
        let knowledgeContext = '';
        if (npc.knowledge.length > 0) {
            knowledgeContext = `You know a secret rumor: ${JSON.stringify(npc.knowledge[0])}. 
            If the player asks about rumors, dungeons, or interesting news, reveal this rumor.
            When revealing, output a special tag: <<RUMOR_REVEALED: ${npc.knowledge[0].id}>>.
            Only reveal it if asked or if the conversation flows there naturally.`;
        }

        const historyContext = npc.history.slice(-10).map(m => `${m.sender.toUpperCase()}: ${m.text}`).join('\n');

        // Build context from TemporalFacts, distinguishing current vs historical
        const currentFacts: Record<string, any> = {};
        const historicalFacts: Record<string, any> = {};
        for (const [key, fact] of Object.entries(npc.collapsedFacts)) {
            if (fact.expired) {
                historicalFacts[key] = `${fact.value} (remembered from day ${fact.collapsedOnDay})`;
            } else {
                currentFacts[key] = fact.value;
            }
        }

        const npcName = npc.collapsedFacts.name?.value || 'Unknown';
        const npcPersonality = npc.collapsedFacts.personality?.value || 'Neutral';
        const npcDescription = npc.collapsedFacts.description?.value || 'A figure.';

        const result = await this.solver.solve({
            requestId: `chat_${Date.now()}`,
            taskType: 'NPC_CHAT',
            entityId: npc.id,
            context: {
                npc: {
                    name: npcName,
                    persona: npcPersonality,
                    description: npcDescription,
                    currentFacts,
                    historicalFacts
                },
                history: historyContext,
                knowledge: knowledgeContext,
                playerInput: message,
                instruction: `You are ${npcName}. Respond in character.
                
CURRENT FACTS about you (DO NOT CONTRADICT - these are true NOW):
${JSON.stringify(currentFacts, null, 2)}

HISTORICAL MEMORY (things you remember but may have changed):
${JSON.stringify(historicalFacts, null, 2)}

If you reveal any NEW facts about yourself (your backstory, a name, a scar, etc.), include them in "collapsed_facts".
Format: { "response": "your dialogue", "collapsed_facts": { "key": "value" }, "revealedRumorId": "id if revealing secret" }`
            },
            whitelist: { requiredFields: ['response'], optionalFields: ['collapsed_facts', 'revealedRumorId'] },
            constraints: { hard: [], soft: [] }
        });

        if (!result.success || !result.proposal) {
            return { text: "..." };
        }

        const responseText = (result.proposal as any).response || "...";

        // ===== SSR: Store any new collapsed facts =====
        const newFacts = (result.proposal as any).collapsed_facts as Record<string, any> | undefined;
        if (newFacts && Object.keys(newFacts).length > 0) {
            this.appendNPCFacts(npc.id, newFacts);
        }

        const revealedRumorId = (result.proposal as any).revealedRumorId;
        let newRumor: Rumor | undefined;

        if (revealedRumorId) {
            const secret = npc.knowledge.find(r => r.id === revealedRumorId);
            if (secret && !secret.discovered) {
                secret.discovered = true;
                this.addRumor(secret);
                this.logEvent('RUMOR_DISCOVERED', secret.id, { title: secret.title });
                newRumor = secret;
            }
        }

        npc.history.push({ sender: 'npc', text: responseText, timestamp: Date.now() });
        return { text: responseText, newRumor };
    }
}

// Singleton
const townManager = new TownManager();
export const getTownManager = () => townManager;
