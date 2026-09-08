export type SenderChannel = 'whatsapp' | 'telegram';

export interface ParsedSenderAddress {
  channel: SenderChannel;
  id: string;
}

export class InvalidSenderAddressError extends Error {
  constructor() {
    super('invalid_sender_address');
    this.name = 'InvalidSenderAddressError';
  }
}

export const TELEGRAM_ADDRESS_PREFIX = 'tg:';

const E164_PATTERN = /^\+[1-9]\d{6,14}$/;
const TELEGRAM_ID_PATTERN = /^\d{1,20}$/;

const VISIBLE_PREFIX_LENGTH = 3;
const VISIBLE_SUFFIX_LENGTH = 4;
const MASK = '****';

export const telegramAddress = (userId: number): string =>
  `${TELEGRAM_ADDRESS_PREFIX}${userId}`;

export const parseSenderAddress = (address: string): ParsedSenderAddress => {
  if (E164_PATTERN.test(address)) {
    return { channel: 'whatsapp', id: address };
  }
  if (address.startsWith(TELEGRAM_ADDRESS_PREFIX)) {
    const id = address.slice(TELEGRAM_ADDRESS_PREFIX.length);
    if (TELEGRAM_ID_PATTERN.test(id)) {
      return { channel: 'telegram', id };
    }
  }
  throw new InvalidSenderAddressError();
};

const maskPhone = (phone: string): string => {
  const digits = phone.replace(/\D/g, '');
  if (digits.length <= VISIBLE_PREFIX_LENGTH + VISIBLE_SUFFIX_LENGTH) {
    return MASK;
  }
  const prefix = digits.slice(0, VISIBLE_PREFIX_LENGTH);
  const suffix = digits.slice(-VISIBLE_SUFFIX_LENGTH);
  return `+${prefix}${MASK}${suffix}`;
};

export const maskSenderAddress = (address: string): string => {
  try {
    const parsed = parseSenderAddress(address);
    return parsed.channel === 'telegram' ? address : maskPhone(address);
  } catch {
    return MASK;
  }
};
