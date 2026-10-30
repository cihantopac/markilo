import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import { MarkiloError } from './errors.js';
import { isDir, nowIso, readJson, writeFileSafe, writeJson } from './fsx.js';
import { isSlug, portableRef, resolveInsideReal, slugify } from './paths.js';
import type {
  AnswerLog,
  BrandProfile,
  BrandRole,
  Brief,
  Concept,
  WorkspaceBrand,
  WorkspaceManifest,
} from './types.js';
import { validateBrief, validateConcept, validateManifest } from './validate.js';

export const MANIFEST = 'markilo.json';
export const DEFAULT_WORKSPACE_DIR = 'brand';

const IGNORED = ['brands/*/research/cache/', 'brands/*/research/references/', '/research/'];
const WORKSPACE_GITIGNORE = `# Created by Markilo. Raw research captures can contain third-party or private material.
${IGNORED.join('\n')}
`;

/** Adds ignore rules introduced by newer Markilo versions to an existing workspace's .gitignore. */
function upgradeGitignore(root: string): void {
  const file = join(root, '.gitignore');
  if (!existsSync(file)) return;
  const current = readFileSync(file, 'utf8');
  const missing = IGNORED.filter((rule) => !current.split(/\r?\n/).includes(rule));
  if (missing.length)
    writeFileSafe(file, `${current.replace(/\n*$/, '\n')}${missing.join('\n')}\n`, { force: true });
}

export class Workspace {
  readonly root: string;
  private manifestCache: WorkspaceManifest | undefined;

  constructor(root: string) {
    this.root = resolve(root);
  }

  /** Finds a workspace: explicit path, ./brand, then the nearest ancestor holding markilo.json. */
  private static open(root: string): Workspace {
    upgradeGitignore(root);
    return new Workspace(root);
  }

  static locate(cwd: string, explicit?: string): Workspace {
    if (explicit) {
      const root = resolve(cwd, explicit);
      if (existsSync(join(root, MANIFEST))) return Workspace.open(root);
      // A relative --workspace also matches from a parent folder, so commands run from inside the workspace
      // (an agent that changed directory into a concept folder) still find it.
      if (!isAbsolute(explicit)) {
        for (let dir = dirname(resolve(cwd)); ; dir = dirname(dir)) {
          if (existsSync(join(dir, explicit, MANIFEST))) return Workspace.open(join(dir, explicit));
          if (dirname(dir) === dir) break;
        }
      }
      throw new MarkiloError('NO_WORKSPACE', `No ${MANIFEST} in ${root}.`, 'Run "markilo init" first.');
    }
    let dir = resolve(cwd);
    for (;;) {
      if (existsSync(join(dir, MANIFEST))) return Workspace.open(dir);
      if (existsSync(join(dir, DEFAULT_WORKSPACE_DIR, MANIFEST)))
        return Workspace.open(join(dir, DEFAULT_WORKSPACE_DIR));
      const parent = dirname(dir);
      if (parent === dir) break;
      dir = parent;
    }
    throw new MarkiloError(
      'NO_WORKSPACE',
      `No Markilo workspace found from ${cwd}.`,
      'Run "markilo init" to create ./brand, or pass --workspace <dir>.',
    );
  }

  static init(root: string, name: string, family?: { name: string; description?: string }): Workspace {
    const ws = new Workspace(root);
    if (existsSync(join(ws.root, MANIFEST))) {
      throw new MarkiloError('EXISTS', `A workspace already exists at ${ws.root}.`);
    }
    const manifest: WorkspaceManifest = {
      schema: 'markilo/workspace@1',
      name,
      createdAt: nowIso(),
      brands: [],
      ...(family
        ? {
            family: {
              name: family.name,
              slug: slugify(family.name),
              ...(family.description ? { description: family.description } : {}),
            },
          }
        : {}),
    };
    writeJson(join(ws.root, MANIFEST), manifest, { force: false });
    writeFileSafe(join(ws.root, '.gitignore'), WORKSPACE_GITIGNORE, { force: true });
    if (family) {
      writeJson(join(ws.root, 'shared', 'system.json'), {
        schema: 'markilo/system@1',
        family: manifest.family,
        tokens: {},
        notes: 'Shared visual language for every brand in this family.',
      });
    }
    return ws;
  }

  get manifest(): WorkspaceManifest {
    if (!this.manifestCache) {
      const m = readJson<WorkspaceManifest>(join(this.root, MANIFEST));
      const issues = validateManifest(m);
      if (issues.length) throw new MarkiloError('INVALID_INPUT', `Invalid ${MANIFEST}: ${issues.join('; ')}`);
      this.manifestCache = m;
    }
    return this.manifestCache;
  }

  saveManifest(m: WorkspaceManifest): void {
    const issues = validateManifest(m);
    if (issues.length) throw new MarkiloError('INVALID_INPUT', `Invalid manifest: ${issues.join('; ')}`);
    writeJson(join(this.root, MANIFEST), m);
    this.manifestCache = m;
  }

  brand(slug: string): WorkspaceBrand {
    const b = this.manifest.brands.find((x) => x.slug === slug);
    if (!b) {
      const known = this.manifest.brands.map((x) => x.slug).join(', ') || '(none)';
      throw new MarkiloError('NOT_FOUND', `Unknown brand "${slug}". Known brands: ${known}.`);
    }
    return b;
  }

