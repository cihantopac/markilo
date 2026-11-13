import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { exportBrand } from '../src/export/exporter.js';
import { finalizeConcept } from '../src/export/kit.js';
import { verifyConcept } from '../src/report/quality.js';
import { mark, synthBrand, tmp } from './helpers.js';

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

  it('main at small sizes ignores the small version', async () => {
    const ws = setup('fold-n', 'plain-circle');
    const c = ws.concept('nimbra', 'fold');
    ws.saveConcept({ ...c, smallSizes: 'main' });
    const { checks } = await verify(ws);
    // The small version is not checked: export does not use it.
    expect(checks.some((x) => x.id.startsWith('small:'))).toBe(false);
    const kit = await finalizeConcept(ws, 'nimbra', 'fold', {
      acceptRisk: true,
      userChoice: 'Chosen in a test.',
    });
    expect(kit.smallSizes).toBe('main');
    // The unused small file is neither listed in the kit nor copied into final/.
    expect(kit.files.symbolSmall).toBeUndefined();
    expect(existsSync(join(ws.finalDir('nimbra'), 'symbol-small.svg'))).toBe(false);
    const result = await exportBrand(ws, 'nimbra', { groups: ['web'] });
    expect(result.assets.find((a) => a.path === 'web/favicon.svg')?.derivedFrom).toBe('symbol.svg');
    expect(result.assets.find((a) => a.path === 'web/favicon.ico')?.derivedFrom).toBe('symbol.svg');
  }, 120_000);

  it("the user's choice turns 16 px failures into warnings", async () => {
    const ws = setup('fine-lines');
    ws.saveConcept({ ...ws.concept('nimbra', 'fold'), smallSizes: 'main' });
    const { r, checks } = await verify(ws);
    const f16 = checks.find((c) => c.id === 'symbol:fidelity-16')!;
    expect(f16.status).toBe('warn');
    expect(f16.message.endsWith(' — the user chose the main symbol at small sizes.')).toBe(true);
    expect(checks.some((c) => SMALL_SIZES.some((id) => c.id === `symbol:${id}`) && c.status === 'fail')).toBe(
      false,
    );
    expect(r.status).not.toBe('needs-work');
  }, 120_000);

  it('a small wordmark is exported', async () => {
    const ws = setup('fold-n');
    const cdir = ws.conceptDir('nimbra', 'fold');
    writeFileSync(join(cdir, 'wordmark-small.svg'), readFileSync(join(cdir, 'wordmark.svg'), 'utf8'));
    const c = ws.concept('nimbra', 'fold');
    ws.saveConcept({ ...c, files: { ...c.files, wordmarkSmall: 'wordmark-small.svg' } });
    await verifyConcept(ws, 'nimbra', 'fold');
    const kit = await finalizeConcept(ws, 'nimbra', 'fold', {
      acceptRisk: true,
      userChoice: 'Chosen in a test.',
    });
    expect(kit.files.wordmarkSmall).toBe('wordmark-small.svg');
    const result = await exportBrand(ws, 'nimbra', { groups: ['logos', 'guidelines'] });
    for (const p of ['logos/wordmark-small.svg', 'logos/wordmark-small.png']) {
      expect(existsSync(join(ws.exportsDir('nimbra'), p)), p).toBe(true);
      expect(result.assets.find((a) => a.path === p)?.derivedFrom).toBe('wordmark-small.svg');
    }
    const md = readFileSync(join(ws.exportsDir('nimbra'), 'guidelines', 'brand-guidelines.md'), 'utf8');
    expect(md).toContain('logos/wordmark-small.svg');
  }, 120_000);
});

describe('small-size flags', () => {
  const bin = join(__dirname, '..', 'plugin', 'dist', 'markilo.mjs');
  it('concept update sets --small-sizes and --wordmark-small', () => {
    const cwd = tmp();
    const run = (args: string[]) => spawnSync(process.execPath, [bin, ...args], { cwd, encoding: 'utf8' });
    const ok = (args: string[]) => {
      const r = run(args);
      expect(r.status, `${args.join(' ')}: ${r.stderr}`).toBe(0);
      return JSON.parse(r.stdout);
    };
    ok(['init', '--name', 'Demo']);
    ok(['brand', 'add', 'Lumen']);
    // biome-ignore format: one flag per pair reads better
    ok(['concept', 'new', '--brand', 'lumen', '--id', 'p1', '--title', 'One', '--direction', 'd', '--rationale', 'r',
      '--semantics', 'a', '--primary', '#c2255c']);
    const dir = join(cwd, 'brand', 'brands', 'lumen', 'concepts', 'p1');
    writeFileSync(join(dir, 'wm-small.svg'), mark('fold-n'));
    const set = ['concept', 'update', '--brand', 'lumen', '--concept', 'p1'];
    ok([...set, '--small-sizes', 'main', '--wordmark-small', 'wm-small.svg']);
    const json = () => JSON.parse(readFileSync(join(dir, 'concept.json'), 'utf8'));
    expect(json().smallSizes).toBe('main');
    expect(json().files.wordmarkSmall).toBe('wm-small.svg');
    const bad = run([...set, '--small-sizes', 'tiny']);
    expect(JSON.parse(bad.stderr).error.code).toBe('INVALID_INPUT');
    // "small" is the default: stored as nothing, so old concepts and new ones read the same.
    ok([...set, '--small-sizes', 'small']);
    expect(json().smallSizes).toBeUndefined();
  });
});
