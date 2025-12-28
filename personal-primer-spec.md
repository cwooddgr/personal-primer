# Personal Primer: Implementation Specification

A stateful, arc-based AI guide for lifelong intellectual formation.

---

## Project Overview

Personal Primer is a personal web application that delivers a single, thoughtful, daily intellectual encounter. The app functions as a persistent guide through human knowledge, art, philosophy, science, and culture.

**Core philosophy:**
- Formation, not education
- No testing, grading, streaks, or metrics
- One intentional encounter per day
- Memory over metrics, taste over coverage

---

## Technical Stack

- **Frontend:** Web app (React or vanilla JS, minimal)
- **Backend:** Node.js / TypeScript
- **Database:** Firebase Firestore
- **Functions:** Firebase Cloud Functions
- **Hosting:** Firebase Hosting
- **LLM:** Anthropic Claude API (Opus 4.5) - direct API calls, no SDK framework
- **Authentication:** Firebase Auth (single user, simple)

---

## Daily Bundle Structure (Fixed)

Each day delivers exactly four elements:

| Slot | Content | Source |
|------|---------|--------|
| **Music** | One piece of music | Apple Music link (validated) |
| **Image** | One visual artwork or photograph | Web search → museum/Wikimedia URL (validated) |
| **Text** | One quote or short literary excerpt | LLM-selected, inline or linked |
| **Framing** | Introductory discussion (~2-3 paragraphs) | LLM-generated, contextual |

**Constraints:**
- No artifact may repeat within recent history (check exposure ledger)
- All four elements should cohere around the current arc theme and day position
- Framing text should reference prior days to build continuity
- Links must be validated before delivery (HEAD request, 200 status)

---

## Arcs

An **Arc** is a ~30 day thematic journey.

**Arc properties:**
- `id`: Unique identifier
- `theme`: e.g., "Scale", "Time", "Power", "Beauty"
- `description`: 2-3 sentence description of the arc
- `startDate`: When the arc began
- `targetDurationDays`: Typically 30
- `currentPhase`: "early" | "middle" | "late"

**Arc behavior:**
- Only one arc is active at a time
- Daily content is selected dynamically within arc constraints
- Phases are coarse (early/middle/late) and influence tone/depth
- Arcs can be manually switched but not fragmented

---

## Firestore Data Model

### Collection: `arcs`
```typescript
interface Arc {
  id: string;
  theme: string;
  description: string;
  startDate: Timestamp;
  targetDurationDays: number;
  currentPhase: 'early' | 'middle' | 'late';
  completedDate?: Timestamp;
}
```

### Collection: `dailyBundles`
```typescript
interface DailyBundle {
  id: string;  // Format: YYYY-MM-DD
  date: Timestamp;
  arcId: string;
  music: {
    title: string;
    artist: string;
    appleMusicUrl: string;
  };
  image: {
    title: string;
    artist?: string;
    year?: string;
    sourceUrl: string;
    imageUrl: string;
  };
  text: {
    content: string;
    source: string;
    author: string;
  };
  framingText: string;
}
```

### Collection: `exposures`
```typescript
interface Exposure {
  id: string;
  artifactType: 'music' | 'image' | 'text';
  artifactIdentifier: string;  // Canonical identifier (title + artist/author)
  dateShown: Timestamp;
  arcId: string;
}
```

### Collection: `conversations`
```typescript
interface Conversation {
  id: string;  // Same as bundle ID (YYYY-MM-DD)
  bundleId: string;
  messages: Array<{
    role: 'user' | 'assistant';
    content: string;
    timestamp: Timestamp;
  }>;
  lastActivity: Timestamp;
  sessionEnded: boolean;
}
```

### Collection: `sessionInsights`
```typescript
interface SessionInsights {
  id: string;
  date: Timestamp;
  arcId: string;
  meaningfulConnections: string[];
  revealedInterests: string[];
  personalContext: string[];
  revisitLater: string[];
  rawSummary: string;
}
```

### Collection: `userReactions`
```typescript
interface UserReaction {
  id: string;
  date: Timestamp;
  bundleId: string;
  artifactType?: 'music' | 'image' | 'text' | 'overall';
  reactionType: 'awe' | 'interest' | 'resistance' | 'familiarity' | 'freeform';
  notes?: string;
}
```

---

## API Endpoints (Firebase Cloud Functions)

