# Semantic State Resolution (SSR)

## Architectural Standard for Just-In-Time Procedural Reality

**Author:** Patrick Richardson  
**Date:** December 19, 2025  
**Status:** Architectural Standard v1.0  
**License:** MIT

## 0. Component Framing

- This repository/component documents Semantic State Resolution (SSR), an architectural component used by the main RPG project.
- SSR is not the whole project and does not own the main project's definition of done.
- SSR is the concept described here. The RPG engine, 2014 D&D 5e SRD / SRD 5.1 ruleset, LAN validation UI, HTTP API, and TypeScript implementation are one planned demonstrator, not requirements of SSR itself.
- `SPEC.md` and `IMPLEMENTATION.md` describe that demonstrator. They are supporting, non-normative documents and do not redefine the concept in this README.
- When checked out inside the main project, root-level acceptance criteria live at `../DEFINITION_OF_DONE.md`.
- SSR supports canonical state, event-sourced persistence, progressive facet resolution, constraint/provenance tracking, and no-retcon behavior.
- Symbolic game logic remains the final authority for hard mechanics; the LLM proposes and interprets but does not directly mutate canonical state.

## 1. Executive Summary

This component documents Semantic State Resolution (SSR), an architecture for progressively resolving latent world state without allowing generated content to silently contradict prior commitments. The planned reference demonstrator is a backend-first, 2014 D&D 5e SRD-compatible role-playing engine with no-retcon state and deterministic replay.

Traditional game engines treat Narrative (Flavor Text, Visuals) and Systems (Stats, Mechanics) as separate domains. This separation leads to Ludonarrative Dissonance, where a sword described as "cursed" behaves identically to a standard iron blade.

Semantic State Resolution (SSR) is a unified architecture that resolves this issue by treating narrative and mechanics as two views of the same canonical state, revealed progressively through observation.

Unlike pure generative AI, SSR does not grant the Large Language Model (LLM) authority over the game state. The LLM is a DM-like proposer/interpreter that generates prose mechanics, NPC responses, and candidate entities/content under schema constraints.
The symbolic engine performs authoritative validation and commits hard mechanics in alignment with SRD constraints.

This architecture is no-retcon: every state-bearing adjudication, observation result, time advance, or system action commits to the event log and canonical projection before the corresponding player-facing assertion is returned.

The reference demonstrator includes a LAN-reachable validation UI for exercising the engine and inspecting projections; that UI remains a non-authoritative client.

## 2. Problem Statement: The Three Traps

Current procedural architectures suffer from three specific disconnects that prevent true immersion. SSR is explicitly designed to solve these architectural failures.

### 2.1 The Semantic Gap (The "Math vs. Meaning" Trap)

Standard procedural algorithms, such as Perlin Noise or RNG loot tables, are semantically blind.

**The Failure:** A generic "Level 5 Loot Table" drops items that mathematically fit the player's level but thematically contradict the context.

**Example:** A Fire Elemental drops a "Frost Wand" simply because the RNG rolled a valid ID, breaking immersion.

### 2.2 The Hallucination Trap (The "Dream Logic" Flaw)

Pure Generative AI lacks state rigidity. Without a canonical anchor, LLMs suffer from object impermanence.

**The Failure:** An NPC described as "mortally wounded" in Turn 1 might appear "perfectly healthy" in Turn 2 because the model context window shifted or the model hallucinated a repair.

**Result:** The world feels like a dream: fluid and reacting to the immediate prompt, but lacking causal history.

### 2.3 The Latency Trap (Static Fidelity)

To ensure coherence, traditional games must pre-simulate the entire world (e.g., Dwarf Fortress) or fully instantiate objects upon creation.

**The Failure:** The game must store the exact stats of a sword the moment it drops, even if the player never picks it up. This wastes resources on unobserved reality and prevents the world from reacting dynamically to player actions.

**Result:** High CPU/Memory overhead for low-interaction fidelity.

## 3. Core Definitions & Invariants

### 3.1 Core Terms

**Latent Entity (Superposition):**  
An entity whose modeled resolution facets are all unresolved. It exists only as an opaque handle (ID), constraints, and provenance; it has no committed components yet.

**Observation:**  
The event where a Player or System queries an unresolved property or component of an entity, triggering the resolution loop for only the information required by that query.

**Resolution Facet:** A property, component, or deliberately grouped set of properties that can be resolved and committed independently. Resolution is facet-scoped: an entity may contain both committed and unresolved facets at the same time. Resolving an item's appearance, for example, does not automatically resolve its statistics.

