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
import { resolveAppleMusicLink, resolveImageLink, MusicSearchOptions } from './linkValidator';

const MAX_MUSIC_RETRIES = 5;
const MAX_IMAGE_RETRIES = 3;
const MAX_TEXT_RETRIES = 3;

// Normalize creator names for comparison (handles "T.S. Eliot" vs "T. S. Eliot")
function normalizeCreatorName(name: string): string {
  return name
    .toLowerCase()
    .replace(/\./g, '') // Remove periods
    .replace(/\s+/g, ' ') // Normalize whitespace
    .trim();
}

const BUNDLE_SELECTION_SYSTEM_PROMPT = `You are the curator for Personal Primer, a daily intellectual formation guide.

Your role is to select today's artifacts: one piece of music, one image, and one quote or literary excerpt. All three should cohere around the current arc theme and be appropriate for the arc phase.

CRITICAL RULES:
- All artifacts must be REAL, EXISTING works—never synthesize, paraphrase, or create original content
- The text MUST be a verbatim quote from an actual published source (book, essay, poem, speech, etc.)
- NEVER attribute text to "synthesis", "adaptation", "after [author]", or similar—only use exact quotes with accurate attribution
- You must NOT select any artifact that appears in the recent exposure list
- You must NOT select work by any creator who appears in the recent creators list—variety of voices matters

After selecting, you will write a short framing text (2-3 paragraphs) that:
- Introduces the day's theme
- Connects to recent days where relevant
- Orients attention without over-explaining
- Maintains a tone of quiet curiosity, not instruction

You are a curator and narrator, not a teacher. Point, don't explain. Evoke, don't lecture.`;

const ALTERNATIVE_MUSIC_SYSTEM_PROMPT = `You are the curator for Personal Primer. A previously selected music piece could not be found on Apple Music. Suggest an alternative that:
- Fits the same thematic role in the arc
- Is by a DIFFERENT artist than the failed selection(s)
- Is HIGHLY likely to be on Apple Music. To maximize findability:
  - Prefer POPULAR, FAMOUS works over obscure ones
  - For classical: choose iconic pieces (Beethoven's 5th, Debussy's Clair de Lune, Bach's Cello Suites)
  - For classical: prefer solo or small ensemble works over full symphonies
  - Avoid obscure movements or rarely-recorded pieces
  - Use the composer/artist's most commonly known name spelling

IMPORTANT for classical music: Always provide BOTH composer AND performer when known. The composer is essential for searching.

Return ONLY a JSON object with the new music selection.`;

interface MusicSelection {
  title: string;
  artist: string;
  composer?: string;
  performer?: string;
  isClassical?: boolean;
  searchQuery: string;
}

function buildAlternativeMusicPrompt(
  arc: Arc,
  failedSelections: MusicSelection[],
  originalFramingText: string
): string {
  const failedList = failedSelections
    .map(s => `- "${s.title}" by ${s.artist}`)
    .join('\n');

  return `CURRENT ARC: ${arc.theme}
${arc.description}

FRAMING CONTEXT (for reference):
${originalFramingText.slice(0, 500)}...

MUSIC SELECTIONS THAT FAILED (not on Apple Music):
${failedList}

Suggest an alternative music piece that fits the theme. Return as JSON:
{
  "title": "exact title of the piece",
  "artist": "primary artist (composer for classical, performer/band for popular music)",
  "composer": "for classical music only: the composer's name",
  "performer": "for classical music only: the performer's name (optional)",
  "isClassical": true or false,
  "searchQuery": "search query to find this on Apple Music"
}`;
}

const ALTERNATIVE_IMAGE_SYSTEM_PROMPT = `You are the curator for Personal Primer. A previously selected artwork could not be found on Wikimedia Commons or museum sites. Suggest an alternative that:
- Fits the same thematic role in the arc
- Is a well-known artwork likely to be on Wikimedia Commons (prefer famous paintings, sculptures, or photographs)
- Is by a DIFFERENT artist than the failed selection

Return ONLY a JSON object with the new image selection.`;

const ALTERNATIVE_TEXT_SYSTEM_PROMPT = `You are the curator for Personal Primer. The previously selected text quote was by an author who has already appeared recently. We need variety of voices.

Suggest an alternative text/quote that:
- Fits the same thematic role in the arc
- Is by a COMPLETELY DIFFERENT author than any listed in the rejected selections
- Is a real, verbatim quote from an actual published source

Return ONLY a JSON object with the new text selection.`;

interface TextSelection {
  content: string;
  source: string;
  author: string;
}

