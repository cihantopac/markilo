import { parseArgs } from 'node:util';
import { MarkiloError } from '../core/errors.js';

export interface OptionSpec {
  type: 'string' | 'boolean';
  short?: string;
  multiple?: boolean;
  description: string;
}

export interface CommandSpec {
  name: string;
  summary: string;
  usage: string;
  options?: Record<string, OptionSpec>;
  run(ctx: RunContext): Promise<unknown>;
}

export interface RunContext {
  cwd: string;
  positionals: string[];
  values: Record<string, string | boolean | string[] | undefined>;
  str(name: string, required?: boolean): string | undefined;
  req(name: string): string;
  bool(name: string): boolean;
  list(name: string): string[];
  num(name: string, fallback?: number): number | undefined;
}

export const GLOBAL_OPTIONS: Record<string, OptionSpec> = {
  workspace: {
    type: 'string',
    short: 'w',
    description: 'Workspace directory (default: ./brand or nearest markilo.json)',
  },
  help: { type: 'boolean', short: 'h', description: 'Show help for this command' },
};

export function parseCommand(spec: CommandSpec, argv: string[], cwd: string): RunContext {
  const options = { ...GLOBAL_OPTIONS, ...(spec.options ?? {}) };
  let parsed: ReturnType<typeof parseArgs>;
  try {
    parsed = parseArgs({
      args: argv,
      allowPositionals: true,
      strict: true,
      options: Object.fromEntries(
        Object.entries(options).map(([k, o]) => [
          k,
          { type: o.type, ...(o.short ? { short: o.short } : {}), ...(o.multiple ? { multiple: true } : {}) },
        ]),
      ),
    });
  } catch (err) {
    const message = (err as Error).message;
    // An unquoted #rrggbb starts a shell comment: the option arrives empty and the rest of the command is gone.
    const colour = /'--(primary|secondary|accent|ink|paper|color|bg)\b[^']*' argument missing/.test(message);
    throw new MarkiloError(
      'USAGE',
      message,
      colour
        ? `Quote colours in the shell: --${message.match(/--(\w+)/)![1]} '#1d4e89'. An unquoted # starts a comment and drops everything after it. Usage: markilo ${spec.usage}`
        : `Usage: markilo ${spec.usage}`,
    );
  }
  const values = parsed.values as RunContext['values'];
  const ctx: RunContext = {
    cwd,
    positionals: parsed.positionals,
    values,
    str(name, required) {
      const v = values[name];
      if (Array.isArray(v)) return v[v.length - 1];
      if (typeof v === 'string') return v;
      if (required) throw new MarkiloError('USAGE', `--${name} is required.`, `Usage: markilo ${spec.usage}`);
      return undefined;
    },
    req(name) {
      return ctx.str(name, true)!;
    },
    bool(name) {
      return values[name] === true;
    },
    list(name) {
      const v = values[name];
      const arr = Array.isArray(v) ? v : typeof v === 'string' ? [v] : [];
      return arr
        .flatMap((x) => x.split(','))
        .map((x) => x.trim())
        .filter(Boolean);
    },
    num(name, fallback) {
      const v = ctx.str(name);
      if (v === undefined) return fallback;
      const n = Number(v);
      if (!Number.isFinite(n)) throw new MarkiloError('USAGE', `--${name} must be a number.`);
      return n;
    },
  };
  return ctx;
}

export function commandHelp(spec: CommandSpec): string {
  const opts = { ...(spec.options ?? {}), ...GLOBAL_OPTIONS };
  const lines = [`markilo ${spec.usage}`, '', spec.summary, ''];
  const entries = Object.entries(opts);
  if (entries.length) {
    lines.push('Options:');
    for (const [k, o] of entries) {
      const flag = `${o.short ? `-${o.short}, ` : '    '}--${k}${o.type === 'string' ? ' <value>' : ''}`;
      lines.push(`  ${flag.padEnd(30)} ${o.description}`);
    }
  }
  return lines.join('\n');
}
