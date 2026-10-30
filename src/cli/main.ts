import { exitCodeFor, MarkiloError } from '../core/errors.js';
import { commandHelp, parseCommand } from './args.js';
import { COMMANDS, findCommand, VERSION } from './commands.js';

const GROUPS: [string, string[]][] = [
  ['Workspace', ['init', 'brand add', 'brand list', 'brief show', 'brief update']],
  [
    'Research',
    [
      'research repo',
      'research site',
      'profile show',
      'profile add-source',
      'profile add-finding',
      'profile add-gap',
      'answers',
      'reference add',
      'reference list',
    ],
  ],
  ['Design', ['concept new', 'concept list', 'concept update', 'wordmark', 'lockup', 'palette', 'fonts']],
  [
    'Verify',
    [
      'verify',
      'originality',
      'diversity',
      'score',
      'analyze',
      'compare',
      'svg lint',
      'name check',
      'name trademark',
    ],
  ],
  ['Deliver', ['finalize', 'lock', 'export', 'gallery', 'install-assets', 'render', 'svg optimize']],
  ['System', ['shortcut', 'doctor']],
];

function usage(): string {
  const lines = [
    `Markilo ${VERSION} — brand identity studio toolchain`,
    '',
    'Usage: markilo <command> [options]   (markilo <command> --help for details)',
    '',
  ];
  for (const [title, names] of GROUPS) {
    lines.push(`${title}:`);
    for (const n of names) {
      const c = COMMANDS.find((x) => x.name === n);
      if (c) lines.push(`  ${n.padEnd(20)} ${c.summary.split('. ')[0]!.replace(/\.$/, '')}`);
    }
    lines.push('');
  }
  lines.push(
    'Output is JSON on stdout (compact when piped; MARKILO_PRETTY=1 to indent); errors are JSON on stderr with a stable "code".',
  );
  return lines.join('\n');
}

async function main(argv: string[]): Promise<number> {
  if (!argv.length || argv[0] === 'help' || argv[0] === '--help' || argv[0] === '-h') {
    process.stdout.write(`${usage()}\n`);
    return 0;
  }
  if (argv[0] === '--version' || argv[0] === '-v' || argv[0] === 'version') {
    process.stdout.write(`${VERSION}\n`);
    return 0;
  }
  const found = findCommand(argv);
  if (!found) {
    throw new MarkiloError(
      'USAGE',
      `Unknown command "${argv.slice(0, 2).join(' ')}".`,
      'Run "markilo help" for the command list.',
    );
  }
  if (found.rest.includes('--help') || found.rest.includes('-h')) {
    process.stdout.write(`${commandHelp(found.spec)}\n`);
    return 0;
  }
  const ctx = parseCommand(found.spec, found.rest, process.cwd());
  const result = await found.spec.run(ctx);
  // Compact JSON when another program (such as Claude) reads the output: indentation costs tokens.
  const pretty = process.stdout.isTTY || process.env.MARKILO_PRETTY === '1';
  process.stdout.write(`${JSON.stringify(result, null, pretty ? 2 : undefined)}\n`);
  return 0;
}

main(process.argv.slice(2)).then(
  (code) => {
    process.exitCode = code;
  },
  (err: unknown) => {
    if (err instanceof MarkiloError) {
      process.stderr.write(
        `${JSON.stringify({ error: { code: err.code, message: err.message, ...(err.hint ? { hint: err.hint } : {}) } }, null, 2)}\n`,
      );
      process.exitCode = exitCodeFor(err.code);
    } else {
      const e = err as Error;
      process.stderr.write(
        `${JSON.stringify({ error: { code: 'INTERNAL', message: e?.message ?? String(err) } }, null, 2)}\n`,
      );
      if (process.env.MARKILO_DEBUG) process.stderr.write(`${e?.stack ?? ''}\n`);
      process.exitCode = 70;
    }
  },
);
