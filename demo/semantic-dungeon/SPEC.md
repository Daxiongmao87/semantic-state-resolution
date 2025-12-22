# SSR Demo Specification

> **Purpose**: Proof-of-concept demonstrating Semantic State Resolution where an LLM acts as a Semantic Constraint Solver for Just-In-Time procedural generation.

---

## 1. Demo Overview

The demo proves SSR's core thesis through two systems:

| System | SSR Principle |
|--------|----------------|
| **Dungeon Generation** | Rooms/objects exist as Latent Entities until observed. LLM proposes themes based on quest + neighbor constraints. |
| **Character Class Generation** | Fractal Collapse — description → class name → abilities → properties. Each level inherits constraints from parent. |
| **Town & Rumors** | **Rumors are Latent Dungeons**. Conversations with JIT NPCs generate semantic constraint sets (Rumors) that seed future dungeons. |

---

## 2. Technology Stack

- **Runtime**: Vite + TypeScript
- **Renderer**: Canvas 2D (top-down, grid-based)
- **LLM Endpoint**: `qwen2.5:7b` at `http://192.168.87.121:11434`
- **Fallback**: Traditional WFC algorithm for LLM failures

---

## 3. Dungeon Generation

### 3.1 Layout: BSP (Binary Space Partition)

Rooms are generated via BSP subdivision. Connecting rooms are **neighbors** for constraint propagation.

```
┌───────────────────────────────┐
│         DUNGEON               │
│  ┌─────────┬─────────────┐    │
│  │ Room A  │   Room B    │    │
│  │         ├──[door]─────┤    │
│  ├─[door]──┤   Room C    │    │
│  │ Room D  │             │    │
│  └─────────┴─────────────┘    │
└───────────────────────────────┘

Neighbors: A↔B, A↔D, B↔C, D↔C
```

### 3.2 Room Entity Lifecycle

```
┌─────────┐    observe    ┌────────────┐    validated    ┌───────────┐
│ LATENT  │ ────────────► │ COLLAPSING │ ─────────────► │ COLLAPSED │
└─────────┘               └────────────┘                └───────────┘
     │                          │                             │
     │ Constraints only         │ LLM proposing               │ Canonical state
     │ (quest, neighbors)       │ (may pause game)            │ (type, theme, objects)
```

### 3.3 Horizon +2 Lookahead

Latency is hidden by pre-collapsing rooms at graph distance ≤ 2 from player position.

```
Player at Room A:
  - Depth 0: A (current room, already collapsed)
  - Depth 1: B, D (neighbors, should be collapsed or collapsing)
  - Depth 2: C (neighbors of neighbors, queued for collapse)
```

**Async Queue Behavior**:
- Rate-limited (e.g., max 2 concurrent LLM calls)
- Priority: lower depth = higher priority
- If player observes uncollapsed entity → **pause game, show loading, wait**

### 3.4 Constraint Propagation

When a room collapses, its tags propagate to neighbors:

```
Room B collapses → { type: "flooded_cavern", theme: "damp" }
    ↓ propagate
Neighbors A, C receive constraint: { key: "adjacent_water", value: true, type: "soft" }
    ↓ when C collapses
LLM context includes: "Adjacent room has water"
```

### 3.5 Room Collapse Schema

**Solver Request** (Engine → LLM):
```json
{
  "task": "COLLAPSE_ROOM",
  "entity_id": "room_3",
  "context": {
    "quest": { "type": "retrieve_artifact", "artifact": "Orb of Storms" },
    "global_theme": "ancient_ruins",
    "neighbors": [
      { "id": "room_2", "state": "collapsed", "type": "entrance_hall", "theme": "crumbling" },
      { "id": "room_4", "state": "latent" }
    ]
  },
  "constraints": {
    "hard": [],
    "soft": ["crumbling_adjacent"]
  },
  "whitelist": {
    "room_types": ["corridor", "chamber", "shrine", "treasury", "monster_den", "trap_room", "puzzle_room"],
    "themes": ["damp", "ancient", "corrupted", "overgrown", "scorched", "frozen", "crumbling"]
  }
}
```

**Solver Response** (LLM → Engine):
```json
{
  "room_type": "shrine",
  "theme": "ancient",
  "description": "A forgotten shrine with cracked pillars and faded murals.",
  "objects": [
    { "type": "altar", "position": "center" },
    { "type": "statue", "position": "north" }
  ],
  "monsters": [],
  "tags": ["sacred", "quiet"]
}
```

---

## 4. Object Interaction

### 4.1 Interaction Tile

The **interaction tile** is the tile in the direction of the last pressed movement key.

