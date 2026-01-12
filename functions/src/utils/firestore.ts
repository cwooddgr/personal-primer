import * as admin from 'firebase-admin';
import { Timestamp } from 'firebase-admin/firestore';
import {
  Arc,
  DailyBundle,
  SuggestedReading,
  Exposure,
  Conversation,
  SessionInsights,
  UserReaction,
} from '../types';
import { ToneId, DEFAULT_TONE } from '../tones';

// Initialize Firebase Admin if not already initialized
if (!admin.apps.length) {
  admin.initializeApp();
}

const db = admin.firestore();

// Get user-scoped collection references
function getUserCollections(userId: string) {
  const userDoc = db.collection('users').doc(userId);
  return {
    arcs: userDoc.collection('arcs'),
    dailyBundles: userDoc.collection('dailyBundles'),
    exposures: userDoc.collection('exposures'),
    conversations: userDoc.collection('conversations'),
    sessionInsights: userDoc.collection('sessionInsights'),
    userReactions: userDoc.collection('userReactions'),
  };
}

// Top-level collections (not user-scoped)
export const globalCollections = {
  allowedEmails: db.collection('allowedEmails'),
  users: db.collection('users'),
};

// Date helpers
export function validateDateId(dateStr: string | undefined): string {
  if (!dateStr) {
    throw new Error('Date parameter is required');
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
    throw new Error('Invalid date format. Expected YYYY-MM-DD');
  }
  return dateStr;
}

export function getTodayId(): string {
  const now = new Date();
  return now.toISOString().split('T')[0];
}

export function toTimestamp(date: Date): Timestamp {
  return Timestamp.fromDate(date);
}

// Whitelist operations
export async function isEmailAllowed(email: string): Promise<boolean> {
  const normalizedEmail = email.toLowerCase().trim();
  const doc = await globalCollections.allowedEmails.doc(normalizedEmail).get();
  return doc.exists;
}

export async function addAllowedEmail(email: string, addedBy?: string): Promise<void> {
  const normalizedEmail = email.toLowerCase().trim();
  await globalCollections.allowedEmails.doc(normalizedEmail).set({
    email: normalizedEmail,
    addedAt: toTimestamp(new Date()),
    addedBy: addedBy || 'system',
  });
}

// Arc operations
export async function getActiveArc(userId: string): Promise<Arc | null> {
  const collections = getUserCollections(userId);
  const snapshot = await collections.arcs
    .orderBy('startDate', 'desc')
    .limit(10)
    .get();

  if (snapshot.empty) return null;

  for (const doc of snapshot.docs) {
    const data = doc.data();
    if (!data.completedDate) {
      return { id: doc.id, ...data } as Arc;
    }
  }

  return null;
}

export async function getArc(userId: string, arcId: string): Promise<Arc | null> {
  const collections = getUserCollections(userId);
  const doc = await collections.arcs.doc(arcId).get();
  if (!doc.exists) return null;
  return { id: doc.id, ...doc.data() } as Arc;
}

export async function updateArcPhase(userId: string, arcId: string, phase: Arc['currentPhase']): Promise<void> {
  const collections = getUserCollections(userId);
  await collections.arcs.doc(arcId).update({ currentPhase: phase });
}

export async function completeArc(userId: string, arcId: string): Promise<void> {
  const collections = getUserCollections(userId);
  await collections.arcs.doc(arcId).update({
    completedDate: toTimestamp(new Date()),
  });
}

export async function updateArc(userId: string, arcId: string, updates: Partial<Arc>): Promise<void> {
  const collections = getUserCollections(userId);
  await collections.arcs.doc(arcId).update(updates);
}

export async function createArc(userId: string, arc: Omit<Arc, 'id'>): Promise<Arc> {
  const collections = getUserCollections(userId);
  const id = `arc-${Date.now()}`;
  const newArc: Arc = { id, ...arc };
  await collections.arcs.doc(id).set(newArc);
  return newArc;
}

