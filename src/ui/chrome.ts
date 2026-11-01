import { createHash } from 'node:crypto';
import { escapeAttr, escapeText } from '../svg/xml.js';
import { TR } from './tr.js';

/**
 * The page chrome shared by Markilo's offline HTML (gallery, kit preview, brand guidelines): Markilo's own ink, warm
 * paper and oxblood for the interface, an English/Turkish switch and a light/dark/system theme, remembered per browser.
 * Brand artwork and swatches are never styled by it: they keep the brand's own colors.
 *
 * Translation is a plain dictionary keyed by the English text, which stays in the HTML, so a page without script
 * still reads in English. Only interface text is marked for translation; brand names, evidence, identifiers and file
 * names are left as written.
 */

const fill = (s: string, vars: (string | number)[]) =>
  s.replace(/\{(\d)\}/g, (m, i: string) => String(vars[Number(i)] ?? m));

/** Translatable interface text. With values, the English template (with {0}, {1}…) travels in the attribute. */
export function t(en: string, vars?: (string | number)[]): string {
  if (!vars) return `<span data-i18n>${escapeText(en)}</span>`;
  return `<span data-i18n="${escapeAttr(en)}" data-i18n-v="${escapeAttr(JSON.stringify(vars.map(String)))}">${escapeText(fill(en, vars))}</span>`;
}

/** A translatable attribute (placeholder, title or aria-label), rendered in English. */
export function ta(name: 'placeholder' | 'title' | 'aria-label', en: string): string {
  return ` ${name}="${escapeAttr(en)}" data-i18n-${name}="${escapeAttr(en)}"`;
}

/** Interface tokens: Markilo's palette (tokens/tokens.css of its approved identity) in light and dark. */
const LIGHT =
  '--bg:#f2ece1;--card:#fbf8f2;--sunk:#ebe3d6;--ink:#16120f;--muted:#6b625b;--line:#ddd2c4;--accent:#7e1d2a;--accent-ink:#fff;--link:#7e1d2a;--good:#2e6b3d;--warn:#8a5a00;--bad:#b42318;--shadow:0 1px 2px rgba(22,18,15,.06),0 4px 16px rgba(22,18,15,.05)';
const DARK =
  '--bg:#120b0b;--card:#1c1414;--sunk:#251b1a;--ink:#f2ece1;--muted:#a89d95;--line:#3a2e2c;--accent:#a33b44;--accent-ink:#fff;--link:#e39a9e;--good:#7cc493;--warn:#e0b25c;--bad:#ff8a7a;--shadow:0 1px 2px rgba(0,0,0,.3)';

