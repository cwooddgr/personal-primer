# Personal Primer

A stateful, arc-based AI guide for lifelong intellectual formation.

Personal Primer delivers a single, thoughtful daily intellectual encounter — curating music, visual art, literature, and framing text around thematic "arcs" that span approximately 7 days.

## Philosophy

- **Formation, not education** — nurturing taste and curiosity rather than testing knowledge
- **One intentional encounter per day** — no streaks, no metrics, no pressure
- **Memory over metrics** — the system remembers your interests and builds on past conversations

## Daily Bundle

Each day delivers four cohering elements:

| Element | Description |
|---------|-------------|
| **Music** | One piece with validated Apple Music link |
| **Image** | One visual artwork from museum/Wikimedia sources |
| **Text** | One quote or literary excerpt |
| **Framing** | 2-3 paragraphs connecting to recent days |

Artifacts never repeat within 14 days, and creators don't repeat within recent bundles.

## Arcs

Content is organized into ~7-day thematic journeys (e.g., "Scale", "Time", "Power"). Each arc has early/middle/late phases. When an arc completes, the system generates a retrospective and creates a new arc based on revealed interests.

## Conversations

Each day includes an optional conversation with an AI guide who:
- Engages thoughtfully about the day's artifacts
- Draws cross-domain connections
- Remembers personal context from past sessions
- Suggests related reading

Sessions end via explicit action, natural conversation endings, or 1-hour inactivity. Insights are extracted and inform future curation.

## Tech Stack

- **Frontend**: React 18 + Vite
- **Backend**: Firebase Cloud Functions v2 (Node.js 20/TypeScript)
- **Database**: Firebase Firestore
- **LLM**: Anthropic Claude API (claude-opus-4-5-20251101)
- **Link Resolution**: Google Custom Search API
- **Auth**: Firebase Auth (single user)

## Setup

### Prerequisites

- Node.js 20+
- Firebase CLI (`npm install -g firebase-tools`)
- Firebase project on Blaze plan
- Anthropic API key
- Google Custom Search API key and Search Engine ID

### Installation

```bash
# Clone and install dependencies
cd functions && npm install
cd ../hosting && npm install

# Configure Firebase
firebase login
firebase use your-project-id

# Set up environment variables
cp hosting/.env.example hosting/.env
# Edit hosting/.env with your Firebase config

# Set secrets
firebase functions:secrets:set ANTHROPIC_API_KEY
firebase functions:secrets:set GOOGLE_SEARCH_API_KEY
firebase functions:secrets:set GOOGLE_SEARCH_CX

# Deploy
firebase deploy
```

### Seed First Arc

Create an arc document in Firestore (`arcs` collection) or use `scripts/seed-arc.ts`.

## Development

```bash
# Start Firebase emulators
firebase emulators:start

# Start frontend dev server (in another terminal)
cd hosting && npm run dev
```

## License

MIT
