/**
 * Migration script to convert single-user data to multi-user structure.
 *
 * This script:
 * 1. Reads all data from top-level collections (arcs, dailyBundles, etc.)
 * 2. Copies data to user-scoped subcollections under /users/{userId}/
 * 3. Adds the user's email to the allowedEmails whitelist
 *
 * Usage:
 *   cd functions
 *   npx ts-node ../scripts/migrate-to-multiuser.ts <userId> <userEmail>
 *
 * Example:
 *   npx ts-node ../scripts/migrate-to-multiuser.ts abc123def user@example.com
 *
 * Prerequisites:
 *   - Get the userId from Firebase Console > Authentication > Users
 *   - Set GOOGLE_APPLICATION_CREDENTIALS to your service account key
 */

import * as admin from 'firebase-admin';

// Initialize Firebase Admin
admin.initializeApp();

const db = admin.firestore();

async function migrateCollection(
  collectionName: string,
  userId: string
): Promise<number> {
  const sourceCollection = db.collection(collectionName);
  const targetCollection = db.collection(`users/${userId}/${collectionName}`);

  const snapshot = await sourceCollection.get();
  let count = 0;

  for (const doc of snapshot.docs) {
    const data = doc.data();
    await targetCollection.doc(doc.id).set(data);
    count++;
    console.log(`  Migrated ${collectionName}/${doc.id}`);
  }

  return count;
}

async function addToWhitelist(email: string): Promise<void> {
  const normalizedEmail = email.toLowerCase().trim();
  await db.collection('allowedEmails').doc(normalizedEmail).set({
    email: normalizedEmail,
    addedAt: admin.firestore.Timestamp.now(),
    addedBy: 'migration-script',
  });
  console.log(`Added ${email} to allowedEmails whitelist`);
}

async function createUserDocument(userId: string, email: string): Promise<void> {
  await db.collection('users').doc(userId).set({
    email,
    createdAt: admin.firestore.Timestamp.now(),
    migratedAt: admin.firestore.Timestamp.now(),
  });
  console.log(`Created user document for ${userId}`);
}

async function migrate(userId: string, email: string): Promise<void> {
  console.log('='.repeat(60));
  console.log('Multi-user Migration Script');
  console.log('='.repeat(60));
  console.log(`User ID: ${userId}`);
  console.log(`Email: ${email}`);
  console.log('');

  const collections = [
    'arcs',
    'dailyBundles',
    'exposures',
    'conversations',
    'sessionInsights',
    'userReactions',
  ];

  console.log('Creating user document...');
  await createUserDocument(userId, email);
  console.log('');

  console.log('Adding email to whitelist...');
  await addToWhitelist(email);
  console.log('');

  console.log('Migrating collections...');
  const totals: Record<string, number> = {};

  for (const collection of collections) {
    console.log(`\nMigrating ${collection}...`);
    totals[collection] = await migrateCollection(collection, userId);
  }

  console.log('\n' + '='.repeat(60));
  console.log('Migration Summary');
  console.log('='.repeat(60));
  for (const [collection, count] of Object.entries(totals)) {
    console.log(`  ${collection}: ${count} documents`);
  }
  console.log('');
  console.log('Migration complete!');
  console.log('');
  console.log('Next steps:');
  console.log('1. Verify data in Firebase Console under /users/' + userId);
  console.log('2. Test the app with your account');
  console.log('3. Once verified, you can delete the old top-level collections');
  console.log('');
}

// Parse command line arguments
const args = process.argv.slice(2);
if (args.length < 2) {
  console.error('Usage: npx ts-node ../scripts/migrate-to-multiuser.ts <userId> <userEmail>');
  console.error('');
  console.error('Get the userId from Firebase Console > Authentication > Users');
  process.exit(1);
}

const [userId, email] = args;

migrate(userId, email)
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('Migration failed:', error);
    process.exit(1);
  });
