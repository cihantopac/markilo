import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Workspace } from '../src/core/workspace.js';
import { loadBundledFace } from '../src/design/fonts.js';
import { wordmarkSvg } from '../src/design/wordmark.js';

export const fixture = (name: string) => join(__dirname, 'fixtures', name);
export const mark = (name: string) => readFileSync(fixture(`marks/${name}.svg`), 'utf8');

export function tmp(prefix = 'markilo-test-'): string {
  return mkdtempSync(join(tmpdir(), prefix));
}

/** A workspace with one synthetic brand ("Nimbra") and one verified-ready concept ("fold"). */
export function synthBrand(): { ws: Workspace; dir: string } {
  const dir = tmp();
  const ws = Workspace.init(join(dir, 'brand'), 'Test');
  ws.addBrand({ name: 'Nimbra' });
  const cdir = ws.conceptDir('nimbra', 'fold');
  mkdirSync(cdir, { recursive: true });
  writeFileSync(join(cdir, 'symbol.svg'), mark('fold-n'));
  writeFileSync(
    join(cdir, 'wordmark.svg'),
    wordmarkSvg(loadBundledFace('manrope', 700), 'nimbra', { tracking: -10, color: '#1b2140' }),
  );
  ws.saveConcept({
    schema: 'markilo/concept@1',
    id: 'fold',
    brand: 'nimbra',
    title: 'Fold',
    direction: 'Folded page forming an N',
    rationale: 'Notes that fold into structure',
    semantics: ['page', 'fold', 'N'],
    palette: { primary: '#3b5bdb', accent: '#ff8a3d' },
    typography: { fontId: 'manrope', weight: 700, family: 'Manrope', license: 'OFL-1.1' },
    files: { symbol: 'symbol.svg', wordmark: 'wordmark.svg' },
    status: 'draft',
    // Reviewed by a critic and clearly passing, so finalize accepts it like a concept that went through the gate.
    critique: { present: true, reason: 'test fixture', at: new Date().toISOString() },
    blind: {
      scores: { distinctiveness: 7, memorability: 7, 'brand-fit': 7, craft: 7, versatility: 7 },
      at: new Date().toISOString(),
    },
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });
  return { ws, dir };
}
