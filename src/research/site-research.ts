import { join } from 'node:path';
import { hexToOklch } from '../analyze/color.js';
import { type MarkSample, sampleFromRaster, sampleFromSvg } from '../analyze/mark.js';
import { writeGenerated, writeJson } from '../core/fsx.js';
import type { Workspace } from '../core/workspace.js';
import { sanitizeSvg } from '../svg/sanitize.js';
import { addReference } from './competitors.js';
import { addFinding, mergeSiteScan } from './profile.js';
import {
  type CrawlOptions,
  type FetchOptions,
  fetchBinary,
  robotsGate,
  type SiteScan,
  scanSite,
} from './site.js';

export interface SiteResearchOptions extends CrawlOptions {
  /** Save icon and logo candidates into research/cache/ and inline logos as `existing` references. */
  downloadAssets?: boolean;
}

export interface SiteResearchResult {
  scan: SiteScan;
  sourceId: string;
  findingsAdded: number;
  gapsAdded: number;
  saved: string[];
  references: { id: string; duplicate: boolean }[];
  /** The main chromatic colour of each identity surface that could be read. */
  identityColors: { favicon?: string; headerLogo?: string; ogImage?: string };
  issues: string[];
  /** The name as the site writes it, when that differs from the name recorded at `brand add`. */
  suggest?: { name: string };
}

/** The first clearly coloured (not grey, white or black) colour of a mark. */
export function chromaticColor(colors: string[]): string | undefined {
  return colors.find((c) => {
    try {
      const o = hexToOklch(c);
      return o.c >= 0.06 && o.l > 0.15 && o.l < 0.97;
    } catch {
      return false;
    }
  });
}

const hueGap = (a: string, b: string) => {
  const d = Math.abs(hexToOklch(a).h - hexToOklch(b).h);
  return d > 180 ? 360 - d : d;
};

async function sampleUrl(
  url: string,
  opts: FetchOptions,
  allowed: (u: string) => Promise<boolean>,
): Promise<MarkSample | undefined> {
  if (!(await allowed(url))) return undefined;
  const bin = await fetchBinary(url, opts);
  if (bin.status >= 400) return undefined;
  if (/svg/i.test(bin.contentType) || /\.svg(\?|$)/i.test(bin.url))
    return sampleFromSvg(sanitizeSvg(new TextDecoder().decode(bin.body)), { id: 'probe' });
  if (/png|jpe?g/i.test(bin.contentType)) return sampleFromRaster(bin.body, { id: 'probe' });
  return undefined;
}

/** The colour of the favicon, the header logo and the og:image, so a site whose surfaces disagree is reported. */
async function identityColorsOf(
  scan: SiteScan,
  opts: FetchOptions,
  allowed: (u: string) => Promise<boolean>,
): Promise<SiteResearchResult['identityColors']> {
  const out: SiteResearchResult['identityColors'] = {};
  const tryColor = async (get: () => Promise<MarkSample | undefined>) => {
    try {
      const s = await get();
      return s ? chromaticColor(s.colors) : undefined;
    } catch {
      return undefined;
    }
  };
  const logo = scan.inlineLogoSvgs[0];
  if (logo) {
    const c = await tryColor(() => sampleFromSvg(logo, { id: 'probe' }));
    if (c) out.headerLogo = c;
  }
  const favicon =
    scan.icons.find((i) => /(^|\s)icon\b/.test(i.rel) && /\.svg(\?|$)/i.test(i.href)) ??
    [...scan.icons]
      .filter((i) => !/mask-icon/.test(i.rel) && !/\.ico(\?|$)/i.test(i.href))
      .sort((a, b) => Number.parseInt(b.sizes ?? '0', 10) - Number.parseInt(a.sizes ?? '0', 10))[0];
  const fav = favicon ? await tryColor(() => sampleUrl(favicon.href, opts, allowed)) : undefined;
  const iconColor = chromaticColor((scan.iconColors ?? []).map((c) => c.hex));
  if (fav ?? iconColor) out.favicon = (fav ?? iconColor)!;
  if (scan.ogImage) {
    const og = scan.ogImage;
    const c = await tryColor(() => sampleUrl(og, { ...opts, maxBytes: 2_000_000 }, allowed));
    if (c) out.ogImage = c;
  }
  return out;
}

/**
 * Researches the brand's own website: scans it, merges the identity it finds into the profile (colours, icon colours,
 * dark theme, inline logos), reports surfaces that disagree in colour and, with downloadAssets, saves the icons and
 * logos. One unusable asset never stops the rest.
 */
