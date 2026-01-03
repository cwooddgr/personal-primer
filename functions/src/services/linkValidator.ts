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
    console.error(`Google Search API error: ${response.status} - ${await response.text()}`);
    throw new Error(`Google Search API error: ${response.status}`);
  }

  const data = await response.json();
  console.log(`Google Search for "${query}" returned ${data.items?.length || 0} results`);
  return (data.items || []).map((item: { title: string; link: string; snippet?: string }) => ({
    title: item.title,
    link: item.link,
    snippet: item.snippet,
  }));
}

export interface ResolvedMusic {
  appleMusicUrl: string;
}

interface iTunesSearchResult {
  trackName: string;
  artistName: string;
  collectionName?: string;
  trackViewUrl: string;
}

interface iTunesSearchResponse {
  resultCount: number;
  results: iTunesSearchResult[];
}

function normalizeString(str: string): string {
  return str
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // Remove diacritics
    .replace(/[^a-z0-9\s]/g, '') // Remove punctuation
    .replace(/\s+/g, ' ')
    .trim();
}

function stringsMatch(a: string, b: string): boolean {
  const normA = normalizeString(a);
  const normB = normalizeString(b);
  // Check if one contains the other (handles cases like "Symphony No. 5" vs "Symphony No. 5 in C Minor")
  return normA.includes(normB) || normB.includes(normA);
}

