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

describe('craft-named directions', () => {
  it('design principles carry a craft section and the explore mode points to it', () => {
    const principles = readFileSync(
      join(root, 'plugin/skills/design/references/design-principles.md'),
      'utf8',
    );
    expect(principles).toContain('## When the direction names a craft');
    const agent = readFileSync(join(root, 'plugin/agents/concept-designer.md'), 'utf8');
    const explore = agent.slice(agent.indexOf('## Mode `explore'), agent.indexOf('## Mode `develop'));
    expect(explore.length).toBeGreaterThan(100);
    expect(explore).toContain('When the direction names a craft');
  });
  it('records agent cost from the harness, not from estimates', () => {
    const concepts = readFileSync(join(root, 'plugin/skills/concepts/SKILL.md'), 'utf8');
    expect(concepts).toContain('subagent_tokens');
    expect(concepts).toContain('duration_ms');
  });
  it('asks the first questions and aims at an icon that stands on its own', () => {
    const skill = readFileSync(join(root, 'plugin/skills/design/SKILL.md'), 'utf8');
    expect(skill).toContain('### First questions');
    for (const q of ['Letter case', 'Icon or word first', 'Network']) expect(skill).toContain(q);
    expect(skill).toContain('If the user is away or asked not to be asked');
    expect(skill).not.toContain('at least one is warmer or more human than the category expects');
    const principles = readFileSync(
      join(root, 'plugin/skills/design/references/design-principles.md'),
      'utf8',
    );
    expect(principles).toContain('## The icon stands on its own');
    const agent = readFileSync(join(root, 'plugin/agents/concept-designer.md'), 'utf8');
    const explore = agent.slice(agent.indexOf('## Mode `explore'), agent.indexOf('## Mode `develop'));
    expect(explore).toContain('at least four variants');
    expect(explore).toContain('First read:');
  });
  it('develop offers word options and a weight ladder; critic and family are explicit', () => {
    const agent = readFileSync(join(root, 'plugin/agents/concept-designer.md'), 'utf8');
    const develop = agent.slice(agent.indexOf('## Mode `develop'), agent.indexOf('## Never'));
    expect(develop).toContain('review/wordmark-options.png');
    expect(develop).toContain('weight ladder');
    const skill = readFileSync(join(root, 'plugin/skills/design/SKILL.md'), 'utf8');
    expect(skill).toContain('### Family');
    expect(skill).toContain('Record a skipped critic');
  });
  it('cli.md table rows have as many cells as the header', () => {
    const cli = readFileSync(join(root, 'plugin/skills/design/references/cli.md'), 'utf8');
    const cells = (row: string) => row.replace(/\\\|/g, '').split('|').length;
    let header = 0;
    for (const line of cli.split('\n')) {
      if (!line.startsWith('|')) {
        header = 0;
        continue;
      }
      if (!header) header = cells(line);
      else expect(cells(line), line.slice(0, 80)).toBe(header);
    }
  });
});
