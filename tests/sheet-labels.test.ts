import { describe, expect, it } from 'vitest';
import { adaptToGround, groundsFor } from '../src/export/variants.js';
import { compareSheetSvg, sheetSvg } from '../src/render/sheet.js';
import { mark } from './helpers.js';

// Sheet text is drawn as outlines, so the sheet is compared against one built from the expected title and labels.
describe('compare sheet', () => {
  const svg = mark('fold-n');
  const g = groundsFor('#ffffff');
  const expected = (title: string, label: string) =>
    sheetSvg(
      [
        { label, background: g.native, svg },
        {
          label: `${label} · on ${g.darkFirst ? 'light' : 'dark'}`,
          background: g.opposite,
          svg: adaptToGround(svg, g.opposite),
        },
      ],
      [16, 32, 64, 128, 256],
      title,
    );

  it('uses the caller title and labels unchanged', () => {
    const sheet = compareSheetSvg([{ label: 'B · Lantern', svg }], '#ffffff', 'Icon options');
    expect(sheet).toBe(expected('Icon options', 'B · Lantern'));
    expect(sheet).not.toBe(expected('Sketch comparison', 'B · Lantern'));
    expect(sheet).not.toBe(expected('Icon options', 'A · B · Lantern'));
  });

  it('defaults the title to Options', () => {
    expect(compareSheetSvg([{ label: 'x', svg }])).toBe(expected('Options', 'x'));
  });
});
