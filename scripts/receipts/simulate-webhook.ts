import { createHmac } from 'node:crypto';

const DEFAULT_BASE_URL = 'http://localhost:3000';
const DEFAULT_PHONE = '56900000000';
const SECONDS_PER_MILLISECOND = 1 / 1000;
const USAGE =
  'Uso: npm run receipts:simulate -- <archivo> [telefono]  |  npm run receipts:simulate -- --text "<texto>" [telefono]';

type SimulatorMessage =
  | { kind: 'image'; fileName: string }
  | { kind: 'text'; body: string };

interface SimulatorArgs {
  message: SimulatorMessage;
  phone: string;
  baseUrl: string;
  secret: string;
}

const readMessage = (): { message: SimulatorMessage; phoneArg?: string } => {
  const [first, second, third] = process.argv.slice(2);
  if (first === '--text') {
    if (!second) {
      throw new Error(USAGE);
    }
    return { message: { kind: 'text', body: second }, phoneArg: third };
  }
  if (!first) {
    throw new Error(USAGE);
  }
  return { message: { kind: 'image', fileName: first }, phoneArg: second };
};

const readArgs = (): SimulatorArgs => {
  const { message, phoneArg } = readMessage();
  const secret = process.env['RECEIPT_WA_APP_SECRET'];
  if (!secret) {
    throw new Error('RECEIPT_WA_APP_SECRET no está definido en el entorno');
  }
  return {
    message,
    phone: phoneArg ?? process.env['RECEIPT_SIMULATE_PHONE'] ?? DEFAULT_PHONE,
    baseUrl: process.env['RECEIPT_SIMULATE_BASE_URL'] ?? DEFAULT_BASE_URL,
    secret,
  };
};

const buildMessage = (args: SimulatorArgs) => {
  const timestamp = String(Math.floor(Date.now() * SECONDS_PER_MILLISECOND));
  if (args.message.kind === 'image') {
    return {
      id: `wamid.sim.img.${Date.now()}`,
      from: args.phone,
      timestamp,
      type: 'image',
      image: { id: args.message.fileName, mime_type: 'image/jpeg' },
    };
  }
  return {
    id: `wamid.sim.txt.${Date.now()}`,
    from: args.phone,
    timestamp,
    type: 'text',
    text: { body: args.message.body },
  };
};

const buildPayload = (args: SimulatorArgs) => ({
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
            messages: [buildMessage(args)],
          },
        },
      ],
    },
  ],
});

const main = async (): Promise<void> => {
  const args = readArgs();
  const body = JSON.stringify(buildPayload(args));
  const signature = `sha256=${createHmac('sha256', args.secret).update(body).digest('hex')}`;

  const response = await fetch(`${args.baseUrl}/receipts/webhook`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Hub-Signature-256': signature,
    },
    body,
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
