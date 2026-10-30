import { MarkiloError } from '../core/errors.js';
import { extractCssSignals, extractHtmlSignals } from './repo.js';

export const USER_AGENT =
  'MarkiloBot/0.1 (+https://github.com/cihantopac/markilo; brand research on behalf of a user)';

export interface FetchOptions {
  allowNetwork: boolean;
  timeoutMs?: number;
  maxBytes?: number;
}

export interface FetchedText {
  url: string;
  status: number;
  contentType: string;
  text: string;
}

function assertHttpUrl(raw: string): URL {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    throw new MarkiloError('INVALID_INPUT', `Not a valid URL: ${raw}`);
  }
  if (u.protocol !== 'https:' && u.protocol !== 'http:')
    throw new MarkiloError('INVALID_INPUT', 'Only http(s) URLs are supported.');
  return u;
}

async function fetchLimited(url: string, opts: FetchOptions): Promise<{ res: Response; body: Uint8Array }> {
  if (!opts.allowNetwork) {
    throw new MarkiloError(
      'NETWORK_DISABLED',
      'Network access is off.',
      'Re-run with --allow-network after the user agrees to Markilo fetching this site.',
    );
  }
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), opts.timeoutMs ?? 15_000);
  try {
    const res = await fetch(url, {
      headers: { 'user-agent': USER_AGENT, accept: 'text/html,text/css,*/*;q=0.5' },
      redirect: 'follow',
      signal: ctrl.signal,
    });
    const max = opts.maxBytes ?? 3_000_000;
    const reader = res.body?.getReader();
    const chunks: Uint8Array[] = [];
    let total = 0;
    if (reader) {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        total += value.length;
        if (total > max) {
          await reader.cancel();
          break;
        }
        chunks.push(value);
      }
    }
    const body = new Uint8Array(Math.min(total, max));
    let off = 0;
    for (const c of chunks) {
      body.set(c.subarray(0, Math.min(c.length, body.length - off)), off);
      off += c.length;
      if (off >= body.length) break;
    }
    return { res, body };
  } catch (err) {
    if (err instanceof MarkiloError) throw err;
    throw new MarkiloError('NETWORK', `Could not fetch ${url}: ${(err as Error).message}`);
  } finally {
    clearTimeout(timer);
  }
}

export async function fetchText(url: string, opts: FetchOptions): Promise<FetchedText> {
  const { res, body } = await fetchLimited(url, opts);
  return {
    url: res.url || url,
    status: res.status,
    contentType: res.headers.get('content-type') ?? '',
    text: new TextDecoder().decode(body),
  };
}

export async function fetchBinary(
  url: string,
  opts: FetchOptions,
): Promise<{ url: string; status: number; contentType: string; body: Uint8Array }> {
  const { res, body } = await fetchLimited(url, { ...opts, maxBytes: opts.maxBytes ?? 2_000_000 });
  return {
    url: res.url || url,
    status: res.status,
    contentType: res.headers.get('content-type') ?? '',
    body,
  };
}

