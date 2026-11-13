import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { AUTH, createHarness, type Harness } from './helpers';

describe('auth and HTTP hardening', () => {
  let h: Harness;
  beforeEach(async () => {
    h = await createHarness();
  });
  afterEach(async () => {
    await h.close();
  });

  it('serves health publicly', async () => {
    const res = await request(h.app).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ status: 'ok', name: 'verba', storage: 'file' });
  });

  it('rejects requests without a token', async () => {
    const res = await request(h.app).get('/api/providers');
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('UNAUTHORIZED');
  });

  it('rejects a wrong token', async () => {
    const res = await request(h.app).get('/api/providers').set('Authorization', 'Bearer wrong-token-value-here');
    expect(res.status).toBe(401);
  });

  it('accepts the correct token and verifies it', async () => {
    const res = await request(h.app).get('/api/auth/verify').set(AUTH);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true, userId: 'local', role: 'admin', name: 'Admin' });
  });

  it('returns VALIDATION_ERROR with issue details for a bad body', async () => {
    const res = await request(h.app).post('/api/translate').set(AUTH).send({ text: '' });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    expect(Array.isArray(res.body.error.details)).toBe(true);
    expect(res.body.error.details.length).toBeGreaterThan(0);
  });

  it('returns 413 PAYLOAD_TOO_LARGE for bodies over 64 KB', async () => {
    const res = await request(h.app)
      .post('/api/translate')
      .set(AUTH)
      .send({ text: 'a'.repeat(70_000), sourceLang: 'en', targetLang: 'es' });
    expect(res.status).toBe(413);
    expect(res.body.error.code).toBe('PAYLOAD_TOO_LARGE');
  });

  it('returns the contract 404 shape for unknown API routes', async () => {
    const res = await request(h.app).get('/api/nope').set(AUTH);
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
  });

  it('does not leak the framework header', async () => {
    const res = await request(h.app).get('/api/health');
    expect(res.headers['x-powered-by']).toBeUndefined();
  });

  it('allows chrome-extension origins and sends the CORS header back', async () => {
    const origin = 'chrome-extension://abcdefghijklmnopabcdefghijklmnop';
    const res = await request(h.app).get('/api/health').set('Origin', origin);
    expect(res.headers['access-control-allow-origin']).toBe(origin);
    expect(res.headers['cross-origin-resource-policy']).toBe('cross-origin');
  });

  it('does not allow unknown web origins', async () => {
    const res = await request(h.app).get('/api/health').set('Origin', 'https://evil.example');
    expect(res.headers['access-control-allow-origin']).toBeUndefined();
  });

  it('answers the preflight for the Verba client header', async () => {
    const res = await request(h.app)
      .options('/api/translate')
      .set('Origin', 'http://localhost:5173')
      .set('Access-Control-Request-Method', 'POST')
      .set('Access-Control-Request-Headers', 'authorization,content-type,x-verba-client');
    expect(res.status).toBe(204);
    expect(res.headers['access-control-allow-headers']).toContain('X-Verba-Client');
  });
});
