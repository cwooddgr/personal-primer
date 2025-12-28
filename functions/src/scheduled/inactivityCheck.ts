import { getStaleConversations, getBundle } from '../utils/firestore';
import { extractAndEndSession } from '../services/insightExtractor';

export async function checkInactiveSessions(): Promise<void> {
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);

  const staleConversations = await getStaleConversations(oneHourAgo);

  console.log(`Found ${staleConversations.length} stale conversation(s)`);

  for (const conversation of staleConversations) {
    try {
      const bundle = await getBundle(conversation.bundleId);
      if (bundle) {
        await extractAndEndSession(conversation.id, bundle);
        console.log(`Ended session for bundle ${conversation.bundleId}`);
      }
    } catch (error) {
      console.error(`Error ending session for ${conversation.bundleId}:`, error);
    }
  }
}