function buildAlternativeTextPrompt(
  arc: Arc,
  failedSelections: TextSelection[],
  originalFramingText: string
): string {
  const failedList = failedSelections
    .map(s => `- "${s.source}" by ${s.author}`)
    .join('\n');

  return `CURRENT ARC: ${arc.theme}
${arc.description}

FRAMING CONTEXT (for reference):
${originalFramingText.slice(0, 500)}...

TEXT SELECTIONS REJECTED (authors appeared too recently):
${failedList}

Suggest an alternative text/quote that fits the theme but is by a DIFFERENT AUTHOR. Return as JSON:
{
  "content": "the quote or excerpt (keep it under 200 words)",
  "source": "book, poem, or work title",
  "author": "author name"
}`;
}

interface ImageSelection {
  title: string;
  artist: string;
  searchQuery: string;
}

function buildAlternativeImagePrompt(
  arc: Arc,
  failedSelections: ImageSelection[],
  originalFramingText: string
): string {
  const failedList = failedSelections
    .map(s => `- "${s.title}" by ${s.artist}`)
    .join('\n');

  return `CURRENT ARC: ${arc.theme}
${arc.description}

FRAMING CONTEXT (for reference):
${originalFramingText.slice(0, 500)}...

IMAGE SELECTIONS THAT FAILED (not found online):
${failedList}

Suggest an alternative artwork that fits the theme. Return as JSON:
{
  "title": "exact title of the artwork",
  "artist": "artist name",
  "searchQuery": "search query to find this on Wikimedia Commons"
}`;
}