export const CHROME_CSS = `:root{${LIGHT};--serif:"Iowan Old Style","Palatino Linotype",Palatino,"Book Antiqua",Georgia,serif;--sans:system-ui,-apple-system,"Segoe UI",Roboto,"Helvetica Neue",sans-serif;color-scheme:light}
@media (prefers-color-scheme:dark){:root:not([data-theme=light]){${DARK};color-scheme:dark}}
:root[data-theme=dark]{${DARK};color-scheme:dark}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--ink);font:15px/1.5 var(--sans);-webkit-font-smoothing:antialiased}
a{color:var(--link)}
.mk-top{display:flex;flex-wrap:wrap;gap:10px 16px;align-items:center;justify-content:space-between;padding:12px 20px;border-bottom:1px solid var(--line);background:var(--card)}
.mk-brand{display:flex;align-items:center;gap:8px;color:var(--ink);text-decoration:none;font:600 15px/1 var(--serif);letter-spacing:.01em}.mk-brand svg{width:22px;height:22px}.mk-brand .p{fill:#7e1d2a}
:root[data-theme=dark] .mk-brand .p{fill:#b34f55}@media (prefers-color-scheme:dark){:root:not([data-theme=light]) .mk-brand .p{fill:#b34f55}}
.mk-brand small{font:500 11px/1 var(--sans);color:var(--muted);text-transform:uppercase;letter-spacing:.08em;border-left:1px solid var(--line);padding-left:8px}
.mk-prefs{display:flex;gap:8px;visibility:hidden}.mk-js .mk-prefs{visibility:visible}
.mk-seg{display:inline-flex;border:1px solid var(--line);border-radius:99px;padding:2px;background:var(--bg)}
.mk-seg button{font:500 12px/1 var(--sans);color:var(--muted);background:transparent;border:0;border-radius:99px;padding:6px 10px;cursor:pointer;min-height:28px}
.mk-seg button[aria-pressed=true]{background:var(--ink);color:var(--bg)}.mk-seg button:focus-visible{outline:2px solid var(--accent);outline-offset:1px}
.mk-steps{display:flex;flex-wrap:wrap;gap:4px;list-style:none;margin:0;padding:0;counter-reset:s}
.mk-steps li{counter-increment:s;display:flex;align-items:center;gap:6px;font-size:12px;color:var(--muted);padding:4px 10px 4px 4px;border-radius:99px;border:1px solid transparent}
.mk-steps li:before{content:counter(s);display:grid;place-items:center;width:20px;height:20px;border-radius:50%;border:1px solid var(--line);font-size:11px;font-weight:600}
.mk-steps li.done:before{content:"✓";background:var(--sunk);color:var(--ink)}.mk-steps li.now{color:var(--ink);border-color:var(--accent);font-weight:600}.mk-steps li.now:before{background:var(--accent);border-color:var(--accent);color:var(--accent-ink)}
.mk-foot{max-width:1280px;margin:0 auto;padding:24px 16px 32px;color:var(--muted);font-size:12px;display:flex;gap:6px;align-items:center}.mk-foot svg{width:14px;height:14px}
@media (max-width:640px){.mk-top{padding:10px 14px}.mk-steps{flex-wrap:nowrap;overflow-x:auto;scrollbar-width:none}.mk-steps li{font-size:11px;padding-right:8px;white-space:nowrap;flex:none}}
@media print{.mk-prefs{display:none}}`;

/** Markilo's approved symbol (branding/brands/markilo/final/symbol.svg), drawn in the interface's ink. */
const SYMBOL =
  '<svg viewBox="0 0 1024 1024" aria-hidden="true"><path fill="currentColor" fill-rule="evenodd" d="M253.08 151.99h-9.28l-48.49 48.48-48.48-48.48h-9.28v629.24c0 20.94-1.02 49.09-21.15 61.38-7.36 4.5-15.85 7.04-24.24 8.77v12.38h206.31v-12.38c-8.39-1.73-16.88-4.27-24.24-8.77-20.13-12.29-21.15-40.44-21.15-61.38zM512 463 345.92 151.99h-92.84L512 636.82l258.92-484.83v629.24c0 20.94-1.02 49.09-21.15 61.38-7.36 4.5-15.85 7.04-24.24 8.77v12.38h206.31v-12.38c-8.39-1.73-16.88-4.27-24.24-8.77-20.13-12.29-21.15-40.44-21.15-61.38V151.99h-9.28l-48.48 48.48-48.49-48.48H678.08z"/><path class="p" fill-rule="evenodd" d="m512 698.71 86.65 86.65L512 872.01l-86.65-86.65z"/></svg>';

/** The language and theme switches. Hidden until the script runs, since they need it. */
export function prefsHtml(): string {
  return `<div class="mk-prefs">
<div class="mk-seg" role="group"${ta('aria-label', 'Language')}><button type="button" data-mk-lang="en" aria-pressed="true" lang="en">EN</button><button type="button" data-mk-lang="tr" aria-pressed="false" lang="tr">TR</button></div>
<div class="mk-seg" role="group"${ta('aria-label', 'Theme')}><button type="button" data-mk-theme="light" aria-pressed="false">${t('Light')}</button><button type="button" data-mk-theme="dark" aria-pressed="false">${t('Dark')}</button><button type="button" data-mk-theme="system" aria-pressed="true">${t('System')}</button></div>
</div>`;
}

/** The top bar: Markilo, what the page is, optional extra content, and the preferences. */
export function topBar(page: string, extra = ''): string {
  return `<header class="mk-top"><span class="mk-brand">${SYMBOL}Markilo<small>${t(page)}</small></span>${extra}${prefsHtml()}</header>`;
}

export const WORKFLOW = [
  'Three proposals',
  'Compare',
  'Select or request changes',
  'Finalize',
  'Export',
] as const;
export type StepState = 'done' | 'now' | 'next';

