export interface IngestImageJobPayload {
  waMessageId: string;
  mediaId: string;
  mimeType: string | undefined;
  senderPhoneE164: string;
  senderUserId: string;
  coupleId: string;
  receivedAtIso: string;
}

export type ReceiptJobPayload = IngestImageJobPayload;