  addBrand(input: {
    name: string;
    slug?: string;
    role?: BrandRole;
    locked?: boolean;
    parent?: string;
  }): WorkspaceBrand {
    const slug = input.slug ?? slugify(input.name);
    if (!isSlug(slug)) throw new MarkiloError('INVALID_INPUT', `"${slug}" is not a valid slug.`);
    const m = structuredClone(this.manifest);
    if (m.brands.some((b) => b.slug === slug))
      throw new MarkiloError('EXISTS', `Brand "${slug}" already exists.`);
    const brand: WorkspaceBrand = {
      slug,
      name: input.name,
      role: input.role ?? (m.family ? 'product' : 'master'),
      ...(input.locked ? { locked: true } : {}),
      ...(input.parent ? { parent: input.parent } : {}),
    };
    m.brands.push(brand);
    this.saveManifest(m);
    const brief: Brief = {
      schema: 'markilo/brief@1',
      brand: slug,
      name: input.name,
      mode: input.locked ? 'evaluate' : 'new',
    };
    writeJson(this.briefPath(slug), brief, { force: false });
    const profile: BrandProfile = {
      schema: 'markilo/profile@1',
      brand: slug,
      updatedAt: nowIso(),
      sources: [],
      findings: [],
      existingIdentity: { logos: [], colors: [], fonts: [] },
      gaps: [],
    };
    writeJson(this.profilePath(slug), profile, { force: false });
    writeJson(this.answersPath(slug), { schema: 'markilo/answers@1', questions: [] } satisfies AnswerLog, {
      force: false,
    });
    writeFileSafe(this.decisionsPath(slug), `# ${input.name} — design decisions\n\n`, { force: false });
    return brand;
  }

  // ----- paths -----
  brandDir(slug: string): string {
    if (!isSlug(slug)) throw new MarkiloError('INVALID_INPUT', `"${slug}" is not a valid brand slug.`);
    return resolveInsideReal(this.root, join('brands', slug));
  }
  briefPath = (slug: string) => join(this.brandDir(slug), 'brief.json');
  profilePath = (slug: string) => join(this.brandDir(slug), 'profile.json');
  answersPath = (slug: string) => join(this.brandDir(slug), 'answers.json');
  decisionsPath = (slug: string) => join(this.brandDir(slug), 'decisions.md');
  referencesDir = (slug: string) => join(this.brandDir(slug), 'research', 'references');
  cacheDir = (slug: string) => join(this.brandDir(slug), 'research', 'cache');
  reportsDir = (slug: string) => join(this.brandDir(slug), 'reports');
  finalDir = (slug: string) => join(this.brandDir(slug), 'final');
  exportsDir = (slug: string) => join(this.brandDir(slug), 'exports');
  galleryDir = () => resolveInsideReal(this.root, 'gallery');
  conceptsDir = (slug: string) => join(this.brandDir(slug), 'concepts');
  conceptDir(slug: string, id: string): string {
    if (!isSlug(id)) throw new MarkiloError('INVALID_INPUT', `"${id}" is not a valid concept id.`);
    return join(this.conceptsDir(slug), id);
  }
  /** Resolves a file referenced from concept.json, refusing paths that leave the concept folder. */
  conceptFile(slug: string, id: string, rel: string): string {
    return resolveInsideReal(this.conceptDir(slug, id), rel);
  }

  // ----- documents -----
  brief(slug: string): Brief {
    const b = readJson<Brief>(this.briefPath(slug));
    const issues = validateBrief(b);
    if (issues.length)
      throw new MarkiloError('INVALID_INPUT', `Invalid brief for ${slug}: ${issues.join('; ')}`);
    return b;
  }
  profile = (slug: string) => readJson<BrandProfile>(this.profilePath(slug));
  /** Saves the profile with local paths made relative to the project folder that holds the workspace. */
  saveProfile(slug: string, p: BrandProfile): void {
    const base = dirname(this.root);
    const sources = p.sources.map((s) => ({ ...s, ref: portableRef(s.ref, base) }));
    writeJson(this.profilePath(slug), { ...p, sources, updatedAt: nowIso() });
  }
  answers = (slug: string) => readJson<AnswerLog>(this.answersPath(slug));

  concepts(slug: string): Concept[] {
    const dir = this.conceptsDir(slug);
    if (!isDir(dir)) return [];
    return readdirSync(dir)
      .filter((d) => existsSync(join(dir, d, 'concept.json')))
      .sort()
      .map((d) => this.concept(slug, d));
  }
  concept(slug: string, id: string): Concept {
    const c = readJson<Concept>(join(this.conceptDir(slug, id), 'concept.json'));
    const issues = validateConcept(c);
    if (issues.length)
      throw new MarkiloError('INVALID_INPUT', `Invalid concept ${slug}/${id}: ${issues.join('; ')}`);
    return c;
  }
  saveConcept(c: Concept): void {
    const issues = validateConcept(c);
    if (issues.length) throw new MarkiloError('INVALID_INPUT', `Invalid concept: ${issues.join('; ')}`);
    writeJson(join(this.conceptDir(c.brand, c.id), 'concept.json'), { ...c, updatedAt: nowIso() });
  }

  assertNotLocked(slug: string): void {
    if (this.brand(slug).locked) {
      throw new MarkiloError(
        'LOCKED',
        `Brand "${slug}" is locked: its existing identity must be preserved and cannot be redesigned.`,
        'Locked brands can be analyzed, shown in galleries and exported from their provided masters only.',
      );
    }
  }
}