/** The studio's path, with where this page stands on it. */
export function stepsHtml(states: readonly StepState[]): string {
  return `<ol class="mk-steps"${ta('aria-label', 'Workflow')}>${WORKFLOW.map(
    (s, i) =>
      `<li class="${states[i] ?? 'next'}"${states[i] === 'now' ? ' aria-current="step"' : ''}>${t(s)}</li>`,
  ).join('')}</ol>`;
}

export function footHtml(): string {
  return `<footer class="mk-foot">${SYMBOL}${t('Made with Markilo — works offline; nothing on this page is loaded from the internet.')}</footer>`;
}

/**
 * Applies the remembered theme before the page paints and translates marked text. Runs in the page's own scope, sets
 * no HTML (only textContent and attributes), stores two words in localStorage and never touches the network.
 */
function chromeScript(page: string): string {
  // Only the entries this page uses travel with it.
  const dict = Object.fromEntries(
    Object.entries(TR).filter(
      ([en]) => page.includes(en) || page.includes(escapeText(en)) || page.includes(escapeAttr(en)),
    ),
  );
  return `(()=>{const D=${JSON.stringify(dict).replace(/</g, '\\u003c')},K='markilo-ui',R=document.documentElement;let p={};try{p=JSON.parse(localStorage.getItem(K)||'{}')||{}}catch(e){}
const nav=String(navigator.language||'').toLowerCase().startsWith('tr')?'tr':'en';
const S={lang:p.lang==='tr'||p.lang==='en'?p.lang:nav,theme:p.theme==='light'||p.theme==='dark'?p.theme:'system'};
const fill=(s,v)=>s.replace(/\\{(\\d)\\}/g,(m,i)=>v[i]!==undefined?v[i]:m);
const t=(en,...v)=>fill(S.lang==='tr'&&D[en]||en,v);
const theme=()=>{if(S.theme==='system')delete R.dataset.theme;else R.dataset.theme=S.theme};theme();R.classList.add('mk-js');
const O=new WeakMap();const vars=el=>{try{return JSON.parse(el.getAttribute('data-i18n-v')||'[]')}catch(e){return[]}};
function apply(){R.lang=S.lang;
document.querySelectorAll('[data-i18n]').forEach(el=>{let en=el.getAttribute('data-i18n');if(!en){if(!O.has(el))O.set(el,el.textContent);en=O.get(el)}el.textContent=t(en,...vars(el))});
for(const a of['placeholder','title','aria-label'])document.querySelectorAll('[data-i18n-'+a+']').forEach(el=>el.setAttribute(a,t(el.getAttribute('data-i18n-'+a))));
document.querySelectorAll('[data-mk-lang]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.mkLang===S.lang)));
document.querySelectorAll('[data-mk-theme]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.mkTheme===S.theme)));
document.dispatchEvent(new CustomEvent('markilo:ui'))}
const store=()=>{try{localStorage.setItem(K,JSON.stringify(S))}catch(e){}};
window.markiloUi={t,get lang(){return S.lang}};
const ready=()=>{document.querySelectorAll('[data-mk-lang]').forEach(b=>b.onclick=()=>{S.lang=b.dataset.mkLang;store();apply()});
document.querySelectorAll('[data-mk-theme]').forEach(b=>b.onclick=()=>{S.theme=b.dataset.mkTheme;store();theme();apply()});apply()};
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',ready);else ready()})();`;
}

/** CSP source for a static script: its hash, so a page that is copied around stays deterministic and still locked. */
function scriptHash(js: string): string {
  return `'sha256-${createHash('sha256').update(js, 'utf8').digest('base64')}'`;
}

/** Where a page puts the chrome script, and (for a page without a nonce) its CSP hash. */
export const CHROME_SCRIPT = '<!--markilo:chrome-script-->';
export const CHROME_HASH = '<!--markilo:chrome-hash-->';

/** Fills in the chrome script of a finished page, with the dictionary entries it needs and its hash for the CSP. */
export function withChrome(html: string): string {
  const js = chromeScript(html);
  return html.replace(CHROME_HASH, () => scriptHash(js)).replace(CHROME_SCRIPT, () => js);
}
