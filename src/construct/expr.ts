import { MarkiloError } from '../core/errors.js';

/**
 * A tiny arithmetic evaluator for construction specs ("r*0.6", "gap/2+4", "sin(30)*r"). No eval, no property
 * access: numbers, parameter names, + - * / % ^, parentheses and a fixed set of functions. Trig takes degrees.
 */
const FUNCS: Record<string, (...a: number[]) => number> = {
  sin: (d) => Math.sin((d * Math.PI) / 180),
  cos: (d) => Math.cos((d * Math.PI) / 180),
  tan: (d) => Math.tan((d * Math.PI) / 180),
  atan2: (y, x) => (Math.atan2(y, x) * 180) / Math.PI,
  sqrt: Math.sqrt,
  abs: Math.abs,
  min: Math.min,
  max: Math.max,
  round: Math.round,
  floor: Math.floor,
  ceil: Math.ceil,
  hypot: Math.hypot,
};
const CONSTS: Record<string, number> = { pi: Math.PI, phi: (1 + Math.sqrt(5)) / 2 };

type Tok = { t: 'n'; v: number } | { t: 'id'; v: string } | { t: 'op'; v: string };

function tokenize(src: string): Tok[] {
  const out: Tok[] = [];
  const re = /\s*(?:(\d+(?:\.\d*)?|\.\d+)(?:e([+-]?\d+))?|([A-Za-z_][A-Za-z0-9_]*)|(\*\*|[-+*/%^(),]))/y;
  let i = 0;
  while (i < src.length) {
    if (/\s/.test(src[i]!)) {
      i++;
      continue;
    }
    re.lastIndex = i;
    const m = re.exec(src);
    if (!m)
      throw new MarkiloError(
        'INVALID_INPUT',
        `Cannot read expression "${src}" at "${src.slice(i, i + 10)}".`,
      );
    if (m[1] !== undefined) out.push({ t: 'n', v: Number(m[1]) * 10 ** Number(m[2] ?? 0) });
    else if (m[3] !== undefined) out.push({ t: 'id', v: m[3] });
    else out.push({ t: 'op', v: m[4] === '**' ? '^' : m[4]! });
    i = re.lastIndex;
  }
  return out;
}

export function evaluate(src: string, vars: Record<string, number>): number {
  const toks = tokenize(src);
  let i = 0;
  const peek = () => toks[i];
  const take = (v?: string) => {
    const t = toks[i];
    if (!t || (v && (t.t !== 'op' || t.v !== v)))
      throw new MarkiloError('INVALID_INPUT', `Expression "${src}": expected ${v ?? 'a value'}.`);
    i++;
    return t;
  };
  const isOp = (v: string) => peek()?.t === 'op' && peek()!.v === v;

  const primary = (): number => {
    const t = take();
    if (t.t === 'n') return t.v;
    if (t.t === 'op' && t.v === '(') {
      const v = expr();
      take(')');
      return v;
    }
    if (t.t === 'op' && t.v === '-') return -unary();
    if (t.t === 'op' && t.v === '+') return unary();
    if (t.t === 'id') {
      if (isOp('(')) {
        const fn = Object.hasOwn(FUNCS, t.v) ? FUNCS[t.v] : undefined;
        if (!fn) throw new MarkiloError('INVALID_INPUT', `Expression "${src}": unknown function ${t.v}().`);
        take('(');
        const args: number[] = [];
        if (!isOp(')'))
          do args.push(expr());
          while (isOp(',') && take(','));
        take(')');
        return fn(...args);
      }
      if (Object.hasOwn(vars, t.v)) return vars[t.v]!;
      if (Object.hasOwn(CONSTS, t.v)) return CONSTS[t.v]!;
      throw new MarkiloError(
        'INVALID_INPUT',
        `Expression "${src}": unknown name "${t.v}". Define it under "params".`,
      );
    }
    throw new MarkiloError('INVALID_INPUT', `Expression "${src}": unexpected "${t.v}".`);
  };
  const unary = (): number => {
    const base = primary();
    if (isOp('^')) {
      take('^');
      return base ** unary();
    }
    return base;
  };
  const term = (): number => {
    let v = unary();
    while (isOp('*') || isOp('/') || isOp('%')) {
      const op = (take() as { v: string }).v;
      const r = unary();
      v = op === '*' ? v * r : op === '/' ? v / r : v % r;
    }
    return v;
  };
  const expr = (): number => {
    let v = term();
    while (isOp('+') || isOp('-')) {
      const op = (take() as { v: string }).v;
      const r = term();
      v = op === '+' ? v + r : v - r;
    }
    return v;
  };
  const v = expr();
  if (i < toks.length)
    throw new MarkiloError('INVALID_INPUT', `Expression "${src}": unexpected trailing input.`);
  if (!Number.isFinite(v))
    throw new MarkiloError('INVALID_INPUT', `Expression "${src}" is not a finite number.`);
  return v;
}
