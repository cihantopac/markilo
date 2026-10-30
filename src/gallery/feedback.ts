import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { MarkiloError } from '../core/errors.js';
import { nowIso, writeJson } from '../core/fsx.js';
import { isSlug } from '../core/paths.js';
import type { Workspace } from '../core/workspace.js';

/** Decisions made in the Brand Preview Gallery, saved where the plugin can read them. */
export interface GalleryFeedback {
  schema: 'markilo/feedback@1';
  savedAt: string;
  decisions: {
    brand: string;
    concept: string;
    decision: 'keep' | 'refine' | 'drop' | null;
    tags: string[];
    note: string;
    pins: { n: number; x: number; y: number; where: string; note: string }[];
  }[];
  preferred: { brand: string; concept: string; why: string; over: string[] } | null;
}

const str = (v: unknown, max: number) => (typeof v === 'string' ? v.slice(0, max) : '');
const num = (v: unknown) =>
  typeof v === 'number' && Number.isFinite(v) ? Math.max(0, Math.min(100, Math.round(v))) : 0;

/** Validates untrusted feedback (it comes from a browser page) and keeps only known fields within limits. */
export function parseFeedback(raw: unknown): GalleryFeedback {
  const o = raw as Record<string, unknown>;
  if (!o || typeof o !== 'object' || o.schema !== 'markilo/feedback@1' || !Array.isArray(o.decisions))
    throw new MarkiloError(
      'INVALID_INPUT',
      'Not a Markilo gallery feedback file (schema markilo/feedback@1).',
    );
  const decisions = (o.decisions as unknown[]).slice(0, 200).flatMap((d) => {
    const x = d as Record<string, unknown>;
    const brand = str(x?.brand, 80);
    const concept = str(x?.concept, 80);
    if (!isSlug(brand) || !/^[a-z0-9][a-z0-9-]*$/.test(concept)) return [];
    const decision = ['keep', 'refine', 'drop'].includes(x.decision as string)
      ? (x.decision as 'keep' | 'refine' | 'drop')
      : null;
    return [
      {
        brand,
        concept,
        decision,
        tags: (Array.isArray(x.tags) ? x.tags : [])
          .slice(0, 12)
          .map((t) => str(t, 60))
          .filter(Boolean),
        note: str(x.note, 1000),
        pins: (Array.isArray(x.pins) ? x.pins : []).slice(0, 6).map((p, i) => {
          const q = p as Record<string, unknown>;
          return { n: i + 1, x: num(q.x), y: num(q.y), where: str(q.where, 30), note: str(q.note, 500) };
        }),
      },
    ];
  });
  const pr = o.preferred as Record<string, unknown> | null;
  const preferred =
    pr && typeof pr === 'object' && isSlug(str(pr.brand, 80)) && str(pr.concept, 80)
      ? {
          brand: str(pr.brand, 80),
          concept: str(pr.concept, 80),
          why: str(pr.why, 500),
          over: (Array.isArray(pr.over) ? pr.over : []).slice(0, 10).map((v) => str(v, 80)),
        }
      : null;
  return { schema: 'markilo/feedback@1', savedAt: nowIso(), decisions, preferred };
}

export const feedbackDir = (ws: Workspace) => join(ws.root, 'feedback');

/** Stores feedback as feedback/latest.json plus a timestamped copy (history of decisions). */
export function storeFeedback(ws: Workspace, f: GalleryFeedback): string {
  const stamp = f.savedAt.replace(/[:.]/g, '-');
  writeJson(join(feedbackDir(ws), `feedback-${stamp}.json`), f);
  const latest = join(feedbackDir(ws), 'latest.json');
  writeJson(latest, f);
  return latest;
}

export function readLatestFeedback(ws: Workspace): GalleryFeedback | undefined {
  const p = join(feedbackDir(ws), 'latest.json');
  return existsSync(p) ? (JSON.parse(readFileSync(p, 'utf8')) as GalleryFeedback) : undefined;
}

/** The decisions as plain requests an agent can act on (the same wording as the gallery's "Copy request"). */
export function feedbackRequests(f: GalleryFeedback): string[] {
  const out: string[] = [];
  for (const d of f.decisions) {
    if (d.decision === 'refine') {
      const w = [
        ...d.tags,
        ...(d.note ? [d.note] : []),
        ...d.pins.map((p) => `at ${p.where}${p.note ? `: ${p.note}` : ''}`),
      ];
      out.push(`refine ${d.brand}/${d.concept}${w.length ? `: ${w.join('; ')}` : ''}`);
    } else if (d.decision) out.push(`${d.decision} ${d.brand}/${d.concept}${d.note ? ` (${d.note})` : ''}`);
  }
  if (f.preferred)
    out.push(
      `preferred ${f.preferred.brand}/${f.preferred.concept}${f.preferred.over.length ? ` over ${f.preferred.over.join(', ')}` : ''}${f.preferred.why ? ` — ${f.preferred.why}` : ''}`,
    );
  return out;
}