### `GET /api/today`
Returns today's bundle and conversation state.

**Logic:**
1. Check if bundle exists for today
2. If not, generate new bundle (see Bundle Generation Flow)
3. Return bundle + conversation (if any)

**Response:**
```typescript
{
  bundle: DailyBundle;
  conversation: Conversation | null;
  arc: Arc;
}
```

### `POST /api/today/message`
Send a message in today's conversation.

**Request:**
```typescript
{
  message: string;
}
```

**Logic:**
1. Get today's bundle and conversation
2. Build LLM context (system prompt + bundle + arc + recent insights + conversation history)
3. Call Claude API
4. Append user message and assistant response to conversation
5. Update `lastActivity` timestamp
6. Return assistant response

**Response:**
```typescript
{
  response: string;
  conversation: Conversation;
}
```

### `POST /api/today/end-session`
Explicitly end the day's session, triggering insight extraction.

**Logic:**
1. Get today's conversation
2. Run insight extraction LLM call
3. Store in `sessionInsights`
4. Mark conversation as `sessionEnded: true`

### `POST /api/today/react`
Record a reaction to today's bundle or a specific artifact.

**Request:**
```typescript
{
  artifactType?: 'music' | 'image' | 'text' | 'overall';
  reactionType: 'awe' | 'interest' | 'resistance' | 'familiarity' | 'freeform';
  notes?: string;
}
```

### `GET /api/arc`
Returns the current arc.

### `GET /api/history`
Returns past bundles (paginated).

**Query params:**
- `limit`: number (default 30)
- `before`: date string

---

## Bundle Generation Flow

Triggered when `GET /api/today` finds no bundle for the current date.

### Step 1: Gather Context

```typescript
const context = {
  currentArc: await getActiveArc(),
  recentExposures: await getExposures({ days: 30 }),
  recentInsights: await getSessionInsights({ days: 14 }),
  dayInArc: calculateDayInArc(currentArc),
  arcPhase: determinePhase(dayInArc, currentArc.targetDurationDays)
};
```

### Step 2: LLM Selection Call

**System prompt:**
```
You are the curator for Personal Primer, a daily intellectual formation guide.

Your role is to select today's artifacts: one piece of music, one image, and one quote or literary excerpt. All three should cohere around the current arc theme and be appropriate for the arc phase.

You must NOT select any artifact that appears in the recent exposure list.

After selecting, you will write a short framing text (2-3 paragraphs) that:
- Introduces the day's theme
- Connects to recent days where relevant
- Orients attention without over-explaining
- Maintains a tone of quiet curiosity, not instruction

You are a curator and narrator, not a teacher. Point, don't explain. Evoke, don't lecture.
```

**User prompt includes:**
- Current arc (theme, description, phase)
- Day number in arc
- Recent exposures (last 30 days) as a list to avoid
- Recent session insights (themes, interests, personal context)
- Instruction to output structured JSON

**Expected output:**
```json
{
  "music": {
    "title": "...",
    "artist": "...",
    "searchQuery": "..."
  },
  "image": {
    "title": "...",
    "artist": "...",
    "searchQuery": "..."
  },
  "text": {
    "content": "...",
    "source": "...",
    "author": "..."
  },
  "framingText": "..."
}
```

### Step 3: Link Resolution & Validation

For **music**:
1. Web search: `{music.searchQuery} site:music.apple.com`
2. Extract Apple Music URL from results
3. HEAD request to verify URL returns 200
4. If fails, retry with alternate search or flag for manual review

For **image**:
1. Web search: `{image.searchQuery} site:wikimedia.org OR site:metmuseum.org OR site:rijksmuseum.nl`
2. Extract image page URL
3. Fetch page, extract direct image URL
4. HEAD request to verify image URL returns 200
5. If fails, retry or flag

### Step 4: Persist Bundle

1. Create `DailyBundle` document
2. Create `Exposure` documents for each artifact
3. Update arc phase if needed

---

## Conversation Flow

### Context Assembly for Conversation

Each LLM call during conversation includes:

```typescript
const systemPrompt = `
You are the guide for Personal Primer. Today's encounter includes:

MUSIC: ${bundle.music.title} by ${bundle.music.artist}
IMAGE: ${bundle.image.title} by ${bundle.image.artist}
TEXT: "${bundle.text.content}" — ${bundle.text.author}, ${bundle.text.source}

