/**
 * Generic URL reachability check.
 *
 * Used as a cheap insurance HEAD check — notably to verify a Wikimedia
 * thumbnail URL before committing to it.
 */
export async function isUrlReachable(url: string): Promise<boolean> {
  if (!url || !/^https?:\/\//i.test(url)) {
    return false;
  }
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);
    let response: globalThis.Response;
    try {
      response = await fetch(url, { method: 'HEAD', signal: controller.signal });
    } finally {
      clearTimeout(timeout);
    }

    // Some servers reject HEAD; retry with a ranged GET before giving up.
    if (response.status === 405 || response.status === 403) {
      const getController = new AbortController();
      const getTimeout = setTimeout(() => getController.abort(), 8000);
      try {
        response = await fetch(url, {
          method: 'GET',
          headers: { Range: 'bytes=0-0' },
          signal: getController.signal,
        });
      } finally {
        clearTimeout(getTimeout);
      }
    }

    const ok = response.status >= 200 && response.status < 400;
    if (!ok) {
      console.log(`[LinkValidator] Unreachable (${response.status}): ${url}`);
    }
    return ok;
  } catch (error) {
    console.error(`[LinkValidator] Error checking ${url}:`, error);
    return false;
  }
}

// ---------------------------------------------------------------------------
// Wikimedia Commons image resolution
// ---------------------------------------------------------------------------

interface WikimediaImageInfo {
  url?: string;
  thumburl?: string;
  descriptionurl?: string;
}

interface WikimediaPage {
  imageinfo?: WikimediaImageInfo[];
}

interface WikimediaResponse {
  query?: {
    pages?: Record<string, WikimediaPage>;
  };
}

const WIKIMEDIA_THUMB_WIDTH = 1200;

/**
 * Query the Wikimedia Commons API for a File:-namespace image matching a
 * search string. Returns the first page with a usable resized thumbnail.
 */
async function queryWikimedia(
  query: string
): Promise<{ imageUrl: string; sourceUrl: string } | null> {
  const apiUrl =
    'https://commons.wikimedia.org/w/api.php' +
    '?action=query&generator=search' +
    `&gsrsearch=${encodeURIComponent(query)}` +
    '&gsrnamespace=6&gsrlimit=5' +
    '&prop=imageinfo&iiprop=url' +
    `&iiurlwidth=${WIKIMEDIA_THUMB_WIDTH}` +
    '&format=json&origin=*';

  let response: globalThis.Response;
  try {
    response = await fetch(apiUrl);
  } catch (error) {
    console.error(`[LinkValidator] Wikimedia request failed for "${query}":`, error);
    return null;
  }

  // Lean 429 handling: one short retry.
  if (response.status === 429) {
    await new Promise(resolve => setTimeout(resolve, 2000));
    try {
      response = await fetch(apiUrl);
    } catch (error) {
      console.error(`[LinkValidator] Wikimedia retry failed for "${query}":`, error);
      return null;
    }
  }

  if (!response.ok) {
    console.log(`[LinkValidator] Wikimedia query "${query}" returned ${response.status}`);
    return null;
  }

  let data: WikimediaResponse;
  try {
    data = (await response.json()) as WikimediaResponse;
  } catch (error) {
    console.error(`[LinkValidator] Wikimedia JSON parse failed for "${query}":`, error);
    return null;
  }

  const pages = data.query?.pages;
  if (!pages) {
    return null;
  }

  for (const page of Object.values(pages)) {
    const info = page.imageinfo?.[0];
    if (info?.thumburl) {
      return {
        imageUrl: info.thumburl,
        sourceUrl: info.descriptionurl || info.url || info.thumburl,
      };
    }
  }
  return null;
}

/**
 * Resolve a real Wikimedia Commons image URL for an artwork. The model is no
 * longer trusted to supply image URLs directly (it hallucinates content-hash
 * upload.wikimedia.org paths that 404). Instead it supplies the artwork's
 * identity and a search query, and we look the image up here.
 *
 * Tries strategies in order: the model's purpose-crafted searchQuery, then
 * `${title} ${artist}`, then `${title}` alone. Returns null if all fail.
 */
export async function resolveWikimediaImage(
  searchQuery: string,
  title: string,
  artist: string
): Promise<{ imageUrl: string; sourceUrl: string } | null> {
  const strategies = [
    searchQuery,
    [title, artist].filter(Boolean).join(' '),
    title,
  ].filter((q): q is string => !!q && q.trim().length > 0);

  // Deduplicate while preserving order.
  const seen = new Set<string>();
  const queries = strategies.filter(q => {
    const key = q.trim().toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  for (const query of queries) {
    const result = await queryWikimedia(query);
    if (result) {
      const reachable = await isUrlReachable(result.imageUrl);
      if (reachable) {
        console.log(`[LinkValidator] Resolved image via Wikimedia for "${query}"`);
        return result;
      }
      console.log(
        `[LinkValidator] Wikimedia hit for "${query}" but thumbnail unreachable; trying next strategy`
      );
    }
  }

  console.warn(
    `[LinkValidator] Could not resolve a Wikimedia image for "${title}" by ${artist}`
  );
  return null;
}
