import { cpSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import vm from 'node:vm';
import { describe, expect, it } from 'vitest';
import { proposalId } from '../src/gallery/cards.js';
import { GALLERY_SCRIPT } from '../src/gallery/client.js';
import {
  extractFeedback,
  feedbackRequests,
  feedbackText,
  parseFeedback,
  readLatestFeedback,
} from '../src/gallery/feedback.js';
import { buildGallery } from '../src/gallery/gallery.js';
import { serveGallery } from '../src/gallery/serve.js';
import { synthBrand } from './helpers.js';

const sample = {
  schema: 'markilo/feedback@1',
  decisions: [
    {
      brand: 'nimbra',
      concept: 'fold',
      decision: 'refine',
      tags: ['simpler'],
      note: 'less ornament',
      pins: [{ x: 70.4, y: 30, where: 'top-right', note: 'thicker stem' }],
    },
    { brand: '../etc', concept: 'x', decision: 'drop' },
    { brand: 'nimbra', concept: 'wave', decision: null, sketch: 's4', note: '' },
    { brand: 'nimbra', concept: 'wave', decision: null, sketch: '../s1' },
    { brand: 'nimbra', concept: 'fold', decision: 'explode' },
  ],
  preferred: { brand: 'nimbra', concept: 'fold', why: 'clearest', over: ['other'] },
};

describe('gallery feedback', () => {
  it('keeps only valid decisions from untrusted page data', () => {
    const f = parseFeedback(sample);
    expect(f.decisions).toHaveLength(4);
    expect(f.decisions[0]!.pins[0]).toEqual({ n: 1, x: 70, y: 30, where: 'top-right', note: 'thicker stem' });
    expect(f.decisions[1]!.sketch).toBe('s4');
    expect(f.decisions[2]!.sketch).toBeUndefined();
    expect(f.decisions[3]!.decision).toBeNull();
    expect(feedbackRequests(f)).toEqual([
      'refine nimbra/fold: simpler; less ornament; at top-right: thicker stem',
      'develop sketch s4 of nimbra/wave',
      'preferred nimbra/fold over other — clearest',
    ]);
    expect(() => parseFeedback({ decisions: [] })).toThrow(/schema/);
  });

  it('serves the gallery on 127.0.0.1 with a token and saves decisions', async () => {
    const { ws } = synthBrand();
    await buildGallery(ws);
    const srv = await serveGallery(ws, { idleMinutes: 1 });
    try {
      const base = new URL(srv.url);
      const token = base.searchParams.get('t')!;
      expect(base.hostname).toBe('127.0.0.1');
      expect((await fetch(srv.url)).status).toBe(200);
      expect((await fetch(`${base.origin}/gallery/index.html`)).status).toBe(403);
      expect((await fetch(`${base.origin}/brands/nimbra/profile.json`)).status).toBe(404);
      // A malformed escape is a bad request, not a crash that takes the server down.
      expect((await fetch(`${base.origin}/gallery/%E0%A4%A`)).status).toBe(400);
      expect((await fetch(srv.url)).status).toBe(200);
      // Only the page's own script may run.
      const html = await (await fetch(srv.url)).text();
      const nonce = /script-src 'nonce-([^']+)'/.exec(html)?.[1];
      expect(nonce).toBeTruthy();
      expect(html).toContain(`<script nonce="${nonce}">`);
      expect((await fetch(`${base.origin}/brands/nimbra/brief.json?t=${token}`)).status).toBe(404);
      const post = (t: string, body: unknown) =>
        fetch(`${base.origin}/feedback`, {
          method: 'POST',
          headers: { 'content-type': 'application/json', 'x-markilo-token': t },
          body: JSON.stringify(body),
        });
      expect((await post('wrong', sample)).status).toBe(403);
      expect((await post(token, { nope: true })).status).toBe(400);
      const ok = await post(token, sample);
      expect(ok.status).toBe(200);
      expect(readLatestFeedback(ws)!.decisions[0]!.note).toBe('less ornament');
      expect(existsSync(join(ws.root, 'feedback', 'latest.json'))).toBe(true);
      expect(readFileSync(join(ws.root, 'gallery', 'index.html'), 'utf8')).toContain('markilo/feedback@1');
    } finally {
      srv.close();
    }
    expect((await srv.done).saved).toBe(1);
  });
});

