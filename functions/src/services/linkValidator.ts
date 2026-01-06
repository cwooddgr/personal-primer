import { defineSecret } from 'firebase-functions/params';

const googleSearchApiKey = defineSecret('GOOGLE_SEARCH_API_KEY');
const googleSearchCx = defineSecret('GOOGLE_SEARCH_CX');

// Helper to avoid rate limiting
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

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

export interface MusicSearchOptions {
  composer?: string;
  performer?: string;
  isClassical?: boolean;
}

export async function resolveAppleMusicLink(
  title: string,
  artist: string,
  searchQuery: string,
  options?: MusicSearchOptions
): Promise<ResolvedMusic | null> {
  try {
    const { composer, performer, isClassical } = options || {};

    // Extract key words from title for fuzzy matching (e.g., "Symphony No. 5" -> ["symphony", "5"])
    const titleKeywords = normalizeString(title).split(' ').filter(w => w.length > 1);

    // Build search queries based on whether this is classical music
    let searches: string[];

    if (isClassical && composer) {
      // For classical music, prioritize composer + title searches
      console.log(`[iTunes] Classical music detected. Composer: ${composer}, Performer: ${performer || 'not specified'}`);
      searches = [
        `${composer} ${title}`,           // Composer + title (most reliable for classical)
        `${title} ${composer}`,           // Title + composer
        searchQuery,                       // User-provided search query
        title,                            // Title only (piece name is key)
        ...(performer ? [`${performer} ${title}`, `${performer} ${composer}`] : []),
        `${composer} ${titleKeywords.slice(0, 3).join(' ')}`,
      ];
    } else {
      // For popular music, use standard artist-based searches
      searches = [
        `${title} ${artist}`,
        searchQuery,
        `${artist} ${title}`,
        title,  // Title-only search
        `${artist} ${titleKeywords.slice(0, 3).join(' ')}`,
      ];
    }

    // Remove duplicates and empty strings
    searches = searches.filter((q, i, arr) => q && arr.indexOf(q) === i);

    for (const query of searches) {
      const url = new URL('https://itunes.apple.com/search');
      url.searchParams.set('term', query);
      url.searchParams.set('entity', 'song');
      url.searchParams.set('limit', '25');

      console.log(`[iTunes] Search: "${query}"`);
      const response = await fetch(url.toString());

      if (!response.ok) {
        console.error(`[iTunes] API error: ${response.status}`);
        continue;
      }

      const data: iTunesSearchResponse = await response.json();
      console.log(`[iTunes] Search returned ${data.resultCount} results`);

      // Find a result that matches the title
      for (const result of data.results) {
        const titleMatches = stringsMatch(result.trackName, title);

        if (!titleMatches) continue;

        // For classical music, accept if artist is composer OR performer
        if (isClassical && composer) {
          const artistIsComposer = stringsMatch(result.artistName, composer);
          const artistIsPerformer = performer && stringsMatch(result.artistName, performer);
          const artistIsListed = stringsMatch(result.artistName, artist);

          if (artistIsComposer || artistIsPerformer || artistIsListed) {
            console.log(`[iTunes] Classical match: "${result.trackName}" by ${result.artistName}`);
            console.log(`[iTunes] URL: ${result.trackViewUrl}`);
            return { appleMusicUrl: result.trackViewUrl };
          }
        } else {
          // For non-classical, require artist match
          const artistMatches = stringsMatch(result.artistName, artist);
          if (artistMatches) {
            console.log(`[iTunes] Match: "${result.trackName}" by ${result.artistName}`);
            console.log(`[iTunes] URL: ${result.trackViewUrl}`);
            return { appleMusicUrl: result.trackViewUrl };
          }
        }
      }

      // Check for partial matches (title keywords)
      for (const result of data.results) {
        const trackNorm = normalizeString(result.trackName);
        const keywordMatches = titleKeywords.filter(kw => trackNorm.includes(kw));

        // Need at least 2 keywords (or all if fewer than 2)
        if (keywordMatches.length < Math.min(2, titleKeywords.length)) continue;

        // For classical, accept if artist is composer or performer
        if (isClassical && composer) {
          const artistIsComposer = stringsMatch(result.artistName, composer);
          const artistIsPerformer = performer && stringsMatch(result.artistName, performer);
          const artistIsListed = stringsMatch(result.artistName, artist);

          if (artistIsComposer || artistIsPerformer || artistIsListed) {
            console.log(`[iTunes] Classical keyword match (${keywordMatches.length}/${titleKeywords.length}): "${result.trackName}" by ${result.artistName}`);
            console.log(`[iTunes] URL: ${result.trackViewUrl}`);
            return { appleMusicUrl: result.trackViewUrl };
          }
        } else {
          const artistMatches = stringsMatch(result.artistName, artist);
          if (artistMatches) {
            console.log(`[iTunes] Keyword match (${keywordMatches.length}/${titleKeywords.length}): "${result.trackName}" by ${result.artistName}`);
            console.log(`[iTunes] URL: ${result.trackViewUrl}`);
            return { appleMusicUrl: result.trackViewUrl };
          }
        }
      }
    }

    console.log(`[iTunes] Could not find: "${title}" by ${artist}`);
    return null;
  } catch (error) {
    console.error('[iTunes] Error:', error);
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

    // Accept image/* types, octet-stream, or missing content-type (some CDNs don't set it)
    // Wikimedia Commons URLs are trusted, so we're lenient here
    const isImage = !contentType ||
      contentType.startsWith('image/') ||
      contentType.includes('octet-stream');

    if (!isImage) {
      console.log(`[Validate] Unexpected content-type (${contentType}): ${url}`);
      // Still accept it for Wikimedia URLs - let the browser handle it
      if (url.includes('wikimedia.org') || url.includes('wikipedia.org')) {
        console.log(`[Validate] Accepting anyway (trusted domain)`);
        return true;
      }
      return false;
    }
    console.log(`[Validate] OK (${contentType || 'no content-type'}): ${url}`);
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

    let response = await fetch(apiUrl.toString());

    // Retry on rate limit with exponential backoff
    if (response.status === 429) {
      console.log(`[Commons] Rate limited, waiting 3s and retrying...`);
      await sleep(3000);
      response = await fetch(apiUrl.toString());
      if (response.status === 429) {
        console.log(`[Commons] Still rate limited, waiting 5s...`);
        await sleep(5000);
        response = await fetch(apiUrl.toString());
      }
    }

    if (!response.ok) {
      console.log(`[Commons] API error: ${response.status}`);
      return null;
    }

    const data = await response.json();
    const pages = data.query?.pages;

    // Check for empty or missing pages (empty object {} is truthy!)
    if (!pages || Object.keys(pages).length === 0) {
      console.log(`[Commons] No pages found for: "${query}"`);
      return null;
    }

    console.log(`[Commons] Found ${Object.keys(pages).length} results`);

    // Find the first image result with a valid URL
    for (const pageId of Object.keys(pages)) {
      const page = pages[pageId];
      console.log(`[Commons] Processing page: ${page.title} (id: ${pageId})`);

      const imageInfo = page?.imageinfo?.[0];
      if (!imageInfo) {
        console.log(`[Commons] Page "${page.title}" has no imageinfo array`);
        continue;
      }

      if (!imageInfo.thumburl) {
        console.log(`[Commons] Page "${page.title}" imageinfo has no thumburl`);
        continue;
      }

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
    console.log(`[Image] Resolving: "${title}" by ${artist}`);
    console.log(`[Image] Using searchQuery: "${searchQuery}"`);

    // Build search strategies - searchQuery FIRST since LLM crafted it specifically
    const searches = [
      searchQuery,                    // LLM-crafted query (most likely to work)
      `${title} ${artist}`,           // Title + artist
      `${artist} ${title}`,           // Reversed order
      title,                          // Title only
    ].filter((q, i, arr) => q && q.trim() && arr.indexOf(q) === i);

    // Try each search strategy on Wikimedia Commons
    for (const query of searches) {
      console.log(`[Image] Trying Commons search: "${query}"`);
      const commonsResult = await searchWikimediaCommons(query);
      if (commonsResult) {
        console.log(`[Image] Found via Commons ("${query}"): ${commonsResult.imageUrl}`);
        return commonsResult;
      }
      await sleep(500); // Rate limiting between attempts
    }

    // Fallback: Use Google to find Wikipedia page, then extract image
    const googleQuery = searchQuery || `${title} ${artist} wikipedia`;
    console.log(`[Image] Falling back to Google: "${googleQuery}"`);
    const results = await googleSearch(googleQuery);

    for (const result of results) {
      if (result.link.includes('wikipedia.org/wiki/')) {
        // Extract page title from URL
        const match = result.link.match(/wikipedia\.org\/wiki\/([^#?]+)/);
        if (match) {
          const pageTitle = decodeURIComponent(match[1]);
          const imageUrl = await getWikimediaImageUrl(pageTitle);
          if (imageUrl) {
            console.log(`[Image] Found Wikipedia image for ${pageTitle}: ${imageUrl}`);
            return {
              sourceUrl: result.link,
              imageUrl: imageUrl,
            };
          }
        }
      }
    }

    console.log(`[Image] No image found for: "${title}" by ${artist}`);
    return null;
  } catch (error) {
    console.error('[Image] Error:', error);
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
