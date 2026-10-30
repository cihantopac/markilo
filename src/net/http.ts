import { lookup as dnsLookup, type LookupAddress } from 'node:dns';
import http from 'node:http';
import https from 'node:https';
import { isIP } from 'node:net';
import { createBrotliDecompress, createGunzip, createInflate } from 'node:zlib';
import { MarkiloError } from '../core/errors.js';

export const USER_AGENT =
  'MarkiloBot/0.3 (+https://github.com/cihantopac/markilo; brand research on behalf of a user)';

export interface GetOptions {
  /** Must be true: callers pass the user's explicit consent through. */
  allowNetwork: boolean;
  /** Permit loopback/private/link-local targets (e.g. a local dev server). Off by default (SSRF protection). */
  allowPrivate?: boolean;
  timeoutMs?: number;
  /** Limit on the decoded body. Larger bodies are truncated and flagged. */
  maxBytes?: number;
  maxRedirects?: number;
  accept?: string;
}

export interface GetResult {
  url: string;
  status: number;
  contentType: string;
  body: Uint8Array;
  truncated: boolean;
  redirects: string[];
}

function v4ToInt(ip: string): number {
  return ip.split('.').reduce((acc, o) => (acc << 8) + Number(o), 0) >>> 0;
}

const V4_BLOCKS: [string, number][] = [
  ['0.0.0.0', 8],
  ['10.0.0.0', 8],
  ['100.64.0.0', 10],
  ['127.0.0.0', 8],
  ['169.254.0.0', 16],
  ['172.16.0.0', 12],
  ['192.0.0.0', 24],
  ['192.0.2.0', 24],
  ['192.88.99.0', 24],
  ['192.168.0.0', 16],
  ['198.18.0.0', 15],
  ['198.51.100.0', 24],
  ['203.0.113.0', 24],
  ['224.0.0.0', 4],
  ['240.0.0.0', 4],
];

/** True for addresses that are not routable on the public internet (loopback, private, link-local, metadata, …). */
export function isPrivateAddress(ip: string): boolean {
  const kind = isIP(ip);
  if (kind === 4) {
    const n = v4ToInt(ip);
    return V4_BLOCKS.some(([base, bits]) => n >>> (32 - bits) === v4ToInt(base) >>> (32 - bits));
  }
  if (kind === 6) {
    const a = ip.toLowerCase().replace(/^\[|\]$/g, '');
    const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(a) ?? /^::(\d+\.\d+\.\d+\.\d+)$/.exec(a);
    if (mapped) return isPrivateAddress(mapped[1]!);
    if (/^::ffff:[0-9a-f]{1,4}:[0-9a-f]{1,4}$/.test(a)) {
      const [hi, lo] = a
        .slice(7)
        .split(':')
        .map((h) => Number.parseInt(h, 16));
      return isPrivateAddress(`${hi! >> 8}.${hi! & 255}.${lo! >> 8}.${lo! & 255}`);
    }
    return (
      a === '::' ||
      a === '::1' ||
      /^f[cd]/.test(a) || // unique local fc00::/7
      /^fe[89ab]/.test(a) || // link-local fe80::/10
      /^ff/.test(a) || // multicast
      /^2001:db8/.test(a) || // documentation
      /^64:ff9b:1:/.test(a)
    );
  }
  return true; // not an IP at all: treat as unsafe
}

/**
 * DNS lookup that refuses non-public answers. It runs at connect time for every connection, so a hostname that
 * re-resolves to a private address between checks (DNS rebinding) is still refused.
 */
function guardedLookup(allowPrivate: boolean) {
  return (
    hostname: string,
    options: { all?: boolean; family?: number } | number,
    callback: (err: NodeJS.ErrnoException | null, address: string | LookupAddress[], family?: number) => void,
  ) => {
    const opts = typeof options === 'number' ? { family: options } : (options ?? {});
    dnsLookup(hostname, { ...opts, all: true }, (err, addresses) => {
      if (err) return callback(err, '', 0);
      const list = addresses as LookupAddress[];
      if (!allowPrivate && list.some((a) => isPrivateAddress(a.address))) {
        const e = new Error(`${hostname} resolves to a private or local address`) as NodeJS.ErrnoException;
        e.code = 'EBLOCKED';
        return callback(e, '', 0);
      }
      if (opts.all) return callback(null, list);
      const first = list[0];
      if (!first) return callback(new Error(`No address for ${hostname}`) as NodeJS.ErrnoException, '', 0);
      callback(null, first.address, first.family);
    });
  };
}

