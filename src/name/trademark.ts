/**
 * Official and public trademark search entry points. Markilo does not scrape these services:
 * searches are run by a person or by the agent through ordinary web access, and logged with dates.
 * Last checked: 2026-10-30.
 */
export interface Registry {
  id: string;
  name: string;
  coverage: string;
  url: string;
  how: string;
}

export const REGISTRIES: Registry[] = [
  {
    id: 'wipo-gbd',
    name: 'WIPO Global Brand Database',
    coverage: 'International (Madrid) registrations plus many national offices',
    url: 'https://branddb.wipo.int/',
    how: 'Search "Brand name" with the fuzzy/phonetic strategy, then filter by Nice class. Also try the image search with the symbol PNG.',
  },
  {
    id: 'tmview',
    name: 'TMview (EUIPO and partner offices)',
    coverage: 'EU trade marks and 70+ national/regional offices',
    url: 'https://www.tmdn.org/tmview/',
    how: 'Search the name, enable "similar" matching, filter by Nice class and status "registered" or "filed".',
  },
  {
    id: 'uspto',
    name: 'USPTO Trademark Search',
    coverage: 'United States',
    url: 'https://tmsearch.uspto.gov/',
    how: 'Use the wordmark field with wildcards (e.g. nimbr*) and review live marks in the relevant classes.',
  },
  {
    id: 'turkpatent',
    name: 'TÜRKPATENT Marka Araştırma',
    coverage: 'Türkiye',
    url: 'https://www.turkpatent.gov.tr/arastirma-yap?form=trademark',
    how: 'Search the brand text and review results in the selected Nice classes.',
  },
  {
    id: 'ukipo',
    name: 'UK IPO trade mark search',
    coverage: 'United Kingdom',
    url: 'https://trademarks.ipo.gov.uk/ipo-tmtext',
    how: 'Search by word, then filter by class.',
  },
];

/** Keyword → Nice class suggestions (12th edition headings). Suggestions only; confirm with counsel. */
const NICE_HINTS: [RegExp, number[], string][] = [
  [
    /\b(software|app|application|sdk|plugin|cli|developer|code)\b/i,
    [9, 42],
    'downloadable software (9), SaaS and software development (42)',
  ],
  [
    /\b(saas|cloud|hosting|platform|api|ai|machine learning)\b/i,
    [42],
    'software as a service, hosting, AI services (42)',
  ],
  [
    /\b(e-?mail|mail|messaging|chat|telecom|communication|video call|meeting)\b/i,
    [38],
    'telecommunication and messaging services (38)',
  ],
  [
    /\b(marketing|advertising|crm|analytics|e-?commerce|store|shop|retail|marketplace)\b/i,
    [35],
    'advertising, business management, retail services (35)',
  ],
  [/\b(website|site builder|web design|cms)\b/i, [42], 'website design and hosting (42)'],
  [/\b(education|course|learning|school|training|lab)\b/i, [41], 'education and training (41)'],
  [/\b(game|gaming|entertainment|music|media|streaming)\b/i, [9, 41], 'games and entertainment (9, 41)'],
  [/\b(bank|finance|payment|fintech|insurance|invest)\b/i, [36], 'financial services (36)'],
  [/\b(health|medical|clinic|wellness|fitness)\b/i, [44, 10], 'medical and wellness services (44, 10)'],
  [/\b(food|restaurant|cafe|coffee|catering)\b/i, [43, 30], 'food and beverage services (43, 30)'],
  [/\b(clothing|apparel|fashion|shoes)\b/i, [25], 'clothing (25)'],
  [/\b(cosmetic|beauty|skincare)\b/i, [3], 'cosmetics (3)'],
  [/\b(travel|booking|transport|logistics|delivery)\b/i, [39], 'transport and travel arrangement (39)'],
];

export function suggestNiceClasses(description: string): { classes: number[]; reasons: string[] } {
  const classes = new Set<number>();
  const reasons: string[] = [];
  for (const [re, cls, why] of NICE_HINTS) {
    if (re.test(description)) {
      for (const c of cls) classes.add(c);
      reasons.push(why);
    }
  }
  return { classes: [...classes].sort((a, b) => a - b), reasons };
}

export function trademarkSearchPlan(name: string, classes: number[]) {
  return {
    name,
    classes,
    registries: REGISTRIES,
    queries: [name, `${name.slice(0, Math.max(3, Math.ceil(name.length * 0.6)))}*`],
    disclaimer:
      'This is a pre-screening aid, not a clearance search or legal advice. Absence of results does not prove a mark is available. Consult a trademark attorney before adopting a brand.',
  };
}
