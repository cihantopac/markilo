import { copyFileSync, existsSync, mkdirSync } from 'node:fs';
import { basename, dirname, extname, join, resolve } from 'node:path';
import { loadMark } from '../analyze/mark.js';
import { assessQuality } from '../analyze/quality.js';
import { compareMarks, genericity } from '../analyze/similarity.js';
import { MarkiloError } from '../core/errors.js';
import { isDir, nowIso, readText, writeFileSafe, writeGenerated, writeJson } from '../core/fsx.js';
import { isSlug, slugify } from '../core/paths.js';
import type {
  BrandRole,
  Brief,
  Concept,
  Confidence,
  FindingStatus,
  FindingTopic,
  Source,
} from '../core/types.js';
import { validateBrief } from '../core/validate.js';
import { Workspace } from '../core/workspace.js';
import { fontInfo, listFonts, loadBundledFace, loadFontFile } from '../design/fonts.js';
import { composeLockup } from '../design/lockup.js';
import { generatePalette } from '../design/palette.js';
import { wordmarkSvg } from '../design/wordmark.js';
import { EXPORT_GROUPS, type ExportGroup, exportBrand } from '../export/exporter.js';
import { finalizeConcept, lockIdentity } from '../export/kit.js';
import { buildGallery } from '../gallery/gallery.js';
import { compareNames, phoneticKey, pronunciationNotes } from '../name/similarity.js';
import { suggestNiceClasses, trademarkSearchPlan } from '../name/trademark.js';
import { renderPng } from '../render/resvg.js';
import { renderReviewSheet } from '../render/sheet.js';
import { buildOriginalityReport, readReferences, referenceIndexPath } from '../report/originality.js';
import { verifyConcept } from '../report/quality.js';
import { scanMonorepo } from '../research/monorepo.js';
import {
  addFinding,
  addSource,
  mergeRepoScan,
  mergeSiteScan,
  summarizeProfile,
} from '../research/profile.js';
import { DEFAULT_MAX_FILES, scanRepo, summarizeScan } from '../research/repo.js';
import { fetchBinary, scanSite } from '../research/site.js';
import { lintSvg } from '../svg/lint.js';
import { optimizeSvg } from '../svg/optimize.js';
import type { CommandSpec, RunContext } from './args.js';
import { doctor, installAssets, shortcut } from './system.js';

declare const __MARKILO_VERSION__: string;
export const VERSION = typeof __MARKILO_VERSION__ === 'string' ? __MARKILO_VERSION__ : '0.0.0-dev';

const ws = (c: RunContext) => Workspace.locate(c.cwd, c.str('workspace'));
const brandOpt = { brand: { type: 'string', short: 'b', description: 'Brand slug' } } as const;
const pos = (c: RunContext, i: number, label: string): string => {
  const v = c.positionals[i];
  if (!v) throw new MarkiloError('USAGE', `Missing <${label}>.`);
  return v;
};
const file = (c: RunContext, p: string) => resolve(c.cwd, p);

