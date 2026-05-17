# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Personal Primer is a multi-user web application that delivers a single, thoughtful daily intellectual encounter. It curates three artifacts daily (music, image, text) plus framing text, organized into week-long thematic "arcs."

**Core philosophy:** Formation over education, one intentional encounter per day, no testing/grading/streaks.

The project was re-architected from an earlier 2024-era design; see `REBUILD-SPEC.md` for the rationale and the shape of that change.

## Tech Stack

- **Frontend:** React 18 + Vite (in `hosting/`)
- **Backend:** Node.js 20 / TypeScript with Firebase Cloud Functions v2 (in `functions/`)
- **Database:** Firebase Firestore
- **LLM:** Anthropic Claude API (`claude-opus-4-7`) via `@anthropic-ai/sdk`, using the `web_search` server tool for artifact discovery and verification
- **Authentication:** Firebase Auth (multi-user with email whitelist)

## Build and Deploy Commands

```bash
# Install dependencies
cd functions && npm install
cd hosting && npm install

# Set the API secret (required before deploy)
firebase functions:secrets:set ANTHROPIC_API_KEY

# Local development
cd hosting && npm run dev          # Frontend dev server (port 5173)
firebase emulators:start           # Firebase emulators

# Build
cd functions && npm run build      # Compile TypeScript
cd hosting && npm run build        # Build React app

# Deploy
firebase deploy                    # Deploy everything
firebase deploy --only functions   # Deploy only functions
firebase deploy --only hosting     # Deploy only hosting
firebase deploy --only firestore   # Deploy security rules + indexes
```

**Deploy prerequisite:** the `web_search` tool must be enabled on the Anthropic API account (developer console settings). Bundle generation fails without it.

## Architecture

### Multi-User Data Structure
All user data is stored in subcollections under `/users/{userId}/`:
```
/users/{userId}/
  /seasons/{seasonId}
  /arcs/{arcId}
  /dailyBundles/{bundleId}
  /exposures/{autoId}
  /conversations/{bundleId}
  /sessionInsights/{bundleId}

/allowedEmails/{normalizedEmail}  (whitelist for registration)
/users/{userId}                    (user profile documents)
```

### Authentication Flow
1. **Registration:** User submits email/password → backend checks `/allowedEmails` whitelist → creates Firebase Auth user
2. **Login:** Standard Firebase Auth email/password
3. **API Calls:** Frontend sends ID token in `Authorization: Bearer` header → backend verifies with `admin.auth().verifyIdToken()`

### Courses and Arcs
A **season** (called a "Course" in the UI) is a batch-planned syllabus of **12 arcs**, each a fixed **7-day** topic. The whole season is planned in a single LLM call so topics are diverse and deliberately sequenced, rather than each arc riffing on the previous one (the old per-arc chain caused topic monotony).

- **Season 1** is planned with no user knowledge — a broad survey.
- **Season N+1** is planned with the full list of every prior topic (do-not-retread) plus a light, stable user profile that *biases* but never generates the syllabus.
- An arc has `status: 'planned' | 'active' | 'completed'` and `orderInSeason` (1–12). Exactly one arc is active per user. When an arc completes, the next planned arc activates. When the last arc completes, the next season is planned.

### Daily Bundle
Each day delivers three artifacts plus framing text that cohere around the active arc:
1. **Music** — one piece with a YouTube link
2. **Image** — one visual artwork
3. **Text** — one verbatim, correctly attributed quote or excerpt
4. **Framing** — 1–3 paragraphs introducing the encounter

Bundles are identified by `(arcId, dayInArc)`, not calendar date. They carry an `engaged` boolean — `false` until the user sends their first message. At most one un-engaged bundle exists per user; if it goes stale (created on a prior calendar day) it is regenerated in place. Arc progression counts only engaged bundles, so skipping a day never consumes a slot.

### Bundle Generation
Bundle generation is **asynchronous**. `GET /api/today` never generates inline — it returns a status (`generating` / `ready` / `failed`) immediately and the frontend polls. When today's bundle doesn't exist, `today.ts` atomically creates a `pending` bundle document (the atomic create is the concurrency lock); a Firestore `onDocumentWritten` trigger (`bundleGenerator`) then runs generation out-of-band, free of Firebase Hosting's 60-second proxy timeout.

Generation is a **single `web_search` LLM call**: the model selects three coherent artifacts for the arc's topic/phase, verifies them, and writes the framing text — all in one pass. Coherence is instructed in-prompt; recent exposures (30-day window) are included so the model self-avoids repeats; framing uses the user's voice preference. The result is returned via a structured tool call (`submit_bundle`), so the output is schema-enforced rather than parsed from text.

The model supplies the music's YouTube URL directly. **Image URLs are resolved via the Wikimedia Commons API** from the artwork's title/artist — the model identifies the artwork but does not emit the image URL itself (it can't reliably produce Wikimedia's content-hashed file paths). If image resolution fails, the bundle is marked `failed` and an attempt-capped retry regenerates with a different artwork.

A bundle carries `generationStatus` (`pending` / `generating` / `ready` / `failed`) and `generationAttempts`. A bundle wedged in `generating` past a watchdog threshold is treated as failed and retried.

### Conversation
The conversation guide's system prompt includes the day's artifacts, framing, arc context, the user's voice preference, and memory for continuity. Session and arc end are driven by model **tool calls** (`conclude_session`, `conclude_arc`), not in-band text markers. The guide can also call `update_voice_preference` when the user asks it to change register ("be more direct"). Conversations may branch freely and never edit the syllabus.

