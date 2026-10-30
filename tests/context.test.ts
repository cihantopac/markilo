import { describe, expect, it } from 'vitest';
import { contextSheetSvg } from '../src/render/context.js';

const mark = (fill: string) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><circle cx="50" cy="50" r="40" fill="${fill}"/></svg>`;

describe('context sheet', () => {
  it('leaves home-screen slots without a collected peer empty', async () => {
    const { svg } = await contextSheetSvg({
      name: 'Own',
      symbol: mark('#224466'),
      paper: '#ffffff',
      primary: '#224466',
      peers: [
        { name: 'Alpha', svg: mark('#aa3311') },
        { name: 'Beta', svg: mark('#11aa33') },
      ],
    });
    // Two peers and the concept: three tiles, not eight (blank tiles read as white app icons).
    expect(svg.match(/width="60" height="60" rx="14"/g)).toHaveLength(3);
  });
});
