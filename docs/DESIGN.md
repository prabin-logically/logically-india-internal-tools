# Design Constitution

This document governs every visual and interaction decision. When it conflicts with the default behavior of the installed `frontend-design` skill, **this document wins.**

## Aesthetic direction (FIXED — do not propose alternatives)

**Refined minimalism.** The reference set:

- Linear (linear.app)
- Vercel Dashboard
- Stripe internal tools
- Raycast

"Bold" in this project means bold in **restraint and precision** — not bold in visual intensity. No brutalism, no maximalism, no retro-futurism, no editorial magazine feel, no playful illustrations. The user is a senior analyst under time pressure. The interface should feel calm, accurate, and get out of the way.

## Design tokens

All color, spacing, radius, and type values come from Tailwind config plus CSS variables defined in `src/shared/styles/tokens.css`. **Never inline values.** If a value isn't in the tokens, propose an addition instead of hardcoding.

### Color

Light theme is the default and only supported mode for v1. Dark mode may be added later; do not scaffold it now, do not use `dark:` variants in Tailwind classes.

| Token | Value | Use |
|-------|-------|-----|
| `--bg` | `#FAFAFA` | App background |
| `--surface` | `#FFFFFF` | Cards, panels, inputs |
| `--surface-2` | `#F4F4F5` | Subtle section backgrounds, hover states |
| `--border` | `#E4E4E7` | Default borders |
| `--border-strong` | `#D4D4D8` | Emphasized borders |
| `--text` | `#18181B` | Primary text |
| `--text-muted` | `#71717A` | Secondary text |
| `--text-subtle` | `#A1A1AA` | Tertiary, timestamps, helper text |
| `--accent` | `#2563EB` | Primary action (blue-600) |
| `--accent-hover` | `#1D4ED8` | Primary action hover |
| `--success` | `#16A34A` | Success states |
| `--warning` | `#D97706` | Warning states |
| `--error` | `#DC2626` | Error states |

### Typography

- **Display / UI**: Inter via `@fontsource/inter` (weights 400, 500, 600 only)
- **Monospace**: JetBrains Mono (weights 400, 500) — for code, hashes, file paths, extracted data
- No decorative fonts. No serif fonts.

Scale (Tailwind classes):

- `text-xs` (12px) — metadata, helper text, timestamps
- `text-sm` (14px) — body default, UI labels
- `text-base` (16px) — long-form content, readable output
- `text-lg` (18px) — section headers
- `text-xl` (20px) — tool title in `ToolShell`
- `text-2xl` (24px) — rarely; app-level titles only

### Spacing

Tailwind default scale only. Preferred values: `2, 3, 4, 6, 8, 12, 16`. Avoid `5, 7, 9` and custom pixel values.

### Radius

- `rounded-md` (6px) — inputs, buttons
- `rounded-lg` (8px) — cards, panels, modals
- `rounded-xl` and above — **do not use** (too soft for this aesthetic)

### Shadow

- `shadow-sm` — cards on hover only
- No heavy drop shadows. No colored shadows. No `shadow-lg` or above.

### Motion

- Default transition: `150ms ease-out` for color/opacity
- Transform transitions: `200ms ease-out`
- Respect `prefers-reduced-motion` — disable transforms, keep opacity fades
- **No entrance animations on mount by default.** Motion is reserved for state transitions, not decoration.

## UX laws (numbered, testable)

These are inviolable. Every tool must pass every law before being marked done.

1. **Verbal status.** Every async operation shows a specific label in words, not a generic spinner. "Parsing resume.docx..." not "Loading...". If the operation takes more than 500ms, the label must appear.

2. **Progress over activity.** For operations with known duration or byte-size, show progress (percent, bytes processed, items done). Reserve indeterminate spinners for truly unknown-duration work.

3. **Disabled buttons have a reason.** A disabled action must have a tooltip or adjacent helper text explaining why it's disabled. No silent disable.

4. **Errors are recoverable.** Every error state shows (a) what failed, (b) likely cause in plain language, (c) a clear next action (retry, reset, change input). No raw stack traces shown to users. Log technical details to console for debugging.

