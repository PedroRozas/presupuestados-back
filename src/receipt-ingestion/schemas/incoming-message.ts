export interface IncomingMessageBase {
  channelMessageId: string;
  senderAddress: string;
  receivedAt: Date;
}

export interface IncomingImageMessage extends IncomingMessageBase {
  kind: 'image';
  mediaId: string;
  mimeType: string | undefined;
}

export interface IncomingTextMessage extends IncomingMessageBase {
  kind: 'text';
  body: string;
}

export type IncomingMessage = IncomingImageMessage | IncomingTextMessage;
