import { randomBytes } from 'node:crypto';
import { lstatSync, readFileSync } from 'node:fs';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { extname } from 'node:path';
import { resolveInsideReal } from '../core/paths.js';
import type { Workspace } from '../core/workspace.js';
import { parseFeedback, storeFeedback } from './feedback.js';

const TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.json': 'application/json',
  '.webmanifest': 'application/manifest+json',
  '.css': 'text/css',
  '.md': 'text/plain; charset=utf-8',
};
const MAX_BODY = 512 * 1024;

export interface GalleryServer {
  url: string;
  close(): void;
  /** Resolves when the server stops (closed, or idle for `idleMinutes`). */
  done: Promise<{ saved: number }>;
}

/**
 * Serves the workspace's gallery on 127.0.0.1 only, so "Send to your agent" in the page can save decisions where the
 * plugin reads them (feedback/latest.json). Every request needs the random token in the URL or header; only files
 * inside the workspace are served (no dotfiles, no symlinks); feedback is size-limited and validated.
 */
export function serveGallery(
  ws: Workspace,
  opts: { port?: number; idleMinutes?: number; onSaved?: (path: string) => void } = {},
): Promise<GalleryServer> {
  const token = randomBytes(16).toString('hex');
  let saved = 0;
  let timer: NodeJS.Timeout | undefined;
  let finish: (v: { saved: number }) => void = () => {};
  const done = new Promise<{ saved: number }>((r) => {
    finish = r;
  });
  const idleMs = (opts.idleMinutes ?? 120) * 60_000;
  const send = (res: ServerResponse, status: number, body: string, type = 'application/json') => {
    res.writeHead(status, {
      'content-type': type,
      'x-content-type-options': 'nosniff',
      'cache-control': 'no-store',
      'referrer-policy': 'no-referrer',
    });
    res.end(body);
  };
  const server = createServer((req: IncomingMessage, res: ServerResponse) => {
    if (timer) timer.refresh();
    const host = `127.0.0.1:${(server.address() as { port: number }).port}`;
    const url = new URL(req.url ?? '/', `http://${host}`);
    // Only this machine, only this origin.
    if (req.headers.host !== host) return send(res, 421, '{"error":"wrong host"}');
    if (req.method === 'POST' && url.pathname === '/feedback') {
      if (req.headers['x-markilo-token'] !== token) return send(res, 403, '{"error":"bad token"}');
      const origin = req.headers.origin;
      if (origin && origin !== `http://${host}`) return send(res, 403, '{"error":"cross-origin"}');
      if (!String(req.headers['content-type'] ?? '').startsWith('application/json'))
        return send(res, 415, '{"error":"json only"}');
      const chunks: Buffer[] = [];
      let size = 0;
      req.on('data', (c: Buffer) => {
        size += c.length;
        if (size > MAX_BODY) {
          send(res, 413, '{"error":"too large"}');
          req.destroy();
        } else chunks.push(c);
      });
      req.on('end', () => {
        if (res.writableEnded) return;
        try {
          const f = parseFeedback(JSON.parse(Buffer.concat(chunks).toString('utf8')));
          const path = storeFeedback(ws, f);
          saved++;
          opts.onSaved?.(path);
          send(res, 200, JSON.stringify({ saved: true, decisions: f.decisions.length }));
        } catch (err) {
          send(res, 400, JSON.stringify({ error: (err as Error).message.slice(0, 200) }));
        }
      });
      return;
    }
    if (req.method !== 'GET' && req.method !== 'HEAD') return send(res, 405, '{"error":"method"}');
    if (url.pathname === '/') {
      res.writeHead(302, { location: `/gallery/index.html?t=${token}` });
      return res.end();
    }
    // Static files need the token too (as ?t= on the page; sub-resources are inlined or same-origin images).
    const rel = decodeURIComponent(url.pathname).replace(/^\/+/, '');
    if (!rel || rel.split('/').some((part) => part.startsWith('.') || part === '..'))
      return send(res, 404, '{"error":"not found"}');
    if (rel.endsWith('.html') && url.searchParams.get('t') !== token)
      return send(res, 403, '{"error":"bad token"}');
    // Only what the gallery shows: the page itself and approved/exported artwork. Never research, profiles,
    // answers or feedback.
    if (!/^(gallery\/[^/]+|brands\/[a-z0-9-]+\/(exports|final)\/.+)$/.test(rel))
      return send(res, 404, '{"error":"not found"}');
    try {
      const file = resolveInsideReal(ws.root, rel);
      const st = lstatSync(file);
      if (!st.isFile() || st.isSymbolicLink()) return send(res, 404, '{"error":"not found"}');
      const type = TYPES[extname(file).toLowerCase()];
      if (!type) return send(res, 404, '{"error":"not served"}');
      send(res, 200, req.method === 'HEAD' ? '' : (readFileSync(file) as unknown as string), type);
    } catch {
      send(res, 404, '{"error":"not found"}');
    }
  });
  const close = () => {
    if (timer) clearTimeout(timer);
    server.close(() => finish({ saved }));
  };
  return new Promise((resolve, reject) => {
    server.on('error', reject);
    server.listen(opts.port ?? 0, '127.0.0.1', () => {
      const port = (server.address() as { port: number }).port;
      timer = setTimeout(close, idleMs);
      resolve({ url: `http://127.0.0.1:${port}/gallery/index.html?t=${token}`, close, done });
    });
  });
}
