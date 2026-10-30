/**
 * What a product does, for whom and why — read from what the project itself says (README sections, package and app
 * manifests, route and screen files, locale files) and, separately, inferred from its dependencies. Every item keeps
 * its source; whatever cannot be established is listed under `unknown` instead of being guessed.
 */

export interface ProductSignal {
  text: string;
  /** File (or URL) the signal comes from. */
  source: string;
  /** stated: the project says so; inferred: derived (e.g. from a dependency) and needs confirming. */
  basis: 'stated' | 'inferred';
}

export interface ProductUnderstanding {
  valueProposition?: ProductSignal;
  features: ProductSignal[];
  audience: ProductSignal[];
  capabilities: ProductSignal[];
  surfaces: ProductSignal[];
  platforms: ProductSignal[];
  languages: ProductSignal[];
  pricing?: ProductSignal;
  /** Questions the evidence does not answer. Research or the user must fill them; they are never guessed. */
  unknown: string[];
}

export const emptyUnderstanding = (): ProductUnderstanding => ({
  features: [],
  audience: [],
  capabilities: [],
  surfaces: [],
  platforms: [],
  languages: [],
  unknown: [],
});

const clean = (s: string, max = 220) =>
  s
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/[*_`>#|]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max);

const FEATURE_HEADING =
  /(features?|what (it|you can) do|highlights|capabilities|key|why|how it works|screens|modules|products|what's inside|özellik|neler)/i;
const AUDIENCE_HEADING =
  /(who (it|this) is for|who is it for|audience|for whom|users|built for|kimler için|kim için)/i;
const PRICING_HEADING = /(pricing|plans|price|fiyat)/i;
const AUDIENCE_NOUN =
  '(?:freelancers|developers|designers|teams|agencies|startups|founders|makers|businesses|companies|firms|students|teachers|parents|families|clinics|doctors|patients|creators|marketers|engineers|shops|restaurants|nonprofits|adults|kids|children|workers|enterprises|organisations|organizations|people|users|professionals)';
const AUDIENCE_PHRASE = new RegExp(
  `\\bfor ((?:[a-z][a-z-]+ ){0,3}${AUDIENCE_NOUN}(?:(?:,| and| &| or) (?:[a-z][a-z-]+ ){0,3}${AUDIENCE_NOUN})*)\\b`,
  'i',
);
const LANGUAGES = [
  'English',
  'Turkish',
  'German',
  'French',
  'Spanish',
  'Italian',
  'Portuguese',
  'Dutch',
  'Polish',
  'Arabic',
  'Russian',
  'Japanese',
  'Korean',
  'Chinese',
  'Hindi',
  'Indonesian',
  'Swedish',
  'Norwegian',
  'Danish',
  'Finnish',
  'Greek',
  'Hebrew',
  'Ukrainian',
  'Czech',
  'Romanian',
  'Vietnamese',
  'Thai',
];

/** Sections of a Markdown document: heading → body. */
function sections(md: string): { heading: string; body: string }[] {
  const text = md.replace(/```[\s\S]*?```/g, '');
  const out: { heading: string; body: string }[] = [];
  let cur = { heading: '', body: '' };
  for (const line of text.split(/\r?\n/)) {
    const h = /^#{1,4}\s+(.+?)\s*#*$/.exec(line);
    if (h) {
      out.push(cur);
      cur = { heading: h[1]!, body: '' };
    } else cur.body += `${line}\n`;
  }
  out.push(cur);
  return out;
}

const bullets = (body: string) =>
  body
    .split(/\r?\n/)
    .map((l) => /^\s*(?:[-*+]|\d+[.)])\s+(.+)$/.exec(l)?.[1])
    .filter((x): x is string => Boolean(x))
    .map((x) => clean(x))
    .filter((x) => x.length > 3);

const tableRows = (body: string) =>
  body
    .split(/\r?\n/)
    .filter((l) => /^\s*\|/.test(l) && !/^\s*\|\s*-/.test(l))
    .slice(1)
    .map((l) =>
      l
        .split('|')
        .map((c) => clean(c, 120))
        .filter(Boolean)
        .join(' — '),
    )
    .filter((x) => x.length > 3);

const paragraphs = (body: string, min = 30) =>
  body
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter((p) => p && !/^\s*([-*+|]|\d+[.)]|!\[|\[!\[|<)/.test(p))
    .map((p) => clean(p, 400))
    .filter((p) => p.length > min);

/** Reads a README (or similar product document) for the value proposition, features, audience and pricing. */
export function fromReadme(md: string, source: string, u: ProductUnderstanding): void {
  const secs = sections(md);
  const intro = secs.find((s) => s.body.trim() && paragraphs(s.body).length);
  const first = intro ? paragraphs(intro.body)[0] : undefined;
  if (first && !u.valueProposition) {
    // A one-line tagline is often followed by the real explanation; keep both when the first is short.
    const second = intro ? paragraphs(intro.body)[1] : undefined;
    const text = first.length < 90 && second ? `${first} ${second}` : first;
    u.valueProposition = { text: text.slice(0, 320), source, basis: 'stated' };
  }
  for (const s of secs) {
    if (FEATURE_HEADING.test(s.heading))
      for (const b of [...bullets(s.body), ...tableRows(s.body)].slice(0, 12))
        u.features.push({ text: b, source, basis: 'stated' });
    if (AUDIENCE_HEADING.test(s.heading)) {
      const items = bullets(s.body);
      for (const t of items.length ? items : paragraphs(s.body, 8).slice(0, 2))
        u.audience.push({ text: t, source, basis: 'stated' });
    }
    if (PRICING_HEADING.test(s.heading) && !u.pricing) {
      const t = [...bullets(s.body), ...paragraphs(s.body)][0];
      if (t) u.pricing = { text: t, source, basis: 'stated' };
    }
  }
  // Products with a "| Product | What it does |" table describe their family that way.
  if (!u.features.length)
    for (const s of secs)
      for (const r of tableRows(s.body).slice(0, 8)) u.features.push({ text: r, source, basis: 'stated' });
  const plain = md.replace(/```[\s\S]*?```/g, '');
  if (!u.audience.length) {
    const m = AUDIENCE_PHRASE.exec(plain);
    if (m) u.audience.push({ text: clean(m[0]), source, basis: 'stated' });
  }
  // Languages the product says it ships in ("English and Turkish at launch").
  for (const lang of LANGUAGES)
    if (new RegExp(`\\b${lang}\\b`).test(plain) && !u.languages.some((l) => l.text === lang))
      u.languages.push({ text: lang, source, basis: 'stated' });
}

/** Dependencies that imply what the product does. Inferred, so the brief must confirm them. */
const CAPABILITIES: [RegExp, string][] = [
  [
    /^(stripe|@stripe\/|@paddle\/|@lemonsqueezy\/|braintree|iyzipay|pay$|in_app_purchase|purchases_flutter)/,
    'takes payments',
  ],
  [
    /^(@prisma\/client|prisma|drizzle-orm|typeorm|mongoose|sequelize|sqflite|drift|hive)$/,
    'stores user data in a database',
  ],
  [
    /^(next-auth|@auth\/|@clerk\/|@auth0\/|@supabase\/|firebase_auth|firebase$|passport)/,
    'has user accounts and sign-in',
  ],
  [/^(openai|@anthropic-ai\/|langchain|@langchain\/|ai$|@ai-sdk\/|google_generative_ai)/, 'uses AI models'],
  [/^(socket\.io|pusher|ably|@liveblocks\/|yjs|y-websocket)/, 'has real-time collaboration or live updates'],
  [
    /^(i18next|react-i18next|next-intl|vue-i18n|flutter_localizations|intl$|easy_localization)/,
    'is multilingual',
  ],
  [/^(mapbox-gl|leaflet|@react-google-maps\/|google_maps_flutter)/, 'shows maps or locations'],
  [/^(chart\.js|recharts|d3|echarts|fl_chart|@nivo\/)/, 'shows charts and data'],
  [/^(just_audio|audioplayers|expo-av|howler|tone)$/, 'plays audio'],
  [
    /^(twilio|@sendgrid\/|resend|nodemailer|postmark|firebase_messaging|onesignal)/,
    'sends messages or notifications',
  ],
  [/^(pdfkit|pdf-lib|@react-pdf\/|pdf$|printing)$/, 'creates documents or PDFs'],
  [/^(commander|yargs|oclif|@oclif\/|cac|clipanion|meow)$/, 'has a command-line interface'],
];

export function fromDependencies(deps: string[], source: string, u: ProductUnderstanding): void {
  const seen = new Set(u.capabilities.map((c) => c.text));
  for (const d of deps)
    for (const [re, cap] of CAPABILITIES)
      if (re.test(d) && !seen.has(cap)) {
        seen.add(cap);
        u.capabilities.push({ text: `${cap} (dependency ${d})`, source, basis: 'inferred' });
      }
}

const ROUTE_SKIP =
  /^(api|_.*|\(.*\)|\[.*\]|layout|loading|error|not-found|globals?|components?|lib|utils?|hooks?|styles?)$/i;

/** Route or screen names from file paths: app/invoices/page.tsx, pages/pricing.tsx, lib/screens/journal.dart. */
export function surfaceOf(rel: string): string | undefined {
  let m = /(?:^|\/)app\/((?:[^/]+\/)*?)([^/]+)\/page\.(t|j)sx?$/.exec(rel);
  if (m && !ROUTE_SKIP.test(m[2]!)) return `/${m[2]}`;
  m = /(?:^|\/)pages\/([a-z0-9-]+)\.(t|j)sx?$/i.exec(rel);
  if (m && !ROUTE_SKIP.test(m[1]!) && m[1] !== 'index') return `/${m[1]}`;
  m = /(?:^|\/)lib\/(?:screens|pages|views|features)\/([a-z0-9_]+?)(?:_screen|_page|_view)?\.dart$/i.exec(
    rel,
  );
  if (m) return `${m[1]!.replace(/_/g, ' ')} screen`;
  m = /(?:^|\/)(?:Screens?|Views?)\/([A-Z][A-Za-z0-9]+?)(?:Screen|View)\.(swift|kt|tsx|jsx)$/.exec(rel);
  if (m) return `${m[1]} screen`;
  return undefined;
}

export function laravelRoutes(php: string): string[] {
  return [...php.matchAll(/Route::(?:get|post|view|resource)\(\s*['"]\/?([a-z0-9-]+)/gi)]
    .map((m) => `/${m[1]}`)
    .filter((r) => r !== '/');
}

/** Locale codes from file paths: locales/tr/…, i18n/de.json, l10n/app_tr.arb, lang/fr/…, values-es/strings.xml. */
export function localeOf(rel: string): string | undefined {
  const m =
    /(?:^|\/)(?:locales?|i18n|lang|translations|messages)\/([a-z]{2}(?:[-_][A-Z]{2})?)(?:\/|\.json$|\.ya?ml$|\.po$)/.exec(
      rel,
    ) ??
    /(?:^|\/)l10n\/[a-z_]*?_([a-z]{2}(?:_[A-Z]{2})?)\.arb$/.exec(rel) ??
    /(?:^|\/)values-([a-z]{2})(?:-r[A-Z]{2})?\/strings\.xml$/.exec(rel) ??
    /(?:^|\/)([a-z]{2})\.lproj\//.exec(rel);
  return m?.[1]?.replace('_', '-');
}

/** Lists what the evidence does not establish. */
export function finishUnderstanding(u: ProductUnderstanding): ProductUnderstanding {
  const dedupe = (xs: ProductSignal[]) => xs.filter((x, i) => xs.findIndex((y) => y.text === x.text) === i);
  u.features = dedupe(u.features).slice(0, 15);
  u.audience = dedupe(u.audience).slice(0, 6);
  u.surfaces = dedupe(u.surfaces).slice(0, 20);
  u.platforms = dedupe(u.platforms);
  u.languages = dedupe(u.languages);
  u.unknown = [];
  if (!u.valueProposition)
    u.unknown.push('value proposition: no plain statement of what the product does and why');
  if (!u.features.length) u.unknown.push('features: no feature list found');
  if (!u.audience.length) u.unknown.push('audience: who the product is for is not stated');
  if (!u.pricing) u.unknown.push('pricing and business model: not stated');
  if (!u.platforms.length) u.unknown.push('platforms: where the product runs is not evident');
  if (!u.languages.length) u.unknown.push('languages and markets: no locale files or stated markets');
  return u;
}

/** Combines what the repository and the website say; the first value proposition found wins, lists are merged. */
export function mergeUnderstanding(
  base: ProductUnderstanding,
  add: ProductUnderstanding,
): ProductUnderstanding {
  const out: ProductUnderstanding = {
    ...((base.valueProposition ?? add.valueProposition)
      ? { valueProposition: (base.valueProposition ?? add.valueProposition)! }
      : {}),
    ...((base.pricing ?? add.pricing) ? { pricing: (base.pricing ?? add.pricing)! } : {}),
    features: [...base.features, ...add.features],
    audience: [...base.audience, ...add.audience],
    capabilities: [...base.capabilities, ...add.capabilities],
    surfaces: [...base.surfaces, ...add.surfaces],
    platforms: [...base.platforms, ...add.platforms],
    languages: [...base.languages, ...add.languages],
    unknown: [],
  };
  return finishUnderstanding(out);
}

export interface SitePageLike {
  url: string;
  title?: string;
  description?: string;
  headings: string[];
  textSample?: string;
  language?: string;
}

const PRICE =
  /(?:[$€£₺¥]\s?\d[\d.,]*|\d[\d.,]*\s?(?:USD|EUR|GBP|TRY|TL|₺))\s*(?:\/|per\s)?\s*(?:month|mo|year|yr|user|seat|ay|yıl)?/i;
const PLATFORM_WORDS: [RegExp, string][] = [
  [/\b(App Store|iPhone|iPad|iOS)\b/, 'iOS'],
  [/\b(Google Play|Android)\b/, 'Android'],
  [/\b(macOS|Mac app|for Mac)\b/, 'macOS'],
  [/\b(Windows)\b/, 'Windows'],
  [/\b(Chrome extension|browser extension)\b/i, 'browser extension'],
  [/\b(command line|CLI|terminal)\b/, 'command line'],
];

/** What a website says about the product: hero statement, feature headings, pricing, audience and platforms. */
export function fromSite(pages: SitePageLike[]): ProductUnderstanding {
  const u = emptyUnderstanding();
  const home = pages[0];
  if (home) {
    const hero = [home.headings[0], home.description].filter(Boolean).join(' — ');
    if (hero) u.valueProposition = { text: clean(hero, 320), source: home.url, basis: 'stated' };
    if (home.language) u.languages.push({ text: home.language, source: home.url, basis: 'stated' });
  }
  for (const pg of pages) {
    const path = (() => {
      try {
        return new URL(pg.url).pathname;
      } catch {
        return pg.url;
      }
    })();
    if (
      /\/(features?|product|products|solutions|how-it-works|platform|use-cases)(\/|$)/i.test(path) ||
      pg === home
    )
      for (const h of pg.headings.slice(pg === home ? 1 : 0, 8))
        u.features.push({ text: clean(h, 160), source: pg.url, basis: 'stated' });
    const text = [pg.title, pg.description, ...pg.headings, pg.textSample].filter(Boolean).join(' ');
    if (/\/(pricing|plans|price)(\/|$)/i.test(path) && !u.pricing) {
      const price = PRICE.exec(text)?.[0];
      u.pricing = {
        text: price
          ? `pricing page shows ${price.trim()}`
          : `pricing page: ${clean(pg.headings[0] ?? pg.title ?? path, 160)}`,
        source: pg.url,
        basis: 'stated',
      };
    }
    const m = AUDIENCE_PHRASE.exec(text);
    if (m) u.audience.push({ text: clean(m[0], 160), source: pg.url, basis: 'stated' });
    for (const [re, name] of PLATFORM_WORDS)
      if (re.test(text)) u.platforms.push({ text: name, source: pg.url, basis: 'stated' });
  }
  u.platforms.push({ text: 'web', source: home?.url ?? '', basis: 'stated' });
  return finishUnderstanding(u);
}
