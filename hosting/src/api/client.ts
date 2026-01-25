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

// Tone types
export type ToneId = 'reflective' | 'guided' | 'inquiry' | 'practical' | 'direct';

export interface ToneDefinition {
  id: ToneId;
  name: string;
  shortName: string;
  description: string;
}

export interface TonesResponse {
  tones: ToneDefinition[];
  default: ToneId;
}

export interface ToneChange {
  messageIndex: number;
  tone: ToneId;
}

// Types (matching backend)
export interface Arc {
  id: string;
  theme: string;
  description: string;
  shortDescription?: string; // One-sentence summary for UI display (optional for backwards compat)
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
    shortDescription: string;
  };
}

export interface DailyBundle {
  id: string;
  arcId: string;
  music: {
    title: string;
    artist: string;
    composer?: string;   // For classical: the composer
    performer?: string;  // For classical: the performer
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
  tone?: ToneId;
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
  initialTone?: ToneId;
  toneChanges?: ToneChange[];
}

export interface TodayResponse {
  bundle: DailyBundle;
  conversation: Conversation | null;
  arc: Arc;
  dayInArc: number;
  currentTone: ToneId;
}

export interface MessageResponse {
  response: string;
  conversation: Conversation;
  sessionShouldEnd?: boolean;
  incompleteMessageDetected?: boolean;
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

export async function sendMessage(message: string, forceComplete?: boolean): Promise<MessageResponse> {
  const localDate = getLocalDate();
  return fetchAPI<MessageResponse>('/today/message', {
    method: 'POST',
    body: JSON.stringify({ message, date: localDate, forceComplete }),
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
    shortDescription: string;
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
  currentTone: ToneId;
  hasSelectedTone: boolean;
}

export async function getUserProfile(): Promise<UserProfileResponse> {
  return fetchAPI<UserProfileResponse>('/user/profile');
}

export async function markAboutAsSeen(): Promise<{ success: boolean }> {
  return fetchAPI<{ success: boolean }>('/user/mark-about-seen', {
    method: 'POST',
  });
}

// Tone API functions
export async function getTones(): Promise<TonesResponse> {
  return fetchAPI<TonesResponse>('/tones');
}

export async function setDefaultTone(tone: ToneId): Promise<{ success: boolean; tone: ToneId }> {
  return fetchAPI<{ success: boolean; tone: ToneId }>('/user/tone', {
    method: 'POST',
    body: JSON.stringify({ tone }),
  });
}

export async function changeToneMidConversation(
  tone: ToneId
): Promise<{ success: boolean; tone: ToneId; messageIndex: number }> {
  const localDate = getLocalDate();
  return fetchAPI<{ success: boolean; tone: ToneId; messageIndex: number }>('/today/tone', {
    method: 'POST',
    body: JSON.stringify({ tone, date: localDate }),
  });
}
