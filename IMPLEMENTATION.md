# SSR Demo Implementation Plan

> **Strategy**: Prove SSR incrementally. Start with **Class Generation** (simpler, isolated system) to validate the LLM solver pipeline, then expand to **Dungeon Generation** (complex, interconnected system).

---

## Phase 0: Project Foundation

**Goal**: Establish the development environment and core infrastructure.

### Tasks

1. **Initialize Vite + TypeScript project**
   - Location: `/demo/semantic-dungeon/`
   - Configure strict TypeScript, ESLint, Prettier

2. **Create core type definitions** (`src/types.ts`)
   - Entity, EntityState, Constraint
   - Component interfaces (placeholder, expand as needed)
   - Event types for event sourcing

3. **Implement Ollama client** (`src/solver/OllamaSolver.ts`)
   - HTTP client for `http://192.168.87.121:11434`
   - Model: `qwen2.5:7b`
   - JSON mode for structured output
   - Timeout handling
   - Retry logic (configurable attempts)

4. **Implement basic Event Log** (`src/engine/EventLog.ts`)
   - Append-only event store
   - Event replay capability (for debugging)

### Exit Criteria

- [ ] `npm run dev` starts without errors
- [ ] Ollama client successfully queries LLM and receives JSON response
- [ ] Events can be recorded and replayed

---

## Phase 1: Class Generation (Fractal SSR Proof)

**Goal**: Prove fractal constraint inheritance works. Player describes a class → LLM proposes names → player selects → LLM proposes abilities → LLM collapses ability properties.

### Why First?

- **Isolated system**: No spatial relationships, no rendering complexity
- **Validates core SSR loop**: Request → Propose → Validate → Commit
- **Visible proof**: Player sees meaningful, coherent output immediately
- **Fast iteration**: No game loop, no canvas, just forms and text

### Tasks

#### 1.1 Class Name Collapse

- **Input**: Player's free-text description (e.g., "A warrior who controls lightning")
- **Process**:
  1. Extract semantic tags from description
  2. Send to LLM with `COLLAPSE_CLASS_NAMES` task
  3. Validate response (3 names, strings, non-empty)
  4. Commit `CollapseCommitted` event
- **Output**: 3 suggested class names

#### 1.2 Ability Collapse

- **Input**: Selected class name + inherited constraints
- **Process**:
  1. Build context with class name, inherited tags
  2. Send to LLM with `COLLAPSE_ABILITIES` task
  3. Validate response (3 abilities with names and categories)
  4. Commit event
- **Output**: 3 abilities with categories

#### 1.3 Ability Property Collapse

- **Input**: Ability name + class context + inherited constraints
- **Process**:
  1. Build context with ability, class, constraints
  2. Send to LLM with `COLLAPSE_ABILITY_PROPERTIES` task
  3. Validate response (properties from whitelist, numeric values in range)
  4. Commit event
- **Output**: Property dictionary for each ability

#### 1.4 UI for Class Generation

- Simple HTML form:
  - Text input for class description
  - Button to generate names
  - Radio buttons to select name
  - Display abilities
  - Display ability properties
- No Canvas required

### Exit Criteria

- [ ] Full flow works: description → names → abilities → properties
- [ ] Each step commits events to Event Log
- [ ] Constraint inheritance is visible (lightning class → lightning abilities)
- [ ] Invalid LLM responses are caught and retried
- [ ] User can complete class generation without errors

---

## Phase 2: Core SSR Engine

**Goal**: Build the reusable engine components needed for dungeon generation.

### Tasks

#### 2.1 Entity Store (`src/engine/EntityStore.ts`)

- Create/read/update entities
- Track entity state (latent/collapsing/collapsed)
- Query entities by state, location, type

#### 2.2 Constraint Store (`src/engine/ConstraintStore.ts`)

- Store constraints per entity
- Support hard/soft constraint types
- Prune soft constraints below strength threshold
- Query constraints for entity

#### 2.3 SSR Engine (`src/engine/SSREngine.ts`)

- Orchestrate collapse flow:
  1. Build request (context, constraints, whitelist)
  2. Call solver (OllamaSolver)
  3. Validate response (schema, whitelist, ranges)
  4. Commit event (EventLog)
  5. Update entity state (EntityStore)
  6. Propagate constraints to neighbors (ConstraintStore)

#### 2.4 WFC Fallback (`src/solver/WFCFallback.ts`)

- Traditional WFC implementation
- Pre-defined adjacency rules
- Deterministic selection via hash
- Used when LLM fails after retries

### Exit Criteria

- [ ] Entities can transition through state machine
- [ ] Constraints propagate correctly
- [ ] Engine correctly orchestrates collapse
- [ ] Fallback produces valid output when LLM fails

---

## Phase 3: Dungeon Layout (BSP + Rendering)

**Goal**: Generate and render a navigable dungeon with rooms connected by doors.

### Tasks

#### 3.1 BSP Generator (`src/dungeon/BSPGenerator.ts`)

- Recursively partition dungeon space
- Create room bounds in each leaf node
- Connect adjacent rooms with doors
- Output: List of latent room entities with dimensions and neighbors

#### 3.2 Grid Renderer (`src/render/GridRenderer.ts`)

- Canvas 2D rendering
- Draw rooms (floor tiles)
- Draw walls (room boundaries)
- Draw doors (connections)
- Draw player position

#### 3.3 Room Entity (`src/dungeon/RoomEntity.ts`)

- Room as SSR entity
- Latent: only position, dimensions, neighbors
- Collapsed: type, theme, description, objects, monsters

#### 3.4 Basic Navigation

