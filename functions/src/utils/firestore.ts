import * as admin from 'firebase-admin';
import { Timestamp } from 'firebase-admin/firestore';
import {
  Arc,
  DailyBundle,
  Exposure,
  Conversation,
  SessionInsights,
  UserReaction,
} from '../types';

// Initialize Firebase Admin if not already initialized
if (!admin.apps.length) {
  admin.initializeApp();
}

const db = admin.firestore();

// Collection references
export const collections = {
  arcs: db.collection('arcs'),
  dailyBundles: db.collection('dailyBundles'),
  exposures: db.collection('exposures'),
  conversations: db.collection('conversations'),
  sessionInsights: db.collection('sessionInsights'),
  userReactions: db.collection('userReactions'),
};

// Date helpers
export function getTodayId(): string {
  const now = new Date();
  return now.toISOString().split('T')[0]; // YYYY-MM-DD
}

export function toTimestamp(date: Date): Timestamp {
  return Timestamp.fromDate(date);
}

// Arc operations
export async function getActiveArc(): Promise<Arc | null> {
  // Get all arcs ordered by start date, filter for active in memory
  // This avoids complex index requirements for null checks
  const snapshot = await collections.arcs
    .orderBy('startDate', 'desc')
    .limit(10)
    .get();

  if (snapshot.empty) return null;

  // Find the first arc without a completedDate
  for (const doc of snapshot.docs) {
    const data = doc.data();
    if (!data.completedDate) {
      return { id: doc.id, ...data } as Arc;
    }
  }

  return null;
}

export async function updateArcPhase(arcId: string, phase: Arc['currentPhase']): Promise<void> {
  await collections.arcs.doc(arcId).update({ currentPhase: phase });
}

// Bundle operations
export async function getBundle(bundleId: string): Promise<DailyBundle | null> {
  const doc = await collections.dailyBundles.doc(bundleId).get();
  if (!doc.exists) return null;
  return { id: doc.id, ...doc.data() } as DailyBundle;
}

export async function createBundle(bundle: DailyBundle): Promise<void> {
  await collections.dailyBundles.doc(bundle.id).set(bundle);
}

export async function getBundleHistory(limit: number = 30, before?: string): Promise<DailyBundle[]> {
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

// Exposure operations
export async function getRecentExposures(days: number = 30): Promise<Exposure[]> {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - days);

  const snapshot = await collections.exposures
    .where('dateShown', '>=', toTimestamp(cutoff))
    .orderBy('dateShown', 'desc')
    .get();

  return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Exposure));
}

export async function createExposure(exposure: Omit<Exposure, 'id'>): Promise<void> {
  await collections.exposures.add(exposure);
}

// Conversation operations
export async function getConversation(bundleId: string): Promise<Conversation | null> {
  const doc = await collections.conversations.doc(bundleId).get();
  if (!doc.exists) return null;
  return { id: doc.id, ...doc.data() } as Conversation;
}

export async function createConversation(conversation: Conversation): Promise<void> {
  await collections.conversations.doc(conversation.id).set(conversation);
}

export async function updateConversation(
  bundleId: string,
  updates: Partial<Conversation>
): Promise<void> {
  await collections.conversations.doc(bundleId).update(updates);
}

export async function getStaleConversations(cutoffTime: Date): Promise<Conversation[]> {
  const snapshot = await collections.conversations
    .where('sessionEnded', '==', false)
    .where('lastActivity', '<', toTimestamp(cutoffTime))
    .get();

  return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Conversation));
}

// Session insights operations
export async function getRecentInsights(days: number = 14): Promise<SessionInsights[]> {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - days);

  const snapshot = await collections.sessionInsights
    .where('date', '>=', toTimestamp(cutoff))
    .orderBy('date', 'desc')
    .get();

  return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as SessionInsights));
}

export async function createSessionInsights(insights: SessionInsights): Promise<void> {
  await collections.sessionInsights.doc(insights.id).set(insights);
}

// User reaction operations
export async function createReaction(reaction: Omit<UserReaction, 'id'>): Promise<void> {
  await collections.userReactions.add(reaction);
}

// Arc phase calculation
export function calculateDayInArc(arc: Arc): number {
  const now = new Date();
  const start = arc.startDate.toDate();
  const diffTime = now.getTime() - start.getTime();
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  return Math.max(1, diffDays);
}

export function determinePhase(dayInArc: number, targetDuration: number): Arc['currentPhase'] {
  const progress = dayInArc / targetDuration;
  if (progress <= 0.33) return 'early';
  if (progress <= 0.66) return 'middle';
  return 'late';
}
