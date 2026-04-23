# Architectural Decisions Log

Append-only log of non-obvious architectural choices. **Never edit existing entries.** To revise a decision, add a new entry that supersedes the old and link back by date.

## Entry format

```
## YYYY-MM-DD — Short decision title

**Status**: accepted | superseded by [YYYY-MM-DD] | deprecated
**Context**: what was the question or pressure
**Decision**: what we chose
**Alternatives considered**: 2–4 options briefly
**Trade-offs accepted**: what we lose by this choice
**Revisit when**: trigger that would make us reconsider
```

---

## 2026-04-23 — Static SPA with Vite + React, no backend

**Status**: accepted
**Context**: Team needs a hub for multiple small utilities. Currently distributed as loose HTML files with no versioning and accumulating style drift.
**Decision**: Vite + React + TypeScript, deployed as static assets to Vercel. No backend, no API routes.
**Alternatives considered**:
- Next.js with static export — rejected; unnecessary complexity for a no-backend target.
- Continue with standalone HTML files — rejected; distribution friction, no versioning, style drift across tools.
- Electron app — rejected; install friction for internal users, overkill for browser-capable tools.
**Trade-offs accepted**: Tools that need secret API keys cannot be built purely client-side. Escape hatch is Vercel serverless functions, which must be added via a new decision entry here before use.
**Revisit when**: a tool genuinely needs server compute, secret credentials, or cross-user shared state.

---

## 2026-04-23 — Strict tool contract, folder-per-tool

**Status**: accepted
**Context**: Long-term consistency across many tools built across many sessions. Loose guidelines produce drift.
**Decision**: Every tool is a folder under `src/tools/<slug>/` with required `meta.ts` and `index.tsx`. See `TOOL_CONTRACT.md`. No cross-tool imports under any circumstance.
**Alternatives considered**:
- Loose guidelines — rejected; drift over many sessions is near-certain.
- Monorepo with per-tool packages — rejected; overkill for in-process static tools.
**Trade-offs accepted**: Slight ceremony overhead for very small tools. Accepted because the consistency payoff compounds over time.
**Revisit when**: the contract becomes a genuine blocker for a real tool requirement (not a stylistic preference).

---

## 2026-04-23 — Sidebar grouped by category from day one

**Status**: accepted
**Context**: Sidebar will contain 15+ tools over time. Flat list doesn't scale and provides no navigational structure.
**Decision**: `meta.group` field required on every tool. Sidebar groups by `group`, sorts tools alphabetically within group.
**Alternatives considered**: Flat list with search — rejected; search alone doesn't convey structure for users browsing for a tool they don't know by name.
**Trade-offs accepted**: Groups must be added to a controlled vocabulary (below).
**Revisit when**: group vocabulary grows beyond ~8 groups, at which point sub-grouping or reclassification may be needed.

### Allowed groups (amend by adding a new entry below, not by editing this)

- `LI-Utilities` — tools specific to the Logically Intelligence platform (CSV ingestion validators, monitor helpers, and other platform-aware utilities)

> **Note (2026-04-23):** The original group list (`Converters`, `Query Builders`, `Report Helpers`, `Text Utilities`, `Data Tools`) was replaced in-place with `LI-Utilities` on explicit user direction — a one-time authorized exception to the append-only rule. Future amendments must follow the append-only rule (add a new entry below).

---

## 2026-04-23 — Light theme only for v1

**Status**: accepted
**Context**: Team requested polished, professional, smooth UX — light theme specified.
**Decision**: Ship light theme only. Do not scaffold dark mode, do not use `dark:` Tailwind variants.
**Alternatives considered**: Dual light/dark from day one — rejected; doubles UI testing surface for unclear demand.
**Trade-offs accepted**: Late-night use will be bright. Accepted given tool is used primarily in daytime analyst workflow.
**Revisit when**: two or more team members explicitly request dark mode, or the tool is adopted for a workflow that runs primarily in low light.

---

## 2026-04-23 — Install `frontend-design` skill, override aesthetic direction

