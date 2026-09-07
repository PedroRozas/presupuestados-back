const MAX_CONTROL_CODE_POINT = 0x1f;
const DELETE_CODE_POINT = 0x7f;
const WHITESPACE_RUN = /\s+/g;

const replaceControlCharacters = (raw: string): string =>
  Array.from(raw, (character) => {
    const codePoint = character.codePointAt(0) ?? 0;
    return codePoint <= MAX_CONTROL_CODE_POINT ||
      codePoint === DELETE_CODE_POINT
      ? ' '
      : character;
  }).join('');

export const toCanonicalName = (raw: string): string =>
  replaceControlCharacters(raw)
    .replace(WHITESPACE_RUN, ' ')
    .trim()
    .toUpperCase();
