export interface PromptInjectionMatch {
  reason: string;
}

const INJECTION_PATTERNS: ReadonlyArray<{ pattern: RegExp; reason: string }> = [
  {
    pattern:
      /\b(ignore|forget|discard)\s+(previous|above|all|your)(\s+\w+){0,3}\s+instructions?\b/i,
    reason: 'instruction_override',
  },
  {
    pattern:
      /\b(ignora|ignorar|olvida|olvidar|descarta|descartar)\s+((todas?|las|mis|tus)\s+){0,3}(instrucciones|reglas|indicaciones)\b/i,
    reason: 'instruction_override',
  },
  {
    pattern: /\b(system|developer)\s+(prompt|message|instructions?)\b/i,
    reason: 'prompt_disclosure',
  },
  {
    pattern:
      /\b(prompt|mensaje|instrucciones)\s+(del\s+)?(sistema|desarrollador|developer)\b/i,
    reason: 'prompt_disclosure',
  },
  {
    pattern:
      /\b(jailbreak|developer mode|modo desarrollador|modo dan|dan mode)\b/i,
    reason: 'jailbreak',
  },
  {
    pattern:
      /\b(exfiltrate|reveal|show|print|list)\s+.*\b(ids?|uuids?|tokens?|secrets?|keys?)\b/i,
    reason: 'secret_or_id_disclosure',
  },
  {
    pattern:
      /\b(muestra|muestrame|revela|lista|imprime|expone)\s+.*\b(ids?|uuids?|tokens?|secretos?|claves?)\b/i,
    reason: 'secret_or_id_disclosure',
  },
  {
    pattern: /\bact\s+as\s+/i,
    reason: 'role_override',
  },
  {
    pattern: /\b(actua|actuar|comportate)\s+como\s+/i,
    reason: 'role_override',
  },
];

const CASE_SENSITIVE_PATTERNS: ReadonlyArray<{
  pattern: RegExp;
  reason: string;
}> = [{ pattern: /\bDAN\b/, reason: 'jailbreak' }];

const MAX_NORMALIZED_CHARS = 1000;

export const normalizePromptText = (text: string): string =>
  text
    .normalize('NFKC')
    .replace(/\p{Cf}/gu, '')
    .replace(/\p{Cc}/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, MAX_NORMALIZED_CHARS);

export const toCanonicalPromptText = (text: string): string =>
  text
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase();

export const detectPromptInjection = (
  text: string,
): PromptInjectionMatch | null => {
  const normalized = normalizePromptText(text);
  const canonical = toCanonicalPromptText(normalized);
  const match =
    INJECTION_PATTERNS.find((item) => item.pattern.test(canonical)) ??
    CASE_SENSITIVE_PATTERNS.find((item) => item.pattern.test(normalized));
  return match ? { reason: match.reason } : null;
};