### Voice Preference
`UserProfile.voicePreference` is a freeform string the guide updates via tool call. It applies to all user-facing generation: framing text, conversation, and arc retrospectives. There is no fixed tone menu (the earlier five-tone system was removed).

### Memory
Insight extraction is for **conversational continuity only** — personal context the guide should remember. A light, stable `UserMemoryProfile` is derived at **season boundaries** (not per conversation) and gently biases the next season's planning. Memory never steers the current syllabus.

### API Endpoints
All endpoints require authentication (except `/api/auth/*`):
- `POST /api/auth/register` — register new user (checks whitelist)
- `POST /api/auth/forgot-password` — send password reset email
- `POST /api/auth/resend-verification` — resend email verification
- `GET /api/today` — returns today's bundle if ready, otherwise a `generating`/`failed` status (generation runs out-of-band; see Bundle Generation)
- `POST /api/today/message` — send a conversation message
- `POST /api/today/end-session` — end session, extract insights
- `POST /api/arc/end-early` — end the current arc early, advance to the next
- `GET /api/season` — current season (Course) with all 12 arcs and statuses
- `POST /api/season/steer/message` — conversationally steer the planned arcs of the current season
- `GET /api/history` — past bundles, grouped by arc
- `GET /api/history/:bundleId/conversation` — conversation history for a past bundle
- `GET /api/user/profile` — user profile (hasSeenAbout, voicePreference)
- `POST /api/user/mark-about-seen` — mark the onboarding About page as seen

### Insight Extraction
Triggered on explicit session end, natural conversational close, or 1-hour inactivity. Extracts personal context and a short summary for conversational continuity, plus an optional suggested reading.

### Arc & Season Completion
When the final day of an arc ends, the LLM generates a short retrospective and the next planned arc activates. When the final arc of a season completes, a `UserMemoryProfile` is derived and the next season is planned.

## Key Constraints

- No artifact or creator repeats within a 30-day window (recent exposures are passed to the model)
- Music URLs come from the model; image URLs are resolved via the Wikimedia Commons API
- Framing text is produced in the same call as artifact selection, so it always matches what is displayed
- Bundle generation runs out-of-band in a Firestore trigger; `GET /api/today` is non-blocking
- Bundle identity is `(arcId, dayInArc)`; arc progression counts only `engaged` bundles
- One season active at a time, 12 arcs per season, 7 days per arc
- One arc active at a time per user

## Key Files

### Backend (`functions/src/`)
- `index.ts` — Cloud Functions entry point, routes all API calls with auth middleware
- `middleware/auth.ts` — token verification middleware
- `api/auth.ts` — registration, forgot password, verification endpoints
- `api/today.ts` — resolves the day's bundle; non-blocking, returns a `generating`/`ready`/`failed` status
- `api/message.ts` — conversation message handler; engages the bundle on first message
- `api/season.ts` — `GET /api/season` and conversational season steering
- `api/endSession.ts`, `api/endArcEarly.ts` — session/arc end, arc and season advancement
- `api/history.ts`, `api/conversationHistory.ts` — past bundles and conversations
- `triggers/bundleTrigger.ts` — Firestore `onDocumentWritten` trigger; generates the daily bundle out-of-band
- `services/anthropic.ts` — Claude client; structured-output (tool-use) and `web_search` helpers
- `services/seasonPlanner.ts` — batched 12-arc season generation
- `services/bundleGenerator.ts` — daily bundle generation: single web-search call + Wikimedia image resolution
- `services/conversationManager.ts` — chat with tool-based session/arc end
- `services/insightExtractor.ts` — continuity insights, arc/season advancement, profile derivation
- `services/linkValidator.ts` — Wikimedia Commons image resolution + URL reachability check
- `utils/firestore.ts` — user-scoped Firestore operations (all functions take userId)
- `scheduled/inactivityCheck.ts` — scheduled function ending stale sessions (every 15 min)

### Frontend (`hosting/src/`)
- `App.tsx` — main app with auth UI and About-only onboarding
- `api/client.ts` — typed API client
- `views/TodayView.tsx` — main daily view
- `views/CourseView.tsx` — "Your Course": the 12-arc syllabus with status and conversational steering
- `views/HistoryView.tsx` — past bundles grouped by arc
- `views/ConversationHistoryView.tsx` — read-only past conversation, keyed by bundleId
- `components/ChatInterface.tsx` — conversation UI (handles suggested reading, arc completion)
- `components/MusicCard.tsx`, `ImageCard.tsx`, `TextCard.tsx`, `FramingText.tsx` — artifact display

## First-Time Setup

1. Create a Firebase project at console.firebase.google.com
2. Enable Firestore, Authentication (Email/Password), and Functions
3. Copy `hosting/.env.example` to `hosting/.env` with your Firebase config
4. Enable the `web_search` tool on your Anthropic API account
5. Run `firebase functions:secrets:set ANTHROPIC_API_KEY`
6. Deploy security rules and indexes: `firebase deploy --only firestore`
7. Add allowed emails to the `/allowedEmails` collection in Firestore

The first course is planned automatically on a user's first visit — no seed script is needed.

## Managing Users

### Adding a new user
1. Add their email to `/allowedEmails/{email}` in the Firestore Console
2. The user can then register via the signup form