function checkUrl(raw: string, allowPrivate: boolean): URL {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    throw new MarkiloError('INVALID_INPUT', `Not a valid URL: ${raw}`);
  }
  if (u.protocol !== 'https:' && u.protocol !== 'http:')
    throw new MarkiloError('INVALID_INPUT', `Only http(s) URLs are supported (got ${u.protocol}).`);
  if (u.username || u.password)
    throw new MarkiloError('INVALID_INPUT', 'URLs with embedded credentials are not allowed.');
  const host = u.hostname.replace(/^\[|\]$/g, '');
  if (
    !allowPrivate &&
    (isIP(host) ? isPrivateAddress(host) : /^(localhost|.*\.localhost|.*\.local|.*\.internal)$/i.test(host))
  ) {
    throw new MarkiloError(
      'BLOCKED_ADDRESS',
      `${u.hostname} is a local or private address.`,
      'Pass --allow-private only for your own local development server.',
    );
  }
  return u;
}

function requestOnce(
  u: URL,
  opts: GetOptions,
): Promise<{ status: number; headers: http.IncomingHttpHeaders; body: Uint8Array; truncated: boolean }> {
  const lib = u.protocol === 'https:' ? https : http;
  const max = opts.maxBytes ?? 3_000_000;
  return new Promise((resolvePromise, reject) => {
    const req = lib.request(
      u,
      {
        method: 'GET',
        headers: {
          'user-agent': USER_AGENT,
          accept: opts.accept ?? 'text/html,application/xhtml+xml,text/css,*/*;q=0.5',
          'accept-encoding': 'gzip, deflate, br',
        },
        lookup: guardedLookup(opts.allowPrivate ?? false) as never,
        timeout: opts.timeoutMs ?? 15_000,
      },
      (res) => {
        const status = res.statusCode ?? 0;
        if (status >= 300 && status < 400 && res.headers.location) {
          res.resume();
          return resolvePromise({ status, headers: res.headers, body: new Uint8Array(0), truncated: false });
        }
        const enc = String(res.headers['content-encoding'] ?? '').toLowerCase();
        const stream =
          enc === 'gzip'
            ? res.pipe(createGunzip())
            : enc === 'deflate'
              ? res.pipe(createInflate())
              : enc === 'br'
                ? res.pipe(createBrotliDecompress())
                : res;
        const chunks: Buffer[] = [];
        let total = 0;
        let truncated = false;
        stream.on('data', (c: Buffer) => {
          if (truncated) return;
          if (total + c.length > max) {
            chunks.push(c.subarray(0, max - total));
            total = max;
            truncated = true;
            req.destroy();
            resolvePromise({
              status,
              headers: res.headers,
              body: new Uint8Array(Buffer.concat(chunks)),
              truncated,
            });
            return;
          }
          chunks.push(c);
          total += c.length;
        });
        stream.on('end', () =>
          resolvePromise({
            status,
            headers: res.headers,
            body: new Uint8Array(Buffer.concat(chunks)),
            truncated,
          }),
        );
        stream.on('error', (e) => (truncated ? undefined : reject(e)));
      },
    );
    req.on('timeout', () => req.destroy(new Error('timed out')));
    req.on('error', reject);
    req.end();
  });
}

/**
 * GET with SSRF protection: http(s) only, no credentials in URLs, no private/local targets (checked on the URL and on
 * every DNS answer at connect time), redirects followed manually and re-checked (max 5), decoded size limit.
 */
export async function safeGet(raw: string, opts: GetOptions): Promise<GetResult> {
  if (!opts.allowNetwork) {
    throw new MarkiloError(
      'NETWORK_DISABLED',
      'Network access is off.',
      'Re-run with --allow-network after the user agrees to Markilo fetching this site.',
    );
  }
  const redirects: string[] = [];
  let u = checkUrl(raw, opts.allowPrivate ?? false);
  for (let hop = 0; ; hop++) {
    let r: Awaited<ReturnType<typeof requestOnce>>;
    try {
      r = await requestOnce(u, opts);
    } catch (err) {
      const e = err as NodeJS.ErrnoException;
      if (e.code === 'EBLOCKED')
        throw new MarkiloError(
          'BLOCKED_ADDRESS',
          e.message,
          'Pass --allow-private only for your own local development server.',
        );
      throw new MarkiloError('NETWORK', `Could not fetch ${u.toString()}: ${e.message}`);
    }
    if (r.status >= 300 && r.status < 400 && r.headers.location) {
      if (hop >= (opts.maxRedirects ?? 5))
        throw new MarkiloError('NETWORK', `Too many redirects from ${raw}.`);
      const next = new URL(String(r.headers.location), u);
      redirects.push(next.toString());
      u = checkUrl(next.toString(), opts.allowPrivate ?? false);
      continue;
    }
    return {
      url: u.toString(),
      status: r.status,
      contentType: String(r.headers['content-type'] ?? ''),
      body: r.body,
      truncated: r.truncated,
      redirects,
    };
  }
}
