# Personal Primer — Re-Architecture Spec

## Motivation

Personal Primer was one of the first LLM-backed apps in this workspace. Its
core concept is sound — a liberal-education daily tutor that picks a week-long
philosophical topic, finds coherent artifacts from visual art, music, and
literature, educates the user about them, and opens a discussion. But the
implementation is a 2024-era design and shows it:

- **Brittleness.** Bundle generation names artifacts with one LLM call, then a
  separate system (iTunes, Wikimedia, Google CSE) tries to *prove they exist*
  via string-matching, with up to 11 retries and a second coherence-validation
  LLM call. Link resolution silently ships empty URLs on failure.
- **Repetitive topics.** Each arc is generated from the previous arc plus
  distilled "revealed interests." That self-referential loop converges — the
  personalization system is the monotony engine.
- **Over-specification.** `{{END_SESSION}}` / `{{END_ARC}}` / `{{NEW_ARC}}`
  markers, regex farewell fallbacks, a Haiku "incomplete message" check, the
  draft/delivered status with `dayInArc + 1` correction, a five-tone system
  threaded through four prompt sites — scaffolding that propped up a weaker
  model.
- **A standing bug** in day-of-arc counting that surfaces when a calendar day
  is skipped (orphan draft bundles keyed by date).

This is a re-architecture, not a rewrite. The data model's user-scoped shape,
the Firebase/React stack, auth, and the frontend are fine. What gets gutted and
rebuilt is `functions/src/services/` — the generation pipeline and conversation
manager — plus targeted frontend changes.

## Guiding principles

1. **Lean on the model.** Use Opus 4.7 with tool-use (web search) so the model
   *finds and verifies* artifacts in one motion. Delete the separate
   verification layer.
2. **Diversify against what's been done, not against a distillation of the
   user.** Topic selection must see prior topics; it must not be seeded solely
   by inferred interests.
3. **Steering is explicit.** The user shapes the syllabus deliberately.
   Conversations are free to branch and have *no automatic effect* on the
   syllabus or future topics.
4. **Remove scaffolding.** Prefer model tool-calls and plain UI actions over
   in-band text markers and pattern-matching.

## What stays

- User-scoped Firestore data model (`/users/{userId}/...`).
- Firebase Auth with email whitelist; registration/login flow.
- React 18 + Vite frontend, Cloud Functions v2 backend.
- The daily four-artifact bundle rhythm: music, image, text, framing.
- Fixed **7-day arcs**.
- Per-day conversations with a guide; arc-completion retrospectives.
- History view (past bundles and conversations, read-only).

## What is removed

- **The tone system entirely**: `functions/src/tones/`, `ToneSelector`,
  `ToneSelectionView`, `/api/tones`, `/api/user/tone`, `/api/today/tone`,
  `Conversation.initialTone` / `toneChanges`, tone history dividers, the
  onboarding tone step.
- **The per-arc generation chain**: `arcGenerator.ts` is replaced by a season
  planner. `refineArc.ts`, `/api/arc/refine/message`, the `{{NEW_ARC}}` marker,
  and the arc-refinement UI in `ChatInterface` are removed.
- **The artifact verification layer**: the iTunes/Apple Music resolver, the
  coherence-validation LLM call, all alternative-artifact retry prompts. Most of
  `linkValidator.ts` is deleted.
- **Conversation scaffolding**: `{{END_SESSION}}` / `{{END_ARC}}` markers and
  regex fallback detection; the Haiku incomplete-message check.
- **Date-keyed bundle identity** and the draft/`dayInArc + 1` correction logic.

## New architecture

### 1. Model

All LLM calls use **`claude-opus-4-7`** (1M context not required; standard
context is fine). The `quickCheck`/Haiku path is removed along with the
incomplete-message check. Add prompt caching where prompts are large and stable
(season planner, bundle generator system prompts).

### 2. Seasons and arcs

Introduce a **season**: a batch-planned sequence of **12 arcs**, each a fixed
7-day topic. A season is a syllabus — planned like a tutor planning a semester:
diverse across domains (ethics, aesthetics, epistemology, power, the self,
language, mortality, …) *and* sequenced as a deliberate progression (earlier
topics give tools for later ones; occasional callbacks; pacing).

**Data model:**

- `seasons/{seasonId}` (new subcollection under the user): `seasonNumber`,
  `createdAt`, `status` (`active` | `completed`).
- `arcs/{arcId}` gains: `seasonId`, `orderInSeason` (1–12), `status`
  (`planned` | `active` | `completed`). `targetDurationDays` is fixed at 7.
  `startDate` is dropped from progression logic (kept only as display metadata
  if useful). `currentPhase` may be derived from `dayInArc` rather than stored.
