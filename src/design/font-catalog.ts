import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import * as fontkit from 'fontkit';
import { MarkiloError } from '../core/errors.js';
import { writeFileSafe, writeJson } from '../core/fsx.js';
import { slugify } from '../core/paths.js';
import { type GetOptions, safeGet } from '../net/http.js';
import { type FontFamilyInfo, registerFontDir } from './fonts.js';

/** Licenses that allow commercial use and embedding in outlined logos without restrictions. */
export const OPEN_FONT_LICENSES = ['OFL-1.1', 'Apache-2.0', 'UFL-1.0', 'MIT', 'CC0-1.0'];
const API = 'https://api.fontsource.org/v1/fonts';

interface CatalogEntry {
  id: string;
  family: string;
  subsets: string[];
  weights: number[];
  styles: string[];
  category: string;
  license: string;
  type?: string;
}

async function getJson<T>(url: string, opts: GetOptions): Promise<T> {
  const r = await safeGet(url, { ...opts, maxBytes: 8_000_000, accept: 'application/json' });
  if (r.status >= 400) throw new MarkiloError('NETWORK', `${url} returned HTTP ${r.status}.`);
  try {
    return JSON.parse(new TextDecoder().decode(r.body)) as T;
  } catch {
    throw new MarkiloError('NETWORK', `${url} did not return JSON.`);
  }
}

/** Searches the Fontsource catalog (Google Fonts and other open-source families). */
export async function searchFonts(
  query: string,
  opts: GetOptions & { category?: string; subset?: string; limit?: number },
): Promise<CatalogEntry[]> {
  const all = await getJson<CatalogEntry[]>(API, opts);
  const q = query.toLowerCase();
  return all
    .filter((f) => OPEN_FONT_LICENSES.includes(f.license))
    .filter((f) => !q || f.family.toLowerCase().includes(q) || f.id.includes(q) || f.category === q)
    .filter((f) => !opts.category || f.category === opts.category)
    .filter((f) => !opts.subset || f.subsets.includes(opts.subset))
    .slice(0, opts.limit ?? 25);
}

/**
 * Downloads an open-licensed family from Fontsource into <workspace>/fonts and registers it, so
 * `markilo wordmark --font <id>` can use it. Only latin + latin-ext (plus requested subsets), WOFF format.
 */
export async function addFont(
  fontsRoot: string,
  idOrFamily: string,
  opts: GetOptions & { weights?: number[]; subsets?: string[] },
): Promise<FontFamilyInfo> {
  const id = slugify(idOrFamily);
  const meta = await getJson<
    CatalogEntry & { variants: Record<string, Record<string, Record<string, { url: { woff?: string } }>>> }
  >(`${API}/${id}`, opts);
  if (!OPEN_FONT_LICENSES.includes(meta.license)) {
    throw new MarkiloError(
      'INVALID_INPUT',
      `${meta.family} is licensed ${meta.license}; Markilo only adds ${OPEN_FONT_LICENSES.join(', ')} fonts.`,
    );
  }
  const weights = (opts.weights?.length ? opts.weights : [400, 500, 600, 700]).filter((w) =>
    meta.weights.includes(w),
  );
  if (!weights.length)
    throw new MarkiloError('INVALID_INPUT', `${meta.family} has weights ${meta.weights.join(', ')}.`);
  const subsets = [...new Set(['latin', 'latin-ext', ...(opts.subsets ?? [])])].filter((s) =>
    meta.subsets.includes(s),
  );
  const dir = join(fontsRoot, id);
  const files: Record<string, string[]> = {};
  for (const w of weights) {
    files[String(w)] = [];
    for (const sub of subsets) {
      const url = meta.variants[String(w)]?.normal?.[sub]?.url.woff;
      if (!url) continue;
      const r = await safeGet(url, { ...opts, maxBytes: 3_000_000, accept: 'font/woff,*/*' });
      if (r.status >= 400) throw new MarkiloError('NETWORK', `Could not download ${url} (HTTP ${r.status}).`);
      try {
        fontkit.create(r.body); // refuse anything that is not a parseable font
      } catch {
        throw new MarkiloError('INVALID_INPUT', `${url} is not a valid font file.`);
      }
      const name = `${id}-${sub}-${w}-normal.woff`;
      writeFileSafe(join(dir, name), r.body, { force: true });
      files[String(w)]!.push(`${id}/${name}`);
    }
  }
  // License text: Google Fonts keeps OFL.txt per family; fall back to a pointer when it is not there.
  let licenseFile = `${id}/LICENSE.txt`;
  const gf = meta.family.toLowerCase().replace(/[^a-z0-9]/g, '');
  const lic = await safeGet(`https://raw.githubusercontent.com/google/fonts/main/ofl/${gf}/OFL.txt`, {
    ...opts,
    maxBytes: 200_000,
  }).catch(() => undefined);
  if (lic && lic.status < 400) {
    licenseFile = `${id}/OFL.txt`;
    writeFileSafe(join(dir, 'OFL.txt'), lic.body, { force: true });
  } else {
    writeFileSafe(
      join(dir, 'LICENSE.txt'),
      `${meta.family} is licensed under ${meta.license}.\nSource: https://fontsource.org/fonts/${id}\n`,
      { force: true },
    );
  }
  const info: FontFamilyInfo = {
    id,
    family: meta.family,
    category: meta.category,
    role: `added from Fontsource (${meta.type ?? 'open source'})`,
    license: meta.license,
    licenseFile,
    commercialUse: 'Open license: commercial use allowed; outlined logos carry no font obligations.',
    source: `https://fontsource.org/fonts/${id}`,
    weights,
    files,
  };
  const regFile = join(fontsRoot, 'fonts.json');
  const reg = existsSync(regFile)
    ? (JSON.parse(readFileSync(regFile, 'utf8')) as { families: FontFamilyInfo[] })
    : { families: [] };
  reg.families = [...reg.families.filter((f) => f.id !== id), info];
  writeJson(regFile, { generatedBy: 'markilo fonts add', families: reg.families });
  registerFontDir(fontsRoot);
  return info;
}
