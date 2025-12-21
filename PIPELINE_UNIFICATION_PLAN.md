# Pipeline Unification Plan

## 1. System Map

The current architecture flows from User Input to Game Logic through the following stages:

```mermaid
flowchart TD
    %% Layers
    subgraph InputLayer [Input Layer]
        PC[PlayerController] -->|Keyboard| Main[main.ts]
        Mouse[Canvas Click] -.->|Unknown| Main
    end

    subgraph UILayer [UI Layer]
        Main -->|handleInspection| Modal[InspectionModal]
        Modal -->|User Clicks Option| Logic[TileCollapser]
    end

    subgraph ExecutionLayer [Execution Layer - THE MESS]
        Logic -->|Interact| Router{Is Object?}
        
        %% Object Fork
        Router -- Yes --> ObjPath[Object Pipeline]
        ObjPath --> Arbiter1[ActionArbiter]
        Arbiter1 --> ObjSim[ObjectCollapser]
        ObjSim --> Manual1[Manual Result Construction]
        
        %% Tile Fork
        Router -- No --> TilePath[Tile Pipeline]
        TilePath --> Arbiter2[ActionArbiter]
        Arbiter2 --> TileSim[TileCollapser]
        TileSim --> Manual2[Manual Result Construction]
    end

    subgraph DataLayer [Data Layer]
        ObjSim --> EventLog
        TileSim --> EventLog
    end
    
    %% The Violation
    Manual1 -.->|Inconsistent| Result[InspectionResult]
    Manual2 -.->|Duplicated| Result
    
    style ExecutionLayer fill:#ffeeee,stroke:#f00
    style Manual1 fill:#f9f,stroke:#333
    style Manual2 fill:#f9f,stroke:#333
```

## 2. Identified Violations

### A. The "Execution Fork" (Critical)
**Location**: `src/entities/TileCollapser.ts`
**Severity**: High
**Description**: The `interactWithTile` function acts as a Manual Router that forks logic based on whether the target is an Object or a Tile.
- **Violation**: DRY (Don't Repeat Yourself). The logic for Arbitration, Skill Checks, and Result Parsing is duplicated.
- **Consequence**: Bug proliferation (e.g., the recent "duplicate skill check text" bug happened because we fixed one path and ignored the other).
- **Evidence**: `collapseObjectContents` returns a different shape than `interactWithTileType`, forcing `TileCollapser` to manually reshape both into `InspectionResult`.

### B. Input Wiring Opacity (Minor)
**Location**: `src/main.ts`
**Severity**: Low
**Description**: While Keyboard input is clearly handled by `PlayerController`, the Mouse input mechanism is implicit (likely handled by `DungeonRenderer` or raw event listeners not immediately visible in `main.ts`).
- **Consequence**: Difficulty tracking "Click-to-Move" vs "Click-to-Inspect" logic.

### C. Logic Leaking (Moderate)
**Location**: `src/entities/ObjectCollapser.ts`
**Severity**: Medium
**Description**: The `ObjectCollapser` handles some logic that belongs in `ActionArbiter` (e.g., deciding if an object is destroyed).
- **Violation**: Separation of Concerns. The "Physics/Logic" of destruction should be distinct from the "Semantic" description of it.

## 3. Unification Strategy

We will focus on fixing **Violation A (The Execution Fork)** immediately as it poses the highest risk to stability.

### Pattern: The "Result Builder"
We will unify the pipelines by extracting the **Termination Step** (Result Construction) into a shared helper function.

#### Step 1: Standardize Internal Returns
Ensure `collapseObjectContents` and `interactWithTileType` return a compatible `InteractionResponse` interface (Message + Items + Outcome).

#### Step 2: Extract `buildInteractionResult`
Create a helper function `buildInteractionResult` that takes the raw outputs and constructs the final `InspectionResult`. This ensures that fields like `mechanics` are handled identically.

#### Step 3: Refactor `interactWithTile`
Refactor the main controller to:
1.  **Detect Context**: (Object vs Tile).
2.  **Run Simulation**: Call the specific Collapser.
3.  **Unify Output**: Pass the result to `buildInteractionResult`.

### Refactoring Roadmap

#### Phase 1: Preparation (Safe)
- [ ] Create `buildInteractionResult` helper function (pure function).
- [ ] Define shared `SimulatedInteraction` interface.

#### Phase 2: Object Path Migration (Low Risk)
- [ ] Refactor `interactWithTile` Object block to use `buildInteractionResult`.
- [ ] Verify functionality (Interact with "Crude Food Carvings").

#### Phase 3: Tile Path Migration (Medium Risk)
- [ ] Refactor `interactWithTile` Tile block to use `buildInteractionResult`.
- [ ] Verify functionality (Interact with "Stone Archway").

#### Phase 4: Cleanup
- [ ] Remove dead code (manual result construction blocks).
