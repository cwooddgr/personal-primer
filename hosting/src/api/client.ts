import { getAuth } from 'firebase/auth';

const API_BASE = '/api';

async function getAuthToken(): Promise<string> {
  const auth = getAuth();
  const user = auth.currentUser;
  if (!user) {
    throw new Error('Not authenticated');
  }
  return user.getIdToken();
}

async function fetchAPI<T>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const method = options.method || 'GET';
  console.log(`[API] ${method} ${path}`, options.body ? JSON.parse(options.body as string) : '');

  const token = await getAuthToken();

  const response = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      ...options.headers,
    },
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Request failed' }));
    console.error(`[API] ${method} ${path} failed:`, response.status, error);
    throw new Error(error.error || 'Request failed');
  }

  const data = await response.json();
  console.log(`[API] ${method} ${path} response:`, data);
  return data;
}

// Types (matching backend)
export interface Arc {
  id: string;
  theme: string;
  description: string;
  currentPhase: 'early' | 'middle' | 'late';
  targetDurationDays: number;
}

export interface SuggestedReading {
  title: string;
  url: string;
  rationale: string;
}

export interface ArcCompletionData {
  summary: string;
  nextArc: {
    theme: string;
    description: string;
  };
}

export interface DailyBundle {
  id: string;
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

export interface ConversationMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface Conversation {
  id: string;
  bundleId: string;
  messages: ConversationMessage[];
  sessionEnded: boolean;
}

export interface TodayResponse {
  bundle: DailyBundle;
  conversation: Conversation | null;
  arc: Arc;
  dayInArc: number;
}

export interface MessageResponse {
  response: string;
  conversation: Conversation;
  sessionShouldEnd?: boolean;
}

export interface EndSessionResponse {
  success: boolean;
  suggestedReading?: SuggestedReading;
  arcCompletion?: ArcCompletionData;
}

// Helper to get local date in YYYY-MM-DD format
function getLocalDate(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

// API functions
export async function getToday(): Promise<TodayResponse> {
  const localDate = getLocalDate();
  return fetchAPI<TodayResponse>(`/today?date=${localDate}`);
}

export async function sendMessage(message: string): Promise<MessageResponse> {
  const localDate = getLocalDate();
  return fetchAPI<MessageResponse>('/today/message', {
    method: 'POST',
    body: JSON.stringify({ message, date: localDate }),
  });
}

export async function endSession(): Promise<EndSessionResponse> {
  const localDate = getLocalDate();
  return fetchAPI<EndSessionResponse>('/today/end-session', {
    method: 'POST',
    body: JSON.stringify({ date: localDate }),
  });
}

export async function recordReaction(
  reactionType: 'awe' | 'interest' | 'resistance' | 'familiarity' | 'freeform',
  artifactType?: 'music' | 'image' | 'text' | 'overall',
  notes?: string
): Promise<void> {
  return fetchAPI<void>('/today/react', {
    method: 'POST',
    body: JSON.stringify({ reactionType, artifactType, notes }),
  });
}

export async function getArc(): Promise<{ arc: Arc; dayInArc: number }> {
  return fetchAPI<{ arc: Arc; dayInArc: number }>('/arc');
}

export interface ArcSummary {
  id: string;
  theme: string;
  description: string;
}

export interface ArcWithBundles {
  arc: ArcSummary;
  bundles: DailyBundle[];
}

export interface HistoryResponse {
  arcGroups: ArcWithBundles[];
  bundles: DailyBundle[];
}

export async function getHistory(
  limit?: number,
  before?: string
): Promise<HistoryResponse> {
  const params = new URLSearchParams();
  if (limit) params.set('limit', String(limit));
  if (before) params.set('before', before);
  const query = params.toString();
  return fetchAPI<HistoryResponse>(`/history${query ? `?${query}` : ''}`);
}

export interface ConversationHistoryResponse {
  conversation: Conversation | null;
  bundle: DailyBundle;
  arc: {
    id: string;
    theme: string;
    description: string;
    targetDurationDays: number;
  } | null;
  dayInArc: number;
}

export async function getConversationHistory(
  date: string
): Promise<ConversationHistoryResponse> {
  return fetchAPI<ConversationHistoryResponse>(`/history/${date}/conversation`);
}

export interface ArcRefinementMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface ArcRefinementResponse {
  response: string;
  arcUpdated?: {
    theme: string;
    description: string;
  };
}

export async function sendArcRefinementMessage(
  message: string,
  conversationHistory: ArcRefinementMessage[]
): Promise<ArcRefinementResponse> {
  return fetchAPI<ArcRefinementResponse>('/arc/refine/message', {
    method: 'POST',
    body: JSON.stringify({ message, conversationHistory }),
  });
}
