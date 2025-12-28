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

export async function resolveAppleMusicLink(
  title: string,
  artist: string,
  searchQuery: string
): Promise<ResolvedMusic | null> {
  try {
    // Search for Apple Music link - don't use site: restriction as it can be flaky
    const query = `${searchQuery} apple music`;
    const results = await googleSearch(query);

    // Find an Apple Music URL (skip validation - Apple blocks HEAD requests)
    for (const result of results) {
      if (result.link.includes('music.apple.com')) {
        console.log(`Found Apple Music link: ${result.link}`);
        return { appleMusicUrl: result.link };
      }
    }

    // Fallback: try with title and artist directly
    const fallbackQuery = `${title} ${artist} apple music`;
    const fallbackResults = await googleSearch(fallbackQuery);

    for (const result of fallbackResults) {
      if (result.link.includes('music.apple.com')) {
        console.log(`Found Apple Music link (fallback): ${result.link}`);
        return { appleMusicUrl: result.link };
      }
    }

    console.log(`No Apple Music link found for: ${title} by ${artist}`);
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
      return thumbnail.replace(/\/\d+px-/, '/800px-');
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
    const apiUrl = new URL('https://commons.wikimedia.org/w/api.php');
    apiUrl.searchParams.set('action', 'query');
    apiUrl.searchParams.set('generator', 'search');
    apiUrl.searchParams.set('gsrsearch', query);
    apiUrl.searchParams.set('gsrlimit', '5');
    apiUrl.searchParams.set('prop', 'imageinfo');
    apiUrl.searchParams.set('iiprop', 'url');
    apiUrl.searchParams.set('iiurlwidth', '800');
    apiUrl.searchParams.set('format', 'json');
    apiUrl.searchParams.set('origin', '*');

    const response = await fetch(apiUrl.toString());
    if (!response.ok) return null;

    const data = await response.json();
    const pages = data.query?.pages;
    if (!pages) return null;

    // Find the first image result
    for (const pageId of Object.keys(pages)) {
      const page = pages[pageId];
      const imageInfo = page?.imageinfo?.[0];
      if (imageInfo?.thumburl) {
        console.log(`Found Wikimedia Commons image: ${imageInfo.thumburl}`);
        return {
          sourceUrl: imageInfo.descriptionurl || `https://commons.wikimedia.org/wiki/File:${page.title?.replace('File:', '')}`,
          imageUrl: imageInfo.thumburl,
        };
      }
    }
    return null;
  } catch (error) {
    console.error('Error searching Wikimedia Commons:', error);
    return null;
  }
}

export async function resolveImageLink(
  title: string,
  artist: string,
  searchQuery: string
): Promise<ResolvedImage | null> {
  try {
    // First, try Wikimedia Commons directly (best for artwork)
    const commonsResult = await searchWikimediaCommons(`${title} ${artist}`);
    if (commonsResult) {
      return commonsResult;
    }

    // Try with just the title
    const commonsTitleResult = await searchWikimediaCommons(title);
    if (commonsTitleResult) {
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

export { googleSearchApiKey, googleSearchCx };
