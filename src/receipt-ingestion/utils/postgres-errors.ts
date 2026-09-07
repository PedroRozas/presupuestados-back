const UNIQUE_VIOLATION_CODE = '23505';

export const isUniqueViolation = (error: unknown): boolean =>
  typeof error === 'object' &&
  error !== null &&
  'code' in error &&
  (error as { code?: unknown }).code === UNIQUE_VIOLATION_CODE;