describe('gallery feedback pasted from chat', () => {
  const block = (o: unknown) => `\`\`\`markilo-feedback\n${JSON.stringify(o)}\n\`\`\``;
  it('reads a whole JSON file as before', () => {
    expect(extractFeedback(JSON.stringify(sample))).toEqual(sample);
  });
  it('takes the block out of chat text with prose around it', () => {
    const text = `Here are my picks:\n- select nimbra/fold\n\n${block(sample)}\n\nthanks!`;
    expect(extractFeedback(text)).toEqual(sample);
  });
  it('uses the last block when there are two', () => {
    const later = { ...sample, preferred: null };
    expect(extractFeedback(`${block(sample)}\nchanged my mind:\n${block(later)}`)).toEqual(later);
  });
  it('says clearly when no block is there', () => {
    expect(() => extractFeedback('I like A best.')).toThrow(
      'No markilo-feedback block found in the pasted text.',
    );
  });
  it('rejects a block that is not valid JSON', () => {
    expect(() => extractFeedback('```markilo-feedback\n{"schema": oops}\n```')).toThrow(
      expect.objectContaining({ code: 'INVALID_INPUT' }),
    );
  });
  it('round-trips the copied text', () => {
    const f = parseFeedback(sample);
    const text = feedbackText(f);
    expect(text).toContain('- refine nimbra/fold');
    expect(parseFeedback(extractFeedback(text)).decisions).toEqual(f.decisions);
  });
});

describe('gallery: ideas', () => {
  it('shows the idea longlist with the critic readings, struck ideas folded away', async () => {
    const { writeJson } = await import('../src/core/fsx.js');
    const { ws } = synthBrand();
    writeJson(ws.ideasPath('nimbra'), {
      schema: 'markilo/ideas@1',
      ideas: [
        {
          id: 'i1',
          hook: 'a lamp seen from above',
          means: 'clarity',
          source: 'audience',
          addedAt: '2026-01-01',
          review: { verdict: 'keep', reading: 'a lampshade from above', rank: 1, at: '2026-01-01' },
          concepts: ['fold'],
        },
        {
          id: 'i2',
          hook: 'an arch with a keystone',
          means: 'reliability',
          source: 'product',
          addedAt: '2026-01-01',
          review: { verdict: 'strike', reading: 'a generic architecture icon', at: '2026-01-01' },
        },
      ],
    });
    const { path } = await buildGallery(ws);
    const html = readFileSync(path, 'utf8');
    expect(html).toContain('Ideas — 1 kept, 1 struck');
    expect(html).toContain('became fold');
    expect(html).toContain('Struck before drawing (1)');
  });
});

describe('gallery: round letters', () => {
  it('cards carry the letters the board shows, in proposal order', async () => {
    const { copyFileSync, mkdirSync } = await import('node:fs');
    const { ws } = synthBrand();
    const base = ws.concept('nimbra', 'fold');
    const made = [
      ['zeta', 'Zeta idea', 'A', '2026-01-01T00:00:00.000Z'],
      ['alpha', 'Alpha idea', 'B', '2026-01-02T00:00:00.000Z'],
      ['mid', 'Mid idea', 'C', '2026-01-03T00:00:00.000Z'],
    ] as const;
    for (const [id, title, letter, createdAt] of made) {
      mkdirSync(ws.conceptDir('nimbra', id), { recursive: true });
      for (const f of ['symbol.svg', 'wordmark.svg'])
        copyFileSync(ws.conceptFile('nimbra', 'fold', f), ws.conceptFile('nimbra', id, f));
      ws.saveConcept({ ...base, id, title, round: 1, letter, createdAt });
    }
    const html = readFileSync((await buildGallery(ws)).path, 'utf8');
    expect(html).toMatch(/<span class="letter">A<\/span>Zeta idea/);
    expect(html).toMatch(/<span class="letter">B<\/span>Alpha idea/);
    expect(html).toMatch(/<span class="letter">C<\/span>Mid idea/);
    expect(html.indexOf('Zeta idea')).toBeLessThan(html.indexOf('Alpha idea'));
    expect(html.indexOf('Alpha idea')).toBeLessThan(html.indexOf('Mid idea'));
  });
});

