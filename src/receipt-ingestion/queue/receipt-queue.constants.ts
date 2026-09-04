export interface IngestImageJobPayload {
  waMessageId: string;
  mediaId: string;
  mimeType: string | undefined;
  senderPhoneE164: string;
  senderUserId: string;
  coupleId: string;
  receivedAtIso: string;
}

export interface CloseGroupByWindowPayload {
  kind: 'window';
  groupId: string;
  pageIndex: number;
  reschedule?: number;
}

export interface CloseGroupByCommandPayload {
  kind: 'command';
  senderPhoneE164: string;
  coupleId: string;
}

export type CloseGroupJobPayload =
  | CloseGroupByWindowPayload
  | CloseGroupByCommandPayload;

export interface NotifyUserJobPayload {
  toPhoneE164: string;
  body: string;
}

export interface ExtractGroupJobPayload {
  groupId: string;
  coupleId: string;
  senderPhoneE164: string;
}

export type ReceiptJobPayload =
  | IngestImageJobPayload
  | CloseGroupJobPayload
  | NotifyUserJobPayload
  | ExtractGroupJobPayload;
