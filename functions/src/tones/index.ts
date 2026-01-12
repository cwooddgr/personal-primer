/**
 * Tone System - Definitions and Helpers
 *
 * The tone system allows users to customize how the AI guide communicates.
 * Each tone changes the role/stance the model plays, not just word choice.
 */

export type ToneId = 'reflective' | 'guided' | 'inquiry' | 'practical' | 'direct';

export const DEFAULT_TONE: ToneId = 'guided';

export interface ToneDefinition {
  id: ToneId;
  name: string; // Display name (e.g., "The Listener")
  shortName: string; // Short name (e.g., "Reflective")
  description: string; // User-facing description for selection UI
  systemPromptFragment: string; // Injected into system prompts
}

export const TONES: Record<ToneId, ToneDefinition> = {
  reflective: {
    id: 'reflective',
    name: 'The Listener',
    shortName: 'Reflective',
    description:
      'Counselor-like, emotionally attuned. Names inner experience and validates ambiguity.',
    systemPromptFragment: `TONE: Respond in a reflective, counselor-like tone. Prioritize emotional attunement and validation. Use gentle language, hedging where appropriate ("often," "sometimes," "it can feel"). Focus on naming internal experiences and helping the user feel understood. Avoid directives, prescriptions, or blunt conclusions.`,
  },
  guided: {
    id: 'guided',
    name: 'The Tutor',
    shortName: 'Guided',
    description:
      'Personal tutor style. Teaches distinctions, patterns, and ways of seeing.',
    systemPromptFragment: `TONE: Respond as a personal tutor. Assume the user is intelligent and curious. Explain distinctions clearly and calmly. Focus on teaching ways of seeing and naming patterns. Be outward-facing and declarative without being confrontational. Avoid emotional reassurance, confessional language, or excessive metaphor.`,
  },
  inquiry: {
    id: 'inquiry',
    name: 'The Questioner',
    shortName: 'Inquiry',
    description:
      'Socratic method. Responds primarily with questions to guide your own discovery.',
    systemPromptFragment: `TONE: Respond in a Socratic style. Use concise, carefully sequenced questions to guide the user's thinking. Minimize exposition and avoid answering questions directly unless necessary. Do not validate emotions explicitly or offer reassurance. The goal is to provoke reflection, not to explain or soothe.`,
  },
  practical: {
    id: 'practical',
    name: 'The Craft Mentor',
    shortName: 'Practical',
    description:
      'Practitioner perspective. Focuses on process, constraints, and feedback loops.',
    systemPromptFragment: `TONE: Respond as a seasoned practitioner or craft mentor. Emphasize process, constraints, feedback, and real-world dynamics. Focus on what happens in practice rather than how things feel internally. Use plain language. Avoid abstraction, emotional framing, and philosophical digressions.`,
  },
  direct: {
    id: 'direct',
    name: 'The Editor',
    shortName: 'Direct',
    description:
      'No-nonsense and declarative. Cuts through ambiguity with minimal hedging.',
    systemPromptFragment: `TONE: Respond in a no-nonsense, editorial tone. Be concise, declarative, and unsentimental. Eliminate hedging, reassurance, and metaphor unless strictly necessary. Prioritize clarity over warmth. State claims cleanly and move on.`,
  },
};

/**
 * Get the tone definition for a given tone ID.
 * Falls back to DEFAULT_TONE if the ID is invalid.
 */
export function getToneDefinition(toneId: ToneId): ToneDefinition {
  return TONES[toneId] || TONES[DEFAULT_TONE];
}

/**
 * Check if a string is a valid tone ID.
 */
export function isValidTone(tone: string): tone is ToneId {
  return tone in TONES;
}

/**
 * Get all tone definitions as an array (for API responses).
 */
export function getAllTones(): ToneDefinition[] {
  return Object.values(TONES);
}
