import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { feedbackRequests, parseFeedback, readLatestFeedback } from '../src/gallery/feedback.js';
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
    { brand: 'nimbra', concept: 'fold', decision: 'explode' },
  ],
  preferred: { brand: 'nimbra', concept: 'fold', why: 'clearest', over: ['other'] },
};

describe('gallery feedback', () => {
  it('keeps only valid decisions from untrusted page data', () => {
    const f = parseFeedback(sample);
    expect(f.decisions).toHaveLength(2);
    expect(f.decisions[0]!.pins[0]).toEqual({ n: 1, x: 70, y: 30, where: 'top-right', note: 'thicker stem' });
    expect(f.decisions[1]!.decision).toBeNull();
    expect(feedbackRequests(f)).toEqual([
      'refine nimbra/fold: simpler; less ornament; at top-right: thicker stem',
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
