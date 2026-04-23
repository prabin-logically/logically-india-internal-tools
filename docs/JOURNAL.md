# Session Journal

Append-only log of non-trivial events: bugs found and fixed, surprises, environment gotchas, things future sessions must remember.

This is **not a changelog** (use git commit history for that) and **not a decisions log** (use `DECISIONS.md` for architectural choices). The journal captures the kind of knowledge that would otherwise be lost between sessions — "why did we do X that weird way?", "what broke last time we touched Y?", "what does that cryptic error mean?"

## When to write an entry

- A bug was found and fixed (always).
- A fix was non-obvious or the root cause was surprising.
- An environment quirk bit us (build tool, library version, Vercel config, browser API).
- A performance issue was diagnosed.
- A security concern was found or resolved.
- A library behaved differently than expected.
- Anything a future Claude Code session would benefit from knowing before retrying similar work.

Skip for: routine feature work, successful implementations with no surprises, commit-log-level events.

## Entry format

```
## YYYY-MM-DD — Short event title

**Kind**: bug | gotcha | environment | performance | security | other
**Session goal**: one sentence
**What happened**: the surprise or failure, observable symptoms
**Root cause**: why, not just what
**Fix**: what was changed
**Remember next time**: generalizable lesson (omit if none)
**Related files**: paths
```

---

## 2026-04-23 — Initial project scaffold

**Kind**: other
**Session goal**: Establish project conventions before any tool code.
**What happened**: Project initialized from blank slate. `CLAUDE.md`, `TOOL_CONTRACT.md`, `DESIGN.md`, `DECISIONS.md`, and this journal created.
**Fix**: n/a — scaffolding, not a fix.
**Remember next time**: This is the canonical starting shape. Any deviation from the folder layout documented in `CLAUDE.md` requires a corresponding entry in `DECISIONS.md`.
**Related files**: `CLAUDE.md`, `docs/*`
