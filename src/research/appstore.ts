import { MarkiloError } from '../core/errors.js';
import { cleanText, type FetchOptions, fetchBinary, fetchText, robotsAllows } from './site.js';

export interface AppListing {
  store: 'ios' | 'android';
  id: string;
  name: string;
  developer?: string;
  category?: string;
  description?: string;
  rating?: number;
  ratingCount?: number;
  url: string;
  iconUrl?: string;
  screenshots: string[];
  retrievedAt: string;
  sourceApi: string;
}

/**
 * iOS / iPadOS / macOS App Store via Apple's public iTunes Search API (documented, JSON, no key).
 * `query` is an app id (digits), an apps.apple.com URL, or search text.
 */
export async function searchIosApps(
  query: string,
  opts: FetchOptions & { country?: string; limit?: number },
): Promise<AppListing[]> {
  const country =
    (opts.country ?? 'us')
      .toLowerCase()
      .replace(/[^a-z]/g, '')
      .slice(0, 2) || 'us';
  const id = /^\d{6,12}$/.test(query) ? query : /\/id(\d{6,12})/.exec(query)?.[1];
  const endpoint = id
    ? `https://itunes.apple.com/lookup?id=${id}&country=${country}`
    : `https://itunes.apple.com/search?entity=software&limit=${Math.min(10, opts.limit ?? 5)}&country=${country}&term=${encodeURIComponent(query.slice(0, 100))}`;
  const r = await fetchText(endpoint, { ...opts, maxBytes: 3_000_000 });
  if (r.status >= 400) throw new MarkiloError('NETWORK', `iTunes Search API returned HTTP ${r.status}.`);
  let data: { results?: Record<string, unknown>[] };
  try {
    data = JSON.parse(r.text) as { results?: Record<string, unknown>[] };
  } catch {
    throw new MarkiloError('NETWORK', 'iTunes Search API returned invalid JSON.');
  }
  const now = new Date().toISOString();
  return (data.results ?? [])
    .filter((x) => x.kind === 'software' || x.wrapperType === 'software')
    .map((x) => ({
      store: 'ios' as const,
      id: String(x.trackId ?? ''),
      name: cleanText(String(x.trackName ?? ''), 120) ?? '',
      ...(cleanText(String(x.sellerName ?? x.artistName ?? ''), 120)
        ? { developer: cleanText(String(x.sellerName ?? x.artistName), 120)! }
        : {}),
      ...(typeof x.primaryGenreName === 'string' ? { category: x.primaryGenreName } : {}),
      ...(cleanText(String(x.description ?? ''), 600)
        ? { description: cleanText(String(x.description), 600)! }
        : {}),
      ...(typeof x.averageUserRating === 'number'
        ? { rating: Math.round(x.averageUserRating * 10) / 10 }
        : {}),
      ...(typeof x.userRatingCount === 'number' ? { ratingCount: x.userRatingCount } : {}),
      url: String(x.trackViewUrl ?? `https://apps.apple.com/app/id${x.trackId}`),
      ...(typeof x.artworkUrl512 === 'string' ? { iconUrl: x.artworkUrl512 } : {}),
      screenshots: (Array.isArray(x.screenshotUrls) ? x.screenshotUrls : [])
        .filter((s): s is string => typeof s === 'string')
        .slice(0, 4),
      retrievedAt: now,
      sourceApi: endpoint,
    }));
}

/**
 * Google Play has no public metadata API; Markilo reads the public listing page's metadata (title, description,
 * icon) after checking robots.txt. Returns undefined when the listing is not readable.
 */
export async function lookupAndroidApp(
  packageOrUrl: string,
  opts: FetchOptions & { language?: string },
): Promise<AppListing | undefined> {
  const pkg =
    /[?&]id=([\w.]+)/.exec(packageOrUrl)?.[1] ??
    (/^[a-z][\w]*(\.[\w]+)+$/i.test(packageOrUrl) ? packageOrUrl : undefined);
  if (!pkg)
    throw new MarkiloError(
      'INVALID_INPUT',
      'Give an Android package name (com.example.app) or a play.google.com listing URL.',
    );
  const path = `/store/apps/details?id=${pkg}&hl=${(opts.language ?? 'en').replace(/[^a-zA-Z-]/g, '')}`;
  const robots = await fetchText('https://play.google.com/robots.txt', { ...opts, maxBytes: 300_000 }).catch(
    () => undefined,
  );
  if (robots && robots.status < 400 && !robotsAllows(robots.text, path)) {
    throw new MarkiloError(
      'ROBOTS_DISALLOWED',
      'Google Play robots.txt disallows reading this listing.',
      'Ask the user for the listing text or screenshots.',
    );
  }
  const r = await fetchText(`https://play.google.com${path}`, opts);
  if (r.status >= 400) return undefined;
  const meta = (name: string) =>
    new RegExp(`<meta[^>]+(?:name|property)=["']${name}["'][^>]*content=["']([^"']*)["']`, 'i').exec(
      r.text,
    )?.[1];
  const title = cleanText(meta('og:title')?.replace(/\s*-\s*Apps on Google Play\s*$/i, ''), 120);
  if (!title) return undefined;
  const icon = meta('og:image');
  return {
    store: 'android',
    id: pkg,
    name: title,
    ...(cleanText(meta('og:description') ?? meta('description'), 600)
      ? { description: cleanText(meta('og:description') ?? meta('description'), 600)! }
      : {}),
    url: `https://play.google.com/store/apps/details?id=${pkg}`,
    ...(icon ? { iconUrl: icon } : {}),
    screenshots: [],
    retrievedAt: new Date().toISOString(),
    sourceApi: 'play.google.com listing page (metadata only)',
  };
}

export async function downloadIcon(
  listing: AppListing,
  opts: FetchOptions,
): Promise<{ bytes: Uint8Array; ext: '.png' | '.jpg' } | undefined> {
  if (!listing.iconUrl) return undefined;
  const r = await fetchBinary(listing.iconUrl, opts);
  if (r.status >= 400) return undefined;
  const b = r.body;
  if (b[0] === 0x89 && b[1] === 0x50) return { bytes: b, ext: '.png' };
  if (b[0] === 0xff && b[1] === 0xd8) return { bytes: b, ext: '.jpg' };
  return undefined;
}
