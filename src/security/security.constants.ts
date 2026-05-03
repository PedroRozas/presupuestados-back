export const RATE_LIMIT_POLICY_METADATA = Symbol('rateLimitPolicy');

export const DEFAULT_RATE_LIMITS = {
  globalWindowSeconds: 60,
  globalMax: 120,
  authWindowSeconds: 900,
  authIpMax: 10,
  authEmailMax: 5,
  authComboMax: 5,
  registerWindowSeconds: 3600,
  registerIpMax: 5,
  registerEmailMax: 3,
  passwordResetWindowSeconds: 3600,
  passwordResetIpMax: 5,
  passwordResetEmailMax: 3,
  refreshWindowSeconds: 900,
  refreshMax: 30,
  chatbotUserWindowSeconds: 60,
  chatbotUserMax: 10,
  chatbotIpWindowSeconds: 600,
  chatbotIpMax: 30,
  aiUserWindowSeconds: 300,
  aiUserMax: 5,
  aiIpWindowSeconds: 900,
  aiIpMax: 10,
} as const;

export const RATE_LIMIT_ERROR_CODE = 'RATE_LIMIT_EXCEEDED';
export const RATE_LIMIT_ERROR_MESSAGE =
  'Demasiadas solicitudes. Intenta nuevamente en unos segundos.';