```
Player facing EAST:
  ┌───┬───┬───┐
  │   │   │   │
  ├───┼───┼───┤
  │   │ P │ X │  ← X is interaction tile
  ├───┼───┼───┤
  │   │   │   │
  └───┴───┴───┘
```

### 4.2 Progressive Object Collapse

Objects collapse in stages upon interaction:

| Trigger | Collapse Level | Example |
|---------|----------------|---------|
| Room collapse | Object type + position | `{ type: "chest", position: { x: 5, y: 3 } }` |
| Inspect ("examine") | Visual description | `"A rusted iron chest bound with corroded chains."` |
| Interact ("open") | Contents | `["gold_coins", "dagger_entity_id"]` |

### 4.3 Free-Form Interaction

Player types natural language (e.g., "open the chest"). LLM interprets → Engine validates.

**Interaction Whitelist** (strict):
```typescript
const VALID_ACTIONS = [
  "examine", "open", "close", "take", "attack",
  "push", "pull", "read", "use", "break"
] as const;
```

**Solver Request**:
```json
{
  "task": "INTERPRET_INTERACTION",
  "entity_id": "chest_12",
  "entity_state": { "type": "chest", "visualDesc": "rusted iron chest", "interactionState": "closed" },
  "player_input": "open the chest",
  "whitelist": ["examine", "open", "close", "take", "attack", "push", "pull", "read", "use", "break"]
}
```

**Solver Response**:
```json
{
  "action": "open",
  "target": "chest_12",
  "reasoning": "Player wants to open the closed chest."
}
```

### 4.4 Walls and Other Inspectables

**Everything** in the interaction tile can be inspected: walls, floor tiles, etc.

```json
{
  "task": "COLLAPSE_INSPECTION",
  "entity_id": "wall_segment_45",
  "context": { "room_theme": "ancient", "room_type": "shrine" }
}
```

**Response**:
```json
{
  "visual_description": "Weathered stone blocks with faint carved glyphs.",
  "interactable": false
}
```

---

## 5. Monster Generation

Monsters are Latent Entities within rooms. They collapse when the room collapses.

**Monster Schema**:
```json
{
  "monster_type": "stone_guardian",
  "description": "A crumbling statue that animates when disturbed.",
  "behavior": "dormant_until_triggered",
  "stats": {
    "health": 50,
    "damage": 15,
    "speed": "slow"
  },
  "tags": ["construct", "ancient", "guardian"]
}
```

**Whitelist**:
```typescript
const MONSTER_TYPES = [
  "skeleton", "zombie", "ghost", "spider", "rat_swarm",
  "goblin", "orc", "troll", "stone_guardian", "elemental",
  "slime", "bat_swarm", "cultist", "demon", "dragon"
] as const;
```

---

## 6. Character Class Generation (Fractal SSR)

### 6.1 Flow

```
Player Input: "A warrior who controls lightning"
         │
         ▼ COLLAPSE (constraints: warrior, lightning)
┌────────────────────────────────────────────┐
│ Class Name Suggestions:                    │
│   • Thunder Warden                         │
│   • Storm Knight                           │
│   • Lightning Lord                         │
└────────────────────────────────────────────┘
         │ Player selects "Thunder Warden"
         ▼ COLLAPSE (constraints: Thunder Warden, warrior, lightning)
┌────────────────────────────────────────────┐
│ Abilities:                                 │
│   • Chain Lightning                        │
│   • Thunder Strike                         │
│   • Storm Armor                            │
└────────────────────────────────────────────┘
         │
         ▼ COLLAPSE EACH (constraints: ability name + class)
┌────────────────────────────────────────────┐
│ Chain Lightning:                           │
│   damage: 25, range: 3, chains: 3          │
│ Thunder Strike:                            │
│   damage: 40, aoe: 2, stun_chance: 0.3     │
│ Storm Armor:                               │
│   defense: 15, reflect_chance: 0.2         │
└────────────────────────────────────────────┘
```

### 6.2 Class Collapse Schema

**Request**:
```json
{
  "task": "COLLAPSE_CLASS_NAMES",
  "player_description": "A warrior who controls lightning",
  "constraints": {
    "extracted_tags": ["warrior", "lightning", "control"]
  },
  "whitelist": {
    "count": 3
  }
}
```

**Response**:
```json
{
  "class_names": ["Thunder Warden", "Storm Knight", "Lightning Lord"],
  "reasoning": "Combined warrior archetype with lightning/storm themes."
}
```

### 6.3 Ability Collapse Schema

**Request**:
```json
{
  "task": "COLLAPSE_ABILITIES",
  "class_name": "Thunder Warden",
  "constraints": {
    "inherited": ["warrior", "lightning", "control"],
    "class_identity": "A disciplined warrior who channels storm energy"
  },
  "whitelist": {
    "count": 3,
    "ability_categories": ["offensive", "defensive", "utility"]
  }
}
```

