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
    const errorBody = await response.json().catch(() => ({ error: 'Request failed' }));
    console.error(`[API] ${method} ${path} failed:`, response.status, errorBody);
    // Include status code and full error body for better error parsing
    const errorMessage = typeof errorBody.error === 'string'
      ? errorBody.error
      : JSON.stringify(errorBody);
    throw new Error(`${response.status} ${errorMessage}`);
  }

  const data = await response.json();
  console.log(`[API] ${method} ${path} response:`, data);
  return data;
}

// Types (matching backend functions/src/types/index.ts)

export interface Season {
  id: string;
  seasonNumber: number;
  status: 'active' | 'completed';
}

export interface Arc {
  id: string;
  seasonId: string;
  orderInSeason: number; // 1-12
  status: 'planned' | 'active' | 'completed';
  theme: string;
  description: string;
  shortDescription: string; // One-sentence summary for UI display
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
    shortDescription: string;
  } | null;
}

export type BundleGenerationStatus =
  | 'pending'
  | 'generating'
  | 'ready'
  | 'failed';

export interface DailyBundle {
  id: string;
  arcId: string;
  dayInArc: number; // 1-7
  engaged: boolean;
  generationStatus?: BundleGenerationStatus;
  generationAttempts?: number;
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

export type TodayReadyResponse = Extract<TodayResponse, { status: 'ready' }>;

export interface MessageResponse {
  response: string;
  conversation: Conversation;
  sessionShouldEnd?: boolean;
  arcShouldEnd?: boolean;
}

export interface EndSessionResponse {
  success: boolean;
  suggestedReading?: SuggestedReading;
  arcCompletion?: ArcCompletionData;
}

export interface SeasonResponse {
  season: Season;
  arcs: Arc[];
}

export interface SeasonSteerMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface SeasonSteerResponse {
  response: string;
  season?: Season;
  arcs?: Arc[];
}

// API functions

export async function getToday(): Promise<TodayResponse> {
  return fetchAPI<TodayResponse>('/today');
}

export async function sendMessage(
  message: string,
  bundleId?: string
): Promise<MessageResponse> {
  return fetchAPI<MessageResponse>('/today/message', {
    method: 'POST',
    body: JSON.stringify({ message, bundleId }),
  });
}

export async function endSession(bundleId?: string): Promise<EndSessionResponse> {
  return fetchAPI<EndSessionResponse>('/today/end-session', {
    method: 'POST',
    body: JSON.stringify({ bundleId }),
  });
}

export async function endArcEarly(bundleId?: string): Promise<EndSessionResponse> {
  return fetchAPI<EndSessionResponse>('/arc/end-early', {
    method: 'POST',
    body: JSON.stringify({ bundleId }),
  });
}

// Season

export async function getSeason(): Promise<SeasonResponse> {
  return fetchAPI<SeasonResponse>('/season');
}

export async function sendSeasonSteerMessage(
  message: string,
  conversationHistory: SeasonSteerMessage[]
): Promise<SeasonSteerResponse> {
  return fetchAPI<SeasonSteerResponse>('/season/steer/message', {
    method: 'POST',
    body: JSON.stringify({ message, conversationHistory }),
  });
}

// History

export interface ArcSummary {
  id: string;
  theme: string;
  description: string;
  shortDescription?: string;
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
    shortDescription?: string;
    targetDurationDays: number;
  } | null;
  dayInArc: number;
}

export async function getConversationHistory(
  bundleId: string
): Promise<ConversationHistoryResponse> {
  return fetchAPI<ConversationHistoryResponse>(`/history/${bundleId}/conversation`);
}

// Auth API functions (no auth token required for these)
export interface RegisterResponse {
  success: boolean;
  message: string;
  userId?: string;
}

export async function register(email: string, password: string): Promise<RegisterResponse> {
  const response = await fetch(`${API_BASE}/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.error || 'Registration failed');
  }

  return data;
}

export async function forgotPassword(email: string): Promise<{ success: boolean; message: string }> {
  const response = await fetch(`${API_BASE}/auth/forgot-password`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email }),
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.error || 'Request failed');
  }

  return data;
}

export async function resendVerification(): Promise<{ success: boolean; message: string }> {
  return fetchAPI<{ success: boolean; message: string }>('/auth/resend-verification', {
    method: 'POST',
  });
}

// User profile API functions
export interface UserProfileResponse {
  hasSeenAbout: boolean;
  voicePreference: string | null;
}

export async function getUserProfile(): Promise<UserProfileResponse> {
  return fetchAPI<UserProfileResponse>('/user/profile');
}

export async function markAboutAsSeen(): Promise<{ success: boolean }> {
  return fetchAPI<{ success: boolean }>('/user/mark-about-seen', {
    method: 'POST',
  });
}
