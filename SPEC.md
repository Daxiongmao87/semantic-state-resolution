# SSR RPG Demonstrator Specification

## 0) Document Status and Boundary

This is a non-normative specification for one RPG demonstrator of SSR. The SSR concept and its invariants are defined by `README.md`.

- The D&D ruleset, complete-RPG scope, LAN validation UI, HTTP endpoints, and example TypeScript whitelists are demonstrator requirements, not requirements for every SSR implementation.
- This document may specialize the concept for the demonstrator but may not weaken or redefine SSR's authority, progressive-resolution, typed-claim, noncanonical-reconciliation, validation, commitment, provenance, scoped no-retcon, or replay invariants.
- If this document conflicts with the conceptual declarations in `README.md`, the README controls the meaning of SSR.

## 1) Scope and Engine Goal

The reference demonstrator is a backend-first RPG engine that is compatible with the 2014 D&D 5e SRD and SRD 5.1.
For this demonstrator, a full role-playing system is required, with full rules coverage and deterministic state persistence.
For this demonstrator, a LAN-accessible validation UI is required for gameplay simulation, projection inspection, and replay.

## 2) Roles and Authority Boundaries

### 2.1 LLM Role

- The LLM is a DM-like proposer/interpreter.
- It is responsible for:
  - Natural language scene narration.
  - NPC and world prose generation.
  - Interpreting player prose into structured intents.
  - Suggesting latent content proposals (entities, rumors, descriptions, affordances).
- It does **not** hold rules authority and does **not** directly mutate canonical state.

### 2.2 Symbolic Engine Role

- The symbolic logic layer is the sole authority for hard mechanics and state transitions:
  - Checks and saving throws
  - Attacks and AC
  - HP, damage, healing, and death logic
  - Conditions
  - Movement and line-of-effect constraints
  - Action economy
  - Rest mechanics
  - Spell and equipment interactions
  - Encounter state
  - Time and duration
- All game updates must pass this adjudication layer before commit.

### 2.3 Worldbuilder Authoring Authority

- A worldbuilder may explicitly request an Authoring Rebaseline when editorial revision of a committed fact is intended.
- Rebaselining is an administrative operation that establishes a revised canonical scope; it is not a gameplay action, in-world causal event, LLM proposal privilege, or in-place rewrite of the source scope.
- The source scope remains replayable and unchanged. The revised scope must pass canonical validation before publication or selection.
- A client may submit and preview a rebaseline request, but only the authoritative backend may validate and establish the resulting scope.

## 3) Hard Mechanics vs Content Model

- **Hard mechanics (binding):** All above rules are authoritative SRD behavior and cannot be overridden by prose output.
- **Content (collapsible):** Monsters, NPC facts, locations, rumors, items, treasure, causes, and similar world content may begin latent and resolve through SSR proposals.
- **Noncanonical working content:** Draft lore, cached candidates, and unexposed generated material may guide resolution as proposals or soft constraints but are not game truth. They may be reconciled or discarded without retconning.
- **Constraint coupling:** Content proposals are valid only after symbolic validation against constraints and SRD mechanics compatibility.
- **Typed claims:** A committed world fact is distinct from a committed record of what a character perceived, said, inferred, or believes. Dialogue and rumors do not become world truth unless the engine explicitly validates and records that promotion as a constraint or resolved fact.
- **Grounded narration:** Any player-facing prose that asserts a persistent fact, affordance, or mechanical result must agree with committed state or be validated and committed before delivery. Stylistic prose that adds no persistent assertion may remain noncanonical.

## 4) Canonical State and Persistence

- The event log is the authoritative historical record. Canonical state is the authoritative current-state projection derived from that log and used by game queries and adjudication.
- Event history and canonical projection are scoped to a continuity. Each scope independently satisfies replay and no-retcon invariants.
- Every accepted state-bearing action or observation must append its resulting events and update canonical projections before returning the corresponding player-facing output.
- The event log is replayable.
- Replay/load must reproduce the same canonical projection and derived state by folding the recorded events; authoritative replay must not depend on asking the LLM to regenerate an accepted answer.
- No-retcon is mandatory: resolved facts cannot be silently invalidated by later LLM output. They may change through a later authorized and recorded causal transition, which preserves the earlier commitment in the event history.
- Editorial supersession uses the separate Authoring Rebaseline operation to establish a revised scope. Runtime resolution cannot invoke or simulate that authority.

## 5) Gameplay Contracts

### 5.1 Intents and Prose Parsing

- Player input arrives as free-form text.
- The LLM maps it to `Intent` JSON constrained by schema:
  - `action`: structured verb set
  - `targetIds`
  - `context` (speaker, location, session step)
  - `mechanicHints` (attack/skill/check intent)
  - `prose` (optional narration channel)
