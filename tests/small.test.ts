import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { exportBrand } from '../src/export/exporter.js';
import { finalizeConcept } from '../src/export/kit.js';
import { verifyConcept } from '../src/report/quality.js';
import { mark, synthBrand } from './helpers.js';

type Check = { id: string; status: string };

describe('small-size symbol', () => {
  it('is verified against the main symbol and used for favicons', async () => {
    const { ws } = synthBrand();
    const cdir = ws.conceptDir('nimbra', 'fold');
    const checks = async () => {
      await verifyConcept(ws, 'nimbra', 'fold');
      const report = JSON.parse(readFileSync(join(ws.reportsDir('nimbra'), 'quality-fold.json'), 'utf8'));
      return (report.checks as Check[]).filter((c) => c.id.startsWith('small:'));
    };

    // An unrelated drawing is not a small version of the mark.
    writeFileSync(join(cdir, 'symbol-small.svg'), mark('plain-circle'));
    ws.saveConcept({
      ...ws.concept('nimbra', 'fold'),
      files: { ...ws.concept('nimbra', 'fold').files, small: 'symbol-small.svg' },
    });
    expect((await checks()).find((c) => c.id === 'small:same-mark')?.status).toBe('warn');

    writeFileSync(join(cdir, 'symbol-small.svg'), mark('fold-n'));
    expect((await checks()).find((c) => c.id === 'small:same-mark')?.status).toBe('pass');

    const kit = await finalizeConcept(ws, 'nimbra', 'fold', { acceptRisk: true });
    expect(kit.files.symbolSmall).toBe('symbol-small.svg');
    const result = await exportBrand(ws, 'nimbra', { groups: ['web'] });
    const fav = result.assets.find((a) => a.path === 'web/favicon.svg');
    expect(fav?.derivedFrom).toBe('symbol-small.svg');
    expect(result.assets.find((a) => a.path === 'web/favicon.ico')?.derivedFrom).toMatch(/symbol-small\.svg/);
    expect(readFileSync(join(ws.exportsDir('nimbra'), 'web', 'favicon.svg'), 'utf8')).toContain('<svg');
  }, 120_000);
});