5. **Destructive actions confirm.** Anything that deletes state, clears output, or overwrites files requires explicit confirmation via an inline confirm UI. Never use `window.confirm`.

6. **Success confirms visibly.** Every completed action produces a visible confirmation (toast, inline message, or state change). Silent success is a bug.

7. **Keyboard-first.** Every action reachable by mouse must be reachable by keyboard. Every interactive element has a visible focus ring. Tab order must be logical.

8. **No layout shift on state change.** Processing → success transitions must not cause the page to jump. Reserve vertical space for output areas from the start.

9. **File operations show what they got.** When a file is uploaded, show filename, size, and type before processing. Never process a file silently.

10. **Copy-to-clipboard has feedback.** "Copy" buttons briefly show "Copied" state on success (2s).

## Component patterns

All custom primitives live in `src/shared/ui/`. Extend shadcn components there rather than building parallel components elsewhere.

### File drop zone — required states

| State | Border | Background | Label |
|-------|--------|------------|-------|
| Idle | Dashed `--border` | `--surface` | Muted: "Drop a .docx file or click to browse" |
| Hover (drag-over) | Solid `--accent` | `--accent` at 5% opacity | Unchanged |
| Processing | Solid `--border` | `--surface` | Specific work label + progress bar if measurable |
| Done | Solid `--success` | `--surface` | Filename + "Process another" action |
| Error | Solid `--error` | `--surface` | Error message + "Try again" action |

### Button hierarchy

- **Primary** — one per view maximum. Solid `--accent` background, white text.
- **Secondary** — outline, `--border-strong`, `--text` foreground.
- **Ghost** — no border, hover background `--surface-2`.
- **Destructive** — outline `--error`, fills on hover. Requires confirm per UX law #5.

### Toast / notification

Use `shared/ui/Toaster`. Position bottom-right. Auto-dismiss success at 3s. Errors persist until dismissed. Never stack more than 3; queue the rest.

### Empty states

Every list or output panel that can be empty has a designed empty state with (a) a short message explaining what would appear here, (b) a next-action hint if applicable. No blank rectangles.

### Access gate

The access gate has its own layout and state spec in `docs/AUTH.md`. The short version for design consistency:

- Full-viewport `--bg`, centered card on `--surface`
- Single 4-digit input, monospace, `text-2xl`, letter-spaced
- No logo, no illustration, no hints
- Error text in `--error` with 600ms input-clear delay
- 150ms opacity fade on unlock transition, `prefers-reduced-motion` respected

The gate is the user's first impression of the app. It must feel fast, calm, and deliberate — not scary, not decorative.

## Forbidden

- ❌ Gradients of any kind
- ❌ Emoji in UI chrome (acceptable inline in user-generated content)
- ❌ Decorative illustrations or stock photos
- ❌ Glassmorphism, backdrop blur, translucent panels
- ❌ Neon or saturated accent colors beyond the defined accent
- ❌ Serif fonts
- ❌ Auto-playing motion, parallax, scroll-triggered entrance animations
- ❌ Custom cursors
- ❌ Heavy box shadows
- ❌ Border radii above 8px
- ❌ More than one primary action per view

## Override note for the `frontend-design` skill

The installed `frontend-design` skill is built to push Claude toward bold, distinctive, often maximalist aesthetic directions in order to avoid generic AI-generated design. That default bias is **overridden** by this document for this project.

What to keep from the skill:
- UX engineering discipline (accessibility, state handling, motion preferences)
- Typography-scale thinking (rhythm, hierarchy)
- Interaction-state completeness (hover / focus / active / disabled)
- Performance and bundle awareness

What to override:
- Any suggestion of a "bold aesthetic direction" beyond refined minimalism
- Unusual font pairings
- Color palettes outside this document
- Decorative motion, scroll-triggered effects, asymmetric "grid-breaking" layouts

When the skill's instructions conflict with this DESIGN.md, DESIGN.md wins. If the conflict is material, flag it to the user before proceeding.