- Exactly one arc is `active` per user at a time. When an arc completes, the
  next-order `planned` arc in the season becomes `active`.

**Season planning (`seasonPlanner.ts`, replaces `arcGenerator.ts`):**

- Generates all 12 arc themes in **one LLM call** so the model can self-
  diversify against the whole set.
- Inputs: explicit diversity + progression constraints; the full list of
  **every topic from every prior season** (do-not-retread); and, for season 2+,
  a *light, stable* user profile (see Memory below). Season 1 is planned with
  no user knowledge — a deliberately broad survey.
- Output per arc: `theme`, `description`, `shortDescription`.
- Triggered: at first use (season 1); and when the current season's last arc
  completes (season N+1).

### 3. The visible, steerable syllabus

`ArcView` is replaced by a **"Your Semester"** view: the 12 topics with
status (completed / active / planned), descriptions, and a conversational way
to steer the *planned* (not-yet-started) portion.

**Steering is explicit only.** The user can, via conversation in this view:
swap a planned topic, reorder, remove, or add one; or reweight ("more from the
visual-art side"). When a structural change is made, the model **re-plans the
unstarted remainder** — preserving completed and active arcs — so progression
stays coherent. There is **no inferred mid-season adaptation**: conversational
drift never edits the syllabus.

The daily Today view does **not** show upcoming topics — artifact-level
surprise is preserved. The syllabus is legible only when the user goes to look
at it.

New/changed endpoints:
- `GET /api/season` — current season with all 12 arcs and statuses.
- `POST /api/season/steer/message` — conversational steering of the planned
  remainder; returns the updated season when a change is applied.

### 4. Bundles — sequential, not date-keyed

A bundle's identity is **`(arcId, dayInArc)`**, not a calendar date. Calendar
date becomes metadata (`createdAt`), not identity. This eliminates the
day-counting bug class.

- A bundle has `arcId`, `dayInArc` (1–7), `engaged` (boolean), `createdAt`,
  and the artifact + framing fields.
- **At most one un-engaged bundle exists per user at a time.** Its `dayInArc`
  is `(count of engaged bundles in the arc) + 1`.
- Arc progression counts **engaged** bundles only — skipping a day never
  consumes a slot.
- "Today's encounter": on load, find the active arc. If an un-engaged bundle
  exists and was created today, show it. If an un-engaged bundle exists but is
  stale (created on a prior calendar day), regenerate it in place (same
  `dayInArc`, fresh content). If none exists, generate one.
- A bundle becomes `engaged` when the user sends their first message —
  replacing the old `draft`/`delivered` status. On engagement, exposures are
  created and the slot is locked. When the arc's 7th bundle is engaged and that
  session ends, the arc completes.

Replaces `draft`/`delivered` and the `dayInArc + 1` display correction.

### 5. Bundle generation — tool-use artifact finding

`bundleGenerator.ts` is rebuilt around model tool-use.

- A single generation pass gives the model **web search** (Anthropic server
  tool). The model selects three coherent artifacts for the arc's topic/phase
  *and* finds verified, working URLs for each in the same pass:
  - **Music**: a real track with a working **`youtube.com`** URL (regular
    YouTube, not `music.youtube.com`, so it plays without a subscription).
  - **Image**: a real artwork with a working image URL (Wikimedia Commons or
    comparable).
  - **Text**: a real, verbatim, correctly attributed quote/excerpt. The model
    must verify the quote and attribution via search — no synthesized text.
- The model is instructed on coherence directly (artifacts cohere with the
  topic and each other; explicit cross-references must match) — no separate
  coherence-validation call.
- Exposure-awareness: the prompt includes recent exposures (30-day window) and
  recent creators; the model avoids repeats itself. No retry cascade.
- Optional: one lightweight reachability check (HEAD request) on the image and
  music URLs as cheap insurance. No alternative-selection retry loop — if a URL
  fails the check, the model is asked once to substitute, and that is the cap.
- **Framing text** is still generated after artifacts are finalized so it
  matches what is displayed. It is generated in the user's voice (see below).
- Generation runs server-side; keep an eye on latency. If a single tool-use
  pass is too slow for a synchronous `GET /api/today`, generation may move
  behind a brief loading state or be split, but a single pass is the target.

`linkValidator.ts` is reduced to (at most) a generic URL reachability check.
iTunes, Google CSE, and the Wikimedia multi-strategy search are deleted.
`GOOGLE_SEARCH_API_KEY` / `GOOGLE_SEARCH_CX` secrets are no longer needed.

### 6. Conversation

`conversationManager.ts` is simplified.

- System prompt includes today's artifacts, framing, arc context, the user's
  **voice preference**, and memory for continuity (below).
- **Session end** is handled by (a) the explicit "End Session" UI button
  (always available), and (b) a model **tool call** (`conclude_session`) the
  guide invokes when the conversation reaches a natural close. No text markers,
  no regex fallback.
- **Arc end on request**: keep an explicit "Move on" action (the existing
  end-arc-early UI) and/or a `conclude_arc` tool the guide calls when the user
  clearly wants to leave the topic. No `{{END_ARC}}` marker.
- The incomplete-message check is removed entirely.
- Conversations may branch freely. Nothing in a conversation edits the
  syllabus.

### 7. Voice preference (replaces tones)

- `users/{userId}.voicePreference`: a freeform string (nullable). Null → the
  guide uses a sensible default register.
- The conversation guide has a tool, `update_voice_preference(description)`,
  which it calls when the user expresses a preference ("be more direct and
  less dreamy"). The change persists across days and applies to all
  user-facing generation: framing text, conversation, arc retrospectives.
- No dropdown, no fixed tone set, no onboarding tone step, no history dividers.

### 8. Memory — conversational continuity only

The insight system is **demoted**. It no longer feeds curation.

- Per-session extraction is retained only for **conversational continuity**:
  personal context the guide should remember so it doesn't greet the user as a
  stranger. This is injected into conversation system prompts.
- A **light, stable user profile** is derived at **season boundaries only**
  (not per conversation) and is the *only* memory input to season planning,
  where it gently biases — never generates — the syllabus.
- "Suggested reading" at session end may be retained as-is (it is independent
  of the convergence problem) — keep it if cheap, drop it if it complicates the
  rebuild.

## API surface (after rebuild)

Unchanged: `/api/auth/*`, `/api/today` (GET), `/api/today/message`,
`/api/today/end-session`, `/api/today/react`, `/api/history`,
`/api/history/:date/conversation`, `/api/user/profile`,
`/api/user/mark-about-seen`, `/api/arc/end-early`.

Removed: `/api/tones`, `/api/user/tone`, `/api/today/tone`,
`/api/arc/refine/message`, `/api/arc` (GET — replaced by `/api/season`).

Added: `GET /api/season`, `POST /api/season/steer/message`.

Note: `/api/history/:date/conversation` and history identifiers may need to
shift from date-based to bundle-based keys; preserve read access to history.

## Frontend changes

- **`ArcView` → `SeasonView`** ("Your Semester"): 12 topics with status, plus
  conversational steering of the planned remainder.
- **`ChatInterface`**: remove the tone selector, tone-change dividers, and the
  arc-refinement sub-UI. Session/arc end driven by explicit buttons and the
  server's tool-call signals.
- **Onboarding (`App.tsx`)**: remove the `ToneSelectionView` step. After
  `AboutView`, the first season is generated; optionally show the new season's
  syllabus as a first-run moment.
- Delete `ToneSelector.tsx`, `ToneSelectionView.tsx`. `PreferencesView` loses
  tone settings (voice preference is set conversationally, not via a form);
  keep the view only if it still has a purpose, otherwise remove it.
- Nav: "Arc" link becomes "Semester".

## Data migration

This is a personal, low-user app and the schema changes are significant.

- **No migration script.** On first load after deploy, if the user has no
  `season`, generate season 1. Any in-flight legacy arc is abandoned.
- Legacy `arcs`/`dailyBundles`/`conversations` documents remain in Firestore,
  untouched. The History view should still display legacy delivered bundles
  on a best-effort basis (they share the music/image/text shape); degraded
  arc/season grouping for legacy data is acceptable.
- Old secrets (`GOOGLE_SEARCH_API_KEY`, `GOOGLE_SEARCH_CX`) can be left set but
  become unused.

## Suggested phasing

1. **Foundations**: model upgrade to `claude-opus-4-7`; remove the tone system
   end-to-end; new season/arc/bundle data model and types.
2. **Season planner**: batched 12-arc generation; season 1 vs N+1 logic.
3. **Bundle generator**: tool-use artifact finding (web search), YouTube music,
   sequential `(arcId, dayInArc)` bundles, `engaged` flag, framing in voice.
4. **Conversation**: voice preference + tool; tool-based session/arc end;
   remove markers and the incomplete-message check; demote memory.
5. **Frontend**: `SeasonView` with steering; strip tone UI and arc-refinement
   UI; onboarding update; nav rename.
6. **Cleanup**: delete dead code (`linkValidator` internals, `arcGenerator`,
   `refineArc`, `tones`, `ToneSelector`, `ToneSelectionView`); update
   `README.md` and `CLAUDE.md`; remove stale design docs
   (`TONE-SYSTEM-DESIGN.md`, `TONE-SYSTEM-PROGRESS.md`).

## Out of scope

- Multi-user scaling work beyond what already exists.
- Visual redesign of the frontend (functional changes only).
- Mobile/native apps.
