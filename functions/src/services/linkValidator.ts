/**
 * Generic URL reachability check.
 *
 * This is the only survivor of the old link-resolution layer. The iTunes /
 * Apple Music resolver, the Google Custom Search integration, and the
 * Wikimedia multi-strategy search have all been removed — the model now finds
 * and verifies URLs itself via the web_search tool. This is just a cheap
 * insurance HEAD check.
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
