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
- `arcs` - Thematic journeys (~7 bundles each with early/middle/late phases, includes `completedDate` when finished)
- `dailyBundles` - Daily content (keyed by YYYY-MM-DD, includes optional `suggestedReading`)
- `exposures` - Tracks shown artifacts to prevent repetition (includes `creator` to avoid same-creator bundles)
- `conversations` - Chat history for each day's bundle (includes `sessionEnded` flag)
- `sessionInsights` - Extracted learnings from conversations
- `userReactions` - User feedback on artifacts

### API Endpoints
- `GET /api/today` - Returns today's bundle (generates if needed), includes arc info and day/phase
- `POST /api/today/message` - Send conversation message (returns `sessionShouldEnd` flag for smart ending)
- `POST /api/today/end-session` - End session, extract insights (returns `suggestedReading` and `arcCompletion` if final day)
- `POST /api/today/react` - Record reaction to artifact
- `GET /api/arc` - Get current arc
- `GET /api/history` - Past bundles (paginated)

### Bundle Generation Flow
1. Gather context (arc, recent exposures, insights, recent creators)
2. Calculate day in arc (counts bundles generated for this arc, not calendar days) and phase (early/middle/late)
3. LLM selects artifacts with search queries
4. On final day of arc, special framing instructions prompt closure
5. Resolve and validate links with retry logic:
   - **Music:** Up to 5 retries with iTunes API, uses multiple search strategies (title+artist, artist-only, keyword matching), falls back to any track by same artist if exact match not found
   - **Image:** Up to 3 retries with Wikimedia Commons API
   - **Text:** Programmatic validation against recent authors (normalized name comparison), up to 3 retries if author appeared in last 14 days
6. Persist bundle and exposure records (including creator info)

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
2. New arc theme and description generated based on user's revealed interests
3. New arc automatically created and becomes active
4. Frontend displays arc completion summary and "coming tomorrow" preview

## Key Constraints

- No artifact may repeat within 14-day window (check exposures)
- No text author may repeat within 14-day window (programmatically enforced with normalized name comparison, e.g., "T.S. Eliot" = "T. S. Eliot")
- Music/image creators are soft-avoided via LLM instructions (not programmatically enforced)
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
- `functions/src/services/linkValidator.ts` - iTunes API for music, Wikimedia API for images, Google Custom Search for readings
- `functions/src/scheduled/inactivityCheck.ts` - Scheduled function to end stale sessions (every 15 min)
- `hosting/src/views/TodayView.tsx` - Main daily view (shows arc description in header)
- `hosting/src/components/ChatInterface.tsx` - Conversation UI (handles suggested reading and arc completion display)

## First-Time Setup

1. Create Firebase project at console.firebase.google.com
2. Enable Firestore, Authentication (Email/Password), and Functions
3. Copy `hosting/.env.example` to `hosting/.env` with your Firebase config
4. Set up Google Custom Search Engine at programmablesearch.google.com
5. Run `firebase functions:secrets:set` for all three secrets
6. Create first arc in Firestore (see `scripts/seed-arc.ts`)
