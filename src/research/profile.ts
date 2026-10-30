import { MarkiloError } from '../core/errors.js';
import { nowIso } from '../core/fsx.js';
import type {
  BrandProfile,
  Confidence,
  Finding,
  FindingStatus,
  FindingTopic,
  Source,
} from '../core/types.js';
import type { RepoScan } from './repo.js';
import type { SiteScan } from './site.js';

export const TOPICS: FindingTopic[] = [
  'product',
  'audience',
  'market',
  'competitor',
  'visual-identity',
  'typography',
  'color',
  'naming',
  'trend',
  'culture',
  'trademark',
  'platform',
];
export const STATUSES: FindingStatus[] = ['observed', 'inferred', 'verified', 'user-provided'];

const nextId = (prefix: string, existing: { id: string }[]) => {
  let n = existing.length + 1;
  while (existing.some((e) => e.id === `${prefix}${n}`)) n++;
  return `${prefix}${n}`;
};

export function addSource(
  p: BrandProfile,
  s: Omit<Source, 'id' | 'retrievedAt'> & { retrievedAt?: string },
): Source {
  const dup = p.sources.find(
    (x) =>
      x.type === s.type &&
      x.ref === s.ref &&
      x.retrievedAt.slice(0, 10) === (s.retrievedAt ?? nowIso()).slice(0, 10),
  );
  if (dup) return dup;
  const src: Source = {
    id: nextId('S', p.sources),
    retrievedAt: s.retrievedAt ?? nowIso(),
    type: s.type,
    ref: s.ref,
    ...(s.notes ? { notes: s.notes } : {}),
  };
  p.sources.push(src);
  return src;
}

export function addFinding(
  p: BrandProfile,
  f: {
    topic: FindingTopic;
    statement: string;
    status: FindingStatus;
    sourceIds: string[];
    confidence?: Confidence;
  },
): Finding {
  if (!TOPICS.includes(f.topic))
    throw new MarkiloError('INVALID_INPUT', `Unknown topic "${f.topic}". Use one of: ${TOPICS.join(', ')}.`);
  if (!STATUSES.includes(f.status))
    throw new MarkiloError(
      'INVALID_INPUT',
      `Unknown status "${f.status}". Use one of: ${STATUSES.join(', ')}.`,
    );
  for (const id of f.sourceIds) {
    if (!p.sources.some((s) => s.id === id))
      throw new MarkiloError('INVALID_INPUT', `Unknown source id "${id}".`);
  }
  if ((f.status === 'observed' || f.status === 'verified') && !f.sourceIds.length) {
    throw new MarkiloError('INVALID_INPUT', `"${f.status}" findings need at least one source (--source S1).`);
  }
  const existing = p.findings.find((x) => x.topic === f.topic && x.statement.trim() === f.statement.trim());
  if (existing) {
    existing.sourceIds = [...new Set([...existing.sourceIds, ...f.sourceIds])];
    return existing;
  }
  const finding: Finding = {
    id: nextId('F', p.findings),
    topic: f.topic,
    statement: f.statement.trim(),
    status: f.status,
    sourceIds: f.sourceIds,
    confidence: f.confidence ?? (f.status === 'inferred' ? 'medium' : 'high'),
    recordedAt: nowIso(),
  };
  p.findings.push(finding);
  return finding;
}

