# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Personal Primer is a personal web application that delivers a single, thoughtful daily intellectual encounter. It curates four artifacts daily (music, image, text, framing) around ~7 day thematic "arcs."

**Core philosophy:** Formation over education, one intentional encounter per day, no testing/grading/streaks.

## Tech Stack

- **Frontend:** React 18 + Vite (in `hosting/`)
- **Backend:** Node.js 20 / TypeScript with Firebase Cloud Functions v2 (in `functions/`)
- **Database:** Firebase Firestore
- **LLM:** Anthropic Claude API (claude-opus-4-5-20250514) via @anthropic-ai/sdk
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
- `arcs` - Thematic journeys (~7 days each with early/middle/late phases)
- `dailyBundles` - Daily content (keyed by YYYY-MM-DD)
- `exposures` - Tracks shown artifacts to prevent repetition
- `conversations` - Chat history for each day's bundle
- `sessionInsights` - Extracted learnings from conversations
- `userReactions` - User feedback on artifacts

### API Endpoints
- `GET /api/today` - Returns today's bundle (generates if needed)
- `POST /api/today/message` - Send conversation message
- `POST /api/today/end-session` - End session, extract insights
- `POST /api/today/react` - Record reaction to artifact
- `GET /api/arc` - Get current arc
- `GET /api/history` - Past bundles (paginated)

### Bundle Generation Flow
1. Gather context (arc, recent exposures, insights)
2. LLM selects artifacts with search queries
3. Resolve and validate links (Apple Music, museum URLs)
4. Persist bundle and exposure records

### Conversation Context
System prompts include: today's artifacts, current arc info, user insights from past sessions. Guide tone is curious companion, not instructor.

### Insight Extraction
Triggered on explicit session end or 1 hour inactivity. Extracts: meaningful connections, revealed interests, personal context, items to revisit.

## Key Constraints

- No artifact may repeat within 14-day window (check exposures)
- All links must be validated before delivery (HEAD request, 200 status)
- Only one arc active at a time
- Token limit of ~50k for conversation context

## Key Files

- `functions/src/index.ts` - Cloud Functions entry point, routes all API calls
- `functions/src/services/bundleGenerator.ts` - Generates daily bundles via LLM
- `functions/src/services/conversationManager.ts` - Handles chat with context
- `functions/src/services/insightExtractor.ts` - Extracts insights from conversations
- `functions/src/services/linkValidator.ts` - Google Custom Search + URL validation
- `hosting/src/views/TodayView.tsx` - Main daily view
- `hosting/src/components/ChatInterface.tsx` - Conversation UI

## First-Time Setup

1. Create Firebase project at console.firebase.google.com
2. Enable Firestore, Authentication (Email/Password), and Functions
3. Copy `hosting/.env.example` to `hosting/.env` with your Firebase config
4. Set up Google Custom Search Engine at programmablesearch.google.com
5. Run `firebase functions:secrets:set` for all three secrets
6. Create first arc in Firestore (see `scripts/seed-arc.ts`)
