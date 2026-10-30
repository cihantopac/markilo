/** Stable error codes. Skills branch on these, so never rename an existing code. */
export type ErrorCode =
  | 'USAGE'
  | 'NOT_FOUND'
  | 'EXISTS'
  | 'UNSAFE_PATH'
  | 'INVALID_INPUT'
  | 'INVALID_SVG'
  | 'NETWORK_DISABLED'
  | 'NETWORK'
  | 'ROBOTS_DISALLOWED'
  | 'LOCKED'
  | 'NO_WORKSPACE'
  | 'INTERNAL';

export class MarkiloError extends Error {
  readonly code: ErrorCode;
  readonly hint: string | undefined;

  constructor(code: ErrorCode, message: string, hint?: string) {
    super(message);
    this.name = 'MarkiloError';
    this.code = code;
    this.hint = hint;
  }
}

export const exitCodeFor = (code: ErrorCode): number =>
  code === 'USAGE' ? 64 : code === 'INTERNAL' ? 70 : 1;
