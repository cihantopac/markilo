#!/usr/bin/env node
// Fails when the committed dist/ differs from a fresh build (keeps the plugin bundle honest in CI).
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const tmp = mkdtempSync(join(tmpdir(), 'markilo-dist-'));
const digest = (dir) =>
  Object.fromEntries(
    readdirSync(dir).map((f) => [
      f,
      createHash('sha256')
        .update(readFileSync(join(dir, f)))
        .digest('hex'),
    ]),
  );
try {
  execFileSync(process.execPath, [join(root, 'scripts/build.mjs'), relative(process.cwd(), tmp)], {
    stdio: 'ignore',
  });
  const fresh = digest(tmp);
  const committed = digest(join(root, 'dist'));
  const stale = Object.keys({ ...fresh, ...committed }).filter((f) => fresh[f] !== committed[f]);
  if (stale.length) {
    console.error(`dist/ is out of date (${stale.join(', ')}). Run "npm run build" and commit the result.`);
    process.exit(1);
  }
  console.log('dist/ is up to date.');
} finally {
  rmSync(tmp, { recursive: true, force: true });
}
