import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS } from '@verba/shared';
import { AUTH, createHarness, type Harness } from './helpers';
import { decryptSecret, encryptSecret, parseEncryptionKey } from '../src/utils/crypto';
import { chunkForMyMemory } from '../src/providers/translation/mymemory';

describe('settings', () => {
  let h: Harness;
  beforeEach(async () => {
    h = await createHarness();
  });
  afterEach(async () => {
    await h.close();
  });

  it('returns defaults before anything is saved', async () => {
    const res = await request(h.app).get('/api/settings').set(AUTH);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ defaultTargetLang: DEFAULT_SETTINGS.defaultTargetLang, saveHistory: true });
    expect(res.body.extension.toolbarActions).toEqual(DEFAULT_SETTINGS.extension.toolbarActions);
  });

  it('deep-merges the extension block and replaces arrays', async () => {
    const res = await request(h.app)
      .put('/api/settings')
      .set(AUTH)
      .send({
        extension: { enabled: false, disabledSites: ['Bank.Example.com'] },
        favoriteLanguages: ['es', 'es', 'fr'],
        updatedAt: '2000-01-01T00:00:00.000Z',
      });
    expect(res.status).toBe(200);
    expect(res.body.extension.enabled).toBe(false);
    expect(res.body.extension.showToolbarOnSelection).toBe(true);
    expect(res.body.extension.disabledSites).toEqual(['bank.example.com']);
    expect(res.body.favoriteLanguages).toEqual(['es', 'fr']);
    expect(res.body.updatedAt).not.toBe('2000-01-01T00:00:00.000Z');

    const second = await request(h.app)
      .put('/api/settings')
      .set(AUTH)
      .send({ extension: { toolbarActions: ['translate', 'more'] } });
    expect(second.body.extension.toolbarActions).toEqual(['translate', 'more']);
    expect(second.body.extension.enabled).toBe(false);
  });

  it('rejects unknown keys and out-of-range values', async () => {
    const unknown = await request(h.app).put('/api/settings').set(AUTH).send({ nonsense: true });
    expect(unknown.status).toBe(400);
    const tooMany = await request(h.app)
      .put('/api/settings')
      .set(AUTH)
      .send({ favoriteLanguages: ['en', 'hi', 'pa', 'bn', 'gu', 'mr', 'ta', 'te', 'kn', 'ml', 'ur', 'fr', 'es'] });
    expect(tooMany.status).toBe(400);
    const duplicateToolbar = await request(h.app)
      .put('/api/settings')
      .set(AUTH)
      .send({ extension: { toolbarActions: ['translate', 'translate'] } });
    expect(duplicateToolbar.status).toBe(400);
  });
});

describe('crypto', () => {
  const key = parseEncryptionKey('22'.repeat(32));

  it('round-trips a secret with AES-256-GCM', () => {
    const payload = encryptSecret('my-api-key', key);
    expect(payload.split('.')).toHaveLength(3);
    expect(payload).not.toContain('my-api-key');
    expect(decryptSecret(payload, key)).toBe('my-api-key');
  });

  it('fails to decrypt with a different key or a tampered payload', () => {
    const payload = encryptSecret('my-api-key', key);
    const otherKey = parseEncryptionKey('33'.repeat(32));
    expect(() => decryptSecret(payload, otherKey)).toThrow();
    const [iv, tag, data] = payload.split('.');
    const tampered = [iv, tag, data.slice(0, -2) + (data.endsWith('AA') ? 'BB' : 'AA')].join('.');
    expect(() => decryptSecret(tampered, key)).toThrow();
  });

  it('accepts hex and base64 keys and rejects anything else', () => {
    expect(parseEncryptionKey('ab'.repeat(32))).toHaveLength(32);
    expect(parseEncryptionKey(Buffer.alloc(32, 1).toString('base64'))).toHaveLength(32);
    expect(() => parseEncryptionKey('too-short')).toThrow();
  });
});

describe('MyMemory chunking', () => {
  it('keeps every chunk within the limit and preserves the words', () => {
    const sentence = 'The quick brown fox jumps over the lazy dog. ';
    const text = `${sentence.repeat(40)}\n\n${'x'.repeat(1000)}\nlast line`;
    const chunks = chunkForMyMemory(text, 450);
    expect(chunks.length).toBeGreaterThan(1);
    for (const chunk of chunks) expect(chunk.text.length).toBeLessThanOrEqual(450);
    const rebuilt = chunks.map((c) => c.text).join(' ');
    expect(rebuilt.replace(/\s+/g, '')).toBe(text.replace(/\s+/g, ''));
  });
});

describe('extension and stats', () => {
  let h: Harness;
  beforeEach(async () => {
    h = await createHarness();
  });
  afterEach(async () => {
    await h.close();
  });

  it('tracks extension heartbeats and reports them online', async () => {
    const before = await request(h.app).get('/api/extension/status').set(AUTH);
    expect(before.body).toEqual({ connected: false, online: false, lastSeenAt: null, version: null });

    const beat = await request(h.app)
      .post('/api/extension/heartbeat')
      .set(AUTH)
      .set('X-Verba-Client', 'extension')
      .send({ version: '0.1.0', userAgent: 'Chrome' });
    expect(beat.status).toBe(204);

    const after = await request(h.app).get('/api/extension/status').set(AUTH);
    expect(after.body).toMatchObject({ connected: true, online: true, version: '0.1.0' });
  });

  it('returns a full stats payload even when empty', async () => {
    const res = await request(h.app).get('/api/stats').set(AUTH);
    expect(res.status).toBe(200);
    expect(res.body.daily).toHaveLength(14);
    expect(res.body.totals.all).toBe(0);
    expect(res.body.recent).toEqual([]);
    expect(res.body.byClient).toEqual({ web: 0, extension: 0 });
  });
});
