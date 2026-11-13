type ClassValue = string | false | null | undefined | 0;

/** Join truthy class names. Intentionally tiny, no tailwind-merge dependency. */
export function cn(...classes: ClassValue[]): string {
  return classes.filter(Boolean).join(' ');
}
