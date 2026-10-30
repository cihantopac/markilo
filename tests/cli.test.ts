import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { tmp } from './helpers.js';

const bin = join(__dirname, '..', 'dist', 'markilo.mjs');
const run = (args: string[], cwd: string) =>
  spawnSync(process.execPath, [bin, ...args], { cwd, encoding: 'utf8' });

describe('cli (bundled)', () => {
  it('prints help and version', () => {
    const cwd = tmp();
    expect(run(['help'], cwd).stdout).toContain('Usage: markilo');
    expect(run(['--version'], cwd).stdout.trim()).toMatch(/^\d+\.\d+\.\d+/);
  });
  it('returns structured errors with stable codes', () => {
    const cwd = tmp();
    const r = run(['brand', 'list'], cwd);
    expect(r.status).toBe(1);
    expect(JSON.parse(r.stderr).error.code).toBe('NO_WORKSPACE');
    const u = run(['frobnicate'], cwd);
    expect(u.status).toBe(64);
    expect(JSON.parse(u.stderr).error.code).toBe('USAGE');
  });
  it('runs a workspace flow from any directory', () => {
    const cwd = tmp();
    expect(run(['init', '--name', 'Demo'], cwd).status).toBe(0);
    expect(JSON.parse(run(['brand', 'add', 'Örnek Marka'], cwd).stdout).brand.slug).toBe('ornek-marka');
    const wm = run(
      ['wordmark', '--text', 'Örnek', '--font', 'inter', '--weight', '700', '--tracking=-20', '-o', 'wm.svg'],
      cwd,
    );
    expect(wm.status, wm.stderr).toBe(0);
    expect(readFileSync(join(cwd, 'wm.svg'), 'utf8')).toContain('data-cap-height');
    expect(run(['wordmark', '--text', 'x', '--font', 'inter', '-o', 'wm.svg'], cwd).status).toBe(1);
    const net = run(['research', 'site', 'https://example.com', '--brand', 'ornek-marka'], cwd);
    expect(JSON.parse(net.stderr).error.code).toBe('NETWORK_DISABLED');
  });
  it('shortcut install is a dry run without --yes and refuses foreign files', () => {
    const dir = tmp();
    const dry = JSON.parse(run(['shortcut', 'install', '--dir', dir], dir).stdout);
    expect(dry.applied).toBe(false);
    expect(existsSync(join(dir, 'markilo', 'SKILL.md'))).toBe(false);
    expect(JSON.parse(run(['shortcut', 'install', '--dir', dir, '--yes'], dir).stdout).applied).toBe(true);
    expect(JSON.parse(run(['shortcut', 'status', '--dir', dir], dir).stdout).managedByMarkilo).toBe(true);
    expect(JSON.parse(run(['shortcut', 'uninstall', '--dir', dir, '--yes'], dir).stdout).applied).toBe(true);
  });
});
