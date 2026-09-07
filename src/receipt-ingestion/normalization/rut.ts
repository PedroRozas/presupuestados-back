const RUT_STRIP_PATTERN = /[.\s-]/g;

export const normalizeRut = (raw: string | null): string | null => {
  if (!raw) return null;
  const normalized = raw.replace(RUT_STRIP_PATTERN, '').toUpperCase();
  return normalized.length > 0 ? normalized : null;
};
