import { Timestamp } from 'firebase-admin/firestore';

export interface Arc {
  id: string;
  theme: string;
  description: string;
  startDate: Timestamp;
  targetDurationDays: number;
  currentPhase: 'early' | 'middle' | 'late';
  completedDate?: Timestamp;
}

export interface ArcCompletionData {
  summary: string;
  nextArc: {
    theme: string;
    description: string;
  };
}

export interface SuggestedReading {
  title: string;
  url: string;
  rationale: string;
}

export interface DailyBundle {
  id: string; // Format: YYYY-MM-DD
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
  suggestedReading?: SuggestedReading;
}

export interface Exposure {
  id: string;
  artifactType: 'music' | 'image' | 'text';
  artifactIdentifier: string; // Canonical identifier (title + artist/author)
  dateShown: Timestamp;
  arcId: string;
}

export interface ConversationMessage {
  role: 'user' | 'assistant';
  content: string;
  timestamp: Timestamp;
}

export interface Conversation {
  id: string; // Same as bundle ID (YYYY-MM-DD)
  bundleId: string;
  messages: ConversationMessage[];
  lastActivity: Timestamp;
  sessionEnded: boolean;
}

export interface SessionInsights {
  id: string;
  date: Timestamp;
  arcId: string;
  meaningfulConnections: string[];
  revealedInterests: string[];
  personalContext: string[];
  revisitLater: string[];
  rawSummary: string;
}

export interface UserReaction {
  id: string;
  date: Timestamp;
  bundleId: string;
  artifactType?: 'music' | 'image' | 'text' | 'overall';
  reactionType: 'awe' | 'interest' | 'resistance' | 'familiarity' | 'freeform';
  notes?: string;
}

// LLM response types
export interface LLMBundleSelection {
  music: {
    title: string;
    artist: string;
    searchQuery: string;
  };
  image: {
    title: string;
    artist: string;
    searchQuery: string;
  };
  text: {
    content: string;
    source: string;
    author: string;
  };
  framingText: string;
}

export interface LLMInsightsExtraction {
  meaningfulConnections: string[];
  revealedInterests: string[];
  personalContext: string[];
  revisitLater: string[];
  rawSummary: string;
  suggestedReading: {
    title: string;
    searchQuery: string;
    rationale: string;
  } | null;
}

// API response types
export interface TodayResponse {
  bundle: DailyBundle;
  conversation: Conversation | null;
  arc: Arc;
}

export interface MessageRequest {
  message: string;
  date: string;
}

export interface MessageResponse {
  response: string;
  conversation: Conversation;
  sessionShouldEnd?: boolean;
}

export interface ReactRequest {
  artifactType?: 'music' | 'image' | 'text' | 'overall';
  reactionType: 'awe' | 'interest' | 'resistance' | 'familiarity' | 'freeform';
  notes?: string;
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
