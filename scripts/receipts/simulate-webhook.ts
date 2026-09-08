import { createHmac } from 'node:crypto';

const DEFAULT_BASE_URL = 'http://localhost:3000';
const DEFAULT_PHONE = '56900000000';
const DEFAULT_TELEGRAM_ID = 100000000;
const TELEGRAM_PREFIX = 'tg:';
const SECONDS_PER_MILLISECOND = 1 / 1000;
const USAGE = [
  'Uso:',
  '  npm run receipts:simulate -- <archivo> [telefono]',
  '  npm run receipts:simulate -- --text "<texto>" [telefono]',
  '  npm run receipts:simulate -- --telegram <archivo> [tg:id]',
  '  npm run receipts:simulate -- --telegram --text "<texto>" [tg:id]',
].join('\n');

type Channel = 'whatsapp' | 'telegram';

type SimulatorMessage =
  | { kind: 'image'; fileName: string }
  | { kind: 'text'; body: string };

interface SimulatorArgs {
  channel: Channel;
  message: SimulatorMessage;
  sender: string;
  baseUrl: string;
}

interface OutgoingRequest {
  path: string;
  headers: Record<string, string>;
  body: string;
}

const readMessage = (
  argv: string[],
): { message: SimulatorMessage; senderArg?: string } => {
  const [first, second, third] = argv;
  if (first === '--text') {
    if (!second) throw new Error(USAGE);
    return { message: { kind: 'text', body: second }, senderArg: third };
  }
  if (!first) throw new Error(USAGE);
  return { message: { kind: 'image', fileName: first }, senderArg: second };
};

const requireEnv = (name: string): string => {
  const value = process.env[name];
  if (!value) throw new Error(`${name} no está definido en el entorno`);
  return value;
};

const readArgs = (): SimulatorArgs => {
  const argv = process.argv.slice(2);
  const channel: Channel = argv[0] === '--telegram' ? 'telegram' : 'whatsapp';
  const { message, senderArg } = readMessage(
    channel === 'telegram' ? argv.slice(1) : argv,
  );
  const defaultSender =
    channel === 'telegram'
      ? `${TELEGRAM_PREFIX}${DEFAULT_TELEGRAM_ID}`
      : DEFAULT_PHONE;
  return {
    channel,
    message,
    sender:
      senderArg ?? process.env['RECEIPT_SIMULATE_SENDER'] ?? defaultSender,
    baseUrl: process.env['RECEIPT_SIMULATE_BASE_URL'] ?? DEFAULT_BASE_URL,
  };
};

const nowSeconds = (): number =>
  Math.floor(Date.now() * SECONDS_PER_MILLISECOND);

const buildWhatsAppMessage = (args: SimulatorArgs) => {
  const timestamp = String(nowSeconds());
  if (args.message.kind === 'image') {
    return {
      id: `wamid.sim.img.${Date.now()}`,
      from: args.sender,
      timestamp,
      type: 'image',
      image: { id: args.message.fileName, mime_type: 'image/jpeg' },
    };
  }
  return {
    id: `wamid.sim.txt.${Date.now()}`,
    from: args.sender,
    timestamp,
    type: 'text',
    text: { body: args.message.body },
  };
};

const buildWhatsAppRequest = (args: SimulatorArgs): OutgoingRequest => {
  const secret = requireEnv('RECEIPT_WA_APP_SECRET');
  const body = JSON.stringify({
    object: 'whatsapp_business_account',
    entry: [
      {
        id: 'simulated-entry',
        changes: [
          {
            field: 'messages',
            value: {
              messaging_product: 'whatsapp',
              metadata: {
                display_phone_number: '56900000001',
                phone_number_id: 'simulated',
              },
              messages: [buildWhatsAppMessage(args)],
            },
          },
        ],
      },
    ],
  });
  const signature = `sha256=${createHmac('sha256', secret).update(body).digest('hex')}`;
  return {
    path: '/receipts/webhook',
    headers: { 'X-Hub-Signature-256': signature },
    body,
  };
};

const telegramUserId = (sender: string): number => {
  const raw = sender.startsWith(TELEGRAM_PREFIX)
    ? sender.slice(TELEGRAM_PREFIX.length)
    : sender;
  const id = Number(raw);
  if (!Number.isInteger(id) || id <= 0) {
    throw new Error(`Id de Telegram inválido: ${sender}`);
  }
  return id;
};

const buildTelegramRequest = (args: SimulatorArgs): OutgoingRequest => {
  const secret = requireEnv('RECEIPT_TELEGRAM_WEBHOOK_SECRET');
  const userId = telegramUserId(args.sender);
  const content =
    args.message.kind === 'image'
      ? {
          photo: [
            {
              file_id: args.message.fileName,
              width: 1280,
              height: 960,
              file_size: 200000,
            },
          ],
        }
      : { text: args.message.body };
  const body = JSON.stringify({
    update_id: Date.now(),
    message: {
      message_id: Date.now() % 1_000_000,
      date: nowSeconds(),
      chat: { id: userId, type: 'private' },
      from: { id: userId, is_bot: false },
      ...content,
    },
  });
  return {
    path: '/receipts/telegram/webhook',
    headers: { 'X-Telegram-Bot-Api-Secret-Token': secret },
    body,
  };
};

const main = async (): Promise<void> => {
  const args = readArgs();
  const request =
    args.channel === 'telegram'
      ? buildTelegramRequest(args)
      : buildWhatsAppRequest(args);

  const response = await fetch(`${args.baseUrl}${request.path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...request.headers },
    body: request.body,
  });

  process.stdout.write(
    `status=${response.status} body=${await response.text()}\n`,
  );
};

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
});
