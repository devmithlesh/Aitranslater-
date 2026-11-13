import request from 'supertest';
import { afterEach, describe, expect, it } from 'vitest';
import { createHarness, type Harness } from './helpers';

describe('general rate limiter', () => {
  let h: Harness | undefined;
  afterEach(async () => {
    await h?.close();
    h = undefined;
  });

  it('does not reset the budget when the client rotates bogus tokens', async () => {
    h = await createHarness({ RATE_LIMIT_PER_MINUTE: '3' });
    for (let i = 0; i < 3; i++) {
      const res = await request(h.app).get('/api/providers').set('Authorization', `Bearer bogus-${i}-token-value`);
      expect(res.status).toBe(401);
    }
    const limited = await request(h.app).get('/api/providers').set('Authorization', 'Bearer bogus-new-token-value');
    expect(limited.status).toBe(429);
    expect(limited.body.error.code).toBe('RATE_LIMITED');
  });
});
