import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = join(__dirname, '..');
const json = (p: string) => JSON.parse(readFileSync(join(root, p), 'utf8'));
const frontmatter = (p: string) => {
  const m = /^---\n([\s\S]*?)\n---/.exec(readFileSync(join(root, p), 'utf8'));
  return Object.fromEntries(
    (m?.[1] ?? '')
      .split('\n')
      .filter((l) => /^[a-z-]+:/.test(l))
      .map((l) => [l.slice(0, l.indexOf(':')), l.slice(l.indexOf(':') + 1).trim()]),
  );
};

describe('plugin packaging', () => {
  it('keeps versions in sync', () => {
    const v = json('package.json').version;
    expect(json('plugin/.claude-plugin/plugin.json').version).toBe(v);
    expect(json('.claude-plugin/marketplace.json').plugins[0].version).toBe(v);
    expect(readFileSync(join(root, 'CHANGELOG.md'), 'utf8')).toContain(`[${v}]`);
  });
  it('every skill and agent has a name and description', () => {
    for (const d of readdirSync(join(root, 'plugin/skills'))) {
      const fm = frontmatter(`plugin/skills/${d}/SKILL.md`);
      expect(fm.name, d).toBe(d);
      expect((fm.description ?? '').length, d).toBeGreaterThan(40);
    }
    for (const f of readdirSync(join(root, 'plugin/agents'))) {
      const fm = frontmatter(`plugin/agents/${f}`);
      expect(fm.name).toBe(f.replace(/\.md$/, ''));
      expect(fm.description?.length).toBeGreaterThan(40);
    }
  });
  it('skill references point at files that exist', () => {
    const all = [
      ...readdirSync(join(root, 'plugin/skills')).map((d) => `plugin/skills/${d}/SKILL.md`),
      ...readdirSync(join(root, 'plugin/agents')).map((f) => `plugin/agents/${f}`),
    ];
    for (const f of all) {
      for (const m of readFileSync(join(root, f), 'utf8').matchAll(
        /\$\{CLAUDE_PLUGIN_ROOT\}\/([\w./-]+\.(?:md|mjs))/g,
      )) {
        expect(existsSync(join(root, 'plugin', m[1]!)), `${f} → ${m[1]}`).toBe(true);
      }
    }
  });
  it('ships the bundled toolchain', () => {
    expect(existsSync(join(root, 'plugin/dist/markilo.mjs'))).toBe(true);
    expect(existsSync(join(root, 'plugin/dist/resvg.wasm'))).toBe(true);
    expect(existsSync(join(root, 'plugin/fonts/fonts.json'))).toBe(true);
  });
});

describe('examples', () => {
  it('every example brief patch produces a valid brief', async () => {
    const { validateBrief } = await import('../src/core/validate.js');
    const dirs = readdirSync(join(root, 'examples'), { withFileTypes: true }).filter((d) => d.isDirectory());
    let count = 0;
    for (const d of dirs) {
      for (const f of readdirSync(join(root, 'examples', d.name)).filter((x) => x.endsWith('.json'))) {
        const patch = json(`examples/${d.name}/${f}`);
        expect(
          validateBrief({ schema: 'markilo/brief@1', brand: 'x', name: 'X', mode: 'new', ...patch }),
          f,
        ).toEqual([]);
        count++;
      }
    }
    expect(count).toBeGreaterThanOrEqual(2);
  });
});

describe('installable plugin folder', () => {
  it('carries the license files and no package.json (so installs skip npm)', () => {
    for (const f of ['LICENSE', 'NOTICE', 'THIRD_PARTY_NOTICES.md']) {
      expect(readFileSync(join(root, 'plugin', f), 'utf8'), f).toBe(readFileSync(join(root, f), 'utf8'));
    }
    expect(existsSync(join(root, 'plugin', 'package.json'))).toBe(false);
    expect(json('.claude-plugin/marketplace.json').plugins[0].source).toBe('./plugin');
  });
});
