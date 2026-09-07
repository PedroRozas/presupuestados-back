const VISIBLE_PREFIX_LENGTH = 3;
const VISIBLE_SUFFIX_LENGTH = 4;
const MASK = '****';

export const maskPhone = (phoneE164: string): string => {
  const digits = phoneE164.replace(/\D/g, '');
  if (digits.length <= VISIBLE_PREFIX_LENGTH + VISIBLE_SUFFIX_LENGTH) {
    return MASK;
  }
  const prefix = digits.slice(0, VISIBLE_PREFIX_LENGTH);
  const suffix = digits.slice(-VISIBLE_SUFFIX_LENGTH);
  return `+${prefix}${MASK}${suffix}`;
};