**Ontic Fact:** A committed fact about the world itself. Ontic facts participate in canonical consistency checks and may change only through later recorded events that represent an allowed cause.

**Epistemic Claim:** A committed record of what an observer said, perceived, inferred, or believes. Recording an epistemic claim makes the claim's existence canonical; it does not automatically make its subject an ontic fact.

**State-Bearing Narration:** Player-facing prose whose later contradiction would constitute a retcon. Such prose must be derived from already committed state or validated and committed before delivery. Purely stylistic wording may remain noncanonical only when it introduces no persistent fact, affordance, or mechanical implication.

**Observation Scope:**

![Observation Scope](assets/ssr_observation_scope.png)

Defined strictly by the Interaction Horizon:
- **Visual Horizon:** Camera Frustum + Buffer
- **Logical Horizon:** Graph Distance (e.g., Depth 2 neighbors)

The Interaction Horizon determines what may trigger resolution. It does not override disclosure rules: a player-facing projection may reveal only the committed information that the querying observer is authorized and positioned to receive.

**Canonical State:**  
A Materialized View (Projection) derived from the Event Log. It is the authoritative current-state view used for queries and adjudication; the Event Log remains the authoritative historical record from which that view is rebuilt.

### 3.2 Entity State Machine

The following diagram illustrates the lifecycle applied independently to a resolution facet. An entity is **latent** when all relevant facets are unresolved, **partially resolved** when it contains both committed and unresolved facets, and **resolved for a given scope** when every facet required by that scope is committed. The diagram's canonical state is therefore facet-level, not a claim that the entire entity must collapse at once.

![Entity State Machine](assets/ssr_entity_state_machine.png)

### 3.3 The "No-Retcon" Invariant

**Invariant:** Once a facet resolves, its realized value becomes canonical and may only change through a recorded Delta caused by an authorized simulation, rules, or player action. A Delta records a new state transition; it does not erase or rewrite the earlier commitment. The semantic model may propose, but the engine validates and commits. Unresolved facets remain latent, defined by constraints and provenance.

### 3.4 Explicit Semantic Commitments

The following rules are part of SSR itself rather than implementation details:

1. **Least commitment:** Resolve only the facets required by an observation or adjudication. Unresolved facets remain constrained possibilities.
2. **Progressive consistency:** Every newly resolved facet must be compatible with prior committed facets, active hard constraints, and the authoritative rules of the host system.
3. **Typed claims:** World facts, observations, beliefs, utterances, rumors, and narration are not interchangeable. Promotion from an epistemic claim to an ontic constraint must be an explicit, validated, recorded operation.
4. **Grounded output:** A proposer may suggest facts and wording, but it cannot make a state-bearing assertion canonical merely by saying it. Validation and commit precede authoritative player-facing output.
5. **Recorded change:** No-retcon does not mean that the world is frozen. A committed fact may be superseded by a later committed state transition with an allowed in-world or mechanical cause; the earlier event remains part of history.
6. **Replay boundary:** Authoritative replay folds committed events into projections. It does not ask the LLM to regenerate accepted proposals or prose and then treat a potentially different answer as history.

## 4. Architecture & Data Contracts

### 4.1 System Architecture

![System Architecture](assets/ssr_system_architecture.png)

The Engine acts as a Mediator to enforce the Strategy and Event Sourcing patterns.

### 4.2 The Constraint Store (The Constraint Graph)

Instead of a "random seed," unvisited worlds are defined by a Constraint Graph.

#### 4.2.1 Constraint Record

Each constraint is stored as a record:

```json
{ "key": "...", "value": "...", "strength": 0.5, "type": "hard|soft", "source_event_id": "...", "ttl": 10 }
```

**Pruning Policy:**
- **Soft constraints** are dropped when strength < Strength_Threshold (default 0.15) or when ttl expires.
- **Hard constraints** persist unless explicitly terminated by ConstraintObsoleted or ConstraintContradicted.

**Constraint Semantics:**
- Active hard constraints are obligations: a candidate cannot commit unless it satisfies them and all higher-priority canonical facts.
- Soft constraints guide selection among otherwise valid candidates and may be weakened, expired, or discarded. Their strength never permits a hard-constraint or canonical-state violation.
- Propagation constrains only unresolved facets. It cannot silently alter a facet that has already been committed.
- A constraint always retains its source and status so the engine can distinguish a valid obligation, an obsolete assumption, and a known false claim.

### 4.3 The Solver Interface (The Contract)

