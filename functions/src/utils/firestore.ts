import * as admin from 'firebase-admin';
import { Timestamp } from 'firebase-admin/firestore';
import {
  Arc,
  Season,
  DailyBundle,
  SuggestedReading,
  Exposure,
  Conversation,
  SessionInsights,
  UserMemoryProfile,
  ARC_DURATION_DAYS,
  ArcPhase,
  BundleGenerationStatus,
} from '../types';

// Initialize Firebase Admin if not already initialized
if (!admin.apps.length) {
  admin.initializeApp();
}

const db = admin.firestore();

// Get user-scoped collection references
function getUserCollections(userId: string) {
  const userDoc = db.collection('users').doc(userId);
  return {
    seasons: userDoc.collection('seasons'),
    arcs: userDoc.collection('arcs'),
    dailyBundles: userDoc.collection('dailyBundles'),
    exposures: userDoc.collection('exposures'),
    conversations: userDoc.collection('conversations'),
    sessionInsights: userDoc.collection('sessionInsights'),
  };
}

// Top-level collections (not user-scoped)
export const globalCollections = {
  allowedEmails: db.collection('allowedEmails'),
  users: db.collection('users'),
};

// ---------------------------------------------------------------------------
// Date helpers
// ---------------------------------------------------------------------------


export function toTimestamp(date: Date): Timestamp {
  return Timestamp.fromDate(date);
}

// Returns true if the timestamp falls on an earlier calendar day than today.
function isFromPriorDay(ts: Timestamp): boolean {
  const created = ts.toDate();
  const now = new Date();
  const createdDay = `${created.getFullYear()}-${created.getMonth()}-${created.getDate()}`;
  const nowDay = `${now.getFullYear()}-${now.getMonth()}-${now.getDate()}`;
  return createdDay !== nowDay;
}

// ---------------------------------------------------------------------------
// Whitelist operations
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Season operations
// ---------------------------------------------------------------------------

export async function getActiveSeason(userId: string): Promise<Season | null> {
  const collections = getUserCollections(userId);
  const snapshot = await collections.seasons
    .where('status', '==', 'active')
    .limit(1)
    .get();
  if (snapshot.empty) return null;
  const doc = snapshot.docs[0];
  return { id: doc.id, ...doc.data() } as Season;
}

export async function getSeason(userId: string, seasonId: string): Promise<Season | null> {
  const collections = getUserCollections(userId);
  const doc = await collections.seasons.doc(seasonId).get();
  if (!doc.exists) return null;
  return { id: doc.id, ...doc.data() } as Season;
}

export async function getAllSeasons(userId: string): Promise<Season[]> {
  const collections = getUserCollections(userId);
  const snapshot = await collections.seasons.orderBy('seasonNumber', 'asc').get();
  return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Season));
}

/** All arcs for the user, across every season. */
export async function getAllArcs(userId: string): Promise<Arc[]> {
  const collections = getUserCollections(userId);
  const snapshot = await collections.arcs.get();
  return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Arc));
}

export async function getLatestSeasonNumber(userId: string): Promise<number> {
  const collections = getUserCollections(userId);
  const snapshot = await collections.seasons
    .orderBy('seasonNumber', 'desc')
    .limit(1)
    .get();
  if (snapshot.empty) return 0;
  return (snapshot.docs[0].data().seasonNumber as number) || 0;
}

export async function createSeason(
  userId: string,
  seasonNumber: number
): Promise<Season> {
  const collections = getUserCollections(userId);
  const id = `season-${seasonNumber}-${Date.now()}`;
  const season: Season = {
    id,
    seasonNumber,
    createdAt: toTimestamp(new Date()),
    status: 'active',
  };
  await collections.seasons.doc(id).set(season);
  return season;
}

export async function completeSeason(userId: string, seasonId: string): Promise<void> {
  const collections = getUserCollections(userId);
  await collections.seasons.doc(seasonId).update({ status: 'completed' });
}

// ---------------------------------------------------------------------------
// Arc operations
// ---------------------------------------------------------------------------

