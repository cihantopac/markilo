// Minimal typings for the parts of fontkit Markilo uses.
declare module 'fontkit' {
  export interface PathCommand {
    command: 'moveTo' | 'lineTo' | 'quadraticCurveTo' | 'bezierCurveTo' | 'closePath';
    args: number[];
  }
  export interface Path {
    commands: PathCommand[];
  }
  export interface BBox {
    minX: number;
    minY: number;
    maxX: number;
    maxY: number;
  }
  export interface Glyph {
    id: number;
    path: Path;
    bbox: BBox;
    advanceWidth: number;
    codePoints: number[];
  }
  export interface GlyphPosition {
    xAdvance: number;
    yAdvance: number;
    xOffset: number;
    yOffset: number;
  }
  export interface GlyphRun {
    glyphs: Glyph[];
    positions: GlyphPosition[];
  }
  export interface Font {
    familyName: string;
    subfamilyName: string;
    unitsPerEm: number;
    capHeight: number;
    xHeight: number;
    ascent: number;
    descent: number;
    hasGlyphForCodePoint(cp: number): boolean;
    layout(text: string, features?: string[] | Record<string, boolean>): GlyphRun;
  }
  export function create(buffer: Uint8Array): Font;
}
