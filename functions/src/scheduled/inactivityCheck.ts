import { getStaleConversationsForUser, getBundle, getAllUserIds } from '../utils/firestore';
import { extractAndEndSession } from '../services/insightExtractor';

export async function checkInactiveSessions(): Promise<void> {
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);

  // Get all user IDs
  const userIds = await getAllUserIds();
  console.log(`Checking inactive sessions for ${userIds.length} user(s)`);

  for (const userId of userIds) {
    try {
      const staleConversations = await getStaleConversationsForUser(userId, oneHourAgo);

      if (staleConversations.length > 0) {
        console.log(`Found ${staleConversations.length} stale conversation(s) for user ${userId}`);

        for (const conversation of staleConversations) {
          try {
            const bundle = await getBundle(userId, conversation.bundleId);
            if (bundle) {
              await extractAndEndSession(userId, conversation.id, bundle);
              console.log(`Ended session for user ${userId}, bundle ${conversation.bundleId}`);
            }
          } catch (error) {
            console.error(`Error ending session for user ${userId}, bundle ${conversation.bundleId}:`, error);
          }
        }
      }
    } catch (error) {
      console.error(`Error checking stale sessions for user ${userId}:`, error);
    }
  }
}
