/**
 * Migration script to add status field to existing bundles.
 *
 * This script:
 * 1. Gets all users
 * 2. For each user, gets all dailyBundles without a status field
 * 3. Sets status: 'delivered' for each (since they were real encounters)
 *
 * Usage:
 *   cd functions
 *   npx ts-node ../scripts/add-bundle-status.ts
 *
 * Prerequisites:
 *   - Set GOOGLE_APPLICATION_CREDENTIALS to your service account key
 */

import * as admin from 'firebase-admin';

// Initialize Firebase Admin with explicit project ID
admin.initializeApp({
  projectId: 'personal-primer',
});

const db = admin.firestore();

async function migrateUserBundles(userId: string): Promise<number> {
  const bundlesCollection = db.collection(`users/${userId}/dailyBundles`);
  const snapshot = await bundlesCollection.get();

  let count = 0;

  for (const doc of snapshot.docs) {
    const data = doc.data();

    // Only update if status field is missing
    if (!data.status) {
      await doc.ref.update({ status: 'delivered' });
      count++;
      console.log(`  Updated bundle ${doc.id}`);
    }
  }

  return count;
}

async function migrate(): Promise<void> {
  console.log('='.repeat(60));
  console.log('Bundle Status Migration Script');
  console.log('='.repeat(60));
  console.log('');
  console.log('Adding status: "delivered" to all existing bundles');
  console.log('(Existing bundles were real encounters, so they are delivered)');
  console.log('');

  // Get all users
  const usersSnapshot = await db.collection('users').get();
  console.log(`Found ${usersSnapshot.size} users`);
  console.log('');

  let totalUpdated = 0;

  for (const userDoc of usersSnapshot.docs) {
    const userId = userDoc.id;
    console.log(`Processing user ${userId}...`);

    const count = await migrateUserBundles(userId);
    totalUpdated += count;

    if (count > 0) {
      console.log(`  Updated ${count} bundles`);
    } else {
      console.log(`  No bundles needed updating`);
    }
  }

  console.log('');
  console.log('='.repeat(60));
  console.log('Migration Summary');
  console.log('='.repeat(60));
  console.log(`Total bundles updated: ${totalUpdated}`);
  console.log('');
  console.log('Migration complete!');
}

migrate()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('Migration failed:', error);
    process.exit(1);
  });
