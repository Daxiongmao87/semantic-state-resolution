# SSR Core Implementation Plan

## Objective

Build a backend-authoritative Semantic State Resolution engine that resolves latent entities and collapsible indexed properties into canonical, replayable, provenance-backed state.

The implementation must keep SSR Core domain-general. Domain profiles may provide specialized schemas, rule kernels, validators, whitelists, and projection formats, but they must not be baked into the core architecture.

## Phase 0: Engine Substrate

### Goal

Establish a strict TypeScript backend scaffold with API, module boundaries, replay-safe persistence primitives, and domain-profile isolation.

### Key work

1. Create canonical engine modules for state, constraints, events, properties, neighbor edges, validators, projections, and solver contracts.
2. Define strict TypeScript types for:
   - canonical entities,
   - collapsible property handles,
   - omnidimensional neighbor edges,
   - latent/collapsed lifecycle states,
   - event envelopes,
   - intent and proposal schemas,
   - authority and visibility scopes.
3. Add deterministic seeded utilities for random selection, fallback selection, timestamps, and relevance tie-breaks.
4. Stand up a minimal HTTP API surface for:
   - session/context creation,
   - intent submission,
   - observation/query,
   - projection fetch,
   - property index fetch,
   - neighbor index fetch,
   - time advance where applicable,
   - replay.
5. Keep UI, rendering, and domain-specific assumptions out of the engine boundary.

### Exit criteria

- API compiles and returns typed validation errors for invalid requests.
- Engine modules are isolated from UI and domain-profile assumptions.
- Baseline session lifecycle is reproducible via seed and session ID.

## Phase 1: Domain Rule Kernel Boundary

### Goal

Make symbolic logic the single source of truth for hard rules, while keeping the SSR Core independent of any one domain.

### Key work

1. Define a domain-profile interface for validators, whitelists, allowed property namespaces, allowed action IDs, hard-rule calculations, and projection rules.
2. Implement a minimal reference profile for generic status/property resolution without narrowing SSR Core to that profile.
3. Build rule validators that reject:
   - out-of-range values,
   - contradictory outcomes,
   - illegal lifecycle transitions,
   - unauthorized visibility changes,
   - invalid property authority changes,
   - whitelist misses.
4. Expose a decision trace format for reproducibility.

### Exit criteria

- Every state-changing route produces events and projection updates only through the kernel boundary.
- Domain profiles can be swapped without changing SSR Core modules.
- Invalid proposals are rejected with structured rejection reasons.

## Phase 2: Event Sourcing and Persistence

### Goal

Guarantee replayability and no-retcon continuity.

### Key work

1. Implement append-only event log schema and writer.
2. Implement projection builder that folds events into canonical state.
3. Implement snapshot + replay CLI/API for load and verification.
4. Ensure every accepted intent, observation, time advance, system action, entity collapse, property collapse, and neighbor mutation writes at least one event before response.
5. Add audit tables/markers for collapse provenance, neighbor influence, deterministic fallback, and rejection reasons.

### Exit criteria

- A replay from event log recreates equivalent canonical state.
- No accepted user-facing response occurs without prior event commit.
- Event stream supports deterministic rehydration in tests and inspection tools.

## Phase 3: Collapsible Indexed Property System

### Goal

Make property-level collapse a first-class SSR primitive.

### Key work

1. Implement property handles with:
   - property ID,
   - entity ID,
   - namespace,
   - lifecycle state,
   - authority level,
   - optional value,
   - validator binding,
   - whitelist binding,
   - visibility scope,
   - provenance.
2. Add property lifecycle transitions:
   - latent,
   - proposing,
   - collapsed,
   - rejected,
   - obsolete,
   - canonical.
3. Add validation rules for property creation, collapse, delta application, obsolescence, and correction.
4. Add property queries for projection and debugging.
5. Ensure hard-coded kernel contracts remain intact even when property values are collapsible.

### Exit criteria

- An entity can be canonical while individual properties remain latent.
- Property values can only become canonical through validated events.
- Property collapse records source constraints, proposal attempt, validator result, and commit event.

## Phase 4: Omnidimensional Neighbor Index

### Goal

Generalize neighboring state from spatial/logical adjacency into typed multidimensional constraint pressure.

### Key work

1. Implement neighbor edge records with:
   - target reference,
   - source reference,
   - dimension,
   - relation,
   - authority,
   - strength,
   - TTL,
   - source event ID.
2. Support neighbor dimensions:
   - spatial,
   - temporal,
   - causal,
   - semantic,
   - mechanical,
   - social,
   - epistemic,
   - provenance,
   - affordance,
   - narrative.
3. Add deterministic neighbor selection and relevance scoring.
4. Convert selected neighbor edges into hard or soft constraints before proposal.
5. Add visibility and authority filtering so neighbor influence does not leak hidden state or bypass validators.

### Exit criteria

- Neighbor selection is deterministic or event-recorded.
- Neighbor influence is represented as constraints, not direct mutation.
- Canonical state and hard rules outrank all neighbor-derived proposal pressure.

