# SSR Core Specification

## 1) Scope and Architecture Goal

Semantic State Resolution (SSR) is a domain-general architecture for converting latent, partially known, or semantically ambiguous state into canonical, replayable, provenance-backed state.

SSR Core is not limited to games or any single application domain. Domain-specific systems provide profiles that define schemas, rule kernels, validators, whitelists, projection formats, authority boundaries, and domain event types.

A complete SSR implementation must provide:

- canonical state projection,
- replay-safe event sourcing,
- latent entity handling,
- property-level collapse,
- omnidimensional neighbor indexing,
- constraint and provenance tracking,
- proposal validation,
- deterministic fallback behavior,
- no-retcon state transitions,
- inspection tooling for projections, events, rejections, and replay.

## 2) Roles and Authority Boundaries

### 2.1 Proposal / Interpretation Role

A model, rules assistant, human operator, or other proposal source may act as a proposer/interpreter.

It may be responsible for:

- natural language explanation,
- content or property proposals,
- interpreting prose or ambiguous input into structured intents,
- suggesting candidate facts, labels, affordances, classifications, or derived properties,
- summarizing canonical state for user-facing projection.

It does **not** hold canonical authority and does **not** directly mutate canonical state.

### 2.2 Symbolic Engine Role

The symbolic logic layer is the sole authority for hard rules and state transitions. Depending on the domain profile, this includes:

- schema validation,
- allowed value enforcement,
- action legality,
- authorization and visibility,
- dependency consistency,
- lifecycle transitions,
- timing and duration,
- numeric calculation,
- policy/rule compatibility,
- conflict handling,
- event commit.

All state updates must pass this adjudication layer before commit.

## 3) Hard Rules vs Collapsible Content

- **Hard rules (binding):** Domain rule kernels and validation contracts cannot be overridden by prose or proposal output.
- **Collapsible content:** Entities, properties, facts, labels, summaries, classifications, explanations, affordances, relationships, and similar semantic state may begin latent and resolve through SSR proposals.
- **Constraint coupling:** Proposals are valid only after symbolic validation against constraints, domain rules, authority scope, and canonical consistency.

## 4) Canonical State and Persistence

- The event log is the source of truth.
- Canonical state is a projection derived from the event log.
- Every accepted action, observation, collapse, system event, property update, and correction must append to the event log before affecting canonical projection.
- Replay/load must reproduce the same canonical projection and derived state.
- No-retcon is mandatory: resolved facts and properties cannot be silently invalidated by later proposal output.

## 5) Entity and Property Model

### 5.1 Entity Handles

An entity is a stable canonical handle. It does not need all properties resolved at creation time.

Required entity-level metadata:

- entity ID,
- lifecycle state,
- type/profile tag where required,
- provenance,
- visibility scope,
- indexed property references,
- constraint references,
- source event ID.

### 5.2 Collapsible Indexed Properties

Properties are first-class collapsible units. A property may be latent while its parent entity is canonical.

Property states:

- `latent`
- `proposing`
- `collapsed`
- `rejected`
- `obsolete`
- `canonical`

Property namespaces may include:

- `mechanic`
- `semantic`
- `sensory`
- `social`
- `spatial`
- `temporal`
- `narrative`
- `affordance`
- `provenance`

Property authority levels may include:

- `kernel`
- `canonical`
- `hard_constraint`
- `soft_constraint`
- `rumor`
- `belief`
- `proposal`

### 5.3 Property Collapse Rule

A property value may collapse only through proposal plus validation, deterministic fallback plus validation, or direct symbolic rule resolution.

Once committed, the property may change only through a recorded delta or correction event.

### 5.4 Kernel Boundary

SSR may remove hard-coded content fields, but it must not remove hard-coded authority contracts.

The engine must still define property metadata, allowed namespaces, lifecycle states, validators, whitelist bindings, visibility rules, event schemas, provenance fields, and rule authority.

## 6) Omnidimensional Neighbors

### 6.1 Definition

An omnidimensional neighbor is a typed, scoped, weighted relationship that can legitimately influence the resolution of an entity or property.

Neighbor dimensions may include:

- `spatial`
- `temporal`
- `causal`
- `semantic`
- `mechanical`
- `social`
- `epistemic`
- `provenance`
- `affordance`
- `narrative`