export function mergeRepoScan(p: BrandProfile, scan: RepoScan): { source: Source; added: number } {
  const source = addSource(p, {
    type: 'repo',
    ref: scan.root,
    notes: `${scan.scannedFiles} files scanned; ${scan.skippedSensitive} secret-like files skipped unread`,
  });
  const before = p.findings.length;
  const obs = (topic: FindingTopic, statement: string) =>
    addFinding(p, { topic, statement, status: 'observed', sourceIds: [source.id] });
  if (scan.project.description)
    obs('product', `package.json describes the project as: "${scan.project.description}"`);
  if (scan.project.keywords?.length)
    obs('product', `package.json keywords: ${scan.project.keywords.join(', ')}`);
  if (scan.readme?.summary)
    obs('product', `README (${scan.readme.path}) summary: "${scan.readme.summary.slice(0, 400)}"`);
  if (scan.frameworks.length) obs('platform', `Built with ${scan.frameworks.join(', ')}.`);
  for (const h of scan.html) {
    if (h.title) obs('naming', `${h.path} <title>: "${h.title}"`);
    if (h.description) obs('product', `${h.path} meta description: "${h.description}"`);
  }
  for (const m of scan.manifests) {
    if (m.themeColor) obs('color', `${m.path} declares theme_color ${m.themeColor}.`);
  }
  if (scan.logos.length)
    obs(
      'visual-identity',
      `${scan.logos.length} existing logo/icon files found (e.g. ${scan.logos
        .slice(0, 3)
        .map((l) => l.path)
        .join(', ')}).`,
    );
  if (scan.colors.length)
    obs(
      'color',
      `Most used colors in styles: ${scan.colors
        .slice(0, 6)
        .map((c) => `${c.hex} (${c.files} files)`)
        .join(', ')}.`,
    );
  if (scan.fonts.length)
    obs('typography', `Fonts referenced: ${scan.fonts.map((f) => f.family).join(', ')}.`);

  const ident = p.existingIdentity;
  for (const l of scan.logos)
    if (!ident.logos.some((x) => x.path === l.path))
      ident.logos.push({ path: l.path, kind: l.kind, source: source.id });
  for (const c of scan.colors)
    if (!ident.colors.some((x) => x.hex === c.hex))
      ident.colors.push({ hex: c.hex, count: c.count, source: source.id });
  for (const f of scan.fonts)
    if (!ident.fonts.some((x) => x.family === f.family))
      ident.fonts.push({ family: f.family, source: source.id });
  return { source, added: p.findings.length - before };
}

export function mergeSiteScan(p: BrandProfile, scan: SiteScan): { source: Source; added: number } {
  const source = addSource(p, {
    type: 'url',
    ref: scan.finalUrl,
    retrievedAt: scan.retrievedAt,
    notes: `HTTP ${scan.status}; stylesheets read: ${scan.stylesheetsRead.length}`,
  });
  const before = p.findings.length;
  const obs = (topic: FindingTopic, statement: string) =>
    addFinding(p, { topic, statement, status: 'observed', sourceIds: [source.id] });
  if (scan.title) obs('naming', `Page title: "${scan.title}"`);
  if (scan.description) obs('product', `Meta description: "${scan.description}"`);
  if (scan.headings.length)
    obs(
      'product',
      `Main headings: ${scan.headings
        .slice(0, 4)
        .map((x) => `"${x}"`)
        .join(', ')}`,
    );
  if (scan.themeColor) obs('color', `theme-color meta: ${scan.themeColor}`);
  if (scan.colors.length)
    obs(
      'color',
      `Most frequent CSS colors: ${scan.colors
        .slice(0, 6)
        .map((c) => c.hex)
        .join(', ')}`,
    );
  if (scan.fonts.length) obs('typography', `Fonts in CSS: ${scan.fonts.join(', ')}`);
  if (scan.icons.length)
    obs(
      'visual-identity',
      `${scan.icons.length} icon links (${[...new Set(scan.icons.map((i) => i.rel))].join(', ')}).`,
    );
  if (scan.logoCandidates.length || scan.inlineSvgLogos)
    obs(
      'visual-identity',
      `Logo candidates: ${scan.logoCandidates.length} <img>, ${scan.inlineSvgLogos} inline <svg>.`,
    );
  if (scan.language) obs('audience', `Page language attribute: ${scan.language}`);
  for (const c of scan.colors)
    if (!p.existingIdentity.colors.some((x) => x.hex === c.hex))
      p.existingIdentity.colors.push({ hex: c.hex, count: c.count, source: source.id });
  for (const f of scan.fonts)
    if (!p.existingIdentity.fonts.some((x) => x.family === f))
      p.existingIdentity.fonts.push({ family: f, source: source.id });
  return { source, added: p.findings.length - before };
}

/** Compact view for agents: counts per topic and status, plus open gaps. */
export function summarizeProfile(p: BrandProfile) {
  const byTopic: Record<string, Record<string, number>> = {};
  for (const f of p.findings) {
    byTopic[f.topic] ??= {};
    byTopic[f.topic]![f.status] = (byTopic[f.topic]![f.status] ?? 0) + 1;
  }
  const missing = TOPICS.filter(
    (t) => !byTopic[t] && ['product', 'audience', 'market', 'competitor', 'visual-identity'].includes(t),
  );
  return {
    brand: p.brand,
    updatedAt: p.updatedAt,
    sources: p.sources.length,
    findings: p.findings.length,
    byTopic,
    existingIdentity: {
      logos: p.existingIdentity.logos.length,
      colors: p.existingIdentity.colors.slice(0, 6).map((c) => c.hex),
      fonts: p.existingIdentity.fonts.map((f) => f.family),
    },
    gaps: p.gaps,
    uncoveredTopics: missing,
  };
}
