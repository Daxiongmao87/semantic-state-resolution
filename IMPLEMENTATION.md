# SSR RPG Demonstrator Implementation Plan

## Document Status

This is a non-normative implementation plan for the RPG demonstrator described in `SPEC.md`. It is not the definition of SSR. `README.md` defines the concept and its invariants; the technology, ruleset, API, UI, and phase ordering below are choices for validating that concept in one host application.

## Objective

Build a backend-authoritative D&D SRD 5.1 RPG engine with SRD-correct mechanics and SSR content collapse, then attach a LAN validation UI as a non-authoritative client.

## Phase 0: Engine Substrate

### Goal

Establish a strict TypeScript backend scaffold with API, module boundaries, and replay-safe persistence primitives.

### Key work

1. Create canonical engine modules for state, constraints, events, and solver contracts.
2. Define strict TypeScript types for:
   - canonical entities
   - per-facet latent/proposing/committed lifecycle and aggregate partial-resolution state
   - canonical scope identity and rebaseline provenance
   - noncanonical working material that cannot appear in canonical projections without validation and commit
   - ontic facts and epistemic claims such as observations, beliefs, utterances, and rumors
   - event envelopes
   - intent, proposal, and separately authorized authoring-command schemas
3. Add deterministic seeded utilities for dice, random selection, and timestamps for testability.
4. Stand up a minimal HTTP API surface for:
   - session creation
   - intent submission
   - observation/query
   - projection fetch
   - time advance and replay
5. Keep rendering and UI modules out of the engine boundary.

### Exit criteria

- API compiles and returns typed validation errors for invalid requests.
- Engine modules are isolated from any UI assumptions.
- Baseline session lifecycle is reproducible via seed and session id.

## Phase 1: SRD Mechanics Kernel (Hard-Rules Authority)

### Goal

Make symbolic logic the single source of truth for mechanical resolution.

### Key work

1. Implement deterministic routines for checks, saves, attack rolls, AC, HP/damage/healing, conditions, movement, rests, action economy, spells, inventory/equipment interactions, encounter state, and time.
2. Model each mechanic outcome as event mutations, not direct mutations.
3. Build rule validators that reject:
   - out-of-range values
   - contradictory outcomes
   - illegal action ordering
4. Expose a decision trace format for reproducibility.

### Exit criteria

- Every mechanical action route produces events and a projection update only through the mechanics kernel.
- Unit checks for core SRD formulas pass with deterministic fixtures.
- Invalid mechanic proposals are rejected with structured rejection reasons.

## Phase 2: Event Sourcing and Persistence

### Goal

Guarantee replayability and no-retcon continuity.

### Key work

1. Implement append-only event log schema and writer.
2. Implement projection builder that folds events from one selected canonical scope into canonical session state.
3. Implement snapshot + replay CLI/API for load and verification.
4. Ensure every accepted state-bearing intent, observation, time advance, and system action writes its resulting events before the corresponding response.
5. Add audit tables/markers for collapse provenance and rejection reasons.

### Exit criteria

- A replay from event log recreates equivalent canonical state.
- No state-bearing user-facing assertion without prior event commit.
- Event stream supports deterministic rehydration in tests and UI inspection tools.
- Replay uses recorded accepted results and does not re-run LLM inference as a source of historical truth.
- A canonical scope cannot mutate the event history or projection semantics of another scope.

## Phase 3: SSR Resolution Engine

### Goal

Resolve latent content through constrained proposal + validation loops.

### Key work

1. Implement an SSR orchestrator:
   - build constraints from contextually related state across the relation dimensions relevant to the host and current request
   - identify the unresolved facets required by the current observation or adjudication
   - include relevant noncanonical working material only as candidates or soft constraints
   - request a proposal for only those facets from the LLM adapter
   - validate against schema, whitelists, SRD constraints, and canonical consistency
   - commit the validated facets and their provenance on success
2. Implement facet lifecycle states and aggregate entity state:
   - latent
   - proposing
   - committed
   - partially resolved (entity aggregate)
3. Add deterministic fallback behavior for proposal failures (schema-safe local defaults, not front-end heuristics).
4. Add noncanonical reconciliation that may revise working candidates and soft constraints around a new commitment while preferring compatible existing material.

### Exit criteria

- Latent facets can only enter committed state through validated resolution events.
- Resolving one facet preserves every prior commitment and leaves unrelated facets unresolved.
- Constraint propagation records sources and confidence for downstream resolution.
- Propagated constraints can restrict unresolved facets but cannot overwrite committed ones.
- Reconciliation cannot modify a committed facet or publish an unresolved ontic contradiction.
- Conflicts requiring canonical revision are returned to the authoring workflow rather than repaired by runtime resolution.
- Fallback does not consume hidden state authority from the UI.

## Phase 4: LLM DM Adapter (Proposer / Interpreter)

### Goal

Provide provider-neutral, configurable LLM entry points for:

- narrative/prose generation
- content proposal
- intent interpretation from player prose

### Key work

1. Add OpenAI-compatible provider adapter with configurable base URL and model.
2. Add schema-constrained prompting and strict JSON extraction.
3. Add retry/failure paths and telemetry fields on proposal attempts.
4. Add adapter isolation so no game-rule logic exists in prompt handlers.
5. Classify generated claims so that state-bearing narration is checked against committed state and epistemic statements are not silently promoted to ontic facts.