**Response**:
```json
{
  "abilities": [
    { "name": "Chain Lightning", "category": "offensive" },
    { "name": "Thunder Strike", "category": "offensive" },
    { "name": "Storm Armor", "category": "defensive" }
  ]
}
```

### 6.4 Ability Property Collapse Schema

**Request**:
```json
{
  "task": "COLLAPSE_ABILITY_PROPERTIES",
  "ability_name": "Chain Lightning",
  "class_name": "Thunder Warden",
  "constraints": {
    "category": "offensive",
    "inherited": ["lightning", "warrior"]
  },
  "whitelist": {
    "stat_types": ["damage", "range", "aoe", "duration", "cooldown", "chains", "stun_chance", "element"]
  }
}
```

**Response**:
```json
{
  "properties": {
    "damage": 25,
    "range": 3,
    "chains": 3,
    "element": "lightning",
    "cooldown": 2
  }
}
```

---

## 7. Quest Generation

When the player starts a dungeon, a quest is generated:

**Quest Types**:
- `retrieve_artifact` — Find and retrieve a specific item
- `rescue_captive` — Find and free an NPC
- `defeat_boss` — Locate and defeat a boss monster
- `clear_dungeon` — Eliminate all monsters
- `explore_depths` — Reach the deepest room

**Quest Collapse Schema**:
```json
{
  "task": "COLLAPSE_QUEST",
  "dungeon_seed": "seed_12345",
  "whitelist": {
    "quest_types": ["retrieve_artifact", "rescue_captive", "defeat_boss", "clear_dungeon", "explore_depths"]
  }
}
```

**Response**:
```json
{
  "quest_type": "retrieve_artifact",
  "artifact_name": "Orb of Storms",
  "artifact_description": "A crackling sphere of compressed lightning.",
  "lore": "Lost by the Thunder Wardens centuries ago.",
  "tags": ["lightning", "ancient", "powerful"]
}
```

The quest tags become **hard constraints** for dungeon room generation.

---

## 8. WFC Fallback

When the LLM fails (timeout, invalid response, schema violation), the system falls back to traditional Wave Function Collapse:

1. **Adjacency Rules**: Pre-defined compatibility matrix for room types
2. **Deterministic Selection**: `Hash(entityId + constraints) % validOptions.length`
3. **Guarantee**: Game loop never blocks on LLM failure

**Example Adjacency Rules**:
```typescript
const ROOM_ADJACENCY = {
  "entrance_hall": ["corridor", "chamber", "trap_room"],
  "corridor": ["entrance_hall", "chamber", "shrine", "treasury", "monster_den"],
  "shrine": ["corridor", "chamber", "treasury"],
  "monster_den": ["corridor", "chamber", "trap_room"],
  // ...
};
```

---

## 9. ECS Components

### 9.1 Core Entity

```typescript
interface Entity {
  id: string;
  state: 'latent' | 'collapsing' | 'collapsed';
  constraints: Constraint[];
  components: Record<string, unknown>;
}

interface Constraint {
  key: string;
  value: unknown;
  strength: number;      // 0.0 - 1.0
  type: 'hard' | 'soft';
  sourceEventId: string;
  ttl?: number;          // Time-to-live in turns
}
```

### 9.2 Room Components

```typescript
interface RoomComponents {
  position: { x: number; y: number };
  dimensions: { width: number; height: number };
  neighbors: string[];       // Entity IDs
  doors: DoorInfo[];         // Position + connected room
  // Collapsed properties:
  roomType?: string;
  theme?: string;
  description?: string;
  objects?: string[];        // Object entity IDs
  monsters?: string[];       // Monster entity IDs
  tags?: string[];
}
```

### 9.3 Object Components

```typescript
interface ObjectComponents {
  position: { x: number; y: number };
  roomId: string;
  objectType?: string;       // Collapsed on room collapse
  visualDesc?: string;       // Collapsed on inspect
  contents?: string[];       // Collapsed on open
  interactionState?: 'closed' | 'open' | 'destroyed' | 'dormant' | 'active';
}
```

### 9.4 Monster Components

```typescript
interface MonsterComponents {
  position: { x: number; y: number };
  roomId: string;
  monsterType?: string;
  description?: string;
  behavior?: string;
  stats?: { health: number; damage: number; speed: string };
  tags?: string[];
}
```

### 9.5 Player Components

```typescript
interface PlayerComponents {
  position: { x: number; y: number };
  facing: 'north' | 'south' | 'east' | 'west';
  class?: ClassComponents;
}

interface ClassComponents {
  name: string;
  description: string;
  abilities: AbilityComponents[];
}

interface AbilityComponents {
  name: string;
  category: string;
  properties: Record<string, number | string>;
}
```