A neighbor is therefore not only an adjacent node. It is any admissible source of constraint pressure.

### 6.2 Neighbor Authority Rule

Omnidimensional neighbors feed the constraint graph. They do not bypass validation and do not expand proposer authority.

Neighbor influence must be:

- typed,
- scoped,
- weighted,
- provenance-backed,
- replayable,
- filtered by visibility and authority,
- converted into hard or soft constraints before proposal,
- validated before commit.

### 6.3 Neighbor Edge Record

```ts
interface OmnidimensionalNeighborEdge {
  id: string;
  target_ref: { kind: "entity" | "property"; id: string };
  source_ref: { kind: string; id: string };
  dimension: NeighborDimensionRef;
  relation: string;
  authority: NeighborAuthorityRef;
  strength: number;
  ttl?: number;
  source_event_id: string;
}

type ProfileRegistryRef = {
  registry_id: string;
  profile_id: string;
  profile_version: string;
  entry_id: string;
};

type NeighborDimensionRef = ProfileRegistryRef & {
  registry_id: "neighbor_dimensions_v1";
};

type NeighborAuthorityRef = ProfileRegistryRef & {
  registry_id: "authority_levels_v1";
};
```

Implementations MUST resolve both `NeighborDimensionRef` and `NeighborAuthorityRef` against the active `ProfileRegistry` before persistence or use; unknown `registry_id` / `profile_id` / `profile_version` / `entry_id` combinations are validation errors.

## 7) Observation and Projection

Observation requests query current visible, authorized, or derivable state.

Projection rules:

- projections may omit hidden latent details,
- projections expose only what the current actor or subsystem is authorized to see,
- observation may trigger property collapse when required by the response contract,
- observation must not leak hidden state through explanation text,
- any collapse caused by observation must be event-backed.

## 8) Backend API Requirements

The backend must provide at least:

- `POST /sessions` or domain-equivalent context creation,
- `POST /sessions/{id}/intents` or structured action submission,
- `POST /sessions/{id}/observations`,
- `POST /sessions/{id}/advance-time` or domain-equivalent clock advancement where applicable,
- `GET /sessions/{id}/projection`,
- `GET /sessions/{id}/replay`,
- `POST /sessions/{id}/system-events`,
- `GET /sessions/{id}/events`,
- `GET /sessions/{id}/properties`,
- `GET /sessions/{id}/neighbors`.

### Response Contract

Responses must include:

- updated projection delta,
- validation result with canonical engine verdict,
- emitted events and event IDs,
- rejection reasons where applicable,
- any explanation or prose for proposal-output channels.

### Client / UI Contract

Inspection tooling and validation UIs are non-authoritative.

They may inspect projections, submit intents/observations, and render diagnostics. They must not interpret or apply hard rules independently of the engine.

## 9) Whitelists and Controlled Generation

The engine uses bounded, versioned whitelists for generated IDs, property values, labels, status values, action IDs, and domain terms.

Example:

```ts
export const STATUS_IDS = [
  "unknown",
  "pending",
  "validated",
  "rejected",
  "obsolete",
] as const;
```

Any whitelist miss is a validation error that prevents commit.

## 10) Determinism and Validation

- All random outcomes, tie-breaks, fallbacks, and deterministic selections must use replayable seeds or event-recorded values.
- All generated numbers and timings used by hard rules must be recorded in the event stream.
- Neighbor selection must be deterministic or event-recorded.
- Property collapse decisions must record provenance.
- Tests and verification must validate:
  - hard rule parity for the active domain profile,
  - persistence and replay invariance,
  - proposal schema and whitelist conformance,
  - separation of proposal output from canonical authority,
  - no-retcon behavior,
  - property-level collapse invariants,
  - omnidimensional neighbor filtering and precedence.

## 11) Rejected Architecture Patterns

- Domain-specific scope baked into SSR Core.
- Frontend-owned rules authority.
- Silent hidden-state mutation.
- Proposal system direct canonical writes.
- Unbounded neighbor influence.
- Property collapse without validators or provenance.
- Non-replayable relevance scoring.
- Prototype-only flows that stop at isolated tasks without full loop.