FRAMING:
${bundle.framingText}

CURRENT ARC: ${arc.theme}
${arc.description}
Day ${dayInArc} of ~${arc.targetDurationDays} (${arc.currentPhase} phase)

WHAT YOU KNOW ABOUT THIS USER (from past conversations):
${formatInsights(recentInsights)}

YOUR ROLE:
- Engage thoughtfully about today's artifacts
- Draw connections across domains
- Be curious, not instructive
- Remember what has been discussed in this conversation
- You may reference prior days' artifacts if relevant
- Avoid over-explanation; preserve mystery and wonder
- If the user shares personal context, acknowledge it naturally

You are a guide, not a teacher. A companion in exploration, not an authority.
`;
```

### Conversation Message Handling

```typescript
async function handleMessage(userMessage: string, bundleId: string) {
  const bundle = await getBundle(bundleId);
  const conversation = await getConversation(bundleId);
  const arc = await getActiveArc();
  const insights = await getRecentInsights();
  
  const messages = [
    { role: 'user', content: userMessage }
  ];
  
  // Prepend conversation history
  if (conversation) {
    messages.unshift(...conversation.messages);
  }
  
  // Simple context management: trim if too long
  while (estimateTokens(messages) > 50000) {
    messages.shift();
  }
  
  const response = await anthropic.messages.create({
    model: 'claude-opus-4-5-20250514',
    max_tokens: 2048,
    system: buildSystemPrompt(bundle, arc, insights),
    messages: messages
  });
  
  const assistantMessage = response.content[0].text;
  
  // Persist
  await appendToConversation(bundleId, [
    { role: 'user', content: userMessage, timestamp: new Date() },
    { role: 'assistant', content: assistantMessage, timestamp: new Date() }
  ]);
  
  return assistantMessage;
}
```

---

## Insight Extraction

Triggered when:
1. User explicitly ends session (`POST /api/today/end-session`)
2. 1 hour of inactivity (scheduled function checks `lastActivity`)

### Extraction Prompt

```typescript
const extractionPrompt = `
Review this conversation about today's Personal Primer encounter.

TODAY'S ARTIFACTS:
- Music: ${bundle.music.title} by ${bundle.music.artist}
- Image: ${bundle.image.title} by ${bundle.image.artist}  
- Text: "${bundle.text.content}" — ${bundle.text.author}

CONVERSATION:
${formatConversation(conversation)}

Extract and return as JSON:
{
  "meaningfulConnections": [
    // Concepts, themes, or cross-domain connections the user found meaningful
  ],
  "revealedInterests": [
    // New interests, curiosities, or directions revealed in this conversation
  ],
  "personalContext": [
    // Personal background, expertise, or preferences the user shared
  ],
  "revisitLater": [
    // Specific artifacts, ideas, or questions worth returning to
  ],
  "rawSummary": "2-3 sentence summary of the conversation's substance"
}

Only include items that would be valuable for future curation. Be selective.
If the conversation was brief or surface-level, arrays may be empty.
`;
```

---

## Inactivity Check (Scheduled Function)

Run every 15 minutes:

```typescript
async function checkInactiveSessions() {
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
  
  const staleConversations = await firestore
    .collection('conversations')
    .where('sessionEnded', '==', false)
    .where('lastActivity', '<', oneHourAgo)
    .get();
  
  for (const doc of staleConversations.docs) {
    await extractInsightsAndEndSession(doc.id);
  }
}
```

---

## Frontend Views

### Today View (Primary)
- Displays the four artifacts
- Music: Title, artist, "Listen on Apple Music" link
- Image: Displayed inline with attribution
- Text: Displayed as blockquote with attribution
- Framing: Below artifacts as introductory prose
- Conversation interface below (simple chat)
- "End Session" button
- Simple reaction buttons (optional)

### Arc View
- Current arc theme and description
- Rough position indicator (early/middle/late) — NOT a percentage
- "Day N of ~30" style display

### History View
- Chronological list of past days
- Each entry shows date + brief summary (artifact titles)
- Tap to view full bundle (read-only)

### Design Principles
- Minimal, calm, no clutter
- No notifications, badges, or pressure
- Generous whitespace
- Typography-focused
- Works well on mobile

---

## Firebase Setup Instructions

### 1. Create Firebase Project