export const COMMANDS: CommandSpec[] = [
  // ------------------------------------------------------------ workspace
  {
    name: 'init',
    summary: 'Create a brand workspace (default ./brand). For multi-product families pass --family.',
    usage: 'init [--name <workspace name>] [--family <family name>] [--dir <path>]',
    options: {
      name: { type: 'string', description: 'Workspace name' },
      family: { type: 'string', description: 'Brand family name (enables a shared system)' },
      description: { type: 'string', description: 'Family description' },
      dir: { type: 'string', description: 'Directory to create (default ./brand)' },
    },
    async run(c) {
      const dir = resolve(c.cwd, c.str('dir') ?? c.str('workspace') ?? 'brand');
      const family = c.str('family');
      const w = Workspace.init(
        dir,
        c.str('name') ?? family ?? basename(c.cwd),
        family
          ? { name: family, ...(c.str('description') ? { description: c.str('description')! } : {}) }
          : undefined,
      );
      return {
        workspace: w.root,
        family: w.manifest.family ?? null,
        next: 'markilo brand add "<Brand Name>"',
      };
    },
  },
  {
    name: 'brand add',
    summary:
      'Register a brand or product. --locked preserves an existing identity exactly (it will never be redesigned).',
    usage:
      'brand add <name> [--slug <slug>] [--role master|product|sub-brand|endorsed] [--parent <slug>] [--locked]',
    options: {
      slug: { type: 'string', description: 'Folder-safe id (default: derived from the name)' },
      role: { type: 'string', description: 'master | product | sub-brand | endorsed' },
      parent: { type: 'string', description: 'Parent brand slug' },
      locked: { type: 'boolean', description: 'Preserve the existing identity; never redesign' },
    },
    async run(c) {
      const w = ws(c);
      const role = c.str('role') as BrandRole | undefined;
      const b = w.addBrand({
        name: pos(c, 0, 'name'),
        ...(c.str('slug') ? { slug: c.str('slug')! } : {}),
        ...(role ? { role } : {}),
        ...(c.str('parent') ? { parent: c.str('parent')! } : {}),
        locked: c.bool('locked'),
      });
      return { brand: b, files: { brief: w.briefPath(b.slug), profile: w.profilePath(b.slug) } };
    },
  },
  {
    name: 'brand list',
    summary: 'List brands in the workspace with their state.',
    usage: 'brand list',
    async run(c) {
      const w = ws(c);
      return {
        workspace: w.manifest.name,
        family: w.manifest.family ?? null,
        brands: w.manifest.brands.map((b) => ({
          ...b,
          concepts: w.concepts(b.slug).map((x) => `${x.id}:${x.status}`),
          approved: existsSync(join(w.finalDir(b.slug), 'brand.json')),
          exported: existsSync(join(w.exportsDir(b.slug), 'asset-manifest.json')),
        })),
      };
    },
  },
  {
    name: 'brief show',
    summary: 'Print a brand brief.',
    usage: 'brief show --brand <slug>',
    options: brandOpt,
    async run(c) {
      return ws(c).brief(c.req('brand'));
    },
  },
  {
    name: 'brief update',
    summary: 'Merge a JSON file (or inline JSON) into the brief and validate it.',
    usage: 'brief update --brand <slug> (--file <patch.json> | --json <json>)',
    options: {
      ...brandOpt,
      file: { type: 'string', description: 'JSON patch file' },
      json: { type: 'string', description: 'Inline JSON patch' },
    },
    async run(c) {
      const w = ws(c);
      const slug = c.req('brand');
      const patchText = c.str('file') ? readText(file(c, c.str('file')!)) : c.str('json');
      if (!patchText) throw new MarkiloError('USAGE', 'Provide --file or --json.');
      let patch: Partial<Brief>;
      try {
        patch = JSON.parse(patchText) as Partial<Brief>;
      } catch (err) {
        throw new MarkiloError('INVALID_INPUT', `Patch is not valid JSON: ${(err as Error).message}`);
      }
      const current = w.brief(slug);
      const merged: Brief = { ...current };
      for (const [k, v] of Object.entries(patch)) {
        const cur = (current as unknown as Record<string, unknown>)[k];
        (merged as unknown as Record<string, unknown>)[k] =
          v &&
          typeof v === 'object' &&
          !Array.isArray(v) &&
          cur &&
          typeof cur === 'object' &&
          !Array.isArray(cur)
            ? { ...cur, ...v }
            : v;
      }
      merged.schema = 'markilo/brief@1';
      merged.brand = slug;
      if (w.brand(slug).locked) merged.mode = 'evaluate';
      const issues = validateBrief(merged);
      if (issues.length) throw new MarkiloError('INVALID_INPUT', `Brief is invalid: ${issues.join('; ')}`);
      writeJson(w.briefPath(slug), merged);
      return { updated: Object.keys(patch), brief: merged };
    },
  },
  // ------------------------------------------------------------ research
  {
    name: 'research repo',
    summary:
      "Scan a repository folder for product and identity signals (logos, icon sets, design docs, colors, fonts) and record them in the Brand Intelligence Profile. Without <path>, scans the brief's codePaths.",
    usage: 'research repo [<path>] --brand <slug> [--full] [--max-files <n>]',
    options: {
      ...brandOpt,
      full: { type: 'boolean', description: 'Print the full scan instead of a summary' },
      'max-files': { type: 'string', description: 'File budget (default 25000)' },
    },
    async run(c) {
      const w = ws(c);
      const slug = c.req('brand');
      const paths = c.positionals.length ? [c.positionals[0]!] : (w.brief(slug).codePaths ?? []);
      if (!paths.length)
        throw new MarkiloError(
          'USAGE',
          'Give a <path> or set codePaths in the brief (research monorepo --register does this).',
        );
      const p = w.profile(slug);
      const results = [];
      for (const path of paths) {
        const scan = scanRepo(file(c, path), { maxFiles: c.num('max-files', DEFAULT_MAX_FILES)! });
        scan.root = path;
        const merged = mergeRepoScan(p, scan);
        writeJson(
          join(w.cacheDir(slug), `repo-${slugify(path.replace(/[\\/:]+/g, '-')).slice(0, 40)}.json`),
          scan,
        );
        results.push(
          c.bool('full')
            ? { source: merged.source.id, findingsAdded: merged.added, scan }
            : { source: merged.source.id, findingsAdded: merged.added, ...summarizeScan(scan) },
        );
      }
      w.saveProfile(slug, p);
      return results.length === 1 ? results[0] : results;
    },
  },
  {
    name: 'research monorepo',
    summary:
      'Find the sites, apps and packages of a monorepo and which deserve an identity. With --register, add them as brands (codePaths set); with --scan, also research each one.',
    usage:
      'research monorepo <path> [--register [--groups products,apps] [--parent <slug>] [--role <role>] [--lock a,b]] [--scan]',
    options: {
      register: { type: 'boolean', description: 'Add brandable packages as brands in the workspace' },
      groups: { type: 'string', description: 'Only these top-level folders (e.g. products,apps)' },
      parent: { type: 'string', description: 'Parent brand slug for registered brands' },
      role: {
        type: 'string',
        description: 'Role for registered brands (default: product for sites, sub-brand for apps)',
      },
      lock: { type: 'string', description: 'Slugs to register as locked (preserved, never redesigned)' },
      scan: { type: 'boolean', description: 'Run research repo for every registered brand' },
      all: { type: 'boolean', description: 'Include non-brandable packages (libraries, services)' },
    },
    async run(c) {
      const root = pos(c, 0, 'path');
      const mono = scanMonorepo(file(c, root));
      const groups = c.list('groups');
      const picked = mono.candidates.filter(
        (x) => (c.bool('all') || x.brandable) && (!groups.length || groups.includes(x.group)),
      );
      if (!c.bool('register')) {
        return {
          ...mono,
          candidates: mono.candidates.map(({ slug, path, group, kind, brandable, reason, title }) => ({
            slug,
            path,
            group,
            kind,
            brandable,
            reason,
            ...(title ? { title } : {}),
          })),
          next: `markilo research monorepo ${root} --register --groups ${Object.keys(mono.groups).join(',')} [--parent <slug>] [--lock <slugs>] --scan`,
        };
      }
      const w = ws(c);
      const locks = new Set(c.list('lock'));
      const registered: { slug: string; status: string; summary?: unknown }[] = [];
      for (const cand of picked) {
        const exists = w.manifest.brands.some((b) => b.slug === cand.slug);
        const codePath = join(root, cand.path);
        if (!exists) {
          const role =
            (c.str('role') as BrandRole | undefined) ?? (cand.kind === 'app' ? 'sub-brand' : 'product');
          w.addBrand({
            name: cand.title && cand.title.length <= 40 ? cand.title : cand.name,
            slug: cand.slug,
            role,
            ...(c.str('parent') ? { parent: c.str('parent')! } : {}),
            locked: locks.has(cand.slug),
          });
        }
        const brief = w.brief(cand.slug);
        if (!brief.codePaths?.includes(codePath))
          writeJson(w.briefPath(cand.slug), { ...brief, codePaths: [...(brief.codePaths ?? []), codePath] });
        const entry: { slug: string; status: string; summary?: unknown } = {
          slug: cand.slug,
          status: exists ? 'existing' : locks.has(cand.slug) ? 'added (locked)' : 'added',
        };
        if (c.bool('scan')) {
          const scan = scanRepo(file(c, codePath));
          scan.root = codePath;
          const prof = w.profile(cand.slug);
          mergeRepoScan(prof, scan);
          w.saveProfile(cand.slug, prof);
          entry.summary = summarizeScan(scan);
        }
        registered.push(entry);
      }
      for (const l of locks)
        if (!picked.some((x) => x.slug === l))
          registered.push({ slug: l, status: 'not found among candidates' });
      return {
        registered,
        note: 'Locked brands still need their existing files: markilo lock --brand <slug> --symbol … --primary …',
      };
    },
  },
  {
    name: 'research site',
    summary:
      'Fetch one web page (+ up to 3 same-origin stylesheets) and record identity signals. Requires --allow-network.',
    usage: 'research site <url> --brand <slug> --allow-network [--download-assets]',
    options: {
      ...brandOpt,
      'allow-network': { type: 'boolean', description: 'Permit network access (ask the user first)' },
      'download-assets': {
        type: 'boolean',
        description: 'Save icon and logo candidates into research/cache/',
      },
    },
    async run(c) {
      const w = ws(c);
      const slug = c.req('brand');
      const net = { allowNetwork: c.bool('allow-network') };
      const scan = await scanSite(pos(c, 0, 'url'), net);
      const p = w.profile(slug);
      const merged = mergeSiteScan(p, scan);
      const saved: string[] = [];
      if (c.bool('download-assets')) {
        const host = new URL(scan.finalUrl).hostname.replace(/[^a-z0-9.-]/gi, '_');
        const urls = [
          ...scan.icons.map((i) => i.href),
          ...scan.logoCandidates.map((l) => l.href),
          ...(scan.ogImage ? [scan.ogImage] : []),
        ].slice(0, 12);
        for (const [i, u] of urls.entries()) {
          try {
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
            const out = join(
              w.cacheDir(slug),
              host,
              `${String(i).padStart(2, '0')}-${
                basename(new URL(u).pathname)
                  .replace(/[^a-z0-9._-]/gi, '_')
                  .slice(0, 40) || 'asset'
              }${extname(new URL(u).pathname) ? '' : ext}`,
            );
            writeGenerated(out, bin.body);
            saved.push(out);
          } catch {
            // Skip assets that fail; the page scan already succeeded.
          }
        }
        if (saved.length)
          addSource(p, {
            type: 'url',
            ref: scan.finalUrl,
            notes: `${saved.length} icon/logo files cached for analysis`,
          });
      }
      w.saveProfile(slug, p);
      writeJson(
        join(w.cacheDir(slug), `site-${new URL(scan.finalUrl).hostname.replace(/[^a-z0-9.-]/gi, '_')}.json`),
        scan,
      );
      const digest = c.bool('full')
        ? scan
        : {
            url: scan.finalUrl,
            title: scan.title,
            description: scan.description,
            themeColor: scan.themeColor,
            headings: scan.headings.slice(0, 4),
            colors: scan.colors.slice(0, 6).map((x) => x.hex),
            fonts: scan.fonts,
            icons: scan.icons.length,
            logoCandidates: scan.logoCandidates.length + scan.inlineSvgLogos,
            language: scan.language,
          };
      return {
        source: merged.source.id,
        findingsAdded: merged.added,
        scan: digest,
        cachedAssets: saved.length,
      };
    },
  },
  {
    name: 'profile show',
    summary: 'Show the Brand Intelligence Profile (summary by default, --full for everything).',
    usage: 'profile show --brand <slug> [--full] [--topic <topic>]',
    options: {
      ...brandOpt,
      full: { type: 'boolean', description: 'Print all findings and sources' },
      topic: { type: 'string', description: 'Filter findings by topic' },
    },
    async run(c) {
      const p = ws(c).profile(c.req('brand'));
      if (c.bool('full')) return p;
      const t = c.str('topic');
      return {
        ...summarizeProfile(p),
        ...(t ? { findings: p.findings.filter((f) => f.topic === t), sources: p.sources } : {}),
      };
    },
  },
  {
    name: 'profile add-source',
    summary: 'Record a source (url, search, registry query, file, user statement) with its retrieval date.',
    usage:
      'profile add-source --brand <slug> --type url|search|registry|file|user|repo --ref <url or description> [--notes <text>] [--date <ISO>]',
    options: {
      ...brandOpt,
      type: { type: 'string', description: 'Source type' },
      ref: { type: 'string', description: 'URL, query or reference' },
      notes: { type: 'string', description: 'What was found' },
      date: { type: 'string', description: 'Retrieval date (default: now)' },
    },
    async run(c) {
      const w = ws(c);
      const slug = c.req('brand');
      const type = c.req('type') as Source['type'];
      if (!['url', 'repo', 'file', 'user', 'search', 'registry'].includes(type))
        throw new MarkiloError('USAGE', 'Invalid --type.');
      const p = w.profile(slug);
      const s = addSource(p, {
        type,
        ref: c.req('ref'),
        ...(c.str('notes') ? { notes: c.str('notes')! } : {}),
        ...(c.str('date') ? { retrievedAt: new Date(c.str('date')!).toISOString() } : {}),
      });
      w.saveProfile(slug, p);
      return s;
    },
  },
  {
    name: 'profile add-finding',
    summary:
      'Record a finding. "observed"/"verified" findings must cite sources; use "inferred" for reasoning.',
    usage:
      'profile add-finding --brand <slug> --topic <topic> --status observed|inferred|verified|user-provided --statement <text> [--source S1,S2] [--confidence low|medium|high]',
    options: {
      ...brandOpt,
      topic: {
        type: 'string',
        description:
          'product, audience, market, competitor, visual-identity, typography, color, naming, trend, culture, trademark, platform',
      },
      status: { type: 'string', description: 'observed | inferred | verified | user-provided' },
      statement: { type: 'string', description: 'The finding' },
      source: { type: 'string', multiple: true, description: 'Source ids (comma-separated or repeated)' },
      confidence: { type: 'string', description: 'low | medium | high' },
    },
    async run(c) {
      const w = ws(c);
      const slug = c.req('brand');
      const p = w.profile(slug);
      const f = addFinding(p, {
        topic: c.req('topic') as FindingTopic,
        status: c.req('status') as FindingStatus,
        statement: c.req('statement'),
        sourceIds: c.list('source'),
        ...(c.str('confidence') ? { confidence: c.str('confidence') as Confidence } : {}),
      });
      w.saveProfile(slug, p);
      return f;
    },
  },
  {
    name: 'profile add-gap',
    summary: 'Record something that could not be established, so nobody fills it with a guess.',
    usage: 'profile add-gap --brand <slug> --text <what is unknown>',
    options: { ...brandOpt, text: { type: 'string', description: 'The open question' } },
    async run(c) {
      const w = ws(c);
      const slug = c.req('brand');
      const p = w.profile(slug);
      const t = c.req('text');
      if (!p.gaps.includes(t)) p.gaps.push(t);
      w.saveProfile(slug, p);
      return { gaps: p.gaps };
    },
  },
  {
    name: 'answers',
    summary:
      'List questions already asked for a brand, or record a new question/answer so it is never asked twice.',
    usage: 'answers --brand <slug> [--question <text> [--answer <text>]]',
    options: {
      ...brandOpt,
      question: { type: 'string', description: 'Question asked' },
      answer: { type: 'string', description: 'Answer given' },
    },
    async run(c) {
      const w = ws(c);
      const slug = c.req('brand');
      const log = w.answers(slug);
      const q = c.str('question');
      if (q) {
        const existing = log.questions.find(
          (x) => x.question.trim().toLowerCase() === q.trim().toLowerCase(),
        );
        const answer = c.str('answer') ?? null;
        if (existing) {
          if (answer !== null) Object.assign(existing, { answer, answeredAt: nowIso() });
        } else
          log.questions.push({
            id: `Q${log.questions.length + 1}`,
            question: q,
            answer,
            askedAt: nowIso(),
            ...(answer !== null ? { answeredAt: nowIso() } : {}),
          });
        writeJson(w.answersPath(slug), log);
      }
      return log;
    },
  },
  {
    name: 'reference add',
    summary:
      'Add a competitor or category reference mark (SVG/PNG/JPEG) for similarity analysis. Stored git-ignored.',
    usage:
      'reference add --brand <slug> --file <path> --name <brand name> --source <url or note> [--category <text>] [--retrieved <ISO date>]',
    options: {
      ...brandOpt,
      file: { type: 'string', description: 'Logo file' },
      name: { type: 'string', description: 'Whose mark this is' },
      source: { type: 'string', description: 'Where it came from' },
      category: { type: 'string', description: 'Direct / indirect / category example' },
      retrieved: { type: 'string', description: 'Retrieval date' },
      notes: { type: 'string', description: 'Notes' },
    },
    async run(c) {
      const w = ws(c);
      const slug = c.req('brand');
      const src = file(c, c.req('file'));
      if (!existsSync(src)) throw new MarkiloError('NOT_FOUND', `File not found: ${src}`);
      const ext = extname(src).toLowerCase();
      if (!['.svg', '.png', '.jpg', '.jpeg'].includes(ext))
        throw new MarkiloError('INVALID_INPUT', 'References must be SVG, PNG or JPEG.');
      await loadMark(src); // fail early on unreadable files
      const idx = readReferences(w, slug);
      const id = slugify(`${c.req('name')}-${idx.references.length + 1}`);
      const dest = join(w.referencesDir(slug), `${id}${ext}`);
      mkdirSync(dirname(dest), { recursive: true });
      copyFileSync(src, dest);
      idx.references.push({
        id,
        file: `${id}${ext}`,
        name: c.req('name'),
        source: c.req('source'),
        retrievedAt: c.str('retrieved') ? new Date(c.str('retrieved')!).toISOString() : nowIso(),
        ...(c.str('category') ? { category: c.str('category')! } : {}),
        ...(c.str('notes') ? { notes: c.str('notes')! } : {}),
      });
      writeJson(referenceIndexPath(w, slug), idx);
      return { added: id, total: idx.references.length };
    },
  },
  {
    name: 'reference list',
    summary: 'List collected reference marks.',
    usage: 'reference list --brand <slug>',
    options: brandOpt,
    async run(c) {
      return readReferences(ws(c), c.req('brand'));
    },
  },
  // ------------------------------------------------------------ concepts
  {
    name: 'concept new',
    summary:
      'Create a concept folder and concept.json. Then write symbol.svg (and optionally wordmark.svg) into it.',
    usage:
      'concept new --brand <slug> --id <id> --title <title> --direction <direction> --rationale <why> --semantics a,b,c --primary <#hex> [--secondary --accent --ink --paper] [--font <id> --weight <n>]',
    options: {
      ...brandOpt,
      id: { type: 'string', description: 'Concept id (slug)' },
      title: { type: 'string', description: 'Concept name' },
      direction: { type: 'string', description: 'Creative direction in one line' },
      rationale: { type: 'string', description: 'Why this expresses the brand' },
      semantics: { type: 'string', description: 'Comma-separated meanings the mark carries' },
      construction: { type: 'string', description: 'Grid / geometry notes' },
      primary: { type: 'string', description: 'Primary color #rrggbb' },
      secondary: { type: 'string', description: 'Secondary color' },
      accent: { type: 'string', description: 'Accent color' },
      ink: { type: 'string', description: 'Text/ink color' },
      paper: { type: 'string', description: 'Background color' },
      font: { type: 'string', description: 'Wordmark font id (markilo fonts)' },
      weight: { type: 'string', description: 'Wordmark font weight' },
    },
    async run(c) {
      const w = ws(c);
      const slug = c.req('brand');
      w.assertNotLocked(slug);
      const id = c.req('id');
      if (!isSlug(id)) throw new MarkiloError('INVALID_INPUT', '--id must be a slug (a-z, 0-9, -).');
      const dir = w.conceptDir(slug, id);
      if (existsSync(join(dir, 'concept.json')))
        throw new MarkiloError('EXISTS', `Concept ${id} already exists.`);
      const font = c.str('font');
      const concept: Concept = {
        schema: 'markilo/concept@1',
        id,
        brand: slug,
        title: c.req('title'),
        direction: c.req('direction'),
        rationale: c.req('rationale'),
        semantics: c.list('semantics'),
        ...(c.str('construction') ? { construction: c.str('construction')! } : {}),
        palette: {
          primary: c.req('primary'),
          ...Object.fromEntries(
            (['secondary', 'accent', 'ink', 'paper'] as const)
              .filter((k) => c.str(k))
              .map((k) => [k, c.str(k)!]),
          ),
        },
        ...(font
          ? {
              typography: {
                fontId: font,
                weight: c.num('weight', 600)!,
                family: fontInfo(font).family,
                license: fontInfo(font).license,
              },
            }
          : {}),
        files: { symbol: 'symbol.svg' },
        status: 'draft',
        createdAt: nowIso(),
        updatedAt: nowIso(),
      };
      mkdirSync(dir, { recursive: true });
      w.saveConcept(concept);
      return {
        concept: id,
        dir,
        write: [join(dir, 'symbol.svg')],
        next: `markilo verify --brand ${slug} --concept ${id}`,
      };
    },
  },
  {
    name: 'concept list',
    summary: 'List concepts for a brand.',
    usage: 'concept list --brand <slug>',
    options: brandOpt,
    async run(c) {
      return ws(c)
        .concepts(c.req('brand'))
        .map((x) => ({
          id: x.id,
          title: x.title,
          status: x.status,
          direction: x.direction,
          files: x.files,
          palette: x.palette,
        }));
    },
  },
  {
    name: 'concept update',
    summary: 'Change a concept: status, files, palette, typography or recorded judgment scores.',
    usage:
      'concept update --brand <slug> --concept <id> [--status <s>] [--wordmark <file>] [--symbol <file>] [--judgment <criterion>=<0-10>:<rationale>]...',
    options: {
      ...brandOpt,
      concept: { type: 'string', description: 'Concept id' },
      status: { type: 'string', description: 'draft | verified | shortlisted | rejected | approved' },
      symbol: { type: 'string', description: 'Symbol file name inside the concept folder' },
      wordmark: { type: 'string', description: 'Wordmark file name inside the concept folder' },
      'lockup-horizontal': { type: 'string', description: 'Hand-made horizontal lockup file' },
      'lockup-stacked': { type: 'string', description: 'Hand-made stacked lockup file' },
      judgment: { type: 'string', multiple: true, description: 'criterion=score:rationale (repeatable)' },
      primary: { type: 'string', description: 'Primary color' },
      font: { type: 'string', description: 'Font id' },
      weight: { type: 'string', description: 'Font weight' },
    },
    async run(c) {
      const w = ws(c);
      const slug = c.req('brand');
      const cur = w.concept(slug, c.req('concept'));
      const next: Concept = { ...cur, files: { ...cur.files }, palette: { ...cur.palette } };
      const st = c.str('status');
      if (st) {
        if (st === 'approved')
          throw new MarkiloError('USAGE', 'Use "markilo finalize" to approve a concept.');
        next.status = st as Concept['status'];
      }
      for (const [opt, key] of [
        ['symbol', 'symbol'],
        ['wordmark', 'wordmark'],
        ['lockup-horizontal', 'lockupHorizontal'],
        ['lockup-stacked', 'lockupStacked'],
      ] as const) {
        const v = c.str(opt);
        if (!v) continue;
        if (!existsSync(w.conceptFile(slug, cur.id, v)))
          throw new MarkiloError('NOT_FOUND', `${v} is not in the concept folder.`);
        next.files[key] = v;
      }
      if (c.str('primary')) next.palette.primary = c.str('primary')!;
      if (c.str('font'))
        next.typography = {
          fontId: c.str('font')!,
          weight: c.num('weight', 600)!,
          family: fontInfo(c.str('font')!).family,
          license: fontInfo(c.str('font')!).license,
        };
      for (const j of c.list('judgment').length ? (c.values.judgment as string[]) : []) {
        const m = /^([a-z-]+)=(\d+(?:\.\d+)?):(.+)$/i.exec(j);
        if (!m) throw new MarkiloError('USAGE', `Bad --judgment "${j}". Use criterion=score:rationale.`);
        next.judgment = {
          ...(next.judgment ?? {}),
          [m[1]!]: { score: Number(m[2]), rationale: m[3]!.trim() },
        };
      }
      w.saveConcept(next);
      return next;
    },
  },
  {
    name: 'verify',
    summary:
      'Run every automated check on a concept: lint, small-size legibility, balance, monochrome, contrast, genericity, similarity, diversity, name. Writes reports and a review sheet PNG.',
    usage: 'verify --brand <slug> --concept <id>',
    options: { ...brandOpt, concept: { type: 'string', description: 'Concept id' } },
    async run(c) {
      return verifyConcept(ws(c), c.req('brand'), c.req('concept'));
    },
  },
  {
    name: 'originality',
    summary: 'Build the Originality & Similarity Report for a concept (also run by verify).',
    usage: 'originality --brand <slug> --concept <id> [--names a,b,c]',
    options: {
      ...brandOpt,
      concept: { type: 'string', description: 'Concept id' },
      names: { type: 'string', description: 'Extra competitor names to compare' },
    },
    async run(c) {
      const r = await buildOriginalityReport(ws(c), c.req('brand'), c.req('concept'), {
        competitorNames: c.list('names'),
      });
      return {
        verdict: r.report.verdict,
        visualRisk: r.report.visual.risk,
        nameRisk: r.report.name.risk,
        genericity: r.report.genericity ?? null,
        report: r.mdPath,
        json: r.jsonPath,
      };
    },
  },
  {
    name: 'diversity',
    summary: 'Pairwise similarity of all active concepts: are the directions really different?',
    usage: 'diversity --brand <slug>',
    options: brandOpt,
    async run(c) {
      const w = ws(c);
      const slug = c.req('brand');
      const items = [];
      for (const x of w.concepts(slug).filter((k) => k.status !== 'rejected')) {
        const f = x.files.symbol ?? x.files.wordmark;
        if (f && existsSync(w.conceptFile(slug, x.id, f)))
          items.push(await loadMark(w.conceptFile(slug, x.id, f), { id: x.id }));
      }
      const pairs = [];
      for (let i = 0; i < items.length; i++)
        for (let j = i + 1; j < items.length; j++) {
          const r = await compareMarks(items[i]!, items[j]!);
          pairs.push({ a: r.a, b: r.b, similarity: r.visual, risk: r.risk, reasons: r.reasons });
        }
      pairs.sort((a, b) => b.similarity - a.similarity);
      return { concepts: items.length, tooSimilar: pairs.filter((p) => p.risk !== 'low'), pairs };
    },
  },
  {
    name: 'finalize',
    summary:
      'Approve a concept: freeze optimized masters, generate lockups (horizontal, stacked, compact) and brand.json.',
    usage: 'finalize --brand <slug> --concept <id> [--tagline <text>] [--force]',
    options: {
      ...brandOpt,
      concept: { type: 'string', description: 'Concept id' },
      tagline: { type: 'string', description: 'Tagline for social images' },
      force: { type: 'boolean', description: 'Replace an existing approved kit' },
    },
    async run(c) {
      const w = ws(c);
      const kit = finalizeConcept(w, c.req('brand'), c.req('concept'), {
        ...(c.str('tagline') ? { tagline: c.str('tagline')! } : {}),
        force: c.bool('force'),
      });
      return { kit, dir: w.finalDir(c.req('brand')), next: `markilo export --brand ${c.req('brand')}` };
    },
  },
  {
    name: 'lock',
    summary:
      'Register an existing identity that must be preserved exactly (files copied byte-for-byte; no redesign, no recoloring).',
    usage:
      'lock --brand <slug> --primary <#hex> [--symbol <svg>] [--wordmark <svg>] [--lockup <svg>] [--paper <#hex>] [--ink <#hex>] [--force]',
    options: {
      ...brandOpt,
      symbol: { type: 'string', description: 'Existing symbol SVG' },
      wordmark: { type: 'string', description: 'Existing wordmark SVG' },
      lockup: { type: 'string', description: 'Existing logo/lockup SVG' },
      primary: { type: 'string', description: 'Brand color' },
      paper: { type: 'string', description: 'Background color' },
      ink: { type: 'string', description: 'Ink color' },
      force: { type: 'boolean', description: 'Replace existing kit' },
    },
    async run(c) {
      const w = ws(c);
      const opt = (k: string) => (c.str(k) ? file(c, c.str(k)!) : undefined);
      const symbol = opt('symbol');
      const wordmark = opt('wordmark');
      const lockup = opt('lockup');
      const kit = lockIdentity(w, c.req('brand'), {
        ...(symbol ? { symbol } : {}),
        ...(wordmark ? { wordmark } : {}),
        ...(lockup ? { lockup } : {}),
        primary: c.req('primary'),
        ...(c.str('paper') ? { paper: c.str('paper')! } : {}),
        ...(c.str('ink') ? { ink: c.str('ink')! } : {}),
        force: c.bool('force'),
      });
      return {
        kit,
        note: 'Locked: Markilo will reproduce these files exactly and refuse concept work for this brand.',
      };
    },
  },
  {
    name: 'export',
    summary: `Generate the complete asset kit from the approved identity. Groups: ${EXPORT_GROUPS.join(', ')}.`,
    usage: 'export --brand <slug> [--only web,ios,...] [--clean]',
    options: {
      ...brandOpt,
      only: { type: 'string', description: 'Comma-separated groups' },
      clean: { type: 'boolean', description: 'Delete previous exports first' },
    },
    async run(c) {
      const w = ws(c);
      const r = await exportBrand(w, c.req('brand'), {
        groups: c.list('only') as ExportGroup[],
        clean: c.bool('clean'),
      });
      const byGroup: Record<string, number> = {};
      for (const a of r.assets) byGroup[a.group] = (byGroup[a.group] ?? 0) + 1;
      return {
        outDir: r.outDir,
        files: r.assets.length,
        byGroup,
        skipped: r.skipped,
        warnings: r.warnings,
        manifest: join(r.outDir, 'asset-manifest.json'),
      };
    },
  },
  {
    name: 'gallery',
    summary: 'Build the self-contained HTML Brand Preview Gallery (concepts, scores, mockups, exports).',
    usage: 'gallery [--brand <slug>]...',
    options: { brand: { type: 'string', short: 'b', multiple: true, description: 'Limit to brands' } },
    async run(c) {
      const r = await buildGallery(ws(c), { brands: c.list('brand') });
      return { gallery: r.path, subjects: r.subjects, open: `file://${r.path.replace(/\\/g, '/')}` };
    },
  },
  {
    name: 'install-assets',
    summary:
      'Copy an exported group (e.g. web) into your project (the current folder, or --project for another folder such as a monorepo package). Dry run unless --apply; never overwrites without --force.',
    usage:
      'install-assets --brand <slug> --group web --into <dir> [--project <project dir>] [--apply] [--force]',
    options: {
      project: {
        type: 'string',
        description: 'Project folder to install into (default: current folder). Ask the user first.',
      },
      ...brandOpt,
      group: { type: 'string', description: 'Export group to copy' },
      into: { type: 'string', description: 'Destination inside the project' },
      apply: { type: 'boolean', description: 'Actually copy' },
      force: { type: 'boolean', description: 'Overwrite existing files' },
    },
    async run(c) {
      const projectDir = c.str('project') ? file(c, c.str('project')!) : c.cwd;
      if (!isDir(projectDir)) throw new MarkiloError('NOT_FOUND', `Project folder not found: ${projectDir}`);
      return installAssets(ws(c), c.req('brand'), c.req('group'), c.req('into'), projectDir, {
        apply: c.bool('apply'),
        force: c.bool('force'),
      });
    },
  },
  // ------------------------------------------------------------ standalone tools
  {
    name: 'svg lint',
    summary: 'Validate SVG files as brand masters (pure vector, self-contained, scalable).',
    usage: 'svg lint <file...> [--master]',
    options: { master: { type: 'boolean', description: 'Strict rules for master files' } },
    async run(c) {
      if (!c.positionals.length) throw new MarkiloError('USAGE', 'Give at least one SVG file.');
      const results = c.positionals.map((p) => ({
        file: p,
        ...lintSvg(readText(file(c, p)), { master: c.bool('master') }),
      }));
      return { ok: results.every((r) => r.ok), results };
    },
  },
  {
    name: 'svg optimize',
    summary: 'Optimize an SVG conservatively (keeps viewBox, titles and referenced ids).',
    usage: 'svg optimize <in.svg> [-o <out.svg>] [--force]',
    options: {
      out: { type: 'string', short: 'o', description: 'Output file (default: print)' },
      force: { type: 'boolean', description: 'Overwrite output' },
    },
    async run(c) {
      const src = readText(file(c, pos(c, 0, 'in.svg')));
      const out = optimizeSvg(src);
      if (c.str('out')) {
        writeFileSafe(file(c, c.str('out')!), out, { force: c.bool('force') });
        return { out: c.str('out'), before: src.length, after: out.length };
      }
      return { svg: out, before: src.length, after: out.length };
    },
  },
  {
    name: 'wordmark',
    summary:
      'Typeset text and convert it to outlined SVG paths with real kerning. Bundled OFL fonts or your own file.',
    usage:
      'wordmark --text <text> (--font <id> --weight <n> | --font-file <path> --font-license <text>) -o <out.svg> [--tracking <‰em>] [--case as-is|lower|upper] [--color <#hex>] [--no-ligatures] [--locale tr]',
    options: {
      text: { type: 'string', description: 'Wordmark text' },
      font: { type: 'string', description: 'Bundled font id (see: markilo fonts)' },
      weight: { type: 'string', description: 'Weight (e.g. 600)' },
      'font-file': { type: 'string', description: 'Your own TTF/OTF/WOFF/WOFF2' },
      'font-license': { type: 'string', description: 'License of --font-file (recorded in the SVG)' },
      tracking: { type: 'string', description: 'Letter spacing in 1/1000 em' },
      case: { type: 'string', description: 'as-is | lower | upper' },
      color: { type: 'string', description: 'Fill color' },
      'no-ligatures': { type: 'boolean', description: 'Disable fi/fl ligatures' },
      locale: { type: 'string', description: 'Casing locale (tr for Turkish i/İ)' },
      out: { type: 'string', short: 'o', description: 'Output SVG' },
      force: { type: 'boolean', description: 'Overwrite output' },
    },
    async run(c) {
      const face = c.str('font-file')
        ? loadFontFile(
            file(c, c.str('font-file')!),
            c.str('font-license') ?? 'user-supplied (license not stated)',
          )
        : loadBundledFace(c.req('font'), c.num('weight', 600)!);
      const svg = wordmarkSvg(face, c.req('text'), {
        ...(c.num('tracking') !== undefined ? { tracking: c.num('tracking')! } : {}),
        ...(c.str('case') ? { case: c.str('case') as 'as-is' } : {}),
        ...(c.str('color') ? { color: c.str('color')! } : {}),
        ...(c.str('locale') ? { locale: c.str('locale')! } : {}),
        ligatures: !c.bool('no-ligatures'),
      });
      writeFileSafe(file(c, c.req('out')), svg, { force: c.bool('force') });
      return { out: c.req('out'), font: face.label, license: face.license, bytes: svg.length };
    },
  },
  {
    name: 'lockup',
    summary: 'Compose a symbol and a wordmark into a horizontal or stacked lockup aligned to cap height.',
    usage:
      'lockup --symbol <svg> --wordmark <svg> --layout horizontal|stacked -o <out.svg> [--scale <n>] [--gap <n>]',
    options: {
      symbol: { type: 'string', description: 'Symbol SVG' },
      wordmark: { type: 'string', description: 'Wordmark SVG' },
      layout: { type: 'string', description: 'horizontal | stacked' },
      scale: { type: 'string', description: 'Symbol height in cap heights' },
      gap: { type: 'string', description: 'Gap in cap heights' },
      out: { type: 'string', short: 'o', description: 'Output SVG' },
      force: { type: 'boolean', description: 'Overwrite output' },
    },
    async run(c) {
      const layout = (c.str('layout') ?? 'horizontal') as 'horizontal' | 'stacked';
      const l = composeLockup(readText(file(c, c.req('symbol'))), readText(file(c, c.req('wordmark'))), {
        layout,
        ...(c.num('scale') ? { symbolScale: c.num('scale')! } : {}),
        ...(c.num('gap') ? { gap: c.num('gap')! } : {}),
      });
      writeFileSafe(file(c, c.req('out')), l.svg, { force: c.bool('force') });
      return {
        out: c.req('out'),
        width: Math.round(l.width),
        height: Math.round(l.height),
        clearSpace: l.clearSpace,
      };
    },
  },
  {
    name: 'render',
    summary:
      'Render an SVG to PNG, or a review contact sheet (sizes 16–256 on light/dark/mono) with --sheet.',
    usage: 'render <in.svg> -o <out.png> [--width <px>] [--bg <#hex>] [--sheet]',
    options: {
      out: { type: 'string', short: 'o', description: 'Output PNG' },
      width: { type: 'string', description: 'Width in px (default 512)' },
      bg: { type: 'string', description: 'Background color' },
      sheet: { type: 'boolean', description: 'Render a review contact sheet' },
    },
    async run(c) {
      const svg = readText(file(c, pos(c, 0, 'in.svg')));
      const png = c.bool('sheet')
        ? await renderReviewSheet(svg, basename(pos(c, 0, 'in.svg')))
        : await renderPng(svg, {
            width: c.num('width', 512)!,
            ...(c.str('bg') ? { background: c.str('bg')! } : {}),
          });
      writeGenerated(file(c, c.req('out')), png);
      return { out: c.req('out'), bytes: png.length };
    },
  },
  {
    name: 'analyze',
    summary: 'Measure a mark: shape features, perceptual hashes, colors and closeness to stock primitives.',
    usage: 'analyze <file.svg|png|jpg>',
    async run(c) {
      const m = await loadMark(file(c, pos(c, 0, 'file')));
      const { radial: _r, ...features } = m.features;
      return {
        id: m.id,
        kind: m.kind,
        colors: m.colors,
        features,
        hashes: m.hashes,
        genericity: await genericity(m),
      };
    },
  },
  {
    name: 'compare',
    summary: 'Compare two marks (SVG/PNG/JPEG): silhouette, perceptual hashes, structure, color, risk.',
    usage: 'compare <a> <b>',
    async run(c) {
      const a = await loadMark(file(c, pos(c, 0, 'a')));
      const b = await loadMark(file(c, pos(c, 1, 'b')));
      return compareMarks(a, b);
    },
  },
  {
    name: 'score',
    summary:
      'Technical quality scorecard for one SVG (legibility, balance, monochrome, contrast, genericity).',
    usage: 'score <file.svg> [--role symbol|wordmark|lockup]',
    options: { role: { type: 'string', description: 'symbol | wordmark | lockup' } },
    async run(c) {
      const p = pos(c, 0, 'file.svg');
      return assessQuality(readText(file(c, p)), p, (c.str('role') ?? 'symbol') as 'symbol');
    },
  },
  {
    name: 'name check',
    summary: 'Compare a name against others for spelling, sound and stem overlap; pronunciation notes.',
    usage: 'name check <name> --against a,b,c [--other-category]',
    options: {
      against: { type: 'string', multiple: true, description: 'Names to compare with' },
      'other-category': { type: 'boolean', description: 'The other names are in a different category' },
    },
    async run(c) {
      const name = pos(c, 0, 'name');
      const results = c
        .list('against')
        .map((o) => compareNames(name, o, !c.bool('other-category')))
        .sort((a, b) => b.score - a.score);
      return {
        name,
        phoneticKey: phoneticKey(name),
        pronunciation: pronunciationNotes(name),
        highest: results[0]?.risk ?? 'low',
        results,
      };
    },
  },
  {
    name: 'name trademark',
    summary:
      'Trademark pre-screening plan: Nice class suggestions and official registry search entry points.',
    usage: 'name trademark <name> [--describe <product description>] [--classes 9,42]',
    options: {
      describe: { type: 'string', description: 'What the product does' },
      classes: { type: 'string', description: 'Known Nice classes' },
    },
    async run(c) {
      const name = pos(c, 0, 'name');
      const s = c.list('classes').length
        ? { classes: c.list('classes').map(Number), reasons: ['given'] }
        : suggestNiceClasses(c.str('describe') ?? '');
      return { ...trademarkSearchPlan(name, s.classes), classReasons: s.reasons };
    },
  },
  {
    name: 'palette',
    summary:
      'Generate OKLCH tonal scales, neutrals, semantic colors and WCAG contrast pairs from brand colors.',
    usage: 'palette <#primary> [--secondary <#hex>] [--accent <#hex>] [-o <palette.json>]',
    options: {
      secondary: { type: 'string', description: 'Secondary color' },
      accent: { type: 'string', description: 'Accent color' },
      out: { type: 'string', short: 'o', description: 'Write JSON here' },
    },
    async run(c) {
      const p = generatePalette({
        primary: pos(c, 0, '#primary'),
        ...(c.str('secondary') ? { secondary: c.str('secondary')! } : {}),
        ...(c.str('accent') ? { accent: c.str('accent')! } : {}),
      });
      if (c.str('out')) writeJson(file(c, c.str('out')!), p);
      return p;
    },
  },
  {
    name: 'fonts',
    summary:
      'List bundled fonts (all SIL OFL 1.1: free for commercial use; outlined logos carry no font obligations).',
    usage: 'fonts',
    async run() {
      return listFonts().map(({ id, family, category, role, weights, license }) => ({
        id,
        family,
        category,
        role,
        weights,
        license,
      }));
    },
  },
  {
    name: 'shortcut',
    summary:
      'Install/remove the optional personal /markilo skill (~/.claude/skills/markilo). Dry run unless --yes.',
    usage: 'shortcut install|uninstall|status [--yes] [--dir <skills dir>]',
    options: {
      yes: { type: 'boolean', description: 'Apply the change' },
      dir: { type: 'string', description: 'Skills directory (default ~/.claude/skills)' },
    },
    async run(c) {
      const action = (c.positionals[0] ?? 'status') as 'install';
      if (!['install', 'uninstall', 'status'].includes(action))
        throw new MarkiloError('USAGE', 'Use install, uninstall or status.');
      return shortcut(action, {
        yes: c.bool('yes'),
        ...(c.str('dir') ? { dir: file(c, c.str('dir')!) } : {}),
      });
    },
  },
  {
    name: 'doctor',
    summary: 'Check that the toolchain works on this machine.',
    usage: 'doctor',
    async run() {
      return doctor(VERSION);
    },
  },
];

export function findCommand(argv: string[]): { spec: CommandSpec; rest: string[] } | undefined {
  const two = `${argv[0]} ${argv[1]}`;
  const exact2 = COMMANDS.find((c) => c.name === two);
  if (exact2) return { spec: exact2, rest: argv.slice(2) };
  const exact1 = COMMANDS.find((c) => c.name === argv[0]);
  if (exact1) return { spec: exact1, rest: argv.slice(1) };
  return undefined;
}