export async function researchSite(
  ws: Workspace,
  brand: string,
  url: string,
  opts: SiteResearchOptions,
): Promise<SiteResearchResult> {
  const scan = await scanSite(url, opts);
  const p = ws.profile(brand);
  const merged = mergeSiteScan(p, scan);
  const issues = [...(scan.logoIssues ?? [])];
  const net: FetchOptions = {
    allowNetwork: opts.allowNetwork,
    ...(opts.allowPrivate ? { allowPrivate: true } : {}),
    ...(opts.timeoutMs ? { timeoutMs: opts.timeoutMs } : {}),
  };
  const allowed = robotsGate(net);
  const identityColors = await identityColorsOf(scan, net, allowed);
  const named = Object.entries(identityColors) as [string, string][];
  const clash = named.some(([, a], i) => named.slice(i + 1).some(([, b]) => hueGap(a, b) > 45));
  if (clash) {
    const label: Record<string, string> = {
      favicon: 'favicon',
      headerLogo: 'header logo',
      ogImage: 'og:image',
    };
    addFinding(p, {
      topic: 'visual-identity',
      statement: `identity inconsistency: ${named.map(([k, v]) => `${label[k]} ${v}`).join(', ')} disagree in colour. Ask which one is current before building on it.`,
      status: 'observed',
      sourceIds: [merged.source.id],
    });
  }

  const saved: string[] = [];
  const references: SiteResearchResult['references'] = [];
  if (opts.downloadAssets) {
    const host = new URL(scan.finalUrl).hostname.replace(/[^a-z0-9.-]/gi, '_');
    for (const [i, svg] of scan.inlineLogoSvgs.entries()) {
      try {
        const clean = sanitizeSvg(svg);
        const out = join(ws.cacheDir(brand), host, `inline-logo-${i}.svg`);
        writeGenerated(out, clean);
        saved.push(out);
        references.push(
          await addReference(ws, brand, {
            name: `${scan.siteName ?? host} logo`,
            source: scan.finalUrl,
            bytes: new TextEncoder().encode(clean),
            ext: '.svg',
            category: 'existing',
            retrievedAt: scan.retrievedAt,
            notes: 'existing logo (inline SVG on the site)',
          }),
        );
      } catch (err) {
        issues.push(`inline SVG logo ${i + 1} skipped: ${(err as Error).message.slice(0, 80)}`);
      }
    }
    const urls = [
      ...scan.icons.map((i) => i.href),
      ...scan.logoCandidates.map((l) => l.href),
      ...(scan.organization?.logo ? [scan.organization.logo] : []),
      ...(scan.ogImage ? [scan.ogImage] : []),
    ].slice(0, 12);
    for (const [i, u] of urls.entries()) {
      try {
        if (!(await allowed(u))) {
          issues.push(`${u.slice(0, 80)} disallowed by robots.txt`);
          continue;
        }
        const bin = await fetchBinary(u, net);
        if (bin.status >= 400 || !/image\//.test(bin.contentType)) continue;
        const ext = bin.contentType.includes('svg')
          ? '.svg'
          : bin.contentType.includes('png')
            ? '.png'
            : bin.contentType.includes('jpeg')
              ? '.jpg'
              : bin.contentType.includes('icon')
                ? '.ico'
                : '.bin';
        const out = join(ws.cacheDir(brand), host, `${String(i).padStart(2, '0')}-asset${ext}`);
        writeGenerated(out, ext === '.svg' ? sanitizeSvg(new TextDecoder().decode(bin.body)) : bin.body);
        saved.push(out);
      } catch (err) {
        issues.push(`${u.slice(0, 80)} skipped: ${(err as Error).message.slice(0, 60)}`);
      }
    }
  }
  ws.saveProfile(brand, p);
  writeJson(
    join(ws.cacheDir(brand), `site-${new URL(scan.finalUrl).hostname.replace(/[^a-z0-9.-]/gi, '_')}.json`),
    scan,
  );
  return {
    scan,
    sourceId: merged.source.id,
    findingsAdded: merged.added + (clash ? 1 : 0),
    gapsAdded: merged.gaps,
    saved,
    references,
    identityColors,
    issues,
    /** The name as the site writes it, when that differs from the name recorded at `brand add`. */
    ...(scan.nameCase && scan.nameCase.name !== ws.brand(brand).name
      ? { suggest: { name: scan.nameCase.name } }
      : {}),
  };
}
