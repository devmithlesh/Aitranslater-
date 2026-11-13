import { EMAIL_MAX_LENGTH, NAME_MAX_LENGTH, PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH } from '@verba/shared';

const EMAIL_SHAPE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Returns an inline error message, or null when the value is acceptable. */
export function checkName(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return 'Enter your name.';
  if (trimmed.length > NAME_MAX_LENGTH) return `Use ${NAME_MAX_LENGTH} characters or fewer.`;
  return null;
}

export function checkEmail(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return 'Enter an email address.';
  if (trimmed.length > EMAIL_MAX_LENGTH) return `Use ${EMAIL_MAX_LENGTH} characters or fewer.`;
  if (!EMAIL_SHAPE.test(trimmed)) return 'Enter a valid email address, like name@example.com.';
  return null;
}

export function checkPassword(value: string): string | null {
  if (value.length < PASSWORD_MIN_LENGTH) return `Use at least ${PASSWORD_MIN_LENGTH} characters.`;
  if (value.length > PASSWORD_MAX_LENGTH) return `Use ${PASSWORD_MAX_LENGTH} characters or fewer.`;
  return null;
}

export function checkConfirmation(password: string, confirmation: string): string | null {
  return password === confirmation ? null : 'Passwords do not match.';
}