## Phase 5: SSR Resolution Orchestrator

### Goal

Resolve latent entities and properties through constrained proposal + validation loops.

### Key work

1. Implement an SSR orchestrator that:
   - identifies required entity/property collapse,
   - builds constraints from canonical state, property index, neighbor index, and profile context,
   - requests proposal from the configured proposer adapter,
   - validates against schema, whitelists, profile rules, authority scope, and canonical consistency,
   - commits resolution event on success,
   - records rejection or fallback on failure.
2. Add deterministic fallback behavior for proposal failures using schema-safe profile defaults.
3. Ensure fallback does not consume hidden state authority from the UI or proposer.

### Exit criteria

- Latent entities and properties can only enter canonical/collapsed state through validated events.
- Constraint propagation records source and confidence for downstream resolution.
- Fallback behavior is replay-safe and validator-bound.

## Phase 6: Proposal / Interpreter Adapter

### Goal

Provide provider-neutral, configurable entry points for proposal, interpretation, and explanation.

### Key work

1. Add OpenAI-compatible provider adapter with configurable base URL and model.
2. Add schema-constrained prompting and strict JSON extraction.
3. Add retry/failure paths and telemetry fields on proposal attempts.
4. Add adapter isolation so no rule logic exists in prompt handlers.
5. Support non-LLM proposal sources where appropriate, such as deterministic local resolvers or human-in-the-loop proposal queues.

### Exit criteria

- Provider adapter can be swapped without changing rule adjudication modules.
- All proposal outputs are machine-validated before any state transition.
- No adapter directly writes canonical state.

## Phase 7: Intent Parsing and Action Interpretation

### Goal

Transform free-form or ambiguous input into valid structured intents and action payloads.

### Key work

1. Define intent schema for domain-profile actions.
2. Use the interpreter adapter to parse prose into this schema where needed.
3. Route all interpreted intents through the rule kernel before commit.
4. Preserve unresolved or ambiguous interpretation as structured clarification requests, not implicit state changes.

### Exit criteria

- Free-text input is converted into canonical intent form or rejected with recovery prompt.
- Ambiguous prose cannot trigger hard-rule effects.
- Meaningful prose is replay-safe and deterministic after commit.

## Phase 8: Application Loop and Projection Orchestration

### Goal

Wire one loop that accepts intent, resolves required mechanics/content/properties, advances time where applicable, persists events, and returns projection plus explanation.

### Key work

1. Implement a single loop coordinator:
   - accept intent,
   - interpret/parse,
   - identify required entity or property collapse,
   - select constraints and omnidimensional neighbors,
   - resolve proposal needs,
   - validate rule effects,
   - persist events,
   - emit projection and explanation.
2. Add deterministic operation boundaries and event markers.
3. Track time passage, dependency updates, and lifecycle transitions as event updates.

### Exit criteria

- Every accepted loop iteration has explicit event markers.
- Engine enforces rule constraints through the profile kernel.
- Explanations always correspond to committed symbolic outcomes.

## Phase 9: Content and State Collapse Systems

### Goal

Collapse domain-facing state while preserving hard rule binding.

### Key work

1. Add domain-profile proposal schemas for records, claims, statuses, relationships, affordances, summaries, explanations, and other profile-defined content types.
2. Build per-domain whitelists and provenance tracking.
3. Validate every proposal before commit.
4. Keep content changes reversible only through new events, not silent mutation.

### Exit criteria

- Content domains resolve through SSR contracts and are reflected in projections.
- Rule-relevant representation of content is linked to canonical properties and profile validators.

## Phase 10: Inspection and Validation UI

### Goal

Provide an internal debugging and validation surface without engine authority.

### Key work

1. Build a UI or API inspection surface to:
   - start/load sessions,
   - submit intents and observations,
   - replay event logs,
   - inspect projections,
   - inspect hidden state boundaries,
   - inspect property collapse history,
   - inspect neighbor influence and selected constraints,
   - inspect rejections, retries, and deterministic seeds.
2. Keep all rule calculations server-side.
3. Include debug views for proposal payloads, validator verdicts, and event provenance.

### Exit criteria

- Inspection tooling can reproduce reported bugs by replaying saved event logs.
- UI cannot apply hidden-state logic outside backend responses.
- Property and neighbor diagnostics are visible for validation.

## Phase 11: Acceptance Validation

### Goal

Prove conformance to the domain-general, no-retcon SSR contract.

### Required checks

- Replay and load consistency tests.
- Canonical rule validation for active domain profile.
- Deterministic intent parsing and proposal validation tests.
- Hidden-state collapse invariants and no-retcon audits.
- Property-level collapse tests.
- Omnidimensional neighbor selection and precedence tests.
- Multi-run uniqueness checks where profile permits generated content.
- Inspection UI scenario tests for submit/observe/replay.

### Release criteria

- The system supports repeated domain-profile sessions with materially diverse resolved state while retaining canonical continuity and replay equivalence.
- Hard-rule outcomes remain profile-compatible and fully attributed to symbolic adjudication events.
- Proposal output remains non-authoritative until validated and committed.
