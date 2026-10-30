import { join } from 'node:path';
import { sampleFromRaster, sampleFromSvg } from '../analyze/mark.js';
import { MarkiloError } from '../core/errors.js';
import { nowIso, sha256, writeFileSafe, writeJson } from '../core/fsx.js';
import { slugify } from '../core/paths.js';
import type { Workspace } from '../core/workspace.js';
import { readReferences, referenceIndexPath } from '../report/originality.js';
import { sanitizeSvg } from '../svg/sanitize.js';
import { mergeSiteScan } from './profile.js';
import { type CrawlOptions, fetchBinary, scanSite } from './site.js';

export type ReferenceCategory = 'direct' | 'indirect' | 'category' | 'form-family';

export interface NewReference {
  name: string;
  source: string;
  bytes: Uint8Array;
  ext: '.svg' | '.png' | '.jpg';
  category?: ReferenceCategory;
  retrievedAt?: string;
  notes?: string;
}

/** Validates (decodes/renders) and stores a reference mark; identical files are not stored twice. */
export async function addReference(
  ws: Workspace,
  brand: string,
  ref: NewReference,
): Promise<{ id: string; duplicate: boolean }> {
  let bytes = ref.bytes;
  if (ref.ext === '.svg') {
    const clean = sanitizeSvg(new TextDecoder().decode(bytes));
    await sampleFromSvg(clean, { id: 'probe' });
    bytes = new TextEncoder().encode(clean);
  } else {
    await sampleFromRaster(bytes, { id: 'probe' });
  }
  const idx = readReferences(ws, brand);
  const hash = sha256(bytes);
  const dup = idx.references.find((r) => r.notes?.includes(`sha256:${hash.slice(0, 16)}`));
  if (dup) return { id: dup.id, duplicate: true };
  let id = slugify(`${ref.name}-${idx.references.length + 1}`);
  while (idx.references.some((r) => r.id === id)) id = `${id}-x`;
  writeFileSafe(join(ws.referencesDir(brand), `${id}${ref.ext}`), bytes, { force: true });
  idx.references.push({
    id,
    file: `${id}${ref.ext}`,
    name: ref.name,
    source: ref.source,
    retrievedAt: ref.retrievedAt ?? nowIso(),
    category: ref.category ?? 'direct',
    notes: [ref.notes, `sha256:${hash.slice(0, 16)}`].filter(Boolean).join(' · '),
  });
  writeJson(referenceIndexPath(ws, brand), idx);
  return { id, duplicate: false };
}

const extOf = (contentType: string, url: string): NewReference['ext'] | undefined => {
  if (/svg/i.test(contentType) || /\.svg(\?|$)/i.test(url)) return '.svg';
  if (/png/i.test(contentType) || /\.png(\?|$)/i.test(url)) return '.png';
  if (/jpe?g/i.test(contentType) || /\.jpe?g(\?|$)/i.test(url)) return '.jpg';
  return undefined;
};

export interface CompetitorResult {
  name: string;
  url: string;
  pagesRead: number;
  findingsAdded: number;
  logo: { id: string; from: string; duplicate: boolean } | null;
  icon: { id: string; from: string; duplicate: boolean } | null;
  issues: string[];
}

/**
 * Researches one competitor site: reads a few pages, records its positioning and identity signals as competitor
 * findings, and collects its logo (inline SVG or image) and app icon as reference marks for similarity checks.
 */
export async function researchCompetitor(
  ws: Workspace,
  brand: string,
  competitor: { name: string; url: string; category?: ReferenceCategory },
  opts: CrawlOptions,
): Promise<CompetitorResult> {
  const issues: string[] = [];
  const scan = await scanSite(competitor.url, { ...opts, maxPages: opts.maxPages ?? 3 });
  const profile = ws.profile(brand);
  const merged = mergeSiteScan(profile, scan, { subject: 'competitor', competitor: competitor.name });
  ws.saveProfile(brand, profile);
  const category = competitor.category ?? 'direct';
  const result: CompetitorResult = {
    name: competitor.name,
    url: scan.finalUrl,
    pagesRead: scan.pages.length,
    findingsAdded: merged.added,
    logo: null,
    icon: null,
    issues,
  };

  // Logo: inline header SVG first (vector, exact), then <img> logos, then JSON-LD logo.
  for (const svg of scan.inlineLogoSvgs) {
    try {
      const r = await addReference(ws, brand, {
        name: competitor.name,
        source: scan.finalUrl,
        bytes: new TextEncoder().encode(svg),
        ext: '.svg',
        category,
        notes: 'logo (inline SVG)',
      });
      result.logo = { ...r, from: 'inline svg' };
      break;
    } catch (err) {
      issues.push(`inline SVG logo unusable: ${(err as Error).message.slice(0, 80)}`);
    }
  }
  const imageUrls = [
    ...scan.logoCandidates.map((l) => l.href),
    ...(scan.organization?.logo ? [scan.organization.logo] : []),
  ];
  for (const u of result.logo ? [] : imageUrls.slice(0, 4)) {
    try {
      const bin = await fetchBinary(u, opts);
      const ext = extOf(bin.contentType, bin.url);
      if (bin.status >= 400 || !ext) continue;
      const r = await addReference(ws, brand, {
        name: competitor.name,
        source: bin.url,
        bytes: bin.body,
        ext,
        category,
        notes: 'logo (image)',
      });
      result.logo = { ...r, from: u };
      break;
    } catch (err) {
      issues.push(`logo image ${u.slice(0, 80)} unusable: ${(err as Error).message.slice(0, 60)}`);
    }
  }
  // App icon: the largest declared icon (apple-touch-icon or icon with sizes ≥ 64), PNG or SVG.
  const icons = [...scan.icons]
    .filter((i) => !/mask-icon/.test(i.rel))
    .sort(
      (a, b) =>
        Number.parseInt(b.sizes ?? '0', 10) - Number.parseInt(a.sizes ?? '0', 10) ||
        Number(/apple/.test(b.rel)) - Number(/apple/.test(a.rel)),
    );
  for (const i of icons.slice(0, 3)) {
    try {
      const bin = await fetchBinary(i.href, opts);
      const ext = extOf(bin.contentType, bin.url);
      if (bin.status >= 400 || !ext) continue;
      const r = await addReference(ws, brand, {
        name: `${competitor.name} icon`,
        source: bin.url,
        bytes: bin.body,
        ext,
        category,
        notes: `app/site icon (${i.rel}${i.sizes ? ` ${i.sizes}` : ''})`,
      });
      result.icon = { ...r, from: i.href };
      break;
    } catch {
      // Try the next icon.
    }
  }
  if (!result.logo) issues.push('no usable logo found; add one manually with "markilo reference add"');
  return result;
}

export function competitorsFromBrief(ws: Workspace, brand: string): { name: string; url: string }[] {
  const list = (ws.brief(brand).competitors ?? []).filter(
    (c): c is { name: string; url: string } => typeof c.url === 'string' && /^https?:\/\//.test(c.url),
  );
  if (!list.length)
    throw new MarkiloError(
      'USAGE',
      'No competitors with URLs in the brief.',
      'Add them with "markilo brief update" (competitors[].url) or pass --url and --name.',
    );
  return list;
}