function buildSelectionUserPrompt(
  arc: Arc,
  dayInArc: number,
  exposures: Exposure[],
  insights: SessionInsights[]
): string {
  const exposureList = exposures
    .map(e => `- [${e.artifactType}] ${e.artifactIdentifier}`)
    .join('\n');

  // Extract unique creators by type
  const creatorsByType = {
    music: new Set<string>(),
    image: new Set<string>(),
    text: new Set<string>(),
  };
  for (const e of exposures) {
    if (e.creator) {
      creatorsByType[e.artifactType].add(e.creator);
    }
  }
  const recentCreators = [
    ...Array.from(creatorsByType.music).map(c => `- [music] ${c}`),
    ...Array.from(creatorsByType.image).map(c => `- [image] ${c}`),
    ...Array.from(creatorsByType.text).map(c => `- [text] ${c}`),
  ].join('\n');

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

  const isLastDay = dayInArc >= arc.targetDurationDays;

  let prompt = `CURRENT ARC: ${arc.theme}
${arc.description}

Day ${dayInArc} of ~${arc.targetDurationDays} (${arc.currentPhase} phase)${isLastDay ? ' — FINAL DAY' : ''}

RECENT EXPOSURES (do NOT repeat these):
${exposureList || '(none yet)'}

RECENT CREATORS (do NOT use work by these artists/authors):
${recentCreators || '(none yet)'}

RECENT USER INSIGHTS:
${insightsSummary || '(no insights recorded yet)'}`;

  if (isLastDay) {
    prompt += `

IMPORTANT: This is the FINAL DAY of the "${arc.theme}" arc. The framing text should:
- Acknowledge this is a concluding encounter for this theme
- Draw threads together from the arc's journey without being heavy-handed
- Create a sense of gentle closure while leaving doors open
- Maintain the tone of quiet curiosity, not a lecture or summary`;
  }

  prompt += `

Select today's artifacts and write the framing text. Return as JSON:
{
  "music": {
    "title": "exact title of the piece",
    "artist": "primary artist (composer for classical, performer/band for popular music)",
    "composer": "for classical music only: the composer's name (e.g., 'Arvo Pärt')",
    "performer": "for classical music only: the performer's name (e.g., 'Yo-Yo Ma') - optional",
    "isClassical": true or false,
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

  return prompt;
}

export async function generateDailyBundle(bundleId: string): Promise<DailyBundle> {
  // Step 1: Gather context
  const arc = await getActiveArc();
  if (!arc) {
    throw new Error('No active arc found. Please create an arc first.');
  }

  // Add 1 because we're generating a NEW bundle (not yet in the count)
  const dayInArc = (await calculateDayInArc(arc)) + 1;
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

  // Step 3: Link resolution with retry for music
  let musicSelection = selection.music;
  const musicOptions: MusicSearchOptions = {
    composer: musicSelection.composer,
    performer: musicSelection.performer,
    isClassical: musicSelection.isClassical,
  };
  let musicLink = await resolveAppleMusicLink(
    musicSelection.title,
    musicSelection.artist,
    musicSelection.searchQuery,
    musicOptions
  );

  // Retry with alternative music if link not found
  const failedMusicSelections: MusicSelection[] = [];
  while (!musicLink && failedMusicSelections.length < MAX_MUSIC_RETRIES) {
    console.log(`Music not found on Apple Music: "${musicSelection.title}" by ${musicSelection.artist}. Requesting alternative...`);
    failedMusicSelections.push(musicSelection);

    const alternative = await generateJSON<MusicSelection>(
      ALTERNATIVE_MUSIC_SYSTEM_PROMPT,
      buildAlternativeMusicPrompt(arc, failedMusicSelections, selection.framingText)
    );

    console.log(`Trying alternative: "${alternative.title}" by ${alternative.artist}`);
    musicSelection = alternative;
    const altMusicOptions: MusicSearchOptions = {
      composer: alternative.composer,
      performer: alternative.performer,
      isClassical: alternative.isClassical,
    };
    musicLink = await resolveAppleMusicLink(
      alternative.title,
      alternative.artist,
      alternative.searchQuery,
      altMusicOptions
    );
  }

  if (!musicLink) {
    console.warn(`Failed to find Apple Music link after ${MAX_MUSIC_RETRIES} retries. Using last selection without link.`);
  }

  // Image link resolution with retry
  let imageSelection = selection.image;
  let imageLink = await resolveImageLink(
    imageSelection.title,
    imageSelection.artist,
    imageSelection.searchQuery
  );

  // Retry with alternative image if link not found
  const failedImageSelections: ImageSelection[] = [];
  while (!imageLink && failedImageSelections.length < MAX_IMAGE_RETRIES) {
    console.log(`Image not found: "${imageSelection.title}" by ${imageSelection.artist}. Requesting alternative...`);
    failedImageSelections.push(imageSelection);

    const alternative = await generateJSON<ImageSelection>(
      ALTERNATIVE_IMAGE_SYSTEM_PROMPT,
      buildAlternativeImagePrompt(arc, failedImageSelections, selection.framingText)
    );

    console.log(`Trying alternative image: "${alternative.title}" by ${alternative.artist}`);
    imageSelection = alternative;
    imageLink = await resolveImageLink(
      alternative.title,
      alternative.artist,
      alternative.searchQuery
    );
  }

  if (!imageLink) {
    console.warn(`Failed to find image link after ${MAX_IMAGE_RETRIES} retries. Using last selection without link.`);
  }

  // Text author validation - ensure we don't repeat authors from recent bundles
  // Build set of normalized recent text authors
  const recentTextAuthors = new Set<string>();
  for (const e of exposures) {
    if (e.artifactType === 'text' && e.creator) {
      recentTextAuthors.add(normalizeCreatorName(e.creator));
    }
  }

  let textSelection = selection.text;
  const failedTextSelections: TextSelection[] = [];

  // Check if selected author is in recent authors
  while (
    recentTextAuthors.has(normalizeCreatorName(textSelection.author)) &&
    failedTextSelections.length < MAX_TEXT_RETRIES
  ) {
    console.log(`Text author "${textSelection.author}" appeared recently. Requesting alternative...`);
    failedTextSelections.push(textSelection);

    const alternative = await generateJSON<TextSelection>(
      ALTERNATIVE_TEXT_SYSTEM_PROMPT,
      buildAlternativeTextPrompt(arc, failedTextSelections, selection.framingText)
    );

    console.log(`Trying alternative text by: ${alternative.author}`);
    textSelection = alternative;
  }

  if (recentTextAuthors.has(normalizeCreatorName(textSelection.author))) {
    console.warn(`Failed to find non-repeated text author after ${MAX_TEXT_RETRIES} retries. Using last selection.`);
  }

  // Step 4: Build and persist bundle
  const now = toTimestamp(new Date());

  const bundle: DailyBundle = {
    id: bundleId,
    date: now,
    arcId: arc.id,
    music: {
      title: musicSelection.title,
      artist: musicSelection.artist,
      ...(musicSelection.composer && { composer: musicSelection.composer }),
      ...(musicSelection.performer && { performer: musicSelection.performer }),
      appleMusicUrl: musicLink?.appleMusicUrl || '',
    },
    image: {
      title: imageSelection.title,
      artist: imageSelection.artist,
      sourceUrl: imageLink?.sourceUrl || '',
      imageUrl: imageLink?.imageUrl || '',
    },
    text: {
      content: textSelection.content,
      source: textSelection.source,
      author: textSelection.author,
    },
    framingText: selection.framingText,
  };

  await createBundle(bundle);

  // Create exposure records
  const exposureBase = {
    dateShown: now,
    arcId: arc.id,
  };

  // For music, use composer as creator if available (for classical music)
  const musicCreator = musicSelection.composer || musicSelection.artist;

  await Promise.all([
    createExposure({
      ...exposureBase,
      artifactType: 'music',
      artifactIdentifier: `${musicSelection.title} - ${musicSelection.artist}`,
      creator: musicCreator,
    }),
    createExposure({
      ...exposureBase,
      artifactType: 'image',
      artifactIdentifier: `${imageSelection.title} - ${imageSelection.artist}`,
      creator: imageSelection.artist,
    }),
    createExposure({
      ...exposureBase,
      artifactType: 'text',
      artifactIdentifier: `${textSelection.source} - ${textSelection.author}`,
      creator: textSelection.author,
    }),
  ]);

  return bundle;
}