---

## 10. Event Log

All state changes are recorded as events (Event Sourcing):

### 10.1 Event Types

```typescript
type SSREvent =
  | { type: 'EntityCreated'; entityId: string; initialConstraints: Constraint[] }
  | { type: 'CollapseStarted'; entityId: string; timestamp: number }
  | { type: 'CollapseCommitted'; entityId: string; components: Record<string, unknown>; tags: string[] }
  | { type: 'CollapseFailed'; entityId: string; reason: string; fallbackUsed: boolean }
  | { type: 'ConstraintInjected'; targetEntityId: string; constraint: Constraint }
  | { type: 'DeltaApplied'; entityId: string; op: 'set' | 'add' | 'remove'; path: string; value: unknown }
  | { type: 'PlayerMoved'; position: { x: number; y: number }; facing: string }
  | { type: 'InteractionAttempted'; entityId: string; action: string; result: string };
```

### 10.2 No-Retcon Invariant

Once `CollapseCommitted` is recorded, the entity's components are **canonical**. They may only change via `DeltaApplied` events caused by simulation or player action.

---

## 11. UI Layout

```
┌─────────────────────────────────────────────────────────────┐
│ Quest: Retrieve the Orb of Storms                          │
├─────────────────────────────────────┬───────────────────────┤
│                                     │ Thunder Warden        │
│                                     │ HP: 100/100           │
│         DUNGEON VIEW                │                       │
│         (Canvas)                    │ Abilities:            │
│                                     │ • Chain Lightning     │
│                                     │ • Thunder Strike      │
│                                     │ • Storm Armor         │
│                                     ├───────────────────────┤
│                                     │ [Interaction Target]  │
│                                     │ Rusted iron chest     │
├─────────────────────────────────────┴───────────────────────┤
│ > examine chest                                             │
│ The chest is bound with corroded chains. It appears locked. │
│ > _                                                         │
└─────────────────────────────────────────────────────────────┘
```

---

## 12. Controls

| Key | Action |
|-----|--------|
| Arrow Keys / WASD | Move player + set facing direction |
| E / Enter | Open interaction prompt |
| Escape | Close interaction prompt |

---

## 13. Debug Overlay

For development, a debug overlay displays:

- Entity states (latent/collapsing/collapsed counts)
- Horizon queue status (pending, in-flight, completed)
- Constraint graph for current room
- LLM call latency (last/avg/max)
- Event log tail (last 10 events)

Toggle with `~` key.

---

## 14. Town & Rumor System

### 14.1 Philosophy: Rumors are Latent Dungeons

In SSR, a "Rumor" is not just flavor text. It is a **Latent Dungeon Seed**. Gaining a rumor means acquiring a set of **Hard Constraints** that will be passed to the Dungeon Generator.

`Rumor = { Theme, QuestType, Difficulty, KeyEntities, MutationTags }`

### 14.2 Town Loop

The game loop expands:
`Character Gen` -> `Town Hub` <-> `NPC Interaction` -> `Rumor Discovery` -> `Dungeon Generation` -> `Town Hub`.

**Town Hub UI**:
- **Menu-based**: static background with buttons for "Tavern", "Shop", "Gate".
- **Locations**:
  - **Tavern**: Rest (restore resources), Gather Rumors (Talk to NPCs).
  - **Shop**: Buy/Sell items.
  - **Gate**: Select a discovered Rumor to "Embark" (Start Dungeon).

### 14.3 NPC Generation (JIT)

NPCs in the tavern/shop are generated JIT based on the location's current atmosphere.

**Schema**:
```typescript
interface NPC {
  id: string;
  name: string;
  archetype: string; // e.g. "Grumpy Barkeep", "Scarred Mercenary"
  knowledge: Rumor[]; // Latent rumors they satisfy
  personality: string;
}
```

### 14.4 Conversation & Rumor Discovery

Interaction is a chat interface. The LLM acts as the NPC.
**Constraint Discovery**:
- Hidden State: The LLM instructions include "You know about a [Specific Rumor Context]".
- Trigger: If the player asks the right questions, the LLM outputs a special `RUMOR_REVEALED` tag.
- Result: The system captures the semantic tags and creates a "Rumor Card" in the player's journal.

**Rumor Schema**:
```typescript
interface Rumor {
  id: string;
  title: string; // e.g. "The Whispering Mines"
  description: string;
  constraints: string[]; // e.g. ["theme:mines", "enemy:spiders", "reward:gemstones"]
  difficulty: 'easy' | 'medium' | 'hard';
}
```

### 14.5 Shop System

- **Inventory**: JIT generated listing based on town level/theme.
- **Economy**: Gold earned in dungeons.

