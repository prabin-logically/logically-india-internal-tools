# Claude Code Briefing — Logically India Internal Tools

This file is loaded at the start of every Claude Code session. It is the source of truth for what this project is and how to work on it. Read it fully before taking any action.

## What this project is

A single static web app named **Logically India Internal Tools** that hosts multiple small, independent utilities ("tools") used by an internal intelligence team. Users open one URL, pass an access gate, pick a tool from the sidebar, use it, done. The app replaces a prior workflow of distributing individual HTML files.

## Non-negotiables

1. **Client-side only.** No server, no backend, no API routes. All processing happens in the browser. Deployed as static assets on Vercel.
2. **No secret API keys in the bundle.** If a tool needs a paid external API, stop and discuss with the user before writing any code. Do not hardcode keys. Do not accept a user-pasted key and silently store it. The only escape hatch is Vercel serverless functions, and that decision must be recorded in `docs/DECISIONS.md` before implementation.
3. **Modular tools.** No cross-tool imports. A tool imports only from `src/shared/`. See `docs/TOOL_CONTRACT.md`.
4. **The aesthetic direction is fixed.** Refined minimalism. See `docs/DESIGN.md`. The installed `frontend-design` skill provides UX discipline, but its default bold/maximalist aesthetic direction is overridden here.
5. **User always knows the current state.** Every async operation has a verbal status. See `docs/DESIGN.md` UX laws.
6. **Access gate on every route.** No tool is reachable without passing the access gate. Spec: `docs/AUTH.md`. The gate is a friction barrier, not real authentication — treat it accordingly.
7. **User owns git.** Claude Code never runs `git push`, `git commit`, or `git add`. Claude Code proposes a commit message; the user runs all git operations. Details below.

## Stack

- Vite + React 18 + TypeScript (strict mode)
- Tailwind CSS + shadcn/ui (components live in repo)
- React Router for tool routes
- No state management library — React context + local state only
- `pnpm` preferred (fallback `npm`)

## Commands

```bash
pnpm dev          # local dev server
pnpm build        # production static build → dist/
pnpm lint         # eslint
pnpm typecheck    # tsc --noEmit
pnpm preview      # serve dist/ locally
```

## Dependencies

Vercel reads `package.json` on every deploy and installs automatically. The rule:

- Install via `pnpm add <name>` (or `pnpm add -D <name>` for dev deps). Never edit `package.json` by hand.
- **Both `package.json` and `pnpm-lock.yaml` must be committed together.** An orphaned lockfile or orphaned package.json change will break Vercel's build.
- Never install a dependency without asking the user first. Propose the dep, say why it's needed, wait for approval.
- Keep the dependency list minimal. Prefer a 20-line utility in `shared/lib/` over a 50KB library.

## Git policy

- Claude Code **never** runs `git add`, `git commit`, `git merge`, `git push`, `git rebase`, or any other git write command.
- Claude Code **may** run read-only git commands (`git status`, `git diff`, `git log`) when useful for context.
- At the end of a change, Claude Code proposes a commit message in conventional-commit format:
  - `feat(tools): add json-to-csv converter`
  - `fix(docx-to-markdown): handle empty tables without crashing`
  - `refactor(shared): extract StateShell into own component`
  - `docs: amend TOOL_CONTRACT.md with input validation rule`
  - `chore: bump mammoth to 1.8.0`
- The user runs the commit and push. Changes do not reach the remote without the user.

## Testing policy

Tests must be **fast**. Assume every test run costs the user's time and attention.

**Default checks (always acceptable, cheap):**
- `pnpm typecheck` — strict TS check, usually 1–3 seconds
- `pnpm lint` — usually 1–2 seconds
- `pnpm build` — 5–20 seconds, only when verifying the bundle genuinely builds

**Logic sanity checks (allowed, keep tight):**
- For non-trivial pure functions in `logic.ts`, a quick throwaway script using `tsx` or `node --experimental-strip-types` to verify a handful of cases. Delete the script when done or keep as `logic.test.ts` only if the user wants it persisted.