export async function createWelcomeArc(userId: string): Promise<Arc> {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  return createArc(userId, {
    theme: 'Beginnings',
    description: 'Every journey starts somewhere. This week we explore the creative spark of first encounters—the tentative opening notes, the initial brushstroke, the words that break silence. These artifacts invite you to notice how things come into being, and perhaps to reflect on your own beginnings with Primer.',
    shortDescription: 'Exploring the creative spark of first encounters.',
    startDate: toTimestamp(today),
    targetDurationDays: 7,
    currentPhase: 'early',
  });
}

export async function getPendingArc(userId: string): Promise<Arc | null> {
  const collections = getUserCollections(userId);
  const snapshot = await collections.arcs
    .orderBy('startDate', 'desc')
    .limit(5)
    .get();

  if (snapshot.empty) return null;

  for (const doc of snapshot.docs) {
    const arc = { id: doc.id, ...doc.data() } as Arc;
    const bundlesSnapshot = await collections.dailyBundles
      .where('arcId', '==', arc.id)
      .limit(1)
      .get();

    if (bundlesSnapshot.empty) {
      return arc;
    }
  }

  return null;
}

export async function getArcBundles(userId: string, arcId: string): Promise<DailyBundle[]> {
  const collections = getUserCollections(userId);
  const snapshot = await collections.dailyBundles
    .where('arcId', '==', arcId)
    .orderBy('date', 'asc')
    .get();

  return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as DailyBundle));
}

export async function getArcInsights(userId: string, arcId: string): Promise<SessionInsights[]> {
  const collections = getUserCollections(userId);
  const snapshot = await collections.sessionInsights
    .where('arcId', '==', arcId)
    .orderBy('date', 'asc')
    .get();

  return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as SessionInsights));
}

// Bundle operations
export async function getBundle(userId: string, bundleId: string): Promise<DailyBundle | null> {
  const collections = getUserCollections(userId);
  const doc = await collections.dailyBundles.doc(bundleId).get();
  if (!doc.exists) return null;
  return { id: doc.id, ...doc.data() } as DailyBundle;
}

export async function createBundle(userId: string, bundle: DailyBundle): Promise<void> {
  const collections = getUserCollections(userId);
  await collections.dailyBundles.doc(bundle.id).set(bundle);
}

export async function getBundleHistory(userId: string, limit: number = 30, before?: string): Promise<DailyBundle[]> {
  const collections = getUserCollections(userId);
  let query = collections.dailyBundles.orderBy('date', 'desc').limit(limit);

  if (before) {
    const beforeDoc = await collections.dailyBundles.doc(before).get();
    if (beforeDoc.exists) {
      query = query.startAfter(beforeDoc);
    }
  }

  const snapshot = await query.get();
  return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as DailyBundle));
}

export async function updateBundleSuggestedReading(
  userId: string,
  bundleId: string,
  suggestedReading: SuggestedReading
): Promise<void> {
  const collections = getUserCollections(userId);
  await collections.dailyBundles.doc(bundleId).update({ suggestedReading });
}

// Exposure operations
export async function getRecentExposures(userId: string, days: number = 30): Promise<Exposure[]> {
  const collections = getUserCollections(userId);
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - days);

  const snapshot = await collections.exposures
    .where('dateShown', '>=', toTimestamp(cutoff))
    .orderBy('dateShown', 'desc')
    .get();

  return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Exposure));
}

export async function createExposure(userId: string, exposure: Omit<Exposure, 'id'>): Promise<void> {
  const collections = getUserCollections(userId);
  await collections.exposures.add(exposure);
}

// Conversation operations
export async function getConversation(userId: string, bundleId: string): Promise<Conversation | null> {
  const collections = getUserCollections(userId);
  const doc = await collections.conversations.doc(bundleId).get();
  if (!doc.exists) return null;
  return { id: doc.id, ...doc.data() } as Conversation;
}

export async function createConversation(userId: string, conversation: Conversation): Promise<void> {
  const collections = getUserCollections(userId);
  await collections.conversations.doc(conversation.id).set(conversation);
}

export async function updateConversation(
  userId: string,
  bundleId: string,
  updates: Partial<Conversation>
): Promise<void> {
  const collections = getUserCollections(userId);
  await collections.conversations.doc(bundleId).update(updates);
}

