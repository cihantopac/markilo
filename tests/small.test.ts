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

    const kit = await finalizeConcept(ws, 'nimbra', 'fold', {
      acceptRisk: true,
      userChoice: 'Chosen in a test.',
    });
    expect(kit.files.symbolSmall).toBe('symbol-small.svg');
    const result = await exportBrand(ws, 'nimbra', { groups: ['web'] });
    const fav = result.assets.find((a) => a.path === 'web/favicon.svg');
    expect(fav?.derivedFrom).toBe('symbol-small.svg');
    expect(result.assets.find((a) => a.path === 'web/favicon.ico')?.derivedFrom).toMatch(/symbol-small\.svg/);
    expect(readFileSync(join(ws.exportsDir('nimbra'), 'web', 'favicon.svg'), 'utf8')).toContain('<svg');
  }, 120_000);

  const SMALL_SIZES = ['fidelity-16', 'fidelity-32', 'thin-detail'];
  const setup = (symbol: string, small?: string) => {
    const { ws } = synthBrand();
    const cdir = ws.conceptDir('nimbra', 'fold');
    writeFileSync(join(cdir, 'symbol.svg'), mark(symbol));
    if (small) {
      writeFileSync(join(cdir, 'symbol-small.svg'), mark(small));
      const c = ws.concept('nimbra', 'fold');
      ws.saveConcept({ ...c, files: { ...c.files, small: 'symbol-small.svg' } });
    }
    return ws;
  };
  const verify = async (ws: ReturnType<typeof setup>) => {
    const r = await verifyConcept(ws, 'nimbra', 'fold');
    const report = JSON.parse(readFileSync(join(ws.reportsDir('nimbra'), 'quality-fold.json'), 'utf8'));
    return { r, checks: report.checks as (Check & { message: string })[] };
  };

  it('a small version takes over the 16 px checks', async () => {
    const { checks } = await verify(setup('fine-lines', 'fold-n'));
    const main = checks.filter((c) => SMALL_SIZES.some((id) => c.id === `symbol:${id}`));
    expect(main.length).toBeGreaterThan(0);
    for (const c of main) expect(c.status === 'pass' || c.status === 'info').toBe(true);
    expect(
      main.some((c) => c.status === 'info' && c.message.endsWith('the small version carries this size.')),
    ).toBe(true);
    expect(checks.find((c) => c.id === 'small:fidelity-16')?.status).toBe('pass');
  }, 120_000);

  it('without a small version the main symbol still fails at 16 px', async () => {
    const { r, checks } = await verify(setup('fine-lines'));
    expect(checks.find((c) => c.id === 'symbol:fidelity-16')?.status).toBe('fail');
    expect(r.status).toBe('needs-work');
  }, 120_000);

  it('a failing small version still blocks', async () => {
    const { r, checks } = await verify(setup('fold-n', 'fine-lines'));
    expect(checks.find((c) => c.id === 'small:fidelity-16')?.status).toBe('fail');
    expect(r.status).toBe('needs-work');
  }, 120_000);
});