The boundary between the Game Engine and the LLM is strict.

1. **Engine Request:** Sends Context + Constraints + Schema + Allowed IDs (Whitelist).
2. **LLM Proposal:** Returns structured JSON (Proposals).
3. **Engine Validation:** Checks schema, ranges, and game rules.
4. **Commit:** Validated data is written to the Event Log.

The proposer generates candidates; it does not decide that its own candidate is satisfiable. The authoritative engine makes that decision using the host rules and active constraints. SSR requires this authority boundary but does not prescribe a particular constraint-solving algorithm.

#### 4.3.1 Deterministic Fallback Protocol

If the LLM fails to produce a valid proposal within N retries, the system executes a Deterministic Fallback:

**Selection Mechanism:** `Index = Hash(Entity_ID + Hard_Constraints + Ruleset_Version) % Safety_Table_Size`

**Invariant:** The game loop must never block or crash due to Solver failure.

### 4.4 Persistence Model (Event Sourcing)

SSR relies on Event Sourcing for replayability and consistency. The Event Log is the Source of Truth; the Game World is merely its current projection.

#### 4.4.1 Event Schema

**ResolutionCommitted:** Writes one or more newly resolved facets without replacing previously committed facets.
- Payload: `{ resolved_facets: [ ... ], components: { ... }, frozen_stats: { ... }, tags: [ ... ] }`

**DeltaApplied:** Writes patch operations (add/remove/set).
- Payload: `{ op: "set", path: "/components/Inventory/slots/main/durability", value: 12 }`

### 4.5 Architectural Pattern Mapping

SSR is a composite architecture built on standard software engineering patterns. This mapping ensures the system is maintainable and testable.

- **Least commitment / progressive resolution:** Defers unspecified facets until an observation or adjudication requires them.
- **Proposal-validation boundary:** Separates creative candidate generation from authoritative acceptance.
- **Constraint propagation:** Carries earlier commitments forward as obligations on unresolved state.
- **Event sourcing:** Preserves the sequence of accepted commitments and causal changes.
- **Materialized projection:** Provides the authoritative current-state view derived from those events.

Event sourcing supplies traceability and replay, but does not create no-retcon behavior by itself. No-retcon follows from the additional rule that previously committed facts cannot be replaced except through an authorized, recorded state transition.

## 5. The SSR Lifecycle (The Loop)

The following sequence details the flow of data from Observation to Propagation, highlighting the strict separation between the Proposer (LLM) and the Truth (Event Log).

![SSR Lifecycle](assets/ssr_lifecycle.png)

**Phase 1: Superposition (Latent State)**
- The world contains Entity_ID_104.
- State: Latent
- Constraints: `{ Neighbor: "Industrial_Zone", Global_Event: "Acid_Rain" }`

**Phase 2: Observation (Trigger)**
- The player enters the sector containing Entity_ID_104.

**Phase 3: Proposal (Semantic Solving)**
- Engine query: "Propose a sector compatible with Industrial/Acid Rain context."
- LLM output: `{ Type: "Chemical_Runoff_Plant", Hazards: ["Corrosive_Puddles"] }`

**Phase 4: Validation & Resolution**
- Engine validates output against ruleset + whitelists.
- Commit: ResolutionCommitted event written for the requested facets
- Materialize: Entity_ID_104 projected as a Chemical Runoff Plant for those facets; unrelated facets may remain unresolved

**Phase 5: Propagation (Constraint Injection)**
- Engine injects constraints into neighbors via events.
- Action: Injects ConstraintInjected event for Entity_ID_105.
- Constraint: `Ground_Water: Contaminated`

**Note on Latency & Future Proofing**

The SSR invariants do not depend on a particular inference speed. A host may use Lookahead Buffers (resolving Depth+1 while the player is at Depth 0) to mask some LLM inference time. This does not make an implementation latency-free: observed responsiveness still depends on model, validation, persistence, workload, and buffer behavior. As inference costs decrease, the buffer size may decrease while the architectural invariants remain identical.

## 6. Conflict Resolution & Precedence

![Conflict Resolution](assets/ssr_conflict_resolution.png)

When generating new content, constraints may conflict. The Solver follows this precedence hierarchy:

1. **Canonical State (Highest):** If a neighbor is already resolved, its reality is absolute.
2. **Hard Constraints:** Quest requirements or previous Propagation tags.
3. **Soft Constraints:** General themes.
4. **LLM Generation (Lowest):** The model's "creative filler."

