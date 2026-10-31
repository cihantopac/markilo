/** Evaluates rollout rules locally; the service only pushes rule updates. */
export function isEnabled(flag: string, user: { id: string }, rules: Record<string, number>): boolean {
  const share = rules[flag] ?? 0;
  return (hash(`${flag}:${user.id}`) % 10000) / 100 < share;
}
const hash = (s: string) => [...s].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7);