export async function getActiveArc(userId: string): Promise<Arc | null> {
  const collections = getUserCollections(userId);
  const snapshot = await collections.arcs
    .where('status', '==', 'active')
    .limit(1)
    .get();
  if (snapshot.empty) return null;
  const doc = snapshot.docs[0];
  return { id: doc.id, ...doc.data() } as Arc;
}

export async function getArc(userId: string, arcId: string): Promise<Arc | null> {
  const collections = getUserCollections(userId);
  const doc = await collections.arcs.doc(arcId).get();
  if (!doc.exists) return null;
  return { id: doc.id, ...doc.data() } as Arc;
}

export async function getSeasonArcs(userId: string, seasonId: string): Promise<Arc[]> {
  const collections = getUserCollections(userId);
  const snapshot = await collections.arcs
    .where('seasonId', '==', seasonId)
    .get();
  const arcs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Arc));
  arcs.sort((a, b) => a.orderInSeason - b.orderInSeason);
  return arcs;
}

export async function createArc(userId: string, arc: Omit<Arc, 'id'>): Promise<Arc> {
  const collections = getUserCollections(userId);
  const id = `arc-${arc.seasonId}-${arc.orderInSeason}-${Date.now()}`;
  const newArc: Arc = { id, ...arc };
  await collections.arcs.doc(id).set(newArc);
  return newArc;
}

export async function updateArc(
  userId: string,
  arcId: string,
  updates: Partial<Arc>
): Promise<void> {
  const collections = getUserCollections(userId);
  await collections.arcs.doc(arcId).update(updates);
}

export async function deleteArc(userId: string, arcId: string): Promise<void> {
  const collections = getUserCollections(userId);
  await collections.arcs.doc(arcId).delete();
}

/**
 * Marks an arc completed and activates the next-order planned arc in the same
 * season. Returns the newly activated arc, or null if the season is finished.
 */
export async function completeArcAndAdvance(
  userId: string,
  arc: Arc
): Promise<Arc | null> {
  await updateArc(userId, arc.id, {
    status: 'completed',
    completedDate: toTimestamp(new Date()),
  });

  const seasonArcs = await getSeasonArcs(userId, arc.seasonId);
  const next = seasonArcs.find(
    a => a.status === 'planned' && a.orderInSeason > arc.orderInSeason
  );
  if (!next) {
    return null;
  }

  await updateArc(userId, next.id, {
    status: 'active',
    startDate: toTimestamp(new Date()),
  });
  return { ...next, status: 'active' };
}

// ---------------------------------------------------------------------------
// Phase helper (derived from dayInArc)
// ---------------------------------------------------------------------------

export function determinePhase(
  dayInArc: number,
  targetDuration: number = ARC_DURATION_DAYS
): ArcPhase {
  const progress = dayInArc / targetDuration;
  if (progress <= 0.33) return 'early';
  if (progress <= 0.66) return 'middle';
  return 'late';
}

// ---------------------------------------------------------------------------
// Bundle operations — keyed by (arcId, dayInArc)
// ---------------------------------------------------------------------------

/**
 * Count of engaged bundles in an arc. Drives arc progression — skipping a day
 * never consumes a slot.
 */
export async function countEngagedBundles(userId: string, arcId: string): Promise<number> {
  const collections = getUserCollections(userId);
  const snapshot = await collections.dailyBundles
    .where('arcId', '==', arcId)
    .where('engaged', '==', true)
    .count()
    .get();
  return snapshot.data().count;
}

/**
 * Day in arc for the *current* encounter: count of engaged bundles + 1,
 * clamped to the arc duration.
 */
export async function calculateDayInArc(userId: string, arc: Arc): Promise<number> {
  const engaged = await countEngagedBundles(userId, arc.id);
  return Math.min(engaged + 1, arc.targetDurationDays);
}

/**
 * Deterministic bundle id. Bundle identity is (arcId, dayInArc); the document
 * id encodes both so an atomic `.create()` can serve as a concurrency lock.
 */
export function bundleId(arcId: string, dayInArc: number): string {
  return `${arcId}-day${dayInArc}`;
}

export async function getBundle(userId: string, id: string): Promise<DailyBundle | null> {
  const collections = getUserCollections(userId);
  const doc = await collections.dailyBundles.doc(id).get();
  if (!doc.exists) return null;
  return { id: doc.id, ...doc.data() } as DailyBundle;
}

