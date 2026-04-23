# Tool Contract

Every tool in `src/tools/<slug>/` MUST follow this contract. Violations block merge. This document is authoritative; if you find yourself wanting to deviate, propose an amendment instead.

## Folder structure

```
src/tools/<tool-slug>/
  meta.ts          # REQUIRED
  index.tsx        # REQUIRED
  logic.ts         # OPTIONAL but preferred for any non-trivial processing
  README.md        # OPTIONAL — tool-specific docs, quirks, limits
```

Folder name must equal `meta.slug`. Slugs are kebab-case (`docx-to-markdown`, not `docxToMarkdown`).

## `meta.ts` — required exports

```ts
import type { ToolMeta } from "@/shared/types/tool";

export const meta: ToolMeta = {
  slug: "docx-to-markdown",       // kebab-case, unique, matches folder name
  name: "DOCX → Markdown",         // shown in sidebar
  group: "Converters",             // must match an entry in DECISIONS.md allowed-groups
  description: "Convert .docx files to clean Markdown for use with LLMs.",
  icon: "FileText",                // lucide-react icon name (PascalCase)
  status: "stable",                // "stable" | "beta" | "experimental"
  version: "1.0.0",                // bump on behavior change
};
```

The `ToolMeta` type lives in `src/shared/types/tool.ts` and is the single source of truth for this shape.

## `index.tsx` — required shape

```tsx
import { meta } from "./meta";
import { ToolShell } from "@/shared/ui/ToolShell";

export default function Tool() {
  return (
    <ToolShell meta={meta}>
      {/* tool UI here */}
    </ToolShell>
  );
}
```

`ToolShell` provides the header, breadcrumb, consistent padding, and status-bar footer. Never roll your own layout.

## `logic.ts` — strongly preferred for non-trivial tools

Any function that transforms data should live in `logic.ts`, not `index.tsx`. Logic functions MUST be:

- **Pure** — no DOM access, no React, no side effects outside their return value.
- **Fully typed** — inputs and outputs explicit, no implicit `any`.
- **Synchronous when possible** — Promise-returning only when genuinely async (file parsing, fetch, etc.).

**Why:** pure logic is testable, reusable across tools if ever needed (copy, don't import), and far easier for Claude Code to modify without breaking UI.

## UI state contract

Every tool UI MUST handle and visually distinguish these four states:

1. **Idle** — ready for input, no action taken yet.
2. **Processing** — work in progress, with a **specific verbal label** (not "Loading..."). For file work: show filename, size, and what's happening (e.g., "Parsing resume.docx — extracting headings").
3. **Success** — output rendered, with "copy" / "download" / "reset" actions as appropriate.
4. **Error** — error surfaced in-place with (a) human-readable reason, (b) likely cause, (c) recovery action. No raw stack traces.

Use the `shared/ui/StateShell` primitive where applicable. It enforces no-layout-shift transitions (see DESIGN.md UX law #8).

## Persistence rules

- **Default: stateless.** Every visit starts fresh.
- If a tool needs persistence, use `shared/lib/localStore.ts` with a tool-scoped namespace: `tool:<slug>:<key>`.
- Persistence requires explicit user-facing opt-in — a checkbox, "remember this" toggle, or equivalent. No silent writes.
- **Never persist uploaded file contents.** Only user preferences and small metadata.
- Never exceed 1 MB per namespace in localStorage.

## Forbidden in tools

- ❌ Cross-tool imports (`import ... from "@/tools/other-tool"`)
- ❌ Global state mutation
- ❌ Network requests to external APIs with hardcoded keys
- ❌ `window.alert` / `window.confirm` / `window.prompt` — use inline UI instead
- ❌ Raw `fetch` without error handling and user-visible error surfacing
- ❌ Inline hex colors — use design tokens from DESIGN.md
- ❌ Inline pixel values for spacing — use the Tailwind spacing scale
- ❌ Any `// TODO` committed to main without a linked issue number
- ❌ `console.log` in shipped code (use `console.warn` / `console.error` for genuine diagnostics only)

## Registration

Add the tool to `src/app/registry.ts`:

```ts
import { meta as docxToMd } from "@/tools/docx-to-markdown/meta";
// ...
export const registry = [
  docxToMd,
  // ... other tools
];
```

The sidebar auto-generates from this list, groups by `meta.group`, and sorts tools alphabetically by `meta.name` within each group.

## Self-review checklist — run before declaring done

- [ ] `meta.ts` matches the `ToolMeta` interface exactly.
- [ ] `meta.slug` equals the folder name.
- [ ] `meta.group` exists in the allowed-groups list in `DECISIONS.md`.
- [ ] Tool is registered in `src/app/registry.ts`.
- [ ] All four UI states (idle / processing / success / error) are visibly distinct.
- [ ] Processing state has a verbal label specific to this tool's work.
- [ ] No cross-tool imports.
- [ ] No hardcoded colors or magic spacing values.
- [ ] Pure logic lives in `logic.ts` where applicable.
- [ ] `pnpm typecheck` passes with zero errors.
- [ ] `pnpm lint` passes with zero warnings.
- [ ] Tool tested manually with: valid input, empty input, malformed input, large input (>5MB where applicable).
- [ ] No API keys, tokens, or credentials anywhere in source.
- [ ] If persistence was added, it has an explicit opt-in UI.

If any checklist item cannot be satisfied, stop and tell the user before marking the work complete.