1. Go to [Firebase Console](https://console.firebase.google.com/)
2. Create new project (e.g., "personal-primer")
3. Disable Google Analytics (not needed)

### 2. Enable Services

**Firestore:**
1. Build → Firestore Database → Create database
2. Start in production mode
3. Choose region (e.g., us-central1)

**Authentication:**
1. Build → Authentication → Get started
2. Enable Email/Password provider
3. Add your user account

**Functions:**
1. Build → Functions → Get started
2. Upgrade to Blaze plan (required for external API calls)

**Hosting:**
1. Build → Hosting → Get started

### 3. Install Firebase CLI

```bash
npm install -g firebase-tools
firebase login
```

### 4. Initialize Project

```bash
mkdir personal-primer
cd personal-primer
firebase init
```

Select:
- Firestore
- Functions (TypeScript)
- Hosting

### 5. Set Up Environment Variables

```bash
firebase functions:secrets:set ANTHROPIC_API_KEY
# Enter your Anthropic API key when prompted
```

### 6. Firestore Security Rules

```javascript
// firestore.rules
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    // Only authenticated user can read/write
    match /{document=**} {
      allow read, write: if request.auth != null;
    }
  }
}
```

### 7. Deploy

```bash
firebase deploy
```

---

## Environment Variables

| Variable | Description |
|----------|-------------|
| `ANTHROPIC_API_KEY` | Claude API key |

---

## File Structure

```
personal-primer/
├── firebase.json
├── firestore.rules
├── firestore.indexes.json
├── functions/
│   ├── package.json
│   ├── tsconfig.json
│   └── src/
│       ├── index.ts              # Cloud Functions entry
│       ├── api/
│       │   ├── today.ts          # GET /api/today
│       │   ├── message.ts        # POST /api/today/message
│       │   ├── endSession.ts     # POST /api/today/end-session
│       │   ├── react.ts          # POST /api/today/react
│       │   ├── arc.ts            # GET /api/arc
│       │   └── history.ts        # GET /api/history
│       ├── services/
│       │   ├── anthropic.ts      # Claude API wrapper
│       │   ├── bundleGenerator.ts
│       │   ├── conversationManager.ts
│       │   ├── insightExtractor.ts
│       │   └── linkValidator.ts
│       ├── scheduled/
│       │   └── inactivityCheck.ts
│       ├── types/
│       │   └── index.ts          # TypeScript interfaces
│       └── utils/
│           ├── firestore.ts
│           └── tokens.ts         # Token estimation
└── hosting/
    ├── index.html
    ├── styles.css
    └── app.js                    # Or React app
```

---

## Dependencies (functions/package.json)

```json
{
  "dependencies": {
    "@anthropic-ai/sdk": "^0.39.0",
    "firebase-admin": "^12.0.0",
    "firebase-functions": "^6.0.0"
  },
  "devDependencies": {
    "typescript": "^5.0.0",
    "@types/node": "^20.0.0"
  }
}
```

---

## First Arc (Seed Data)

Create this manually in Firestore or via a setup script:

```json
{
  "id": "arc-001-scale",
  "theme": "Scale",
  "description": "An exploration of scale—from the cosmic to the microscopic, from civilizations to individual moments. How does perspective shift when we zoom in or out? What remains constant across scales, and what transforms entirely?",
  "startDate": "2025-01-01T00:00:00Z",
  "targetDurationDays": 30,
  "currentPhase": "early"
}
```

---

## Testing Checklist

- [ ] Bundle generation produces valid, non-repeating artifacts
- [ ] Apple Music links resolve correctly
- [ ] Image URLs load correctly
- [ ] Conversation maintains context across turns
- [ ] Session insights are extracted on timeout
- [ ] Session insights are extracted on explicit end
- [ ] Arc phase updates as days progress
- [ ] History view shows past bundles correctly
- [ ] No repetition of artifacts within 30-day window

---

## Out of Scope for v1

- Multiple users
- Push notifications / email
- Arc recommendation/generation (manual for v1)
- Offline support
- Native mobile app
- Analytics / metrics
- Content moderation
- Backup/export

---

## Success Criteria

The system is working when:

1. You can open the app daily and see a coherent, non-repeating bundle
2. You can have a meaningful conversation about the day's artifacts
3. The system remembers relevant context from past conversations
4. It feels calm, personal, and worth returning to
5. You feel more curious after using it than before
