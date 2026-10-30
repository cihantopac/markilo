import { describe, expect, it } from 'vitest';
import { compareNames, phoneticKey, pronunciationNotes } from '../src/name/similarity.js';
import { suggestNiceClasses, trademarkSearchPlan } from '../src/name/trademark.js';

describe('name similarity', () => {
  it('identical after normalization is high risk', () => {
    expect(compareNames('Nimbra', 'NIMBRA!').risk).toBe('high');
    expect(compareNames('Şirket', 'Sirket').score).toBe(1);
  });
  it('catches sound-alikes and shared stems', () => {
    expect(phoneticKey('Kwikly')).toBe(phoneticKey('Quickly'));
    expect(compareNames('Kwikly', 'Quickly').risk).toBe('high');
    expect(compareNames('Nimbra', 'Nimbus Notes').risk).not.toBe('low');
  });
  it('ignores cross-word fragments and generic category words', () => {
    expect(compareNames('preplay', 'Google Play').risk).toBe('low');
    expect(compareNames('Streamly', 'Stream Pro').signals.sharedStem).toBe('');
    expect(compareNames('Nimbra', 'Nimbrax Cloud').risk).not.toBe('low');
  });
  it('unrelated names are low risk', () => {
    expect(compareNames('Nimbra', 'Zentrix').risk).toBe('low');
  });
  it('gives pronunciation notes', () => {
    expect(pronunciationNotes('Strkzpt').join(' ')).toMatch(/consonants|vowels/);
  });
  it('suggests Nice classes and a registry plan', () => {
    expect(suggestNiceClasses('SaaS email marketing app').classes).toEqual(
      expect.arrayContaining([9, 35, 38, 42]),
    );
    const plan = trademarkSearchPlan('Nimbra', [9, 42]);
    expect(plan.registries.length).toBeGreaterThanOrEqual(4);
    expect(plan.disclaimer).toMatch(/not a clearance search/);
  });
});
