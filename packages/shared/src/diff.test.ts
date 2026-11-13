import { describe, expect, it } from 'vitest';
import { decodeConnectionCode, encodeConnectionCode } from './connection';
import { diffWords } from './diff';
import { getLanguage, languageName } from './languages';

const join = (segs: { op: string; text: string }[], keep: 'before' | 'after') =>
  segs.filter((s) => s.op === 'equal' || s.op === (keep === 'before' ? 'delete' : 'insert')).map((s) => s.text).join('');

describe('diffWords', () => {
  it('returns a single equal segment for identical text', () => {
    expect(diffWords('same text', 'same text')).toEqual([{ op: 'equal', text: 'same text' }]);
  });

  it('marks replaced words and reconstructs both sides', () => {
    const before = 'She go to school yesterday.';
    const after = 'She went to school yesterday.';
    const segs = diffWords(before, after);
    expect(segs).toContainEqual({ op: 'delete', text: 'go' });
    expect(segs).toContainEqual({ op: 'insert', text: 'went' });
    expect(join(segs, 'before')).toBe(before);
    expect(join(segs, 'after')).toBe(after);
  });

  it('handles non-Latin scripts', () => {
    const segs = diffWords('नमस्ते आप कैसे हो', 'नमस्ते आप कैसे हैं');
    expect(join(segs, 'after')).toBe('नमस्ते आप कैसे हैं');
    expect(segs.some((s) => s.op === 'insert')).toBe(true);
  });

  it('handles empty inputs', () => {
    expect(diffWords('', '')).toEqual([]);
    expect(diffWords('', 'new')).toEqual([{ op: 'insert', text: 'new' }]);
  });
});

describe('connection code', () => {
  it('round-trips and normalizes the URL', () => {
    const code = encodeConnectionCode('http://localhost:8787/api/', 'tok_123');
    expect(code.startsWith('verba_')).toBe(true);
    expect(decodeConnectionCode(code)).toEqual({ v: 1, apiUrl: 'http://localhost:8787', token: 'tok_123' });
  });

  it('rejects garbage and non-http URLs', () => {
    expect(decodeConnectionCode('hello')).toBeNull();
    expect(decodeConnectionCode('verba_!!!')).toBeNull();
    const js = 'verba_' + btoa(JSON.stringify({ v: 1, apiUrl: 'javascript:alert(1)', token: 'x' }));
    expect(decodeConnectionCode(js)).toBeNull();
  });
});

describe('languages', () => {
  it('resolves aliases', () => {
    expect(getLanguage('zh')?.code).toBe('zh-Hans');
    expect(getLanguage('pt-BR')?.code).toBe('pt');
    expect(languageName('auto')).toBe('Detect language');
  });
});