**Forbidden without explicit user approval (record in DECISIONS.md):**
- Installing Jest, Vitest, Playwright, Cypress, or any test framework
- Writing test suites beyond a handful of assertions
- Spinning up headless browsers
- Creating CI test pipelines

**For browser-visible behavior:** ask the user to test manually in `pnpm dev`. Do not try to automate UI verification.

## Folder layout (authoritative)

```
src/
  main.tsx              # entry
  app/
    Layout.tsx          # shell with sidebar + main
    Sidebar.tsx         # auto-generated from registry
    registry.ts         # imports every tool's meta.ts
    routes.tsx          # route definitions
    auth/
      Gate.tsx          # the access-code screen
      useAuth.ts        # unlock check + sessionStorage logic
      timeCode.ts       # pure HHMM-IST computation (testable)
  tools/
    <tool-slug>/
      meta.ts           # REQUIRED: name, slug, icon, group, description
      index.tsx         # REQUIRED: default exported React component
      logic.ts          # OPTIONAL: pure functions (prefer to isolate here)
      README.md         # OPTIONAL: tool-specific notes
  shared/
    ui/                 # shadcn components + custom primitives
    lib/                # cross-tool utilities (clipboard, file helpers, etc.)
    types/              # cross-tool TS types
    styles/
      tokens.css        # CSS variables from DESIGN.md
docs/
  TOOL_CONTRACT.md
  DESIGN.md
  AUTH.md
  DECISIONS.md
  JOURNAL.md
```

## Session protocol

When the user makes a request, follow this protocol. Do not skip steps.

**Before any code changes:**
1. Restate the request in one sentence so the user can confirm understanding.
2. If anything is ambiguous, ask questions. **Do not assume.** Do not proceed until answered.
3. State your plan in 3–7 bullets. Wait for "go" before editing files.

**For a new tool:**
- Read `docs/TOOL_CONTRACT.md` in full.
- Read `docs/DESIGN.md` in full.
- Scaffold the tool folder following the contract.
- Register it in `src/app/registry.ts`.
- Implement `logic.ts` first (pure functions), then `index.tsx`.
- Run the self-review checklist at the bottom of `TOOL_CONTRACT.md`.

**For a modification to an existing tool:**
- Read the affected tool's files.
- Read `docs/TOOL_CONTRACT.md` if the change touches structure.
- Read `docs/DESIGN.md` if the change touches UI.
- Make the change. Do not refactor unrelated code.

**For a bug fix:**
- Reproduce the bug or ask how to reproduce.
- Find the root cause. Do not patch symptoms.
- Fix.
- Append an entry to `docs/JOURNAL.md`.
- If the bug reveals a missing rule, propose a `TOOL_CONTRACT.md` or `DESIGN.md` amendment for user approval.

**After any non-trivial change:**
- Run `pnpm typecheck` and `pnpm lint`. Report any failures.
- If an architectural decision was made, append an entry to `docs/DECISIONS.md`.
- Propose a commit message. Do not run git.

## Hard rules for Claude Code

- Never install a new dependency without asking.
- Never run git write commands (see Git policy).
- Never install a test framework without explicit user approval (see Testing policy).
- Never bypass TypeScript strict mode with `any` or `@ts-ignore` without an adjacent comment justifying why.
- Never add a tool outside `src/tools/`.
- Never import from one tool into another.
- Never edit existing `DECISIONS.md` entries — only append. To supersede, write a new entry.
- Never silently skip the self-review checklist.
- Never bypass or weaken the access gate for "convenience."
- When in doubt, stop and ask.

## Working relationship

The user prefers brief, direct communication. Clarifying questions are welcome and expected. Do not over-explain completed work — a concise summary and the proposed commit message is enough. If you did something non-obvious, flag it. If you skipped something you were supposed to do, say so explicitly.
