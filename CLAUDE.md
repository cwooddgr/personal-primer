# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Personal Primer is a personal web application that delivers a single, thoughtful daily intellectual encounter. It curates four artifacts daily (music, image, text, framing) around ~7 day thematic "arcs."

**Core philosophy:** Formation over education, one intentional encounter per day, no testing/grading/streaks.

## Tech Stack

- **Frontend:** React 18 + Vite (in `hosting/`)
- **Backend:** Node.js 20 / TypeScript with Firebase Cloud Functions v2 (in `functions/`)
- **Database:** Firebase Firestore
- **LLM:** Anthropic Claude API (claude-opus-4-5-20251101) via @anthropic-ai/sdk
- **Link Resolution:** Google Custom Search API
- **Authentication:** Firebase Auth (single user)

## Build and Deploy Commands

```bash
# Install dependencies
cd functions && npm install
cd hosting && npm install

# Set secrets (required before deploy)
firebase functions:secrets:set ANTHROPIC_API_KEY
firebase functions:secrets:set GOOGLE_SEARCH_API_KEY
firebase functions:secrets:set GOOGLE_SEARCH_CX

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
```

## Architecture

### Daily Bundle Structure (Fixed)
Each day delivers exactly four elements that cohere around the current arc theme:
1. **Music** - One piece with Apple Music link (validated)
2. **Image** - One visual artwork from museum/Wikimedia (validated)
3. **Text** - One quote or literary excerpt
4. **Framing** - 2-3 paragraph introduction connecting to recent days

### Core Data Collections (Firestore)
- `arcs` - Thematic journeys (~7 bundles each with early/middle/late phases, includes `completedDate` when finished, `shortDescription` for UI display)
- `dailyBundles` - Daily content (keyed by YYYY-MM-DD, includes optional `suggestedReading`)
- `exposures` - Tracks shown artifacts to prevent repetition (includes `creator` to avoid same-creator bundles)
- `conversations` - Chat history for each day's bundle (includes `sessionEnded` flag)
- `sessionInsights` - Extracted learnings from conversations
- `userReactions` - User feedback on artifacts

### API Endpoints
- `GET /api/today` - Returns today's bundle (generates if needed), includes arc info and dayInArc (actual bundle count)
- `POST /api/today/message` - Send conversation message (returns `sessionShouldEnd` flag for smart ending)
- `POST /api/today/end-session` - End session, extract insights (returns `suggestedReading` and `arcCompletion` if final day)
- `POST /api/today/react` - Record reaction to artifact
- `GET /api/arc` - Get current arc
- `GET /api/history` - Past bundles (paginated)
- `GET /api/history/:date/conversation` - Get conversation history for a specific date with full context
- `POST /api/arc/refine/message` - Refine next arc theme via conversation (returns `arcUpdated` when theme confirmed)

### Bundle Generation Flow
1. Gather context (arc, recent exposures, insights, recent creators)
2. Calculate day in arc (bundle count + 1, since generating a new bundle) and phase (early/middle/late)
3. LLM selects artifacts with search queries (prompt includes explicit coherence rules)
4. **Coherence validation:** Second LLM call checks for cross-reference mismatches
   - If text mentions artist X, image must be by artist X
   - If coherence issues found, replacement artifacts are requested
5. On final day of arc, special framing instructions prompt closure
6. Resolve and validate links with retry logic:
   - **Music:** Up to 5 retries with iTunes API, classical-aware search (see below)
   - **Image:** Up to 3 retries with Wikimedia Commons API, uses LLM-provided `searchQuery` first
   - **Text:** Programmatic validation against recent authors (normalized name comparison), up to 3 retries if author appeared in last 14 days
7. Persist bundle and exposure records (including creator info)

### Classical Music Search
For classical music, the LLM provides additional fields: `composer`, `performer`, `isClassical`. The search strategy differs:
- Search prioritizes `{composer} {title}` (e.g., "Arvo Pärt Fratres")
- Accepts matches where iTunes artist is either the composer OR the performer
- Title must match - will NOT return unrelated works by the same performer
- No artist-only fallback (removed to prevent returning wrong pieces like "Here Comes the Sun" when searching for "Fratres")
- For exposures, stores the composer (not performer) as `creator` to avoid same-composer repeats

### Image Resolution
Images are resolved via Wikimedia Commons API with a multi-strategy search:
1. LLM-provided `searchQuery` (tried first - this is purpose-crafted for the artwork)
2. `{title} {artist}` combination
3. `{artist} {title}` (reversed)
4. `{title}` only
5. Fallback: Google Custom Search → Wikipedia page → extract image via Wikimedia API

