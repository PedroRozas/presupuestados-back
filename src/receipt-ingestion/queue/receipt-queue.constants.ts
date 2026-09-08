export interface IngestImageJobPayload {
  channelMessageId: string;
  mediaId: string;
  mimeType: string | undefined;
  senderAddress: string;
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
  senderAddress: string;
  coupleId: string;
}

export type CloseGroupJobPayload =
  | CloseGroupByWindowPayload
  | CloseGroupByCommandPayload;

export interface NotifyUserJobPayload {
  toAddress: string;
  body: string;
}

export interface ExtractGroupJobPayload {
  groupId: string;
  coupleId: string;
  senderAddress: string;
}

export interface NormalizeGroupJobPayload {
  groupId: string;
  coupleId: string;
}

export interface AnswerQueryJobPayload {
  senderAddress: string;
  coupleId: string;
  message: string;
}

export type ReceiptJobPayload =
  | IngestImageJobPayload
  | CloseGroupJobPayload
  | NotifyUserJobPayload
  | ExtractGroupJobPayload
  | NormalizeGroupJobPayload
  | AnswerQueryJobPayload;
