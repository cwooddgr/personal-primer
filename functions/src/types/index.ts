import { Timestamp } from 'firebase-admin/firestore';

// ---------------------------------------------------------------------------
// Seasons
// ---------------------------------------------------------------------------

export const ARCS_PER_SEASON = 12;
export const ARC_DURATION_DAYS = 7;

export interface Season {
  id: string;
  seasonNumber: number;
  createdAt: Timestamp;
  status: 'active' | 'completed';
}

// ---------------------------------------------------------------------------
// Arcs
// ---------------------------------------------------------------------------

export interface Arc {
  id: string;
  seasonId: string;
  orderInSeason: number; // 1-12
  status: 'planned' | 'active' | 'completed';
  theme: string;
  description: string;
  shortDescription: string; // One-sentence summary for UI display
  targetDurationDays: number; // Fixed at 7
  startDate?: Timestamp; // Display metadata only
  completedDate?: Timestamp;
}

// Phase is derived, not stored
export type ArcPhase = 'early' | 'middle' | 'late';

// ---------------------------------------------------------------------------
// Bundles
// ---------------------------------------------------------------------------

export interface SuggestedReading {
  title: string;
  url: string;
  rationale: string;
}

export type BundleGenerationStatus =
  | 'pending'
  | 'generating'
  | 'ready'
  | 'failed';

export interface DailyBundle {
  id: string; // Deterministic id: `${arcId}-day${dayInArc}`
  arcId: string;
  dayInArc: number; // 1-7
  engaged: boolean; // True once the user sends their first message
  createdAt: Timestamp;
  // Generation lifecycle. Artifact/framing fields may be empty/absent until
  // generationStatus is 'ready'.
  generationStatus: BundleGenerationStatus;
  generationAttempts: number;
  music: {
    title: string;
    artist: string;
    youtubeUrl: string;
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
  suggestedReading?: SuggestedReading;
}

// ---------------------------------------------------------------------------
// Exposures
// ---------------------------------------------------------------------------

export interface Exposure {
  id: string;
  artifactType: 'music' | 'image' | 'text';
  artifactIdentifier: string; // Canonical identifier (title + artist/author)
  creator: string; // Artist, composer, or author name
  dateShown: Timestamp;
  arcId: string;
}

// ---------------------------------------------------------------------------
// Conversations
// ---------------------------------------------------------------------------

export interface ConversationMessage {
  role: 'user' | 'assistant';
  content: string;
  timestamp: Timestamp;
}

export interface Conversation {
  id: string; // Same as bundle id
  bundleId: string;
  messages: ConversationMessage[];
  lastActivity: Timestamp;
  sessionEnded: boolean;
}

// ---------------------------------------------------------------------------
// Insights (conversational continuity only)
// ---------------------------------------------------------------------------

export interface SessionInsights {
  id: string;
  date: Timestamp;
  arcId: string;
  personalContext: string[];
  rawSummary: string;
}

// Light, stable user profile derived at season boundaries
export interface UserMemoryProfile {
  intellectualLeanings: string[]; // Domains / angles the user gravitates toward
  notes: string; // A short freeform paragraph of stable observations
  derivedAt: Timestamp;
  fromSeasonNumber: number;
}

// ---------------------------------------------------------------------------
// LLM response types
// ---------------------------------------------------------------------------

// Season planning: the model returns 12 arcs.
export interface LLMSeasonPlan {
  arcs: Array<{
    theme: string;
    description: string;
    shortDescription: string;
  }>;
}

// Bundle draft via a single web-search pass: artifacts + framing in one call.
// The image block carries only artwork *identity* — the actual imageUrl /
// sourceUrl are resolved afterward via the Wikimedia Commons API.
export interface LLMBundleDraft {
  music: {
    title: string;
    artist: string;
    youtubeUrl: string;
  };
  image: {
    title: string;
    artist: string;
    year?: string;
    searchQuery: string;
  };
  text: {
    content: string;
    source: string;
    author: string;
  };
  framingText: string;
}

// Light user profile derivation at a season boundary.
export interface LLMUserProfile {
  intellectualLeanings: string[];
  notes: string;
}

// ---------------------------------------------------------------------------
// API response types
// ---------------------------------------------------------------------------

export type TodayResponse =
  | { status: 'generating' }
  | {
      status: 'ready';
      bundle: DailyBundle;
      conversation: Conversation | null;
      arc: Arc;
      dayInArc: number;
    }
  | { status: 'failed' };

export interface MessageRequest {
  message: string;
  date?: string; // Legacy / optional; bundle resolution is arc-based
  bundleId?: string;
}

export interface MessageResponse {
  response: string;
  conversation: Conversation;
  sessionShouldEnd?: boolean;
  arcShouldEnd?: boolean;
}

export interface ArcCompletionData {
  summary: string;
  nextArc: {
    theme: string;
    description: string;
    shortDescription: string;
  } | null;
}

export interface EndSessionResponse {
  success: boolean;
  suggestedReading?: SuggestedReading;
  arcCompletion?: ArcCompletionData;
}

export interface HistoryQuery {
  limit?: number;
  before?: string;
}

export interface SeasonResponse {
  season: Season;
  arcs: Arc[];
}

export interface SeasonSteerRequest {
  message: string;
  conversationHistory?: Array<{ role: 'user' | 'assistant'; content: string }>;
}

export interface SeasonSteerResponse {
  response: string;
  season?: Season;
  arcs?: Arc[];
}
