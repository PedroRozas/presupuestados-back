import { RECEIPT_IMAGE_EXTENSION } from '../receipt.constants.js';

export interface StoragePathInput {
  coupleId: string;
  groupId: string;
  receivedAt: Date;
  pageIndex: number;
}

const MONTH_PAD_LENGTH = 2;

export const buildStoragePath = (input: StoragePathInput): string => {
  const year = input.receivedAt.getUTCFullYear();
  const month = String(input.receivedAt.getUTCMonth() + 1).padStart(
    MONTH_PAD_LENGTH,
    '0',
  );
  return `${input.coupleId}/${year}/${month}/${input.groupId}/${input.pageIndex}.${RECEIPT_IMAGE_EXTENSION}`;
};