export async function getBundleByArcDay(
  userId: string,
  arcId: string,
  dayInArc: number
): Promise<DailyBundle | null> {
  return getBundle(userId, bundleId(arcId, dayInArc));
}

/**
 * Atomically create a pending bundle document via Firestore `.create()`, which
 * throws if the document already exists. That throw IS the concurrency lock:
 * exactly one concurrent request can win the create. Artifact/framing fields
 * start empty; a Firestore trigger fills them in out-of-band.
 */
export async function createPendingBundle(
  userId: string,
  arcId: string,
  dayInArc: number
): Promise<DailyBundle> {
  const collections = getUserCollections(userId);
  const id = bundleId(arcId, dayInArc);
  const bundle: DailyBundle = {
    id,
    arcId,
    dayInArc,
    engaged: false,
    createdAt: toTimestamp(new Date()),
    generationStatus: 'pending',
    generationAttempts: 0,
    music: { title: '', artist: '', youtubeUrl: '' },
    image: { title: '', sourceUrl: '', imageUrl: '' },
    text: { content: '', source: '', author: '' },
    framingText: '',
  };
  // .create() throws (code 6 / ALREADY_EXISTS) if the doc already exists.
  await collections.dailyBundles.doc(id).create(bundle);
  return bundle;
}

/**
 * Reset a bundle back to `pending` so the Firestore trigger regenerates it.
 * Refreshes `createdAt` to the current calendar day. Used for stale un-engaged
 * bundles and for auto-retrying failed bundles.
 */
export async function resetBundleToPending(
  userId: string,
  id: string
): Promise<void> {
  const collections = getUserCollections(userId);
  await collections.dailyBundles.doc(id).update({
    generationStatus: 'pending',
    createdAt: toTimestamp(new Date()),
  });
}

/**
 * Transition a bundle's generationStatus. Optionally bumps generationAttempts.
 */
export async function setBundleGenerationStatus(
  userId: string,
  id: string,
  status: BundleGenerationStatus,
  options: { incrementAttempts?: boolean } = {}
): Promise<void> {
  const collections = getUserCollections(userId);
  const updates: Record<string, unknown> = { generationStatus: status };
  if (options.incrementAttempts) {
    updates.generationAttempts = admin.firestore.FieldValue.increment(1);
  }
  await collections.dailyBundles.doc(id).update(updates);
}

/**
 * The single un-engaged bundle for the active arc, if one exists.
 */
export async function getCurrentUnengagedBundle(
  userId: string,
  arcId: string
): Promise<DailyBundle | null> {
  const collections = getUserCollections(userId);
  const snapshot = await collections.dailyBundles
    .where('arcId', '==', arcId)
    .where('engaged', '==', false)
    .get();
  if (snapshot.empty) return null;
  // There should be at most one; if more, pick the most recent.
  const bundles = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as DailyBundle));
  bundles.sort((a, b) => b.createdAt.toMillis() - a.createdAt.toMillis());
  return bundles[0];
}

export function isBundleStale(bundle: DailyBundle): boolean {
  return isFromPriorDay(bundle.createdAt);
}

// A bundle stuck mid-generation: still 'generating' well past the trigger's
// 540s timeout (the trigger crashed/OOM'd before reaching ready/failed).
const GENERATION_STUCK_MS = 12 * 60 * 1000;

export function isBundleGenerationStuck(bundle: DailyBundle): boolean {
  return Date.now() - bundle.createdAt.toMillis() > GENERATION_STUCK_MS;
}

/**
 * The most recently created bundle for an arc (engaged or not). Used for
 * session-end resolution after a bundle has already been engaged.
 */
export async function getLatestBundleForArc(
  userId: string,
  arcId: string
): Promise<DailyBundle | null> {
  const collections = getUserCollections(userId);
  const snapshot = await collections.dailyBundles
    .where('arcId', '==', arcId)
    .get();
  if (snapshot.empty) return null;
  const bundles = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as DailyBundle));
  bundles.sort((a, b) => b.createdAt.toMillis() - a.createdAt.toMillis());
  return bundles[0];
}

