import { describe, expect, it } from 'vitest';
import {
  cleanApiUrl,
  cleanDashboardUrl,
  classifySender,
  isHostDisabled,
  isRequestAllowed,
  isSafePath,
} from '../src/lib/policy';
import { parseRequest } from '../src/background/router';

const EXT_ORIGIN = 'chrome-extension://abcdef/';

describe('request policy', () => {
  it('denies content scripts every request except opening the popup', () => {
    const content = 'content' as const;
    expect(isRequestAllowed(content, { type: 'verba:api', method: 'POST', path: '/translate-variants' })).toBe(false);
    expect(isRequestAllowed(content, { type: 'verba:api', method: 'DELETE', path: '/history' })).toBe(false);
    expect(isRequestAllowed(content, { type: 'verba:get-state' })).toBe(false);
    expect(isRequestAllowed(content, { type: 'verba:open-options' })).toBe(false);
    expect(isRequestAllowed(content, { type: 'verba:login', email: 'a@b.co', password: 'x' })).toBe(false);
    expect(isRequestAllowed(content, { type: 'verba:open-popup' })).toBe(true);
  });

  it('checks the dashboard path for extension pages', () => {
    const ext = 'extension' as const;
    expect(isRequestAllowed(ext, { type: 'verba:open-dashboard', path: '/settings/providers' })).toBe(true);
    expect(isRequestAllowed(ext, { type: 'verba:open-dashboard', path: '/../admin' })).toBe(false);
    expect(isRequestAllowed(ext, { type: 'verba:open-dashboard' })).toBe(true);
  });

  it('lets extension pages use any safe path but rejects traversal and absolute URLs', () => {
    const ext = 'extension' as const;
    expect(isRequestAllowed(ext, { type: 'verba:api', method: 'GET', path: '/providers' })).toBe(true);
    expect(isRequestAllowed(ext, { type: 'verba:api', method: 'GET', path: '/history?type=translate' })).toBe(true);
    expect(isRequestAllowed(ext, { type: 'verba:api', method: 'GET', path: '/../admin' })).toBe(false);
    expect(isRequestAllowed(ext, { type: 'verba:api', method: 'GET', path: '//evil.example/x' })).toBe(false);
    expect(isRequestAllowed(ext, { type: 'verba:api', method: 'GET', path: 'https://evil.example' })).toBe(false);
    expect(isRequestAllowed(ext, { type: 'verba:api', method: 'GET', path: '/%2e%2e/admin' })).toBe(false);
  });

  it('denies untrusted senders everything', () => {
    expect(isRequestAllowed('untrusted', { type: 'verba:get-state' })).toBe(false);
  });

  it('validates path shape', () => {
    expect(isSafePath('/settings/providers')).toBe(true);
    expect(isSafePath('settings')).toBe(false);
    expect(isSafePath('/a\\b')).toBe(false);
  });
});

describe('sender classification', () => {
  it('treats pages under the extension origin as extension pages', () => {
    expect(classifySender({ id: 'abc', url: `${EXT_ORIGIN}popup.html` }, 'abc', EXT_ORIGIN)).toBe('extension');
  });

  it('treats web pages as content scripts and foreign ids as untrusted', () => {
    expect(classifySender({ id: 'abc', url: 'https://mail.example.com/' }, 'abc', EXT_ORIGIN)).toBe('content');
    expect(classifySender({ id: 'other', url: 'https://mail.example.com/' }, 'abc', EXT_ORIGIN)).toBe('untrusted');
    expect(classifySender({ url: 'https://mail.example.com/' }, undefined, EXT_ORIGIN)).toBe('untrusted');
  });
});

describe('URL validation', () => {
  it('normalises the backend URL and rejects non-http schemes', () => {
    expect(cleanApiUrl('http://localhost:1201/api/')).toBe('http://localhost:1201');
    expect(cleanApiUrl('javascript:alert(1)')).toBeNull();
    expect(cleanApiUrl('ftp://files.example.com')).toBeNull();
  });

  it('keeps the dashboard path but drops query, hash and trailing slashes', () => {
    expect(cleanDashboardUrl('https://app.example.com/verba/?x=1#y')).toBe('https://app.example.com/verba');
    expect(cleanDashboardUrl('file:///etc/passwd')).toBeNull();
  });
});

describe('site rules', () => {
  it('matches a disabled site and its subdomains, not look-alike hosts', () => {
    expect(isHostDisabled('bank.example.com', ['bank.example.com'])).toBe(true);
    expect(isHostDisabled('mail.bank.example.com', ['bank.example.com'])).toBe(true);
    expect(isHostDisabled('notbank.example.com', ['bank.example.com'])).toBe(false);
    expect(isHostDisabled('example.com', [])).toBe(false);
  });
});

describe('request parsing', () => {
  it('rejects unknown types and malformed API calls', () => {
    expect(parseRequest({ type: 'verba:nope' })).toBeNull();
    expect(parseRequest({ type: 'verba:api', method: 'TRACE', path: '/x' })).toBeNull();
    expect(parseRequest(null)).toBeNull();
    expect(parseRequest({ type: 'verba:api', method: 'POST', path: '/translate', body: { text: 'hi' } })).toEqual({
      type: 'verba:api',
      method: 'POST',
      path: '/translate',
      body: { text: 'hi' },
    });
  });

  it('parses email sign-in and trims the email but keeps the password as typed', () => {
    expect(
      parseRequest({ type: 'verba:login', email: '  user@example.com ', password: ' pw with spaces ' }),
    ).toEqual({
      type: 'verba:login',
      apiUrl: undefined,
      email: 'user@example.com',
      password: ' pw with spaces ',
      dashboardUrl: undefined,
    });
    expect(
      parseRequest({ type: 'verba:login', apiUrl: 'http://localhost:8787', email: 'a@b.co', password: 'x', dashboardUrl: 'http://localhost:5173' }),
    ).toMatchObject({ apiUrl: 'http://localhost:8787', dashboardUrl: 'http://localhost:5173' });
  });

  it('rejects malformed or oversized login requests', () => {
    expect(parseRequest({ type: 'verba:login', email: 'a@b.co' })).toBeNull();
    expect(parseRequest({ type: 'verba:login', email: 42, password: 'x' })).toBeNull();
    expect(parseRequest({ type: 'verba:login', email: '   ', password: 'x' })).toBeNull();
    expect(parseRequest({ type: 'verba:login', email: 'a@b.co', password: '' })).toBeNull();
    expect(parseRequest({ type: 'verba:login', email: `${'a'.repeat(250)}@b.co`, password: 'x' })).toBeNull();
    expect(parseRequest({ type: 'verba:login', email: 'a@b.co', password: 'p'.repeat(201) })).toBeNull();
    expect(parseRequest({ type: 'verba:login', email: 'a@b.co', password: 'p'.repeat(200) })).not.toBeNull();
  });
});
