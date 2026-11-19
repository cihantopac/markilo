#!/usr/bin/env node
// Renders the repository's synthetic SVG marks to WebP (and reference PNG) in headless Chromium, through
// `canvas.toDataURL`, and writes them to tests/fixtures/raster/. Run it only to regenerate the committed fixtures:
//   node scripts/make-webp-fixtures.mjs [path-to-chrome]
// The browser comes from the Playwright cache (no dependency); pass another Chrome binary as the first argument.
import { spawn } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { join } from 'node:path';

const root = new URL('..', import.meta.url).pathname;
const chrome =
  process.argv[2] ??
  join(
    homedir(),
    'Library/Caches/ms-playwright/chromium-1254/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing',
  );
const out = join(root, 'tests/fixtures/raster');

/** name, source mark, size, background (null = transparent), outputs as [file, mime, quality]. */
const JOBS = [
  [
    'orbit',
    'orbit.svg',
    160,
    '#ffffff',
    [
      ['orbit.png', 'image/png'],
      ['orbit-lossless.webp', 'image/webp', 1],
      ['orbit-lossy.webp', 'image/webp', 0.6],
    ],
  ],
  [
    'bolt',
    'bolt.svg',
    128,
    null,
    [
      ['bolt-alpha.png', 'image/png'],
      ['bolt-alpha-lossless.webp', 'image/webp', 1],
      ['bolt-alpha-lossy.webp', 'image/webp', 0.6],
    ],
  ],
  [
    'leaf',
    'leaf-letter.svg',
    96,
    '#f4f1ea',
    [
      ['leaf.png', 'image/png'],
      ['leaf-lossless.webp', 'image/webp', 1],
    ],
  ],
];

const port = 9400 + Math.floor(Math.random() * 400);
const profile = mkdtempSync(join(tmpdir(), 'markilo-webp-'));
const proc = spawn(
  chrome,
  [
    '--headless=new',
    `--remote-debugging-port=${port}`,
    `--user-data-dir=${profile}`,
    '--no-first-run',
    '--disable-gpu',
    'about:blank',
  ],
  { stdio: 'ignore' },
);

async function pageSocket() {
  for (let i = 0; i < 100; i++) {
    try {
      const list = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
      const page = list.find((t) => t.type === 'page');
      if (page) return page.webSocketDebuggerUrl;
    } catch {}
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error('Chromium did not start.');
}

try {
  const ws = new WebSocket(await pageSocket());
  await new Promise((r, j) => {
    ws.onopen = r;
    ws.onerror = j;
  });
  let id = 0;
  const pending = new Map();
  ws.onmessage = (e) => {
    const m = JSON.parse(e.data);
    if (m.id && pending.has(m.id)) {
      pending.get(m.id)(m);
      pending.delete(m.id);
    }
  };
  const evaluate = (expression) =>
    new Promise((resolve, reject) => {
      const n = ++id;
      pending.set(n, (m) => {
        const r = m.result;
        if (m.error || r?.exceptionDetails) reject(new Error(JSON.stringify(m.error ?? r.exceptionDetails)));
        else resolve(r.result.value);
      });
      ws.send(
        JSON.stringify({
          id: n,
          method: 'Runtime.evaluate',
          params: { expression, awaitPromise: true, returnByValue: true },
        }),
      );
    });

  for (const [name, mark, size, bg, outputs] of JOBS) {
    const svg = readFileSync(join(root, 'tests/fixtures/marks', mark), 'utf8');
    const urls = await evaluate(`(async () => {
      const img = new Image();
      img.src = 'data:image/svg+xml;base64,' + ${JSON.stringify(Buffer.from(svg).toString('base64'))};
      await img.decode();
      const c = document.createElement('canvas');
      c.width = c.height = ${size};
      const g = c.getContext('2d');
      ${bg ? `g.fillStyle = ${JSON.stringify(bg)}; g.fillRect(0, 0, ${size}, ${size});` : ''}
      g.drawImage(img, 0, 0, ${size}, ${size});
      return ${JSON.stringify(outputs)}.map(([, mime, q]) => c.toDataURL(mime, q));
    })()`);
    outputs.forEach(([file, mime], i) => {
      const prefix = `data:${mime};base64,`;
      if (!urls[i].startsWith(prefix)) throw new Error(`${name}: Chromium did not encode ${mime}.`);
      const bytes = Buffer.from(urls[i].slice(prefix.length), 'base64');
      writeFileSync(join(out, file), bytes);
      process.stderr.write(`${file}: ${bytes.length} bytes\n`);
    });
  }
  ws.close();
} finally {
  const exited = new Promise((r) => proc.once('exit', r));
  proc.kill();
  await exited;
  rmSync(profile, { recursive: true, force: true, maxRetries: 5 });
}