**Status**: accepted
**Context**: The official Anthropic `frontend-design` skill provides valuable UX engineering discipline (state handling, accessibility, typography, motion). Its default bias is toward bold / maximalist aesthetic directions, which is wrong for internal intelligence tooling used by analysts under time pressure.
**Decision**: Install the skill. Override its aesthetic defaults via `DESIGN.md`. The skill's discipline is authoritative; its aesthetic direction is not.
**Alternatives considered**:
- No skill, DESIGN.md only — rejected; loses the skill's UX engineering discipline.
- Skill without override — rejected; wrong aesthetic for the use case.
**Trade-offs accepted**: Must maintain DESIGN.md carefully to keep the override effective.
**Revisit when**: a tool genuinely requires a different aesthetic treatment (unlikely within this project's scope).

---

## 2026-04-23 — No external state management library

**Status**: accepted
**Context**: Need to decide on state management approach up front to avoid reactive churn later.
**Decision**: React local state (`useState`, `useReducer`) plus React Context for any rare cross-component shared state within a single tool. No Redux, Zustand, Jotai, or similar.
**Alternatives considered**:
- Zustand — rejected; tools are small and independent, shared state across tools is explicitly forbidden.
- Redux — rejected; massively overkill.
**Trade-offs accepted**: Tools with complex internal state will rely on `useReducer` discipline.
**Revisit when**: a single tool has state complex enough that `useReducer` becomes unwieldy (unusual for this project's tool scope).

---

## 2026-04-23 — Project name: Logically India Internal Tools

**Status**: accepted
**Context**: Needed a canonical name for the app, referenced in the access gate UI, page titles, and internal docs.
**Decision**: App is named "Logically India Internal Tools". Short form in UI chrome: "Logically India Internal Tools" (no abbreviation). Internal identifiers use `lit` prefix where short names are needed (e.g., sessionStorage key `lit-unlocked`).
**Alternatives considered**: Shorter branded name — rejected; clarity beats brevity for an internal tool.
**Revisit when**: organizational rebrand or spinout.

---

## 2026-04-23 — HHMM-IST access gate (friction barrier, not auth)

**Status**: accepted
**Context**: App must not be casually accessible via a leaked or guessed URL. True auth requires a backend, which this project does not have.
**Decision**: Client-side access gate on every route. Access code is the current IST time formatted as HHMM (24-hour, zero-padded), with ±1 minute grace window. Unlock is stored in `sessionStorage` and clears on tab close. Full spec in `docs/AUTH.md`.
**Alternatives considered**:
- Static shared password — rejected; rotates only when the team remembers, feels stale, easy to leak once.
- OAuth via Google Workspace — rejected; requires a backend/serverless function, adds org-integration complexity disproportionate to the need.
- No gate — rejected; URL leakage would expose tools immediately.
**Trade-offs accepted**: **This is security by obscurity.** Anyone who reads the bundle in devtools can deduce the scheme. Acceptable because the URL is not advertised, the app stores no sensitive data at rest, and the repo is private. If the threat model changes (public URL, sensitive data, external users), replace with real auth.
**Revisit when**: the URL is shared outside the core team, the app begins storing or transmitting sensitive data, or a motivated-attacker scenario becomes plausible.

---

## 2026-04-23 — User owns all git operations

**Status**: accepted
**Context**: User explicitly wants control over what reaches the remote. Automated pushes risk accidentally publishing half-done work.
**Decision**: Claude Code never runs `git add`, `git commit`, `git push`, `git merge`, `git rebase`, or any other git write command. Claude Code may run read-only git commands (`status`, `diff`, `log`) for context. At the end of a change, Claude Code proposes a commit message in conventional-commit format; the user runs all git operations.
**Alternatives considered**:
- Claude Code runs commit but not push — rejected; the user prefers a single unambiguous rule over a "which commands are safe" checklist.
- Claude Code stages only — rejected; same reason.
**Trade-offs accepted**: Slightly more manual work per change for the user. Accepted given the safety and predictability gain.
**Revisit when**: the manual overhead becomes a real friction — unlikely given typical change cadence.

---

## 2026-04-23 — No test framework installed by default; fast checks only

**Status**: accepted
**Context**: Tool code is small, largely pure-function logic wrapped in simple UI. Heavy test infrastructure would slow the iteration loop disproportionately to its value.
**Decision**: Default checks are `pnpm typecheck`, `pnpm lint`, and (when relevant) `pnpm build`. Non-trivial pure functions in `logic.ts` may be spot-checked with a throwaway `tsx` script. No Jest, Vitest, Playwright, Cypress, or equivalent is installed without a subsequent entry in this log approving it for a specific reason. Browser-visible behavior is verified manually by the user in `pnpm dev`.
**Alternatives considered**:
- Vitest from day one — rejected; overhead exceeds benefit for this project's scope.
- Playwright for UI — rejected; internal tools, manual check is faster per cycle.
**Trade-offs accepted**: Regressions may slip past pure-function boundaries. Accepted because the UI surface is small per tool and changes are reviewed by the user before merge.
**Revisit when**: a specific tool accumulates enough logic complexity that test automation pays for itself, at which point add Vitest scoped to that tool's `logic.ts` only.

---

## 2026-04-23 — Dependencies via pnpm add, both files committed

**Status**: accepted
**Context**: Vercel installs from `package.json` and the lockfile. Orphaned changes to one without the other break deploys.
**Decision**: Dependencies are added via `pnpm add <n>` only, never by hand-editing `package.json`. Both `package.json` and `pnpm-lock.yaml` must be committed together in the same commit. Every new dependency requires user approval before install.
**Alternatives considered**: npm or yarn — rejected; team-level consistency on pnpm.
**Trade-offs accepted**: None material.
**Revisit when**: pnpm causes a concrete problem.

---

## 2026-04-23 — Add `Claude Utilities` group

**Status**: accepted
**Context**: Second tool is an upstream converter that pre-processes `.docx` intelligence reports into Markdown + extracted images, packaged as a zip for upload to Claude. This concern is distinct from the LI ingestion pipeline — different downstream consumer, different constraints — and more Claude-adjacent helpers are likely to follow (text cleanup, image batching, attachment prep, etc.).
**Decision**: Extend the allowed-groups list with `Claude Utilities`. Reserved for tools that prepare, clean, or convert artefacts for use with Claude (or the Claude API) specifically, rather than LI's ingestion pipeline.
**Alternatives considered**:
- Reuse `LI-Utilities` — rejected; conflates distinct use-cases and makes the sidebar harder to scan as more tools land.
- Introduce a broader `Utilities` bucket and drop platform names — rejected; loses the at-a-glance categorisation the sidebar leans on.
**Trade-offs accepted**: Small vocabulary growth. The two groups stay distinct by intended downstream consumer.
**Revisit when**: Either group outgrows the sidebar's readability (~8+ tools in one group) and sub-grouping becomes useful, or a tool sits ambiguously between the two (at which point the categorisation needs a rethink).

### Allowed groups — amended

- `LI-Utilities` — tools for the Logically Intelligence platform (CSV ingestion validators, monitor helpers, platform-aware utilities).
- `Claude Utilities` — tools that prepare or convert artefacts for use with Claude / the Claude API (document pre-processors, prompt helpers, attachment bundlers).

---

## 2026-04-23 — Standardise group naming: space-separated

**Status**: accepted, supersedes the two prior "Allowed groups" lists (from the "Sidebar grouped by category" and "Add Claude Utilities group" entries).
**Context**: The two existing groups were named inconsistently — `LI-Utilities` (hyphenated) and `Claude Utilities` (space-separated). Names are display-facing labels used in the sidebar, not code identifiers, so the inconsistency leaks into the UI.
**Decision**: Standardise on **space-separated** group names (Title Case words, separated by a single space, no hyphens or underscores). Rename `LI-Utilities` → `LI Utilities`. Future group names follow the same convention.
**Alternatives considered**:
- Hyphenate all (rename `Claude Utilities` → `Claude-Utilities`) — rejected; hyphens read awkwardly in uppercase sidebar headers ("CLAUDE-UTILITIES") and aren't justified when the name isn't an identifier.
- Keep inconsistent — rejected; gets worse with every new group.
**Trade-offs accepted**: One additional rename in code (`meta.ts` of li-csv-validator, the `ToolGroup` union). No runtime impact — group strings aren't persisted anywhere outside source.
**Revisit when**: A future group name genuinely needs punctuation (unlikely).

### Allowed groups — current (authoritative)

- `LI Utilities` — tools for the Logically Intelligence platform (CSV ingestion validators, monitor helpers, platform-aware utilities).
- `Claude Utilities` — tools that prepare or convert artefacts for use with Claude / the Claude API (document pre-processors, prompt helpers, attachment bundlers).