/**
 * Fill a pending/generating bundle's artifact + framing content in place and
 * mark it `ready`. Identity (id, arcId, dayInArc) is unchanged.
 */
export async function fillBundleContent(
  userId: string,
  id: string,
  content: Pick<DailyBundle, 'music' | 'image' | 'text' | 'framingText'>
): Promise<void> {
  const collections = getUserCollections(userId);
  await collections.dailyBundles.doc(id).update({
    music: content.music,
    image: content.image,
    text: content.text,
    framingText: content.framingText,
    generationStatus: 'ready',
  });
}

export async function getArcBundles(userId: string, arcId: string): Promise<DailyBundle[]> {
  const collections = getUserCollections(userId);
  const snapshot = await collections.dailyBundles
    .where('arcId', '==', arcId)
    .where('engaged', '==', true)
    .get();
  const bundles = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as DailyBundle));
  bundles.sort((a, b) => (a.dayInArc || 0) - (b.dayInArc || 0));
  return bundles;
}

export async function getBundleHistory(
  userId: string,
  limit: number = 30
): Promise<DailyBundle[]> {
  const collections = getUserCollections(userId);
  // Engaged bundles, newest first. Legacy bundles use 'status' instead of
  // 'engaged'; fetch broadly then filter for best-effort legacy support.
  const snapshot = await collections.dailyBundles
    .orderBy('createdAt', 'desc')
    .limit(limit * 3)
    .get();

  const bundles = snapshot.docs
    .map(doc => ({ id: doc.id, ...doc.data() } as DailyBundle & { status?: string }))
    .filter(b => b.engaged === true || b.status === 'delivered')
    // Exclude bundles that never finished generating (no artifacts to show).
    .filter(b => b.generationStatus === undefined || b.generationStatus === 'ready');

  return bundles.slice(0, limit);
}

export async function updateBundleSuggestedReading(
  userId: string,
  bundleId: string,
  suggestedReading: SuggestedReading
): Promise<void> {
  const collections = getUserCollections(userId);
  await collections.dailyBundles.doc(bundleId).update({ suggestedReading });
}

/**
 * Mark a bundle engaged and create exposure records. Called when the user
 * sends their first message (intentional engagement). Idempotent.
 */
export async function engageBundle(userId: string, bundle: DailyBundle): Promise<void> {
  if (bundle.engaged) {
    return;
  }

  const collections = getUserCollections(userId);
  await collections.dailyBundles.doc(bundle.id).update({ engaged: true });

  const now = toTimestamp(new Date());
  const exposureBase = {
    dateShown: now,
    arcId: bundle.arcId,
  };

  await Promise.all([
    createExposure(userId, {
      ...exposureBase,
      artifactType: 'music',
      artifactIdentifier: `${bundle.music.title} - ${bundle.music.artist}`,
      creator: bundle.music.artist,
    }),
    createExposure(userId, {
      ...exposureBase,
      artifactType: 'image',
      artifactIdentifier: `${bundle.image.title} - ${bundle.image.artist || ''}`,
      creator: bundle.image.artist || '',
    }),
    createExposure(userId, {
      ...exposureBase,
      artifactType: 'text',
      artifactIdentifier: `${bundle.text.source} - ${bundle.text.author}`,
      creator: bundle.text.author,
    }),
  ]);
}

// ---------------------------------------------------------------------------
// Exposure operations
// ---------------------------------------------------------------------------

export async function getRecentExposures(
  userId: string,
  days: number = 30
): Promise<Exposure[]> {
  const collections = getUserCollections(userId);
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - days);

  const snapshot = await collections.exposures
    .where('dateShown', '>=', toTimestamp(cutoff))
    .orderBy('dateShown', 'desc')
    .get();

  return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Exposure));
}

export async function createExposure(
  userId: string,
  exposure: Omit<Exposure, 'id'>
): Promise<void> {
  const collections = getUserCollections(userId);
  await collections.exposures.add(exposure);
}

// ---------------------------------------------------------------------------
// Conversation operations
// ---------------------------------------------------------------------------

