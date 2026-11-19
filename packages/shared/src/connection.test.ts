import { describe, expect, it } from 'vitest';
import { replaceRetiredApiUrl } from './connection';

const CURRENT = 'https://aitranslater.onrender.com';

describe('replaceRetiredApiUrl', () => {
  it('moves the retired Railway host to the current server', () => {
    expect(replaceRetiredApiUrl('https://verba-api-production.up.railway.app', CURRENT)).toBe(CURRENT);
  });

  it('keeps any other server, including self-hosted and local ones', () => {
    expect(replaceRetiredApiUrl('https://my-verba.example.com', CURRENT)).toBe('https://my-verba.example.com');
    expect(replaceRetiredApiUrl('http://localhost:8787', CURRENT)).toBe('http://localhost:8787');
  });

  it('leaves values that are not URLs unchanged', () => {
    expect(replaceRetiredApiUrl('not a url', CURRENT)).toBe('not a url');
  });
});
