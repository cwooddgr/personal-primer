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
    throw new Error(error.error || 'Request failed');
  }

  return response.json();
}

// Types (matching backend)
export interface Arc {
  id: string;
  theme: string;
  description: string;
  currentPhase: 'early' | 'middle' | 'late';
  targetDurationDays: number;
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
}

export interface MessageResponse {
  response: string;
  conversation: Conversation;
}

// API functions
export async function getToday(): Promise<TodayResponse> {
  return fetchAPI<TodayResponse>('/today');
}

export async function sendMessage(message: string): Promise<MessageResponse> {
  return fetchAPI<MessageResponse>('/today/message', {
    method: 'POST',
    body: JSON.stringify({ message }),
  });
}

export async function endSession(): Promise<void> {
  return fetchAPI<void>('/today/end-session', {
    method: 'POST',
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

export async function getHistory(
  limit?: number,
  before?: string
): Promise<{ bundles: DailyBundle[] }> {
  const params = new URLSearchParams();
  if (limit) params.set('limit', String(limit));
  if (before) params.set('before', before);
  const query = params.toString();
  return fetchAPI<{ bundles: DailyBundle[] }>(`/history${query ? `?${query}` : ''}`);
}
