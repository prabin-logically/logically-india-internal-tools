# Access Gate Specification

This document is the full spec for the access gate that guards every tool in the app. Every detail below is normative.

## Purpose and honest caveat

The gate is a **friction barrier**, not authentication. Its job is to prevent casual or accidental access — a curious colleague, a link pasted in the wrong Slack channel, a URL that leaked outside the team. It is not a security boundary against a motivated attacker. Anyone who opens the browser's devtools and reads the bundle can deduce the scheme and compute the current code.

**Acceptable because:**
- The URL is not publicly advertised.
- The app is client-side only; nothing on the server side to protect.
- The team shares the scheme out-of-band.
- The tools do not process third-party sensitive data — users bring their own data into their own browser.

**Unacceptable as:**
- Real authentication
- Protection against a targeted attacker
- A substitute for source-code access control (the repo should be private)

If the threat model changes (public URL, sensitive stored data, external users), replace this with real auth via a serverless function. That change requires a new entry in `DECISIONS.md`.

## Access code scheme

The access code is the **current IST time as HHMM in 24-hour format**, zero-padded.

- 1:27 PM IST → `1327`
- 9:05 AM IST → `0905`
- 00:00 IST (midnight) → `0000`
- 23:59 IST → `2359`

Codes are 4 digits exactly. No separators, no spaces.

## Grace window

Accept three consecutive minutes: the current minute, one minute before, and one minute after.

- At system time 13:27:30 IST, accept `1326`, `1327`, or `1328`.
- At 00:00:30 IST, accept `2359`, `0000`, or `0001` (wrap correctly across midnight).

This prevents failure from typing latency or slight clock drift.

## Timezone handling

Always compute the expected code using the `Asia/Kolkata` timezone, regardless of the browser's local timezone setting. A user in Singapore or London using this app must see the same expected code as a user in Mumbai.

Reference implementation (goes in `src/app/auth/timeCode.ts`):

```ts
// Returns the HHMM string in IST for the given Date.
export function istCode(now: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Kolkata",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(now);
  const hh = parts.find(p => p.type === "hour")?.value ?? "00";
  const mm = parts.find(p => p.type === "minute")?.value ?? "00";
  return `${hh}${mm}`;
}

// Returns true if the given input is within the ±1 minute grace window.
export function isValidCode(input: string, now: Date = new Date()): boolean {
  if (!/^\d{4}$/.test(input)) return false;
  const current = new Date(now);
  const candidates: string[] = [];
  for (const offset of [-1, 0, 1]) {
    const t = new Date(current.getTime() + offset * 60_000);
    candidates.push(istCode(t));
  }
  return candidates.includes(input);
}
```

Note: the `Intl.DateTimeFormat` approach handles IST, DST edge cases (none in India but safe elsewhere), and midnight wrap automatically. Do not hand-roll timezone math.

## Storage and session lifecycle

- **Storage:** `sessionStorage`, key `"lit-unlocked"`, value `"1"`.
- **Set:** on successful gate entry.
- **Cleared automatically:** when the tab closes (browser behavior for sessionStorage).
- **Not persisted across tabs.** Each new tab requires a fresh unlock.
- **Not persisted across browser restarts.**
- **No idle timeout in v1.** A tab left open remains unlocked. Treat OS-level screen lock as the layer handling idle physical security.

A manual "Lock" action may be added to the sidebar footer later; it is not required for v1.

## UI specification

### Route behavior

- The gate is mounted at every route via a wrapper component. Any route access without `sessionStorage["lit-unlocked"] === "1"` renders the gate and suppresses the app shell.
- On successful unlock, the gate unmounts and the originally requested route renders.
- Deep links (`/tools/docx-to-markdown`) are preserved: after unlock, route to the original destination, not to `/`.

### Layout

- Full viewport, centered card, `--bg` background.
- Card: `--surface` background, `rounded-lg`, `shadow-sm`, max-width `360px`, padding `8` (Tailwind).
- Content in the card, top to bottom:
  1. Small app name: `Logically India Internal Tools`, `text-sm`, `--text-muted`
  2. Label: `Access code`, `text-sm`, `--text`, `font-medium`
  3. Single input, 4 digits, numeric inputMode, monospace font, centered text, `text-2xl`, tracked with `tracking-widest`
  4. Helper or error text slot below input, `text-xs`, reserved height to prevent layout shift
- No logo, no illustration, no decorative elements. No "forgot code" link. No hints about the scheme.

### Input behavior

- `type="text"`, `inputMode="numeric"`, `autoComplete="off"`, `maxLength={4}`, `pattern="\d{4}"`, `aria-label="Access code"`.
- Auto-focus on mount.
- Accept only digits; ignore any other keypress.
- **Auto-submit when 4 digits are entered.** Also submit on Enter.
- On submit:
  - If valid per `isValidCode`: set `sessionStorage["lit-unlocked"] = "1"`, unmount gate, render target route.
  - If invalid: show error text in the slot ("Incorrect code"), keep focus, clear the input after a 600ms delay so the user sees their entry before retry.
- Error text announced via `aria-live="polite"`.

### Visual states

| State | Input border | Helper slot |
|-------|--------------|-------------|
| Idle (empty) | `--border` | empty (invisible, space reserved) |
| Typing | `--border-strong` on focus ring `--accent` | empty |
| Submitting | `--border` | `Checking...` in `--text-muted` (if check somehow isn't instant — expected to rarely show) |
| Invalid | `--error` | `Incorrect code` in `--error` |

No loading spinner is needed; validation is synchronous and instant.

### Motion

- Gate unmount → app mount: 150ms opacity fade on the gate card. Respect `prefers-reduced-motion`.

## File structure

```
src/app/auth/
  Gate.tsx         # the UI component
  useAuth.ts       # hook returning { unlocked, unlock(), lock() }
  timeCode.ts      # pure: istCode(), isValidCode()
```

`timeCode.ts` contains no React, no DOM, no storage. It is pure and trivially testable.

`useAuth.ts` wraps sessionStorage access and re-reads on mount. It does **not** continuously poll — the unlocked flag is set once and the hook doesn't need to know about time passing.

`Gate.tsx` is presentational. It receives `onUnlock` from a parent route guard.

## Integration points

- Wrap `app/Layout.tsx` with a route guard that reads `useAuth`. If not unlocked, render `<Gate />`; otherwise render children.
- The guard must preserve the current location so the user lands on their intended route after unlock.
- No tool file imports anything from `auth/`. Tools assume the gate has already passed.

## Self-review checklist for the gate implementation

- [ ] `timeCode.ts` is pure and exports `istCode` and `isValidCode` with full typing.
- [ ] `isValidCode` accepts current minute and ±1 minute.
- [ ] IST is computed via `Intl.DateTimeFormat` with `timeZone: "Asia/Kolkata"`, not manual offsetting.
- [ ] Gate renders on every route when not unlocked.
- [ ] Successful unlock preserves the original requested route.
- [ ] sessionStorage is used, not localStorage.
- [ ] Input auto-focuses, accepts only digits, auto-submits at 4 digits, also submits on Enter.
- [ ] Error shows "Incorrect code", clears input after 600ms, keeps focus.
- [ ] No hints about the scheme appear in the UI.
- [ ] No console logs reveal the expected code.
- [ ] Layout matches DESIGN.md tokens.
- [ ] Tested manually with: correct code, wrong code, code with offset ±1, midnight wrap.