/** Minimal robots.txt evaluation for our user agent and "*": longest matching Allow/Disallow prefix wins. */
export function robotsAllows(robots: string, path: string, agent = 'markilobot'): boolean {
  const groups: { agents: string[]; rules: { allow: boolean; path: string }[] }[] = [];
  let current: (typeof groups)[number] | undefined;
  let lastWasAgent = false;
  for (const raw of robots.split(/\r?\n/)) {
    const line = raw.replace(/#.*/, '').trim();
    const idx = line.indexOf(':');
    if (idx < 0) continue;
    const key = line.slice(0, idx).trim().toLowerCase();
    const value = line.slice(idx + 1).trim();
    if (key === 'user-agent') {
      if (!current || !lastWasAgent) {
        current = { agents: [], rules: [] };
        groups.push(current);
      }
      current.agents.push(value.toLowerCase());
      lastWasAgent = true;
    } else if ((key === 'allow' || key === 'disallow') && current) {
      lastWasAgent = false;
      if (value || key === 'allow') current.rules.push({ allow: key === 'allow', path: value });
    } else lastWasAgent = false;
  }
  const specific = groups.filter((g) => g.agents.some((a) => a !== '*' && agent.includes(a)));
  const applicable = specific.length ? specific : groups.filter((g) => g.agents.includes('*'));
  let best: { allow: boolean; len: number } = { allow: true, len: -1 };
  for (const g of applicable)
    for (const r of g.rules) {
      if (!r.path) continue;
      const pattern = r.path.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*');
      const re = new RegExp(`^${pattern.endsWith('\\$') ? `${pattern.slice(0, -2)}$` : pattern}`);
      if (re.test(path) && r.path.length > best.len) best = { allow: r.allow, len: r.path.length };
    }
  return best.allow;
}

export interface SiteScan {
  url: string;
  finalUrl: string;
  retrievedAt: string;
  status: number;
  title?: string;
  description?: string;
  siteName?: string;
  themeColor?: string;
  ogImage?: string;
  headings: string[];
  icons: { rel: string; href: string; sizes?: string }[];
  logoCandidates: { href: string; hint: string }[];
  inlineSvgLogos: number;
  manifest?: string;
  colors: { hex: string; count: number }[];
  fonts: string[];
  stylesheetsRead: string[];
  language?: string;
}

const abs = (href: string, base: string) => {
  try {
    return new URL(href, base).toString();
  } catch {
    return href;
  }
};

/** Fetches one page (plus up to three same-origin stylesheets) and extracts identity signals. */
export async function scanSite(rawUrl: string, opts: FetchOptions): Promise<SiteScan> {
  const u = assertHttpUrl(rawUrl);
  try {
    const robots = await fetchText(`${u.origin}/robots.txt`, { ...opts, maxBytes: 200_000 });
    if (robots.status < 400 && !robotsAllows(robots.text, u.pathname || '/')) {
      throw new MarkiloError(
        'ROBOTS_DISALLOWED',
        `${u.origin}/robots.txt disallows ${u.pathname} for automated agents.`,
        'Ask the user for screenshots or files instead.',
      );
    }
  } catch (err) {
    if (err instanceof MarkiloError && (err.code === 'ROBOTS_DISALLOWED' || err.code === 'NETWORK_DISABLED'))
      throw err;
    // robots.txt unreachable: proceed, as crawlers conventionally do.
  }
  const page = await fetchText(u.toString(), opts);
  if (page.status >= 400) throw new MarkiloError('NETWORK', `${u} returned HTTP ${page.status}.`);
  const html = page.text;
  const base = page.url;
  const h = extractHtmlSignals(html);

  const icons: SiteScan['icons'] = [];
  for (const m of html.matchAll(/<link\b[^>]*>/gi)) {
    const tag = m[0];
    const rel = /rel=["']([^"']+)["']/i.exec(tag)?.[1]?.toLowerCase() ?? '';
    const href = /href=["']([^"']+)["']/i.exec(tag)?.[1];
    if (!href) continue;
    if (/icon|mask-icon/.test(rel)) {
      const sizes = /sizes=["']([^"']+)["']/i.exec(tag)?.[1];
      icons.push({ rel, href: abs(href, base), ...(sizes ? { sizes } : {}) });
    }
  }
  const manifestHref = /<link[^>]+rel=["']manifest["'][^>]*href=["']([^"']+)["']/i.exec(html)?.[1];

  const logoCandidates: SiteScan['logoCandidates'] = [];
  for (const m of html.matchAll(/<img\b[^>]*>/gi)) {
    const tag = m[0];
    const src = /src=["']([^"']+)["']/i.exec(tag)?.[1];
    if (src && /logo|brand|wordmark/i.test(tag))
      logoCandidates.push({
        href: abs(src, base),
        hint: (/alt=["']([^"']*)["']/i.exec(tag)?.[1] ?? 'img').slice(0, 80),
      });
  }
  const inlineSvgLogos = [...html.matchAll(/<svg\b[^>]*(?:logo|brand)[^>]*>/gi)].length;

  let css = [...html.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/gi)].map((m) => m[1]).join('\n');
  css += [...html.matchAll(/style=["']([^"']+)["']/gi)].map((m) => m[1]).join(';');
  const stylesheetsRead: string[] = [];
  for (const m of html.matchAll(/<link\b[^>]*rel=["']stylesheet["'][^>]*>/gi)) {
    if (stylesheetsRead.length >= 3) break;
    const href = /href=["']([^"']+)["']/i.exec(m[0])?.[1];
    if (!href) continue;
    const full = abs(href, base);
    if (new URL(full).origin !== new URL(base).origin && !/fonts\.googleapis\.com/.test(full)) continue;
    try {
      const sheet = await fetchText(full, { ...opts, maxBytes: 1_000_000 });
      if (sheet.status < 400) {
        css += `\n${sheet.text}`;
        stylesheetsRead.push(full);
      }
    } catch {
      // A failing stylesheet should not fail the scan.
    }
  }
  const sig = extractCssSignals(
    `${css}\n${
      html
        .match(/fonts\.googleapis\.com[^"']+/g)
        ?.map((x) => `url(${x})`)
        .join('\n') ?? ''
    }`,
  );
  const counts = new Map<string, number>();
  for (const c of sig.colors) counts.set(c, (counts.get(c) ?? 0) + 1);
  const headings = [...html.matchAll(/<h[12][^>]*>([\s\S]*?)<\/h[12]>/gi)]
    .map((m) =>
      m[1]!
        .replace(/<[^>]+>/g, ' ')
        .replace(/\s+/g, ' ')
        .trim(),
    )
    .filter(Boolean)
    .slice(0, 8);

  return {
    url: rawUrl,
    finalUrl: page.url,
    retrievedAt: new Date().toISOString(),
    status: page.status,
    ...(h.title ? { title: h.title } : {}),
    ...(h.description ? { description: h.description } : {}),
    ...(h.siteName ? { siteName: h.siteName } : {}),
    ...(h.themeColor ? { themeColor: h.themeColor } : {}),
    ...(h.ogImage ? { ogImage: abs(h.ogImage, base) } : {}),
    headings,
    icons,
    logoCandidates: logoCandidates.slice(0, 10),
    inlineSvgLogos,
    ...(manifestHref ? { manifest: abs(manifestHref, base) } : {}),
    colors: [...counts.entries()]
      .filter(([c]) => c !== '#ffffff' && c !== '#000000')
      .sort((a, b) => b[1] - a[1])
      .slice(0, 12)
      .map(([hex, count]) => ({ hex, count })),
    fonts: [...new Set(sig.fonts)].slice(0, 10),
    stylesheetsRead,
    ...(/<html[^>]*lang=["']([^"']+)["']/i.exec(html)?.[1]
      ? { language: /<html[^>]*lang=["']([^"']+)["']/i.exec(html)![1]! }
      : {}),
  };
}
