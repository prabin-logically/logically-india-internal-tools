# Logically India Internal Tools

A single web app hosting the small utilities our analyst team uses day to day — file converters, query builders, text helpers, data processors. Replaces the older workflow of passing around standalone HTML files.

Client-side only. Nothing ever leaves the browser. Hosted as static assets on Vercel.

## Stack

- Vite + React 18 + TypeScript (strict)
- Tailwind CSS + shadcn/ui
- React Router
- pnpm

## Getting started

```bash
pnpm install
pnpm dev          # http://localhost:5173
```

Before the app lets you in, you'll see an access code screen. The code is **the current IST time in HHMM 24-hour format** — e.g. 1:27 PM becomes `1327`. Any of the current minute, one minute earlier, or one minute later works.

## Deployment

Push to `main`. Vercel is connected to the GitHub repo and redeploys automatically. Typical time from push to live: 60–90 seconds.

Build settings are default for Vite — `pnpm install` followed by `pnpm build`, output to `dist/`. No environment variables required, no runtime configuration.

## Project structure

```
src/
  main.tsx              # entry
  app/
    Layout.tsx          # app shell (sidebar + main content)
    Sidebar.tsx         # auto-generated from tool registry
    registry.ts         # list of tools that appear in the sidebar
    routes.tsx          # route definitions
    auth/               # access-code gate
  tools/
    <tool-slug>/        # each tool is a self-contained folder
      meta.ts           # name, icon, group, description
      index.tsx         # UI
      logic.ts          # pure processing (optional)
  shared/
    ui/                 # shared components
    lib/                # shared utilities
    types/              # shared TS types
    styles/tokens.css   # design tokens
docs/                   # project conventions (read these before contributing)
```

## Adding or changing tools

This project is built primarily by asking Claude Code in the terminal. The docs in `docs/` and the `CLAUDE.md` at the root define all project conventions — Claude Code reads them at the start of every session and asks clarifying questions before making changes.

Typical flow:

- Open the repo in Claude Code.
- Describe what you want: *"Add a new tool that converts JSON to CSV with nested-key flattening."*
- Claude Code asks clarifying questions and proposes a plan.
- You say go.
- Claude Code scaffolds the tool, registers it in the sidebar, runs typecheck and lint.
- Claude Code proposes a commit message. You commit and push. Vercel redeploys.

Full conventions for what a tool must look like are in [`docs/TOOL_CONTRACT.md`](docs/TOOL_CONTRACT.md).

## Documentation map

| File | What it's for |
|------|---------------|
| [`CLAUDE.md`](CLAUDE.md) | Claude Code's project briefing. Auto-loaded every session. |
| [`docs/TOOL_CONTRACT.md`](docs/TOOL_CONTRACT.md) | Mandatory shape every tool folder must follow. |
| [`docs/DESIGN.md`](docs/DESIGN.md) | Design tokens, component patterns, UX laws. |
| [`docs/AUTH.md`](docs/AUTH.md) | Full spec for the access-code gate. |
| [`docs/DECISIONS.md`](docs/DECISIONS.md) | Append-only log of architectural decisions and their trade-offs. |
| [`docs/JOURNAL.md`](docs/JOURNAL.md) | Append-only log of bugs, gotchas, and lessons learned across sessions. |

## Contributing conventions (short version)

- No cross-tool imports. Tools import only from `@/shared/`.
- No secret API keys in the bundle. If a tool needs one, stop and talk.
- Light theme only. Refined minimalism (reference: Linear, Vercel dashboard). See `docs/DESIGN.md`.
- Dependencies via `pnpm add`; commit both `package.json` and `pnpm-lock.yaml` together.
- User owns git. Claude Code proposes commit messages; humans push.

## License

Internal use only.