- Mechanical actions must be validated by the symbolic layer before applying effects.
- Input classification must preserve the difference between an attempted action and its adjudicated outcome, between a character's utterance and world truth, and between table discussion and a state-bearing commitment.

### 5.2 SSR Collapse and Proposal Contracts

- Resolution operates on requested facets: independently committable properties, components, or deliberate groups of properties. An entity may therefore be partially resolved.
- Latent facets resolve only through proposal + validation flow:
  1. engine builds constrained proposal request
  2. LLM proposes candidate content under allow-lists
  3. engine validates constraints, ranges, and canonical consistency
  4. engine commits only the validated facets or rejects with a recorded reason
- Previously committed facets constrain later proposals and cannot be replaced by resolving another facet.
- When a new commitment affects existing unexposed working content, the engine may revise that noncanonical content and its soft constraints while preserving compatible material where practical.
- If coherence would require altering a committed facet, runtime resolution rejects the repair and reports the conflict. It does not silently convert the conflict into a retcon.

### 5.3 Observation and Projection

- Observation requests query current visible or derivable state and identify the facets needed by the query.
- Projections can omit hidden latent details and expose only what the UI/player is authorized or positioned to see.
- Interaction scope determines what may trigger resolution; projection authorization separately determines what the querying observer receives.
- Neighbor context may span multiple simultaneous, host-defined relation dimensions rather than only physical adjacency. SSR prescribes no universal relation taxonomy, edge schema, distance function, or traversal and propagation policy; the directional examples in `README.md` are only one spatial view.
- Before state-bearing information is exposed during a session, its asserted facets must be committed in the selected scope. That exposure protects those facets, not unrelated details of the same entity.
- Unexposed working content remains noncanonical and mutable unless the worldbuilder deliberately commits it through an authorized authoring operation.

## 6) Backend API Requirements

The backend must provide at least:

- `POST /sessions` — create session and canonical world seed
- `POST /sessions/{id}/intents` — submit free-form or structured player intent
- `POST /sessions/{id}/observations` — submit observation requests
- `POST /sessions/{id}/advance-time` — explicit time-step advancement
- `GET /sessions/{id}/projection` — safe player-facing view for UI
- `GET /sessions/{id}/replay` — event-log replay output
- `POST /sessions/{id}/system-events` — deterministic system actions (rest, traps, scripted milestones)

### Response contract

Responses must include:

- Updated projection delta
- Validation result with canonical engine verdict
- Emitted events and event ids
- Any narration/prose for LLM output channels

### Frontend/UI contract

- LAN validation UI is non-authoritative.
- It may inspect projections, submit intents/observations, and render diagnostics.
- It must not interpret or apply hard mechanics independently of the engine.
- Runtime routes cannot perform an Authoring Rebaseline. Any authoring surface must use a separately authorized backend operation that previews impact and identifies the source and proposed revised scopes.

## 7) Whitelists and Controlled Generation

The engine uses bounded, versioned whitelists for generated IDs and IDs/terms to prevent unscoped expansion.

```ts
export const MONSTER_TYPES = [
  "skeleton",
  "zombie",
  "ghost",
  "spider",
  "rat_swarm",
  "goblin",
  "orc",
  "troll",
  "stone_guardian",
  "elemental",
  "slime",
  "bat_swarm",
  "cultist",
  "wraith",
  "dragon",
  "demon",
] as const;
```

Any whitelist miss is a validation error that prevents commit.

## 8) Determinism and Validation

- All random outcomes and tie-breaks must use deterministic seeds for deterministic replay per session seed.
- All generated numbers and timings used for mechanics must be recorded in the event stream.
- Accepted LLM results needed for state or replay must be recorded as committed events or event-linked payloads. Replay consumes those records rather than re-running inference.
- Tests and verification must validate:
  - hard mechanics parity with SRD assumptions,
  - persistence and replay invariance,
  - LLM proposal schema/whitelist conformance,
  - separation of prose generation from mechanic authority,
  - component-level progressive resolution,
  - separation of ontic facts from speech, belief, rumor, and observation claims,
  - agreement between state-bearing narration and prior commits,
  - exclusion of noncanonical working content from canonical projections and replay,
  - reconciliation that changes only noncanonical content and soft constraints,
  - facet-level commitment before session exposure,
  - rebaseline isolation that leaves the source scope unchanged and replayable.

## 9) Rejected Architecture Patterns

- Frontend-owned rules authority.
- Silent hidden-state mutation.
- LLM direct canonical writes.
- Treating drafts, cached candidates, or unclassified input as canonical facts.
- In-place editorial rewriting of a canonical scope or disguising a retcon as an in-world Delta.
- Committing unresolved ontic contradictions instead of rejecting or surfacing them.
- Prototype-only flows that stop at isolated tasks without full loop.
