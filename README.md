# Personal Primer

A stateful, course-based AI tutor for lifelong intellectual formation.

Personal Primer delivers a single, thoughtful daily intellectual encounter — curating music, visual art, and literature around a week-long theme, then opening a discussion with an AI guide.

## Philosophy

- **Formation, not education** — nurturing taste and curiosity rather than testing knowledge
- **One intentional encounter per day** — no streaks, no metrics, no pressure
- **Memory over metrics** — the guide remembers your interests and builds on past conversations

## Daily Bundle

Each day delivers four cohering elements:

| Element | Description |
|---------|-------------|
| **Music** | One piece with a YouTube link |
| **Image** | One visual artwork |
| **Text** | One verbatim quote or literary excerpt |
| **Framing** | 1–3 paragraphs introducing the encounter |

Artifacts and creators are not repeated within a 30-day window.

## Courses and Arcs

Content is organized into **courses** — a syllabus of 12 thematic **arcs**, each a fixed 7-day topic. The whole course is planned up front (like a tutor planning a semester) so the topics are diverse and deliberately sequenced, rather than each topic riffing on the last.

The course is visible and steerable: the "Your Course" view shows all 12 topics with their status, and you can adjust the not-yet-started topics through conversation. When a course finishes, the next is planned — informed by what you covered and a light, stable sense of your interests, but never collapsing into sameness.

## Conversations

Each day includes an optional conversation with an AI guide who engages with the day's artifacts, draws cross-domain connections, remembers personal context from past sessions, and suggests related reading.

Sessions end on an explicit action, a natural conversational close, or one hour of inactivity. The guide adapts its voice when you ask it to ("be more direct," "less abstract") and remembers that preference.

## Tech Stack

- **Frontend**: React 18 + Vite
- **Backend**: Firebase Cloud Functions v2 (Node.js 20 / TypeScript)
- **Database**: Firebase Firestore
- **LLM**: Anthropic Claude API (`claude-opus-4-7`) with the `web_search` tool for artifact discovery and verification

## Setup

### Prerequisites

- Node.js 20+
- Firebase CLI (`npm install -g firebase-tools`)
- Firebase project on the Blaze plan
- Anthropic API key, with the **web search tool enabled** on the API account (developer console → settings; required for bundle generation)

### Installation

```bash
# Install dependencies
cd functions && npm install
cd ../hosting && npm install

# Configure Firebase
firebase login
firebase use your-project-id

# Set up environment variables
cp hosting/.env.example hosting/.env
# Edit hosting/.env with your Firebase config

# Set the API secret
firebase functions:secrets:set ANTHROPIC_API_KEY

# Deploy security rules and indexes
firebase deploy --only firestore

# Deploy everything
firebase deploy
```

Add allowed emails to the `/allowedEmails` collection in Firestore so users can register. The first course is planned automatically on a new user's first visit.

## Development

```bash
# Start Firebase emulators
firebase emulators:start

# Start the frontend dev server (in another terminal)
cd hosting && npm run dev
```

## License

MIT
