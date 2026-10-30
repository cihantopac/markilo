import { foldAscii } from '../core/paths.js';

/**
 * Reference marks are evidence only when they are distinct brands from trustworthy sources. These helpers turn a
 * list of files into that view: which brand each file belongs to, how reliable its source is, and how many distinct
 * brands (not files) the originality check really rests on.
 */

export type SourceQuality = 'official' | 'store' | 'catalog' | 'unknown';

const DESCRIPTOR =
  /^(icon|icons|logo|logos|logomark|logotype|wordmark|mark|symbol|favicon|fav|avatar|app|og|image|square|dark|light|white|black|color|colour|mono|svg|png|\d+)$/;

/**
 * "GitHub Copilot icon", "github-copilot (2)" and "GitHub Copilot logo dark" all belong to "github copilot".
 * Descriptive words are dropped only at the end, so "App Icon Generator" stays one brand.
 */
export function brandKeyOf(name: string): string {
  const words = foldAscii(name)
    .toLowerCase()
    .replace(/\([^)]*\)/g, ' ')
    .replace(/[_\-./]+/g, ' ')
    .split(/\s+/)
    .filter(Boolean);
  while (words.length > 1 && DESCRIPTOR.test(words[words.length - 1]!)) words.pop();
  return words.join(' ') || name.toLowerCase().trim();
}

const STORE_HOSTS = /(^|\.)(apps\.apple\.com|mzstatic\.com|play\.google\.com|googleusercontent\.com)$/;
const CATALOG_HOSTS =
  /(^|\.)(simpleicons\.org|svgl\.app|lobehub\.com|brandfetch\.(com|io)|wikimedia\.org|wikipedia\.org|seeklogo\.com|worldvectorlogo\.com|iconify\.design|clearbit\.com|jsdelivr\.net|unpkg\.com)$/;

const hostOf = (source: string): string | undefined => {
  try {
    return new URL(source).hostname.toLowerCase().replace(/^www\./, '');
  } catch {
    return undefined;
  }
};

/**
 * official: the brand's own site (its name is in the host, or it is the competitor URL in the brief);
 * store: an app store listing; catalog: a logo catalog that mirrors official files; unknown: anything else.
 */
export function sourceQualityOf(
  source: string,
  brandKey: string,
  officialHosts: string[] = [],
): SourceQuality {
  const host = hostOf(source);
  if (!host) return 'unknown';
  if (STORE_HOSTS.test(host)) return 'store';
  if (CATALOG_HOSTS.test(host)) return 'catalog';
  const compact = brandKey.replace(/\s+/g, '');
  const words = brandKey.split(' ').filter((w) => w.length >= 4);
  if (officialHosts.some((h) => host === h || host.endsWith(`.${h}`))) return 'official';
  if (compact.length >= 3 && host.replace(/[^a-z0-9]/g, '').includes(compact)) return 'official';
  if (words.some((w) => host.split('.').some((part) => part === w))) return 'official';
  return 'unknown';
}

export interface RefLike {
  id: string;
  name: string;
  source: string;
  category?: string;
}

export interface BrandEvidence {
  brand: string;
  files: string[];
  /** The most relevant category any file of this brand was filed under (direct beats category/form-family). */
  category: string;
  /** The best source quality among its files. */
  quality: SourceQuality;
}

const QUALITY_RANK: Record<SourceQuality, number> = { official: 3, store: 2, catalog: 1, unknown: 0 };

/** Groups reference files by brand, keeping each brand's most relevant category and best source. */
export function brandsOf(refs: RefLike[], officialHosts: string[] = []): BrandEvidence[] {
  const byBrand = new Map<string, BrandEvidence>();
  for (const r of refs) {
    const brand = brandKeyOf(r.name);
    const quality = sourceQualityOf(r.source, brand, officialHosts);
    const category = r.category ?? 'direct';
    const cur = byBrand.get(brand);
    if (!cur) {
      byBrand.set(brand, { brand, files: [r.id], category, quality });
      continue;
    }
    cur.files.push(r.id);
    if (category === 'direct') cur.category = 'direct';
    if (QUALITY_RANK[quality] > QUALITY_RANK[cur.quality]) cur.quality = quality;
  }
  return [...byBrand.values()];
}

/** Hosts of the competitor URLs in the brief: files from there are official. */
export function officialHostsFrom(competitors: { url?: string }[] = []): string[] {
  return competitors.map((c) => (c.url ? hostOf(c.url) : undefined)).filter((h): h is string => Boolean(h));
}
