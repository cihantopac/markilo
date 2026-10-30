import { isSlug } from './paths.js';
import type { Brief, Concept, WorkspaceManifest } from './types.js';

export type Issues = string[];

const HEX = /^#[0-9a-fA-F]{6}$/;
const isObj = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);
const isStrArray = (v: unknown): v is string[] => Array.isArray(v) && v.every((x) => typeof x === 'string');

function optStrArray(obj: Record<string, unknown>, key: string, path: string, issues: Issues): void {
  if (obj[key] !== undefined && !isStrArray(obj[key]))
    issues.push(`${path}.${key} must be an array of strings`);
}

export function validateManifest(v: unknown): Issues {
  const issues: Issues = [];
  if (!isObj(v)) return ['workspace manifest must be an object'];
  if (v.schema !== 'markilo/workspace@1') issues.push('schema must be "markilo/workspace@1"');
  if (typeof v.name !== 'string' || !v.name) issues.push('name is required');
  if (!Array.isArray(v.brands)) return [...issues, 'brands must be an array'];
  const seen = new Set<string>();
  for (const [i, b] of (v.brands as unknown[]).entries()) {
    if (!isObj(b)) {
      issues.push(`brands[${i}] must be an object`);
      continue;
    }
    if (typeof b.slug !== 'string' || !isSlug(b.slug))
      issues.push(`brands[${i}].slug must be a kebab-case slug`);
    else if (seen.has(b.slug)) issues.push(`brands[${i}].slug "${b.slug}" is duplicated`);
    else seen.add(b.slug);
    if (typeof b.name !== 'string' || !b.name) issues.push(`brands[${i}].name is required`);
    if (!['master', 'product', 'sub-brand', 'endorsed'].includes(b.role as string))
      issues.push(`brands[${i}].role is invalid`);
  }
  const m = v as unknown as WorkspaceManifest;
  for (const b of m.brands) {
    if (b.parent && !seen.has(b.parent)) issues.push(`brand "${b.slug}" has unknown parent "${b.parent}"`);
  }
  return issues;
}

export function validateBrief(v: unknown): Issues {
  const issues: Issues = [];
  if (!isObj(v)) return ['brief must be an object'];
  if (v.schema !== 'markilo/brief@1') issues.push('schema must be "markilo/brief@1"');
  if (typeof v.brand !== 'string' || !isSlug(v.brand)) issues.push('brand must be a slug');
  if (typeof v.name !== 'string' || !v.name) issues.push('name is required');
  if (!['new', 'refresh', 'redesign', 'evaluate'].includes(v.mode as string))
    issues.push('mode must be one of new | refresh | redesign | evaluate');
  for (const section of ['product', 'audience', 'positioning', 'constraints'] as const) {
    const s = v[section];
    if (s === undefined) continue;
    if (!isObj(s)) {
      issues.push(`${section} must be an object`);
      continue;
    }
    for (const [k, val] of Object.entries(s)) {
      if (Array.isArray(val)) optStrArray(s, k, section, issues);
      else if (typeof val !== 'string') issues.push(`${section}.${k} must be a string or array of strings`);
    }
  }
  const colors = (v as unknown as Brief).constraints?.colors;
  for (const c of colors ?? [])
    if (!HEX.test(c)) issues.push(`constraints.colors entry "${c}" must be #rrggbb`);
  if (v.competitors !== undefined) {
    if (!Array.isArray(v.competitors)) issues.push('competitors must be an array');
    else
      v.competitors.forEach((c, i) => {
        if (!isObj(c) || typeof c.name !== 'string') issues.push(`competitors[${i}].name is required`);
      });
  }
  if (v.niceClasses !== undefined) {
    if (
      !Array.isArray(v.niceClasses) ||
      !v.niceClasses.every((n) => Number.isInteger(n) && n >= 1 && n <= 45)
    )
      issues.push('niceClasses must be integers between 1 and 45');
  }
  return issues;
}

export function validateConcept(v: unknown): Issues {
  const issues: Issues = [];
  if (!isObj(v)) return ['concept must be an object'];
  if (v.schema !== 'markilo/concept@1') issues.push('schema must be "markilo/concept@1"');
  for (const key of ['id', 'brand', 'title', 'direction', 'rationale'] as const) {
    if (typeof v[key] !== 'string' || !v[key]) issues.push(`${key} is required`);
  }
  if (typeof v.id === 'string' && !isSlug(v.id)) issues.push('id must be a slug');
  if (!isStrArray(v.semantics)) issues.push('semantics must be an array of strings');
  if (!isObj(v.palette) || typeof v.palette.primary !== 'string' || !HEX.test(v.palette.primary)) {
    issues.push('palette.primary must be #rrggbb');
  } else {
    for (const [k, c] of Object.entries(v.palette)) {
      if (typeof c !== 'string' || !HEX.test(c)) issues.push(`palette.${k} must be #rrggbb`);
    }
  }
  if (!isObj(v.files)) issues.push('files must be an object');
  else if (!v.files.symbol && !v.files.wordmark) issues.push('files needs at least a symbol or a wordmark');
  if (!['draft', 'verified', 'shortlisted', 'rejected', 'approved'].includes(v.status as string))
    issues.push('status is invalid');
  const t = (v as unknown as Concept).typography;
  if (t !== undefined && (typeof t.fontId !== 'string' || typeof t.weight !== 'number'))
    issues.push('typography needs fontId and weight');
  return issues;
}