// Record a mid-conversation tone change
export async function recordToneChange(
  userId: string,
  bundleId: string,
  tone: ToneId,
  messageIndex: number
): Promise<void> {
  const conversation = await getConversation(userId, bundleId);
  if (!conversation) return;

  const toneChanges = conversation.toneChanges || [];
  toneChanges.push({ messageIndex, tone });

  await updateConversation(userId, bundleId, { toneChanges });
}

// Get stale conversations across all users (for scheduled function)
export async function getStaleConversationsForUser(userId: string, cutoffTime: Date): Promise<Conversation[]> {
  const collections = getUserCollections(userId);
  const snapshot = await collections.conversations
    .where('sessionEnded', '==', false)
    .where('lastActivity', '<', toTimestamp(cutoffTime))
    .get();

  return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Conversation));
}

// Get all user IDs (for scheduled function)
export async function getAllUserIds(): Promise<string[]> {
  const snapshot = await globalCollections.users.get();
  return snapshot.docs.map(doc => doc.id);
}

// User profile type
export interface UserProfile {
  email: string;
  createdAt: Timestamp;
  hasSeenAbout: boolean;
  currentTone?: ToneId;
  hasSelectedTone?: boolean;
}

// Ensure user document exists
export async function ensureUserExists(userId: string, email: string): Promise<void> {
  const userDoc = globalCollections.users.doc(userId);
  const doc = await userDoc.get();
  if (!doc.exists) {
    await userDoc.set({
      email,
      createdAt: toTimestamp(new Date()),
      hasSeenAbout: false, // New users haven't seen the about page
    });
  }
}

// Get user profile
export async function getUserProfile(userId: string): Promise<UserProfile | null> {
  const doc = await globalCollections.users.doc(userId).get();
  if (!doc.exists) return null;

  const data = doc.data();
  return {
    email: data?.email || '',
    createdAt: data?.createdAt || toTimestamp(new Date()),
    // For existing users without this field, assume they've seen it
    hasSeenAbout: data?.hasSeenAbout ?? true,
    currentTone: data?.currentTone,
    hasSelectedTone: data?.hasSelectedTone ?? false,
  };
}

// Get user's current tone preference
export async function getUserTone(userId: string): Promise<ToneId> {
  const profile = await getUserProfile(userId);
  return profile?.currentTone || DEFAULT_TONE;
}

// Set user's tone preference
export async function setUserTone(userId: string, tone: ToneId): Promise<void> {
  await globalCollections.users.doc(userId).set({
    currentTone: tone,
    hasSelectedTone: true,
  }, { merge: true });
}

// Mark tone as selected (for onboarding)
export async function markToneSelected(userId: string): Promise<void> {
  await globalCollections.users.doc(userId).set({
    hasSelectedTone: true,
  }, { merge: true });
}

// Mark about page as seen
export async function markAboutAsSeen(userId: string): Promise<void> {
  await globalCollections.users.doc(userId).set({
    hasSeenAbout: true,
  }, { merge: true });
}

// Session insights operations
export async function getRecentInsights(userId: string, days: number = 14): Promise<SessionInsights[]> {
  const collections = getUserCollections(userId);
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - days);

  const snapshot = await collections.sessionInsights
    .where('date', '>=', toTimestamp(cutoff))
    .orderBy('date', 'desc')
    .get();

  return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as SessionInsights));
}

export async function createSessionInsights(userId: string, insights: SessionInsights): Promise<void> {
  const collections = getUserCollections(userId);
  await collections.sessionInsights.doc(insights.id).set(insights);
}

// User reaction operations
export async function createReaction(userId: string, reaction: Omit<UserReaction, 'id'>): Promise<void> {
  const collections = getUserCollections(userId);
  await collections.userReactions.add(reaction);
}

// Arc phase calculation - counts bundles generated for this arc
export async function calculateDayInArc(userId: string, arc: Arc): Promise<number> {
  const collections = getUserCollections(userId);
  const snapshot = await collections.dailyBundles
    .where('arcId', '==', arc.id)
    .count()
    .get();

  return Math.max(1, snapshot.data().count);
}

export function determinePhase(dayInArc: number, targetDuration: number): Arc['currentPhase'] {
  const progress = dayInArc / targetDuration;
  if (progress <= 0.33) return 'early';
  if (progress <= 0.66) return 'middle';
  return 'late';
}
