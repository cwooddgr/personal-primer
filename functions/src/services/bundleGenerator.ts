import {
  Arc,
  DailyBundle,
  Exposure,
  SessionInsights,
  LLMBundleSelection,
} from '../types';
import {
  getActiveArc,
  getRecentExposures,
  getRecentInsights,
  createBundle,
  createExposure,
  calculateDayInArc,
  determinePhase,
  updateArcPhase,
  toTimestamp,
} from '../utils/firestore';
import { generateJSON } from './anthropic';
import { resolveAppleMusicLink, resolveImageLink } from './linkValidator';

const BUNDLE_SELECTION_SYSTEM_PROMPT = `You are the curator for Personal Primer, a daily intellectual formation guide.

Your role is to select today's artifacts: one piece of music, one image, and one quote or literary excerpt. All three should cohere around the current arc theme and be appropriate for the arc phase.

You must NOT select any artifact that appears in the recent exposure list.

After selecting, you will write a short framing text (2-3 paragraphs) that:
- Introduces the day's theme
- Connects to recent days where relevant
- Orients attention without over-explaining
- Maintains a tone of quiet curiosity, not instruction

You are a curator and narrator, not a teacher. Point, don't explain. Evoke, don't lecture.`;

function buildSelectionUserPrompt(
  arc: Arc,
  dayInArc: number,
  exposures: Exposure[],
  insights: SessionInsights[]
): string {
  const exposureList = exposures
    .map(e => `- [${e.artifactType}] ${e.artifactIdentifier}`)
    .join('\n');

  const insightsSummary = insights
    .map(i => {
      const parts = [];
      if (i.meaningfulConnections.length) {
        parts.push(`Connections: ${i.meaningfulConnections.join(', ')}`);
      }
      if (i.revealedInterests.length) {
        parts.push(`Interests: ${i.revealedInterests.join(', ')}`);
      }
      if (i.personalContext.length) {
        parts.push(`Context: ${i.personalContext.join(', ')}`);
      }
      return parts.join('; ');
    })
    .filter(s => s)
    .join('\n');

  return `CURRENT ARC: ${arc.theme}
${arc.description}

Day ${dayInArc} of ~${arc.targetDurationDays} (${arc.currentPhase} phase)

RECENT EXPOSURES (do NOT repeat these):
${exposureList || '(none yet)'}

RECENT USER INSIGHTS:
${insightsSummary || '(no insights recorded yet)'}

Select today's artifacts and write the framing text. Return as JSON:
{
  "music": {
    "title": "exact title of the piece",
    "artist": "composer or performer",
    "searchQuery": "search query to find this on Apple Music"
  },
  "image": {
    "title": "exact title of the artwork",
    "artist": "artist name",
    "searchQuery": "search query to find this on Wikimedia or a museum site"
  },
  "text": {
    "content": "the quote or excerpt (keep it under 200 words)",
    "source": "book, poem, or work title",
    "author": "author name"
  },
  "framingText": "2-3 paragraphs introducing today's encounter"
}`;
}

export async function generateDailyBundle(bundleId: string): Promise<DailyBundle> {
  // Step 1: Gather context
  const arc = await getActiveArc();
  if (!arc) {
    throw new Error('No active arc found. Please create an arc first.');
  }

  const dayInArc = calculateDayInArc(arc);
  const currentPhase = determinePhase(dayInArc, arc.targetDurationDays);

  // Update phase if changed
  if (currentPhase !== arc.currentPhase) {
    await updateArcPhase(arc.id, currentPhase);
    arc.currentPhase = currentPhase;
  }

  const exposures = await getRecentExposures(14);
  const insights = await getRecentInsights(14);

  // Step 2: LLM selection
  const selection = await generateJSON<LLMBundleSelection>(
    BUNDLE_SELECTION_SYSTEM_PROMPT,
    buildSelectionUserPrompt(arc, dayInArc, exposures, insights)
  );

  // Step 3: Link resolution
  const musicLink = await resolveAppleMusicLink(
    selection.music.title,
    selection.music.artist,
    selection.music.searchQuery
  );

  const imageLink = await resolveImageLink(
    selection.image.title,
    selection.image.artist,
    selection.image.searchQuery
  );

  // Step 4: Build and persist bundle
  const now = toTimestamp(new Date());

  const bundle: DailyBundle = {
    id: bundleId,
    date: now,
    arcId: arc.id,
    music: {
      title: selection.music.title,
      artist: selection.music.artist,
      appleMusicUrl: musicLink?.appleMusicUrl || '',
    },
    image: {
      title: selection.image.title,
      artist: selection.image.artist,
      sourceUrl: imageLink?.sourceUrl || '',
      imageUrl: imageLink?.imageUrl || '',
    },
    text: {
      content: selection.text.content,
      source: selection.text.source,
      author: selection.text.author,
    },
    framingText: selection.framingText,
  };

  await createBundle(bundle);

  // Create exposure records
  const exposureBase = {
    dateShown: now,
    arcId: arc.id,
  };

  await Promise.all([
    createExposure({
      ...exposureBase,
      artifactType: 'music',
      artifactIdentifier: `${selection.music.title} - ${selection.music.artist}`,
    }),
    createExposure({
      ...exposureBase,
      artifactType: 'image',
      artifactIdentifier: `${selection.image.title} - ${selection.image.artist}`,
    }),
    createExposure({
      ...exposureBase,
      artifactType: 'text',
      artifactIdentifier: `${selection.text.source} - ${selection.text.author}`,
    }),
  ]);

  return bundle;
}
