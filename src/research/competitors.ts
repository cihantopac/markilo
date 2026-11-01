import { rmSync } from 'node:fs';
import { join } from 'node:path';
import { loadMark, type MarkSample, sampleFromRaster, sampleFromSvg } from '../analyze/mark.js';
import { compareMarks } from '../analyze/similarity.js';
import { MarkiloError } from '../core/errors.js';
import { nowIso, sha256, writeFileSafe, writeJson } from '../core/fsx.js';
import { resolveInsideReal, slugify } from '../core/paths.js';
import type { Workspace } from '../core/workspace.js';
import { type ReferenceEntry, readReferences, referenceIndexPath } from '../report/originality.js';
import { brandKeyOf, officialHostsFrom, sourceQualityOf } from '../report/references.js';
import { sanitizeSvg } from '../svg/sanitize.js';
import { mergeSiteScan } from './profile.js';
import { type CrawlOptions, fetchBinary, scanSite } from './site.js';

export type ReferenceCategory =
  | 'direct'
  | 'indirect'
  | 'category'
  | 'form-family'
  /** The user's own references: what they like, what they do not, and an identity that already exists. */
  | 'inspiration'
  | 'dislike'
  | 'existing';

export const REFERENCE_CATEGORIES: ReferenceCategory[] = [
  'direct',
  'indirect',
  'category',
  'form-family',
  'inspiration',
  'dislike',
  'existing',
];

/** References the user supplied: compared for originality like any other, never shown as competitors. */
export const USER_REFERENCE: ReferenceCategory[] = ['inspiration', 'dislike', 'existing'];

export interface NewReference {
  name: string;
  source: string;
  bytes: Uint8Array;
  ext: '.svg' | '.png' | '.jpg' | '.ico';
  category?: ReferenceCategory;
  retrievedAt?: string;
  notes?: string;
}

/**
 * The largest PNG image inside an .ico file (favicons are usually PNG-in-ICO). ICO files that only hold BMP images
 * are refused with a hint, rather than decoded half-right.
 */
export function pngFromIco(bytes: Uint8Array): Uint8Array {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (bytes.length < 6 || view.getUint16(0, true) !== 0 || view.getUint16(2, true) !== 1)
    throw new MarkiloError('INVALID_INPUT', 'Not an .ico file.');
  const count = view.getUint16(4, true);
  let best: Uint8Array | undefined;
  for (let i = 0; i < count && 6 + i * 16 + 16 <= bytes.length; i++) {
    const e = 6 + i * 16;
    const size = view.getUint32(e + 8, true);
    const offset = view.getUint32(e + 12, true);
    if (offset + size > bytes.length || size < 8) continue;
    const data = bytes.subarray(offset, offset + size);
    const png = data[0] === 0x89 && data[1] === 0x50 && data[2] === 0x4e && data[3] === 0x47;
    if (png && (!best || data.length > best.length)) best = data;
  }
  if (!best)
    throw new MarkiloError(
      'INVALID_INPUT',
      'This .ico only contains BMP images.',
      "Use the site's PNG or SVG icon instead (apple-touch-icon, icon.svg).",
    );
  return best;
}

/** Validates (decodes/renders) and stores a reference mark; identical files are not stored twice. */
export async function addReference(
  ws: Workspace,
  brand: string,
  ref: NewReference,
): Promise<{ id: string; duplicate: boolean }> {
  let bytes = ref.bytes;
  let ext = ref.ext;
  if (ext === '.ico') {
    bytes = pngFromIco(bytes);
    ext = '.png';
  }
  if (ext === '.svg') {
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
  writeFileSafe(join(ws.referencesDir(brand), `${id}${ext}`), bytes, { force: true });
  idx.references.push({
    id,
    file: `${id}${ext}`,
    name: ref.name,
    source: ref.source,
    retrievedAt: ref.retrievedAt ?? nowIso(),
    category: ref.category ?? 'direct',
    notes: [ref.notes, `sha256:${hash.slice(0, 16)}`].filter(Boolean).join(' · '),
  });
  writeJson(referenceIndexPath(ws, brand), idx);
  return { id, duplicate: false };
}

/** Removes reference marks (wrong logo, a duplicate, a broken download) from the index and the folder. */
export function removeReferences(
  ws: Workspace,
  brand: string,
  ids: string[],
): { removed: string[]; missing: string[] } {
  const idx = readReferences(ws, brand);
  const removed: string[] = [];
  const keep = idx.references.filter((r) => {
    if (!ids.includes(r.id)) return true;
    removed.push(r.id);
    rmSync(resolveInsideReal(ws.referencesDir(brand), r.file), { force: true });
    return false;
  });
  writeJson(referenceIndexPath(ws, brand), { ...idx, references: keep });
  return { removed, missing: ids.filter((i) => !removed.includes(i)) };
}

export interface DuplicateGroup {
  keep: { id: string; name: string; source: string };
  remove: { id: string; name: string; source: string; similarity: number }[];
}

/**
 * Finds reference files that add no evidence: near-identical files of the same brand (≥ 0.90 visual similarity) and
 * the same artwork filed under two names (≥ 0.97). In each group the file with the best source is kept.
 */
export async function findDuplicateReferences(ws: Workspace, brand: string): Promise<DuplicateGroup[]> {
  const idx = readReferences(ws, brand);
  const hosts = officialHostsFrom(ws.brief(brand).competitors);
  const rank: Record<string, number> = { official: 3, store: 2, catalog: 1, unknown: 0 };
  const items: { ref: ReferenceEntry; key: string; quality: number; sample: MarkSample }[] = [];
  for (const r of idx.references) {
    const file = join(ws.referencesDir(brand), r.file);
    try {
      const key = brandKeyOf(r.name);
      items.push({
        ref: r,
        key,
        quality: rank[sourceQualityOf(r.source, key, hosts)]!,
        sample: await loadMark(file, { id: r.id, label: r.name }),
      });
    } catch {
      // Unreadable files are reported by the originality check.
    }
  }
  // Better sources first, so the kept file of a group is the most trustworthy one.
  items.sort((a, b) => b.quality - a.quality);
  const removed = new Set<string>();
  const groups: DuplicateGroup[] = [];
  for (const [i, a] of items.entries()) {
    if (removed.has(a.ref.id)) continue;
    const remove: DuplicateGroup['remove'] = [];
    for (const b of items.slice(i + 1)) {
      if (removed.has(b.ref.id)) continue;
      const c = await compareMarks(a.sample, b.sample);
      if ((a.key === b.key && c.visual >= 0.9) || c.visual >= 0.97) {
        removed.add(b.ref.id);
        remove.push({ id: b.ref.id, name: b.ref.name, source: b.ref.source, similarity: c.visual });
      }
    }
    if (remove.length)
      groups.push({ keep: { id: a.ref.id, name: a.ref.name, source: a.ref.source }, remove });
  }
  return groups;
}

const extOf = (contentType: string, url: string): NewReference['ext'] | undefined => {
  if (/svg/i.test(contentType) || /\.svg(\?|$)/i.test(url)) return '.svg';
  if (/png/i.test(contentType) || /\.png(\?|$)/i.test(url)) return '.png';
  if (/jpe?g/i.test(contentType) || /\.jpe?g(\?|$)/i.test(url)) return '.jpg';
  if (/icon/i.test(contentType) || /\.ico(\?|$)/i.test(url)) return '.ico';
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