export async function getConversation(
  userId: string,
  bundleId: string
): Promise<Conversation | null> {
  const collections = getUserCollections(userId);
  const doc = await collections.conversations.doc(bundleId).get();
  if (!doc.exists) return null;
  return { id: doc.id, ...doc.data() } as Conversation;
}

export async function createConversation(
  userId: string,
  conversation: Conversation
): Promise<void> {
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

export async function getStaleConversationsForUser(
  userId: string,
  cutoffTime: Date
): Promise<Conversation[]> {
  const collections = getUserCollections(userId);
  const snapshot = await collections.conversations
    .where('sessionEnded', '==', false)
    .where('lastActivity', '<', toTimestamp(cutoffTime))
    .get();
  return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Conversation));
}

export async function getAllUserIds(): Promise<string[]> {
  const snapshot = await globalCollections.users.get();
  return snapshot.docs.map(doc => doc.id);
}

// ---------------------------------------------------------------------------
// User profile
// ---------------------------------------------------------------------------

export interface UserProfile {
  email: string;
  createdAt: Timestamp;
  hasSeenAbout: boolean;
  voicePreference?: string | null;
  memoryProfile?: UserMemoryProfile | null;
}

export async function ensureUserExists(userId: string, email: string): Promise<void> {
  const userDoc = globalCollections.users.doc(userId);
  const doc = await userDoc.get();
  if (!doc.exists) {
    await userDoc.set({
      email,
      createdAt: toTimestamp(new Date()),
      hasSeenAbout: false,
    });
  }
}

export async function getUserProfile(userId: string): Promise<UserProfile | null> {
  const doc = await globalCollections.users.doc(userId).get();
  if (!doc.exists) return null;

  const data = doc.data();
  return {
    email: data?.email || '',
    createdAt: data?.createdAt || toTimestamp(new Date()),
    hasSeenAbout: data?.hasSeenAbout ?? true,
    voicePreference: data?.voicePreference ?? null,
    memoryProfile: data?.memoryProfile ?? null,
  };
}

export async function markAboutAsSeen(userId: string): Promise<void> {
  await globalCollections.users.doc(userId).set({ hasSeenAbout: true }, { merge: true });
}

export async function getVoicePreference(userId: string): Promise<string | null> {
  const profile = await getUserProfile(userId);
  return profile?.voicePreference ?? null;
}

export async function setVoicePreference(
  userId: string,
  voicePreference: string
): Promise<void> {
  await globalCollections.users.doc(userId).set({ voicePreference }, { merge: true });
}

export async function getMemoryProfile(
  userId: string
): Promise<UserMemoryProfile | null> {
  const profile = await getUserProfile(userId);
  return profile?.memoryProfile ?? null;
}

export async function setMemoryProfile(
  userId: string,
  memoryProfile: UserMemoryProfile
): Promise<void> {
  await globalCollections.users.doc(userId).set({ memoryProfile }, { merge: true });
}

// ---------------------------------------------------------------------------
// Session insights (conversational continuity only)
// ---------------------------------------------------------------------------

export async function getRecentInsights(
  userId: string,
  days: number = 21
): Promise<SessionInsights[]> {
  const collections = getUserCollections(userId);
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - days);

  const snapshot = await collections.sessionInsights
    .where('date', '>=', toTimestamp(cutoff))
    .orderBy('date', 'desc')
    .get();

  return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as SessionInsights));
}

export async function getSeasonInsights(
  userId: string,
  arcIds: string[]
): Promise<SessionInsights[]> {
  if (arcIds.length === 0) return [];
  const collections = getUserCollections(userId);
  const result: SessionInsights[] = [];
  // Firestore 'in' queries are capped at 30 values; chunk to be safe.
  for (let i = 0; i < arcIds.length; i += 10) {
    const chunk = arcIds.slice(i, i + 10);
    const snapshot = await collections.sessionInsights
      .where('arcId', 'in', chunk)
      .get();
    result.push(
      ...snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as SessionInsights))
    );
  }
  return result;
}

export async function createSessionInsights(
  userId: string,
  insights: SessionInsights
): Promise<void> {
  const collections = getUserCollections(userId);
  await collections.sessionInsights.doc(insights.id).set(insights);
}