### Exit criteria

- Provider adapter can be swapped without changing rule adjudication modules.
- All LLM outputs are machine-validated before any state transition.
- No adapter directly writes canonical state.
- No adapter can invoke, authorize, or disguise an Authoring Rebaseline.
- Purely stylistic prose may remain uncommitted only when it introduces no persistent fact, affordance, or mechanical implication.

## Phase 5: Prose Intent Parsing and Mechanical Interpretation

### Goal

Transform player prose into valid engine intents and mechanical action payloads.

### Key work

1. Define intent schema for movement, combat actions, social actions, object interaction, rest, and narration.
2. Use the LLM interpreter to parse prose into this schema.
3. Classify attempted actions, adjudicated outcomes, character utterances, observations, and table discussion without promoting them to the same claim type.
4. Route all interpreted intents through the mechanics kernel before commit.
5. Preserve unresolved or ambiguous interpretation as structured clarification requests, not implicit state changes.

### Exit criteria

- Free-text input is converted into canonical intent form or rejected with recovery prompt.
- Ambiguous prose cannot trigger hard-mechanic effects.
- Character speech and player speculation cannot become ontic truth without an explicit validated promotion.
- Mechanically meaningful prose is replay-safe and deterministic after commit.

## Phase 6: Gameplay Loop and World Orchestration

### Goal

Wire one loop that accepts intent, resolves mechanics/content, advances time, and returns projection + prose.

### Key work

1. Implement a single loop coordinator:
   - accept intent
   - interpret / parse
   - resolve mechanical and SSR needs
   - persist events
   - record which committed facets support each state-bearing session output
   - emit player-facing projection and narration grounded in the resulting committed state
2. Add deterministic turn boundaries and initiative/action budgeting.
3. Track encounter state, turn sequencing, and time passage as event updates.

### Exit criteria

- Every turn in a session has explicit start/end event markers.
- Engine enforces action economy and encounter constraints.
- State-bearing facets are committed before exposure, while unrelated and unexposed facets remain unresolved or noncanonical.
- State-bearing prose responses always correspond to committed symbolic outcomes and resolved world facts.

## Phase 7: Content Collapse Systems

### Goal

Collapse story-facing content while preserving hard mechanics binding.

### Key work

1. Add content domains: monster/NPC/location/treasure/rumor/equipment proposal schemas.
2. Represent ontic world facts separately from observations, beliefs, utterances, and rumors.
3. Build per-domain whitelists and provenance tracking.
4. Make any promotion from an epistemic claim to an ontic constraint an explicit, validated event.
5. Validate every proposed content proposal before commit (no direct injection).
6. Keep content changes reversible only through new causal events, not silent mutation or history replacement.
7. Implement a separately authorized worldbuilder workflow for Authoring Rebaseline:
   - select an unchanged source scope
   - express explicit editorial supersessions
   - analyze affected relations, constraints, and working material
   - construct and validate a revised scope
   - publish or select that scope only after worldbuilder authorization
8. Support explicit authoring commitment of hidden facts when the worldbuilder wants them protected before session exposure.

### Exit criteria

- Content domains resolve through SSR contracts and are reflected in projections.
- Mechanical representation of content (if any) is linked to canonical components and SRD rules.
- A character can be canonically wrong: recording a statement or belief does not make its subject true unless an explicit propagation policy promotes it.
- Runtime and LLM routes cannot perform editorial supersession.
- A rebaseline leaves its source scope unchanged and replayable, and its revised scope independently passes validation.

## Phase 8: LAN Validation UI (Client)

### Goal

Provide an internal LAN-accessible debugging and validation surface without engine authority.

### Key work

1. Build a UI to:
   - start/load sessions
   - submit intents and observations
   - replay event logs
   - inspect projections and hidden state boundaries
   - distinguish canonical facts from noncanonical working material
   - preview rebaseline impact and submit separately authorized worldbuilder requests
2. Keep all rule calculations server-side.
3. Include debug views for rejections, retries, and deterministic seeds.

### Exit criteria

- UI can reproduce reported bugs by replaying saved event logs.
- UI cannot apply hidden-state logic outside backend responses.
- UI cannot turn a preview, draft, or rebaseline proposal into canonical state without backend validation and worldbuilder authorization.

## Phase 9: Acceptance Validation

### Goal

Prove conformance to the SRD-backed, no-retcon engine contract.

### Required checks

- Replay and load consistency tests
- Canonical mechanics validation (checks, saves, combat flow, movement, rests, conditions)
- Deterministic intent parsing and proposal validation tests
- Hidden-state collapse invariants and no-retcon audits
- Progressive facet-resolution tests that preserve committed facets while leaving unrelated facets latent
- Claim-layer tests for world facts, observations, beliefs, utterances, rumors, and promoted constraints
- Narration-grounding tests for persistent player-facing assertions
- Working-material isolation and compatible-preservation reconciliation tests
- Session-exposure tests that freeze asserted facets without freezing unrelated facets
- Rebaseline tests proving that source scopes remain unchanged and runtime/LLM routes lack supersession authority
- Multi-run uniqueness checks for high-level generated sessions
- LAN validation UI scenario tests (scenario submit/observe/replay)

### Release criteria

- The system performs repeated games with materially diverse sessions while retaining canonical continuity and replay equivalence.
- Mechanic outcomes remain SRD-compatible and fully attributed to symbolic adjudication events.