describe('gallery: nothing passed', () => {
  it('says why nothing is offered and shows the rejected concepts with the critic verdict', async () => {
    const { ws } = synthBrand();
    const c = ws.concept('nimbra', 'fold');
    ws.saveConcept({
      ...c,
      status: 'rejected',
      critique: { present: false, reason: 'reads as a folded page icon', at: '2026-01-01T00:00:00Z' },
      readsAs: ['a folded page', 'a file icon'],
    });
    const html = readFileSync((await buildGallery(ws)).path, 'utf8');
    expect(html).not.toContain('No concepts yet.');
    expect(html).toContain('Nothing is waiting for a decision');
    expect(html).toContain('<details class="rejected-list" open>');
    expect(html).toContain('<span data-i18n>would not present it as is</span> — reads as a folded page icon');
  });
});

describe('gallery feedback pasted from chat: hard cases', () => {
  it('keeps a note that contains a code fence', () => {
    const f = parseFeedback({
      ...sample,
      decisions: [{ ...sample.decisions[0], note: 'like ```this``` one' }],
    });
    expect(parseFeedback(extractFeedback(`ok:\n${feedbackText(f)}\nthanks`)).decisions[0]!.note).toBe(
      'like ```this``` one',
    );
  });
  it('looks for the block when chat text merely starts with a brace', () => {
    const text = `{oops} here are my picks\n${feedbackText(parseFeedback(sample))}`;
    expect(parseFeedback(extractFeedback(text)).decisions[0]!.concept).toBe('fold');
  });
  it('says a whole file is not valid JSON when there is no block either', () => {
    expect(() => extractFeedback('{"schema": oops')).toThrow(/not valid JSON/);
  });
});

/** Run the gallery's own script against saved decisions and return what "Copy decisions" puts on the clipboard. */
async function copiedText(state: unknown): Promise<string> {
  const stub: unknown = new Proxy(() => {}, {
    get: (_t, k) => (k === Symbol.toPrimitive ? () => '' : k === 'length' ? 0 : stub),
    apply: () => stub,
    set: () => true,
  });
  const clicks: Record<string, () => unknown> = {};
  let copied = '';
  const document = {
    querySelectorAll: () => [],
    querySelector: () => null,
    addEventListener: () => {},
    activeElement: null,
    getElementById: (id: string) =>
      new Proxy(stub as object, {
        set: (_t, k, v) => {
          if (k === 'onclick') clicks[id] = v;
          return true;
        },
      }),
  };
  const sandbox = {
    document,
    location: { pathname: '/gallery/index.html', search: '', hash: '', protocol: 'file:' },
    localStorage: { getItem: () => JSON.stringify(state), setItem: () => {} },
    navigator: {
      clipboard: {
        writeText: async (t: string) => {
          copied = t;
        },
      },
    },
    CSS: { escape: (x: string) => x },
    history: { replaceState: () => {} },
    URLSearchParams,
    setTimeout: () => 0,
    JSON,
    Date,
    Object,
    Number,
    Math,
  };
  vm.runInNewContext(GALLERY_SCRIPT, { ...sandbox, window: sandbox });
  await clicks.copy!();
  return copied;
}