- Player starts in entrance room
- Arrow keys move player
- Player cannot walk through walls
- Can walk through doors to connected rooms

### Exit Criteria

- [ ] BSP generates valid dungeon layout
- [ ] Dungeon renders correctly on canvas
- [ ] Player can navigate between rooms via doors
- [ ] All rooms start as latent entities

---

## Phase 4: Horizon Lookahead (+2 Async)

**Goal**: Pre-collapse rooms at depth ≤ 2 from player to hide LLM latency.

### Tasks

#### 4.1 Horizon Queue (`src/engine/HorizonQueue.ts`)

- Track player position
- Calculate rooms at depth 0, 1, 2
- Prioritize by depth (lower = higher priority)
- Rate limit concurrent LLM calls (max 2)

#### 4.2 Async Collapse Worker

- Background worker processes queue
- Calls SSREngine.collapse() for each entity
- Updates entity state on completion

#### 4.3 Pause-and-Wait

- When player enters room that is:
  - **Collapsed**: Proceed normally
  - **Collapsing**: Pause game, show loading indicator, wait
  - **Latent**: Add to queue with high priority, pause, wait
- Resume when collapse completes

### Exit Criteria

- [ ] Rooms pre-collapse as player approaches
- [ ] Normal movement speed never triggers pause
- [ ] Fast movement correctly pauses and waits
- [ ] Debug overlay shows queue status

---

## Phase 5: Room Semantic Collapse

**Goal**: LLM determines room type, theme, objects, and monsters based on quest + neighbor constraints.

### Tasks

#### 5.1 Quest Generation

- Generate quest at dungeon start
- Quest provides hard constraints for rooms
- Quest types: retrieve_artifact, rescue_captive, defeat_boss, etc.

#### 5.2 Room Collapse Schema

- Implement `COLLAPSE_ROOM` solver request
- Include: quest context, neighbor states, constraints
- Whitelist: room_types, themes

#### 5.3 Constraint Propagation

- When room collapses, inject constraints to neighbors
- Example: "damp" room → neighbors get "adjacent_water" soft constraint

#### 5.4 Object/Monster Generation

- Room collapse includes object and monster lists
- Objects and monsters created as latent entities
- Positioned within room bounds

### Exit Criteria

- [ ] Rooms collapse with coherent themes
- [ ] Quest constraints influence room types
- [ ] Neighbor constraints propagate correctly
- [ ] Objects and monsters spawn in rooms

---

## Phase 6: Object Interaction

**Goal**: Player can inspect and interact with objects. Objects collapse progressively.

### Tasks

#### 6.1 Interaction System (`src/player/InteractionSystem.ts`)

- Calculate interaction tile (direction player is facing)
- Identify entity at tile
- Handle interaction input

#### 6.2 Progressive Object Collapse

- **Inspect**: Collapse visual description
- **Interact**: Parse player input, LLM interprets action, collapse result

#### 6.3 Interaction Validation

- Whitelist of valid actions
- LLM proposes action from whitelist
- Engine validates before committing

#### 6.4 Wall/Floor Inspection

- Walls and floors can be inspected
- LLM generates contextual descriptions

### Exit Criteria

- [ ] Player can inspect objects, walls, floors
- [ ] Objects collapse progressively
- [ ] Free-form input correctly interpreted
- [ ] Invalid actions rejected

---

## Phase 7: Polish & Integration

**Goal**: Complete the demo with UI, debug tools, and final integration.

### Tasks

#### 7.1 Full UI Layout

- Quest display
- Player stats and class
- Interaction log
- Interaction prompt

#### 7.2 Debug Overlay

- Entity state counts
- Horizon queue status
- Constraint graph visualization
- LLM latency metrics
- Event log tail

#### 7.3 Class → Dungeon Integration

- Class generation happens before dungeon entry
- Player class available during dungeon
- (Combat out of scope for MVP)

#### 7.4 Error Handling & Edge Cases

- Network failures
- LLM timeouts
- Invalid responses after all retries
- Fallback to WFC gracefully

### Exit Criteria

- [ ] Complete flow: describe class → enter dungeon → explore → interact
- [ ] Debug overlay functional
- [ ] Graceful error handling
- [ ] Demo is presentable

---

## Implementation Order Summary

| Phase | Focus | Key Deliverable |
|-------|-------|-----------------|
| 0 | Foundation | Working project + Ollama client |
| 1 | Class Generation | Full fractal collapse flow |
| 2 | Core Engine | Reusable SSR components |
| 3 | Dungeon Layout | BSP + Rendering + Navigation |
| 4 | Horizon Lookahead | Latency hiding with +2 async |
| 5 | Room Collapse | Semantic rooms with propagation |
| 6 | Object Interaction | Progressive collapse + free-form input |
| 7 | Polish | UI + Debug + Integration |

---

## Milestones

### Milestone 1: "SSR Works" (Phase 0-1)
> Player describes a class, LLM generates coherent names/abilities/properties with visible constraint inheritance.

### Milestone 2: "Dungeon Exists" (Phase 2-3)
> Navigable BSP dungeon renders, rooms are latent entities.

### Milestone 3: "Latency Hidden" (Phase 4)
> Horizon +2 pre-collapses rooms, player never waits during normal play.

### Milestone 4: "Semantic Dungeon" (Phase 5)
> Rooms have coherent themes based on quest and neighbors.

### Milestone 5: "Interactive World" (Phase 6)
> Objects collapse progressively, player can interact with anything.

### Milestone 6: "Demo Complete" (Phase 7)
> Polished, presentable proof of SSR.
