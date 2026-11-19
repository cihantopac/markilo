import { TR } from './tr.js';

/** The language of a PNG board or of guidelines.md. English is the default and the text the code is written in. */
export type BoardLang = 'en' | 'tr';

const fill = (s: string, vars: (string | number)[]) =>
  s.replace(/\{(\d)\}/g, (m, i: string) => String(vars[Number(i)] ?? m));

/**
 * Board and guidelines text in `lang`: the same dictionary as the HTML pages, keyed by the English text. A text
 * without an entry stays English, and `en` returns the template unchanged apart from its {0}, {1}… values.
 */
export function boardText(en: string, lang: BoardLang = 'en', vars?: (string | number)[]): string {
  const text = lang === 'tr' ? (TR[en] ?? en) : en;
  return vars ? fill(text, vars) : text;
}

/** `en` or `tr` from a --lang value (case-insensitive); undefined for anything else. */
export function parseBoardLang(value: string | undefined): BoardLang | undefined {
  const v = value?.trim().toLowerCase();
  return v === 'en' || v === 'tr' ? v : undefined;
}

/** True when a brief's language entry names Turkish: "tr", "tr-TR", "Turkish", "Türkçe", "Turkce". */
export function isTurkish(entry: string | undefined): boolean {
  const v = (entry ?? '').trim().toLowerCase();
  return /^(tr([-_][a-z]+)?|tur|turkish|türkçe|turkce|turk)$/.test(v) || /^t[uü]rk(ish|çe|ce)\b/.test(v);
}

/** The board language of a brief: Turkish when its first audience language is Turkish, else English. */
export function briefBoardLang(brief: { audience?: { languages?: string[] } } | undefined): BoardLang {
  return isTurkish(brief?.audience?.languages?.[0]) ? 'tr' : 'en';
}