export async function resolveAppleMusicLink(
  title: string,
  artist: string,
  searchQuery: string
): Promise<ResolvedMusic | null> {
  try {
    // Extract key words from title for fuzzy matching (e.g., "Symphony No. 5" -> ["symphony", "5"])
    const titleKeywords = normalizeString(title).split(' ').filter(w => w.length > 1);

    // Use iTunes Search API with multiple query strategies
    const searches = [
      `${title} ${artist}`,
      searchQuery,
      `${artist} ${title}`,
      artist, // Artist-only search - good for classical music with complex titles
      title,  // Title-only search
      // Simplified searches for classical music
      `${artist} ${titleKeywords.slice(0, 3).join(' ')}`,
    ].filter((q, i, arr) => arr.indexOf(q) === i); // Remove duplicates

    let bestArtistMatch: iTunesSearchResult | null = null;

    for (const query of searches) {
      const url = new URL('https://itunes.apple.com/search');
      url.searchParams.set('term', query);
      url.searchParams.set('entity', 'song');
      url.searchParams.set('limit', '25'); // Increased from 10 for better chances

      console.log(`iTunes Search: "${query}"`);
      const response = await fetch(url.toString());

      if (!response.ok) {
        console.error(`iTunes Search API error: ${response.status}`);
        continue;
      }

      const data: iTunesSearchResponse = await response.json();
      console.log(`iTunes Search returned ${data.resultCount} results`);

      // Find a result that matches both title and artist
      for (const result of data.results) {
        const titleMatches = stringsMatch(result.trackName, title);
        const artistMatches = stringsMatch(result.artistName, artist);

        if (titleMatches && artistMatches) {
          console.log(`Verified Apple Music match: "${result.trackName}" by ${result.artistName}`);
          console.log(`URL: ${result.trackViewUrl}`);
          return { appleMusicUrl: result.trackViewUrl };
        }
      }

      // Check for partial matches (artist + title keywords)
      for (const result of data.results) {
        const artistMatches = stringsMatch(result.artistName, artist);
        if (artistMatches) {
          // Check if track name contains key words from the title
          const trackNorm = normalizeString(result.trackName);
          const keywordMatches = titleKeywords.filter(kw => trackNorm.includes(kw));

          if (keywordMatches.length >= Math.min(2, titleKeywords.length)) {
            console.log(`Keyword match (${keywordMatches.length}/${titleKeywords.length} keywords): "${result.trackName}" by ${result.artistName}`);
            console.log(`URL: ${result.trackViewUrl}`);
            return { appleMusicUrl: result.trackViewUrl };
          }

          // Store first artist match as fallback
          if (!bestArtistMatch) {
            bestArtistMatch = result;
            console.log(`Stored artist-only fallback: "${result.trackName}" by ${result.artistName}`);
          }
        }
      }
    }

    // Fallback: Accept artist-only match if we found one
    // Better to have a link to a different piece by the same composer than no link at all
    if (bestArtistMatch) {
      console.log(`Using artist-only fallback: "${bestArtistMatch.trackName}" by ${bestArtistMatch.artistName}`);
      console.log(`URL: ${bestArtistMatch.trackViewUrl}`);
      return { appleMusicUrl: bestArtistMatch.trackViewUrl };
    }

    console.log(`Could not verify Apple Music link for: "${title}" by ${artist}`);
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

async function validateImageUrl(url: string): Promise<boolean> {
  try {
    console.log(`[Validate] Checking URL: ${url}`);
    const response = await fetch(url, { method: 'HEAD' });
    if (!response.ok) {
      console.log(`[Validate] Failed (${response.status}): ${url}`);
      return false;
    }
    const contentType = response.headers.get('content-type');
    if (!contentType?.startsWith('image/')) {
      console.log(`[Validate] Wrong content-type (${contentType}): ${url}`);
      return false;
    }
    console.log(`[Validate] OK (${contentType}): ${url}`);
    return true;
  } catch (error) {
    console.error(`[Validate] Error for ${url}:`, error);
    return false;
  }
}

// Use Wikimedia API to get image URL from a Wikipedia/Commons page title
async function getWikimediaImageUrl(pageTitle: string): Promise<string | null> {
  try {
    // Use the Wikimedia API to get page images
    const apiUrl = new URL('https://en.wikipedia.org/w/api.php');
    apiUrl.searchParams.set('action', 'query');
    apiUrl.searchParams.set('titles', pageTitle);
    apiUrl.searchParams.set('prop', 'pageimages');
    apiUrl.searchParams.set('pithumbsize', '800');
    apiUrl.searchParams.set('format', 'json');
    apiUrl.searchParams.set('origin', '*');

    const response = await fetch(apiUrl.toString());
    if (!response.ok) return null;

    const data = await response.json();
    const pages = data.query?.pages;
    if (!pages) return null;

    // Get the first page's thumbnail
    const pageId = Object.keys(pages)[0];
    const thumbnail = pages[pageId]?.thumbnail?.source;

    if (thumbnail) {
      // Get a larger version by modifying the URL
      const imageUrl = thumbnail.replace(/\/\d+px-/, '/800px-');
      const isValid = await validateImageUrl(imageUrl);
      if (isValid) {
        return imageUrl;
      }
      console.log(`Wikipedia image URL failed validation: ${imageUrl}`);
    }
    return null;
  } catch (error) {
    console.error('Error fetching Wikimedia image:', error);
    return null;
  }
}

// Search Wikimedia Commons directly for artwork
async function searchWikimediaCommons(query: string): Promise<{ sourceUrl: string; imageUrl: string } | null> {
  try {
    console.log(`[Commons] Searching for: "${query}"`);
    const apiUrl = new URL('https://commons.wikimedia.org/w/api.php');
    apiUrl.searchParams.set('action', 'query');
    apiUrl.searchParams.set('generator', 'search');
    apiUrl.searchParams.set('gsrsearch', query);
    apiUrl.searchParams.set('gsrnamespace', '6'); // File namespace only
    apiUrl.searchParams.set('gsrlimit', '5');
    apiUrl.searchParams.set('prop', 'imageinfo');
    apiUrl.searchParams.set('iiprop', 'url');
    apiUrl.searchParams.set('iiurlwidth', '800');
    apiUrl.searchParams.set('format', 'json');
    apiUrl.searchParams.set('origin', '*');

    const response = await fetch(apiUrl.toString());
    if (!response.ok) {
      console.log(`[Commons] API error: ${response.status}`);
      return null;
    }

    const data = await response.json();
    const pages = data.query?.pages;
    if (!pages) {
      console.log(`[Commons] No pages found for: "${query}"`);
      return null;
    }

    console.log(`[Commons] Found ${Object.keys(pages).length} results`);

    // Find the first image result with a valid URL
    for (const pageId of Object.keys(pages)) {
      const page = pages[pageId];
      const imageInfo = page?.imageinfo?.[0];
      if (imageInfo?.thumburl) {
        console.log(`[Commons] Checking image: ${imageInfo.thumburl}`);
        const isValid = await validateImageUrl(imageInfo.thumburl);
        if (isValid) {
          console.log(`[Commons] Valid image found: ${imageInfo.thumburl}`);
          return {
            sourceUrl: imageInfo.descriptionurl || `https://commons.wikimedia.org/wiki/File:${page.title?.replace('File:', '')}`,
            imageUrl: imageInfo.thumburl,
          };
        }
        console.log(`[Commons] Image failed validation, trying next...`);
      } else {
        console.log(`[Commons] No thumburl for page: ${page.title}`);
      }
    }
    console.log(`[Commons] No valid images found for: "${query}"`);
    return null;
  } catch (error) {
    console.error('[Commons] Error:', error);
    return null;
  }
}

export async function resolveImageLink(
  title: string,
  artist: string,
  searchQuery: string
): Promise<ResolvedImage | null> {
  try {
    console.log(`Resolving image for: "${title}" by ${artist}`);

    // First, try Wikimedia Commons directly (best for artwork)
    const commonsResult = await searchWikimediaCommons(`${title} ${artist}`);
    if (commonsResult) {
      console.log(`Image resolved via Commons (title+artist): ${commonsResult.imageUrl}`);
      return commonsResult;
    }

    // Try with just the title
    const commonsTitleResult = await searchWikimediaCommons(title);
    if (commonsTitleResult) {
      console.log(`Image resolved via Commons (title only): ${commonsTitleResult.imageUrl}`);
      return commonsTitleResult;
    }

    // Fallback: Use Google to find Wikipedia page, then extract image
    const query = `${title} ${artist} wikipedia`;
    const results = await googleSearch(query);

    for (const result of results) {
      if (result.link.includes('wikipedia.org/wiki/')) {
        // Extract page title from URL
        const match = result.link.match(/wikipedia\.org\/wiki\/([^#?]+)/);
        if (match) {
          const pageTitle = decodeURIComponent(match[1]);
          const imageUrl = await getWikimediaImageUrl(pageTitle);
          if (imageUrl) {
            console.log(`Found Wikipedia image for ${pageTitle}: ${imageUrl}`);
            return {
              sourceUrl: result.link,
              imageUrl: imageUrl,
            };
          }
        }
      }
    }

    console.log(`No image found for: ${title} by ${artist}`);
    return null;
  } catch (error) {
    console.error('Error resolving image link:', error);
    return null;
  }
}

export interface ResolvedReading {
  url: string;
}

export async function resolveReadingUrl(
  title: string,
  searchQuery: string
): Promise<ResolvedReading | null> {
  try {
    const results = await googleSearch(searchQuery);

    if (results.length === 0) {
      console.log(`No search results for reading: "${title}"`);
      return null;
    }

    // Prioritize Wikipedia
    for (const result of results) {
      if (result.link.includes('wikipedia.org')) {
        console.log(`Found Wikipedia link for "${title}": ${result.link}`);
        return { url: result.link };
      }
    }

    // Fall back to first result from reputable sources
    const reputableDomains = [
      'stanford.edu', 'mit.edu', 'harvard.edu',
      'nature.com', 'sciencedirect.com', 'jstor.org',
      'britannica.com', 'plato.stanford.edu',
      'arxiv.org', 'ncbi.nlm.nih.gov',
    ];

    for (const result of results) {
      if (reputableDomains.some(domain => result.link.includes(domain))) {
        console.log(`Found reputable source for "${title}": ${result.link}`);
        return { url: result.link };
      }
    }

    // Last resort: first result
    console.log(`Using first result for "${title}": ${results[0].link}`);
    return { url: results[0].link };
  } catch (error) {
    console.error('Error resolving reading URL:', error);
    return null;
  }
}

export { googleSearchApiKey, googleSearchCx };
