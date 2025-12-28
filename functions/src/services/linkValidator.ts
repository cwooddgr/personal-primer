import { defineSecret } from 'firebase-functions/params';

const googleSearchApiKey = defineSecret('GOOGLE_SEARCH_API_KEY');
const googleSearchCx = defineSecret('GOOGLE_SEARCH_CX');

interface SearchResult {
  title: string;
  link: string;
  snippet?: string;
}

async function googleSearch(query: string): Promise<SearchResult[]> {
  const url = new URL('https://www.googleapis.com/customsearch/v1');
  url.searchParams.set('key', googleSearchApiKey.value());
  url.searchParams.set('cx', googleSearchCx.value());
  url.searchParams.set('q', query);
  url.searchParams.set('num', '5');

  const response = await fetch(url.toString());
  if (!response.ok) {
    throw new Error(`Google Search API error: ${response.status}`);
  }

  const data = await response.json();
  return (data.items || []).map((item: { title: string; link: string; snippet?: string }) => ({
    title: item.title,
    link: item.link,
    snippet: item.snippet,
  }));
}

async function validateUrl(url: string): Promise<boolean> {
  try {
    const response = await fetch(url, { method: 'HEAD' });
    return response.ok;
  } catch {
    return false;
  }
}

export interface ResolvedMusic {
  appleMusicUrl: string;
}

export async function resolveAppleMusicLink(
  title: string,
  artist: string,
  searchQuery: string
): Promise<ResolvedMusic | null> {
  try {
    // Search for Apple Music link
    const query = `${searchQuery} site:music.apple.com`;
    const results = await googleSearch(query);

    // Find a valid Apple Music URL
    for (const result of results) {
      if (result.link.includes('music.apple.com')) {
        const isValid = await validateUrl(result.link);
        if (isValid) {
          return { appleMusicUrl: result.link };
        }
      }
    }

    // Fallback: try with title and artist directly
    const fallbackQuery = `${title} ${artist} site:music.apple.com`;
    const fallbackResults = await googleSearch(fallbackQuery);

    for (const result of fallbackResults) {
      if (result.link.includes('music.apple.com')) {
        const isValid = await validateUrl(result.link);
        if (isValid) {
          return { appleMusicUrl: result.link };
        }
      }
    }

    return null;
  } catch (error) {
    console.error('Error resolving Apple Music link:', error);
    return null;
  }
}

export interface ResolvedImage {
  sourceUrl: string;
  imageUrl: string;
}

export async function resolveImageLink(
  title: string,
  artist: string,
  searchQuery: string
): Promise<ResolvedImage | null> {
  try {
    // Search for image on trusted sources
    const query = `${searchQuery} site:wikimedia.org OR site:metmuseum.org OR site:rijksmuseum.nl`;
    const results = await googleSearch(query);

    for (const result of results) {
      // Check if it's a valid source
      const isTrustedSource =
        result.link.includes('wikimedia.org') ||
        result.link.includes('metmuseum.org') ||
        result.link.includes('rijksmuseum.nl') ||
        result.link.includes('wikipedia.org');

      if (isTrustedSource) {
        const isValid = await validateUrl(result.link);
        if (isValid) {
          // For now, use the page URL as both source and image
          // In a more complete implementation, we'd scrape the page for the actual image URL
          return {
            sourceUrl: result.link,
            imageUrl: result.link,
          };
        }
      }
    }

    // Fallback search with title and artist
    const fallbackQuery = `${title} ${artist} artwork painting site:wikimedia.org`;
    const fallbackResults = await googleSearch(fallbackQuery);

    for (const result of fallbackResults) {
      if (result.link.includes('wikimedia.org') || result.link.includes('wikipedia.org')) {
        const isValid = await validateUrl(result.link);
        if (isValid) {
          return {
            sourceUrl: result.link,
            imageUrl: result.link,
          };
        }
      }
    }

    return null;
  } catch (error) {
    console.error('Error resolving image link:', error);
    return null;
  }
}

// Extract direct image URL from Wikimedia Commons page
export async function extractWikimediaImageUrl(pageUrl: string): Promise<string | null> {
  try {
    // For Wikimedia Commons, we can often construct the direct image URL
    // This is a simplified approach - production would need proper parsing
    if (pageUrl.includes('commons.wikimedia.org/wiki/File:')) {
      const fileName = pageUrl.split('File:')[1];
      if (fileName) {
        // Construct the direct image URL (simplified)
        const directUrl = `https://upload.wikimedia.org/wikipedia/commons/thumb/${fileName}`;
        return directUrl;
      }
    }
    return pageUrl; // Fall back to page URL
  } catch {
    return null;
  }
}

export { googleSearchApiKey, googleSearchCx };
