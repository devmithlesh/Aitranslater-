import { describe, expect, it } from 'vitest';
import { NAME_MAX_LENGTH, PASSWORD_MIN_LENGTH } from '@verba/shared';
import { parseRequest } from '../src/background/router';

const validSignup = {
  type: 'verba:signup',
  name: 'Ada Lovelace',
  email: 'ada@example.com',
  password: 'correct horse',
};

describe('parseRequest: verba:signup', () => {
  it('parses a valid signup and trims name and email', () => {
    const parsed = parseRequest({
      ...validSignup,
      name: '  Ada Lovelace  ',
      email: '  ada@example.com \n',
      password: '  spaced password  ',
    });
    expect(parsed).toMatchObject({
      type: 'verba:signup',
      name: 'Ada Lovelace',
      email: 'ada@example.com',
      password: '  spaced password  ',
    });
  });

  it('keeps optional apiUrl and dashboardUrl', () => {
    const parsed = parseRequest({ ...validSignup, apiUrl: 'https://api.example.com', dashboardUrl: 'https://app.example.com' });
    expect(parsed).toMatchObject({ apiUrl: 'https://api.example.com', dashboardUrl: 'https://app.example.com' });
  });

  it('rejects an empty or whitespace-only name', () => {
    expect(parseRequest({ ...validSignup, name: '' })).toBeNull();
    expect(parseRequest({ ...validSignup, name: '   ' })).toBeNull();
  });

  it('rejects a name longer than NAME_MAX_LENGTH', () => {
    expect(parseRequest({ ...validSignup, name: 'a'.repeat(NAME_MAX_LENGTH + 1) })).toBeNull();
    expect(parseRequest({ ...validSignup, name: 'a'.repeat(NAME_MAX_LENGTH) })).not.toBeNull();
  });

  it('rejects a password shorter than PASSWORD_MIN_LENGTH', () => {
    expect(parseRequest({ ...validSignup, password: 'a'.repeat(PASSWORD_MIN_LENGTH - 1) })).toBeNull();
    expect(parseRequest({ ...validSignup, password: 'a'.repeat(PASSWORD_MIN_LENGTH) })).not.toBeNull();
  });

  it('rejects bad field types', () => {
    expect(parseRequest({ ...validSignup, name: 42 })).toBeNull();
    expect(parseRequest({ ...validSignup, email: null })).toBeNull();
    expect(parseRequest({ ...validSignup, password: ['correct horse'] })).toBeNull();
    expect(parseRequest({ type: 'verba:signup' })).toBeNull();
  });
});

describe('parseRequest: verba:login', () => {
  it('still parses a valid login', () => {
    expect(
      parseRequest({ type: 'verba:login', email: ' ada@example.com ', password: 'secret' }),
    ).toEqual({
      type: 'verba:login',
      apiUrl: undefined,
      email: 'ada@example.com',
      password: 'secret',
      dashboardUrl: undefined,
    });
  });

  it('rejects a login with an empty email or password', () => {
    expect(parseRequest({ type: 'verba:login', email: '  ', password: 'secret' })).toBeNull();
    expect(parseRequest({ type: 'verba:login', email: 'ada@example.com', password: '' })).toBeNull();
  });
});
