# Personal Primer

A stateful, arc-based AI guide for lifelong intellectual formation.

Personal Primer delivers a single, thoughtful daily intellectual encounter — curating music, visual art, literature, and framing text around thematic "arcs" that span approximately 30 days.

## Philosophy

- **Formation, not education** — nurturing taste and curiosity rather than testing knowledge
- **One intentional encounter per day** — no streaks, no metrics, no pressure
- **Memory over metrics** — the system remembers your interests and builds on past conversations

## Daily Bundle

Each day delivers four elements:

| Element | Description |
|---------|-------------|
| **Music** | One piece with Apple Music link |
| **Image** | One visual artwork from museum/Wikimedia sources |
| **Text** | One quote or literary excerpt |
| **Framing** | 2-3 paragraphs introducing the day's theme |

## Tech Stack

- **Frontend**: React 18 + Vite
- **Backend**: Firebase Cloud Functions (Node.js/TypeScript)
- **Database**: Firebase Firestore
- **LLM**: Anthropic Claude API
- **Link Resolution**: Google Custom Search API

## Setup

### Prerequisites

- Node.js 20+
- Firebase CLI (`npm install -g firebase-tools`)
- Firebase project on Blaze plan
- Anthropic API key
- Google Custom Search API key and Search Engine ID

### Installation

```bash
# Clone the repo
git clone https://github.com/YOUR_USERNAME/personal-primer.git
cd personal-primer

# Install dependencies
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

Create an arc document in Firestore (`arcs` collection) with:

```json
{
  "theme": "Scale",
  "description": "An exploration of scale—from the cosmic to the microscopic...",
  "startDate": "<timestamp>",
  "targetDurationDays": 30,
  "currentPhase": "early",
  "completedDate": null
}
```

## Development

```bash
# Start Firebase emulators
firebase emulators:start

# Start frontend dev server (in another terminal)
cd hosting && npm run dev
```

## License

MIT
