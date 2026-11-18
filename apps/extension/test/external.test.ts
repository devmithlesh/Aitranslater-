import { describe, expect, it } from 'vitest';
import { isTrustedWebSender } from '../src/background/external';

const DASHBOARD = 'https://verba-trans-ai.netlify.app';

describe('isTrustedWebSender', () => {
  it('accepts a top-frame page from the dashboard origin', () => {
    expect(isTrustedWebSender({ origin: DASHBOARD, url: `${DASHBOARD}/extension/connect`, frameId: 0 }, DASHBOARD)).toBe(true);
  });

  it('rejects a page from any other origin', () => {
    expect(isTrustedWebSender({ origin: 'https://evil.example', frameId: 0 }, DASHBOARD)).toBe(false);
    expect(isTrustedWebSender({ origin: 'https://verba-trans-ai.netlify.app.evil.example', frameId: 0 }, DASHBOARD)).toBe(false);
    expect(isTrustedWebSender({ origin: 'http://verba-trans-ai.netlify.app', frameId: 0 }, DASHBOARD)).toBe(false);
  });

  it('rejects subframes', () => {
    expect(isTrustedWebSender({ origin: DASHBOARD, frameId: 3 }, DASHBOARD)).toBe(false);
    expect(isTrustedWebSender({ origin: DASHBOARD }, DASHBOARD)).toBe(false);
  });

  it('rejects senders with no origin or url', () => {
    expect(isTrustedWebSender({ frameId: 0 }, DASHBOARD)).toBe(false);
  });

  it('falls back to the url origin when origin is missing', () => {
    expect(isTrustedWebSender({ url: `${DASHBOARD}/extension/connect?ext=abc`, frameId: 0 }, DASHBOARD)).toBe(true);
    expect(isTrustedWebSender({ url: 'https://evil.example/page', frameId: 0 }, DASHBOARD)).toBe(false);
  });

  it('rejects an unparseable url', () => {
    expect(isTrustedWebSender({ url: 'not a url', frameId: 0 }, DASHBOARD)).toBe(false);
  });

  it('compares origins, so a dashboard URL with a trailing slash or path still matches', () => {
    expect(isTrustedWebSender({ origin: DASHBOARD, frameId: 0 }, `${DASHBOARD}/`)).toBe(true);
    expect(isTrustedWebSender({ origin: DASHBOARD, frameId: 0 }, `${DASHBOARD}/app/extension`)).toBe(true);
  });

  it('returns false when the configured dashboard URL is invalid', () => {
    expect(isTrustedWebSender({ origin: DASHBOARD, frameId: 0 }, 'not a url')).toBe(false);
  });
});
