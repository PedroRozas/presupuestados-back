// eslint-disable-next-line no-control-regex
const CONTROL_CHARACTERS = /[\u0000-\u001f\u007f]/g;
const WHITESPACE_RUN = /\s+/g;

export const toCanonicalName = (raw: string): string =>
  raw
    .replace(CONTROL_CHARACTERS, ' ')
    .replace(WHITESPACE_RUN, ' ')
    .trim()
    .toUpperCase();