describe('gallery: the client copies what feedbackText builds', () => {
  const state = {
    'nimbra/fold': {
      pick: 'refine',
      chips: ['simpler', 'combine with another'],
      note: 'less ornament',
      pins: [{ x: 70, y: 30, note: 'thicker stem' }],
    },
    'nimbra/wave': { pick: 'keep', chips: ['combine with another'], note: 'calm' },
    'nimbra/dune': { pick: 'drop' },
    'nimbra/arch': { sketch: 's2', note: 'taller' },
    'nimbra/tide': { sketch: 'none' },
    '_reject:nimbra/1': { on: true, note: 'too busy' },
    _prefer: { key: 'nimbra/wave', brand: 'nimbra', concept: 'wave', why: 'calmest', over: ['fold'] },
  };
  it('has the same requests and the same decisions block', async () => {
    const text = await copiedText(state);
    const f = parseFeedback(extractFeedback(text));
    const lines = text.split('\n\n```')[0]!.split('\n');
    expect(lines).toEqual(feedbackRequests(f).map((r) => `- ${r}`));
    expect(text.split('\n\n```')[0]).toBe(feedbackText(f).split('\n\n```')[0]);
    expect(f.decisions.map((d) => `${d.concept}:${d.decision}`).sort()).toEqual([
      'arch:null',
      'dune:drop',
      'fold:refine',
      'tide:null',
      'wave:keep',
    ]);
    expect(lines).toContain('- combine nimbra/fold (less ornament) + nimbra/wave (calm)');
    expect(lines).toContain('- reject all of round 1 for nimbra: too busy');
  });
});

describe('gallery: ids, flags and the board', () => {
  it('keeps proposal ids unique across brands that share a joined name', () => {
    const id = (slug: string, key: string) => proposalId({ brand: { slug }, key } as never);
    expect(id('acme', 'pro-x')).not.toBe(id('acme-pro', 'x'));
    expect(id('acme', 'fold')).toBe('acme--fold');
  });
  it('labels the tile flag and says the originality problem on the proposal', async () => {
    const { ws } = synthBrand();
    ws.saveConcept({ ...ws.concept('nimbra', 'fold'), round: 1 });
    mkdirSync(ws.reportsDir('nimbra'), { recursive: true });
    writeFileSync(
      join(ws.reportsDir('nimbra'), 'originality-fold.json'),
      JSON.stringify({ schema: 'markilo/originality@2', verdict: 'redesign', visual: { matches: [] } }),
    );
    const html = readFileSync((await buildGallery(ws)).path, 'utf8');
    expect(html).toMatch(
      /<i class="tile-flag" role="img" aria-label="Has a problem — see the proposal" data-i18n-aria-label=/,
    );
    expect(html).toMatch(/class="flags"[\s\S]*originality: redesign/);
  });
  it('lists older rounds on their own boards and rejected proposals without a tile', async () => {
    const { ws } = synthBrand();
    const fold = ws.concept('nimbra', 'fold');
    const add = (id: string, round: number, status: 'draft' | 'rejected') => {
      if (id !== 'fold')
        cpSync(ws.conceptDir('nimbra', 'fold'), ws.conceptDir('nimbra', id), { recursive: true });
      ws.saveConcept({ ...fold, id, title: id, round, status });
    };
    add('fold', 1, 'draft');
    add('fold2', 2, 'draft');
    add('fold3', 2, 'rejected');
    const html = readFileSync((await buildGallery(ws)).path, 'utf8');
    const boards = [...html.matchAll(/<nav class="board"[\s\S]*?<\/nav>/g)].map((m) => m[0]);
    expect(boards).toHaveLength(2);
    expect(boards[0]).toContain('data-target="nimbra--fold2"');
    expect(boards[0]).not.toContain('nimbra--fold"');
    expect(boards[1]).toContain('data-target="nimbra--fold"');
    expect(html).toMatch(
      /<details class="round"><summary><span data-i18n="Round \{0\} \(\{1\}\)"[^>]*>Round 1 \(1\)<\/span>/,
    );
    expect(html).not.toContain('data-target="nimbra--fold3"');
    expect(html).toMatch(/<details class="rejected-list"[\s\S]*id="nimbra--fold3"/);
  });
});