**Conflict Policy:** If a Hard Constraint violates Canonical State, the system marks the Constraint as "Obsolete" or "False Rumor" rather than altering the map (Retconning).

## 7. Application Domains (Unified)

### 7.1 Progressive Mechanical Resolution (Loot)

1. **Drop:** Entity is Latent. Constraint: `Origin: Swamp_Beast`.
2. **Inspect:** Resolve Visuals. Result: "Slime-coated Blade." (Tags: Toxic, Crude).
3. **Equip:** Resolve Stats.

After inspection and before equipment, the item is partially resolved: its committed visual facet constrains its still-latent mechanical facet. The later statistics must be compatible with the already committed description and tags.

#### 7.1.1 The Translation Layer (Tag-to-Math)

The LLM is a Selector, not a Calculator. It generates Semantic Tags which map to Game Math via a Translation Table.

- **Tag Canonicalization:** The LLM may only output tags from a provided whitelist.
- **No-Retcon Fix (Balance Patches):** Numeric baseline stats are frozen when the mechanical facet resolves. Resolving a visual facet alone does not freeze statistics that remain latent.

**The Maintenance Trade-off:** This approach deliberately trades Runtime Chaos for Design-Time Structure. Maintaining the Translation Table requires defining valid mappings for all tags. This front-loaded effort bounds high-variance AI outputs to mechanics explicitly represented by the table and validators; it does not by itself prove global balance or the absence of implementation bugs.

### 7.2 Reverse Propagation (Cognition)

1. **Dialogue:** NPC generates the utterance: "The sewers are flooded."
2. **Claim Commit:** The Engine records that the NPC made this claim. At this point, the speech act is canonical; the sewer's flooded state is not automatically canonical.
3. **Validated Promotion:** Because the sewer's relevant facets are unresolved and the host's propagation policy accepts the claim, the Engine explicitly promotes its content into the hard constraint `State: Flooded`, retaining the utterance as provenance.
4. **Result:** When the player eventually reaches the sewers, the map generator must generate water obstacles to satisfy the promoted constraint.

If the sewers had already been canonically established as dry, the utterance could remain a lie, mistake, outdated belief, or false rumor. It could not overwrite the committed sewer state merely because an NPC said it.

## 8. Conclusion

SSR is not merely "LLMs writing text." It is a rigorous system architecture where:

- **Latent Facets** defer work and storage for details that have not yet been required.
- **Event Sourcing** ensures deterministic replay and traceability.
- **Canonical Projections** prevent "dream logic."
- **Validation Layers** enforce the schemas, constraints, and invariants that the host has actually encoded.

This standard provides a blueprint for open-ended worlds that preserve coherence within their encoded rules, constraints, and committed facts while respecting player agency and logical cause-and-effect.

## 9. Appendix: Reference Data Contracts

To illustrate implementation, the following JSON message shapes show one possible communication protocol between the Engine and the Semantic Solver. They are examples, not normative JSON Schema definitions. Implementations may use different fields or formats while preserving SSR's authority, validation, commitment, provenance, and replay invariants.

### 9.1 Solver Request (Engine -> LLM)

```json
{
  "request_id": "req_8821a",
  "task_type": "RESOLVE_ZONE",
  "context": {
    "entity_id": "grid_4_5",
    "global_state": { "weather": "acid_rain", "alert": "high" },
    "neighbors": {
      "north": { "id": "grid_4_4", "tags": ["industrial", "power_plant"] },
      "west": { "id": "grid_3_5", "tags": ["slums"] }
    }
  },
  "constraints": {
    "hard": ["must_have_power_access"],
    "soft": ["vibe_decay", "high_crime"]
  },
  "whitelist": {
    "zone_ids": ["factory", "warehouse", "checkpoint", "clinic"],
    "hazard_ids": ["radiation", "toxin", "fire"]
  }
}
```

### 9.2 Solver Proposal (LLM -> Engine)

```json
{
  "request_id": "req_8821a",
  "proposal": {
    "zone_id": "checkpoint",
    "visual_description": "A rusted security gate checking for contamination.",
    "hazards": ["toxin"],
    "tags": ["military", "decay"],
    "reasoning": "Checkpoint fits between Slums and Power Plant; decay fits weather."
  }
}
```

### 9.3 Validator Response (Engine Internal)

```json
{
  "status": "PASS",
  "validated_payload": {
    "zone_id": "checkpoint",
    "components": {
      "Zone": "checkpoint",
      "HazardVolume": "toxin",
      "Visuals": { "skybox": "acid_green", "props": ["barricade"] }
    }
  }
}
```
