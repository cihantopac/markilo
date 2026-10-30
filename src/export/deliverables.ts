import type { Brief } from '../core/types.js';
import { EXPORT_GROUPS, type ExportGroup } from './exporter.js';

/** What each export group contains, in words a user can choose from. */
export const GROUP_INFO: Record<ExportGroup, string> = {
  logos: 'logo files: symbol, wordmark and lockups in color, reversed, black and white (SVG + PNG)',
  web: 'favicons, PWA and maskable icons, apple-touch-icon, web manifest and an HTML head snippet',
  ios: 'iOS / iPadOS app icon set (light, dark, tinted) and Icon Composer sources',
  android: 'Android adaptive and legacy launcher icons, Play Store icon, TV banners',
  macos: 'macOS app icon (.icns and icon set)',
  windows: 'Windows app icons (.ico, tiles and unplated variants)',
  social: 'Open Graph images, X / LinkedIn covers and profile avatars',
  marketing: 'business card, email signature and letterhead artwork',
  tokens: 'color and typography design tokens (JSON, CSS, Tailwind)',
  guidelines: 'brand guidelines page (HTML + Markdown)',
};

const has = (text: string, re: RegExp) => re.test(text.toLowerCase());

export interface DeliverableSuggestion {
  groups: ExportGroup[];
  /** Why each suggested group is in. */
  reasons: Partial<Record<ExportGroup, string>>;
  /** Groups left out, with what they contain, to offer in one question. */
  optional: { group: ExportGroup; contains: string }[];
}

/**
 * Picks the export groups a product needs from what the brief says about it, so a web app does not get desktop and
 * mobile icon sets nobody asked for. Logos, tokens and guidelines are always in.
 */
export function suggestDeliverables(
  brief: Pick<Brief, 'product' | 'oneLiner' | 'notes'>,
): DeliverableSuggestion {
  const platforms = (brief.product?.platforms ?? []).join(' ');
  const text = [
    platforms,
    brief.product?.type ?? '',
    brief.product?.category ?? '',
    brief.oneLiner ?? '',
  ].join(' ');
  const reasons: DeliverableSuggestion['reasons'] = {
    logos: 'every identity needs its logo files',
    tokens: 'colors and type for designers and developers',
    guidelines: 'how to use the identity',
  };
  const ios = has(text, /\b(ios|iphone|ipad|ipados|mobile|app store|react native|flutter|swiftui)\b/);
  const android = has(text, /\b(android|mobile|play store|google play|react native|flutter|kotlin)\b/);
  const desktop = has(text, /\b(desktop|electron|tauri)\b/);
  const mac = desktop || has(text, /\b(macos|mac app|os x)\b/);
  const win = desktop || has(text, /\b(windows|win32|uwp)\b/);
  const onlyNative = (ios || android || mac || win) && !has(text, /\b(web|site|saas|browser|online|pwa)\b/);
  if (!onlyNative) reasons.web = 'browser tab icons, home-screen icons and link previews';
  if (ios) reasons.ios = 'the product ships on iOS / iPadOS';
  if (android) reasons.android = 'the product ships on Android';
  if (mac) reasons.macos = 'the product ships as a Mac app';
  if (win) reasons.windows = 'the product ships as a Windows app';
  reasons.social = 'link previews and profile images wherever the product is shared';
  const groups = EXPORT_GROUPS.filter((g) => g in reasons);
  return {
    groups,
    reasons,
    optional: EXPORT_GROUPS.filter((g) => !groups.includes(g)).map((g) => ({
      group: g,
      contains: GROUP_INFO[g],
    })),
  };
}

/** The groups to export: the brief's saved choice when it names known groups, otherwise the suggestion. */
export function resolveDeliverables(brief: Brief): { groups: ExportGroup[]; source: 'brief' | 'suggested' } {
  const chosen = (brief.deliverables ?? []).filter((d): d is ExportGroup =>
    (EXPORT_GROUPS as readonly string[]).includes(d),
  );
  if (chosen.length) return { groups: EXPORT_GROUPS.filter((g) => chosen.includes(g)), source: 'brief' };
  return { groups: suggestDeliverables(brief).groups, source: 'suggested' };
}