describe('gallery: ids are safe to join', () => {
  it('refuses "--" in a new brand slug or concept id, but still reads one that exists', () => {
    const { ws } = synthBrand();
    expect(() => ws.addBrand({ name: 'Odd', slug: 'a--b' })).toThrow(
      expect.objectContaining({ code: 'USAGE' }),
    );
    const fold = ws.concept('nimbra', 'fold');
    expect(() => ws.saveConcept({ ...fold, id: 'b--x' })).toThrow(expect.objectContaining({ code: 'USAGE' }));
    // A workspace made before the rule keeps working: an existing concept with "--" is still saved.
    cpSync(ws.conceptDir('nimbra', 'fold'), ws.conceptDir('nimbra', 'old--one'), { recursive: true });
    writeFileSync(
      join(ws.conceptDir('nimbra', 'old--one'), 'concept.json'),
      JSON.stringify({ ...fold, id: 'old--one' }),
    );
    expect(ws.concept('nimbra', 'old--one').id).toBe('old--one');
    expect(() => ws.saveConcept({ ...fold, id: 'old--one' })).not.toThrow();
  });
  it('no longer lets two brand and concept pairs share an id', () => {
    const id = (slug: string, key: string) => proposalId({ brand: { slug }, key } as never);
    expect(id('a', 'b-x')).not.toBe(id('a-b', 'x'));
  });
  /** Run the client against a page of these proposal ids; returns the id it brings forward. */
  const shown = (ids: string[], hash: string) => {
    const on: Record<string, boolean> = {};
    const stub: unknown = new Proxy(() => {}, {
      get: (_t, k) => (k === Symbol.toPrimitive ? () => '' : k === 'length' ? 0 : stub),
      apply: () => stub,
      set: () => true,
    });
    const list: Record<string, unknown> = {};
    const cards = ids.map((id) => ({
      id,
      parentElement: list,
      classList: {
        toggle: (n: string, v: boolean) => {
          if (n === 'on') on[id] = v;
        },
      },
      querySelectorAll: () => [],
      querySelector: () => null,
    }));
    Object.assign(list, {
      children: cards,
      classList: { add: () => {} },
      querySelector: (sel: string) => (sel === ':scope>.proposal' ? cards[0] : null),
      querySelectorAll: () => [],
      contains: () => false,
      getClientRects: () => [1],
      getBoundingClientRect: () => ({ top: 0 }),
      parentElement: { querySelector: () => ({ querySelectorAll: () => [], contains: () => false }) },
    });
    const document = {
      querySelectorAll: (sel: string) => (sel === '.proposals' ? [list] : sel === '.proposal' ? cards : []),
      querySelector: () => null,
      addEventListener: () => {},
      activeElement: null,
      getElementById: (id: string) => cards.find((c) => c.id === id) ?? (id.includes('-') ? null : stub),
    };
    const sandbox = {
      document,
      location: { pathname: '/g.html', search: '', hash, protocol: 'file:' },
      localStorage: { getItem: () => '{}', setItem: () => {} },
      navigator: {},
      CSS: { escape: (x: string) => x },
      history: { replaceState: () => {} },
      URLSearchParams,
      setTimeout: () => 0,
      JSON,
      Date,
      Object,
      Number,
      Math,
    };
    vm.runInNewContext(GALLERY_SCRIPT, { ...sandbox, window: sandbox });
    return ids.filter((id) => on[id]);
  };
  it('opens an old "#slug-key" link only when exactly one proposal matches', () => {
    expect(shown(['nimbra--other', 'nimbra--fold'], '#nimbra-fold')).toEqual(['nimbra--fold']);
    expect(shown(['nimbra--other', 'nimbra--fold'], '#nimbra--fold')).toEqual(['nimbra--fold']);
    // "#acme-pro-x" could be acme--pro-x or acme-pro--x: bring neither forward (the first stays).
    expect(shown(['zzz--q', 'acme-pro--x', 'acme--pro-x'], '#acme-pro-x')).toEqual(['zzz--q']);
  });
});
