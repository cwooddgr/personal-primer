/**
 * Seed script to create the first arc in Firestore.
 *
 * Run with:
 *   npx ts-node scripts/seed-arc.ts
 *
 * Or use the Firebase console to manually add this document to the 'arcs' collection.
 */

import * as admin from 'firebase-admin';

// Initialize with default credentials (uses GOOGLE_APPLICATION_CREDENTIALS env var)
admin.initializeApp();

const db = admin.firestore();

async function seedFirstArc() {
  const arc = {
    id: 'arc-001-scale',
    theme: 'Scale',
    description:
      'An exploration of scale—from the cosmic to the microscopic, from civilizations to individual moments. How does perspective shift when we zoom in or out? What remains constant across scales, and what transforms entirely?',
    startDate: admin.firestore.Timestamp.fromDate(new Date()),
    targetDurationDays: 30,
    currentPhase: 'early' as const,
    completedDate: null,
  };

  await db.collection('arcs').doc(arc.id).set(arc);

  console.log('Created arc:', arc.id);
  console.log('Theme:', arc.theme);
  console.log('Description:', arc.description);
}

seedFirstArc()
  .then(() => {
    console.log('\nDone! You can now start the app.');
    process.exit(0);
  })
  .catch((error) => {
    console.error('Error seeding arc:', error);
    process.exit(1);
  });