The `searchQuery` parameter from the LLM is critical—it often includes specifics like "Chagall I and the Village painting 1911" that improve match accuracy.

### Artifact Coherence Validation
After artifact selection, a second LLM call validates coherence:
- **Strict checks:** If text explicitly mentions an artist (e.g., "as Chagall understood..."), the image must be by that artist
- **Lenient checks:** General thematic connections (e.g., shared motif of dreams) are acceptable without explicit cross-references
- When issues are detected, replacement artifacts are requested with context about the required coherence

### Conversation Context
System prompts include: today's artifacts, current arc info, user insights from past sessions. Guide tone is curious companion, not instructor.

### Insight Extraction
Triggered on explicit session end, smart session-end detection, or 1 hour inactivity. Extracts: meaningful connections, revealed interests, personal context, items to revisit, and suggested reading (with resolved URL).

### Smart Session-End Detection
The system detects natural conversation endings via:
1. **Explicit marker:** Assistant adds `{{END_SESSION}}` when user signals ending
2. **Pattern matching:** User ending signals ("goodbye", "let's end", "that's all") combined with assistant farewells ("take care", "see you")

### Arc Completion & Transition
When the final day of an arc ends:
1. LLM generates 2-3 paragraph retrospective summary of the arc journey
2. New arc theme, description, and shortDescription generated based on user's revealed interests (uses final conversation for context)
3. New arc automatically created and becomes active
4. Frontend displays arc completion summary and "coming tomorrow" preview

### Arc Refinement
User can change the suggested next arc theme before it begins:
1. Click "Change" link next to the "Coming tomorrow" preview
2. Conversation continues in the same chat interface
3. User and assistant discuss alternative themes
4. When agreed, assistant includes `{{NEW_ARC:theme|description|shortDescription}}` marker
5. Pending arc is updated in Firestore and preview refreshes
6. User can cancel anytime to keep original theme

### History View
The history page (`/history`) displays past bundles organized by arc:
- Bundles grouped under arc headings with theme and description
- Each day shows date and artifact summaries (music, image, text titles)
- "View conversation" link opens full context for that day
- Conversation history view shows: arc info, day X of Y, all artifacts, framing text, conversation prompt, and full chat transcript (read-only)

## Key Constraints

- No artifact may repeat within 14-day window (check exposures)
- No text author may repeat within 14-day window (programmatically enforced with normalized name comparison, e.g., "T.S. Eliot" = "T. S. Eliot")
- For classical music, composer is stored as `creator` in exposures (not performer) to avoid same-composer repeats
- Music/image creators are soft-avoided via LLM instructions for non-classical music
- All links must be validated before delivery (HEAD request, 200 status)
- Only one arc active at a time
- Arc duration is bundle-count based (skipped days don't advance the arc)
- Token limit of ~50k for conversation context

## Key Files

- `functions/src/index.ts` - Cloud Functions entry point, routes all API calls
- `functions/src/services/bundleGenerator.ts` - Generates daily bundles via LLM (includes final day handling)
- `functions/src/services/conversationManager.ts` - Handles chat with context and session-end detection
- `functions/src/services/insightExtractor.ts` - Extracts insights and suggested reading from conversations
- `functions/src/services/arcGenerator.ts` - Generates arc completion summaries and creates next arcs
- `functions/src/api/refineArc.ts` - Handles arc refinement conversation and theme updates
- `functions/src/services/linkValidator.ts` - iTunes API for music, Wikimedia API for images, Google Custom Search for readings
- `functions/src/scheduled/inactivityCheck.ts` - Scheduled function to end stale sessions (every 15 min)
- `hosting/src/views/TodayView.tsx` - Main daily view (shows arc shortDescription in header)
- `hosting/src/views/HistoryView.tsx` - History page with bundles organized by arc
- `hosting/src/views/ConversationHistoryView.tsx` - Read-only view of past conversations with full bundle context
- `hosting/src/components/ChatInterface.tsx` - Conversation UI (handles suggested reading, arc completion, and arc refinement)

## First-Time Setup

1. Create Firebase project at console.firebase.google.com
2. Enable Firestore, Authentication (Email/Password), and Functions
3. Copy `hosting/.env.example` to `hosting/.env` with your Firebase config
4. Set up Google Custom Search Engine at programmablesearch.google.com
5. Run `firebase functions:secrets:set` for all three secrets
6. Create first arc in Firestore (see `scripts/seed-arc.ts`)

## Debugging Scripts

- `./scripts/delete-today-data.sh` - Deletes today's bundle, conversation, and session insights so it can be regenerated. Exposures must still be deleted manually in Firebase Console (they have auto-generated IDs). Run this when debugging bundle generation issues.
