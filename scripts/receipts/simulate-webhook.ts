import { createHmac } from 'node:crypto';

const DEFAULT_BASE_URL = 'http://localhost:3000';
const DEFAULT_PHONE = '56900000000';
const SECONDS_PER_MILLISECOND = 1 / 1000;

interface SimulatorArgs {
  fileName: string;
  phone: string;
  baseUrl: string;
  secret: string;
}

const readArgs = (): SimulatorArgs => {
  const [fileName, phoneArg] = process.argv.slice(2);
  const secret = process.env['RECEIPT_WA_APP_SECRET'];
  if (!fileName) {
    throw new Error(
      'Uso: npm run receipts:simulate -- <archivo-en-RECEIPT_LOCAL_MEDIA_DIR> [telefono-sin-mas]',
    );
  }
  if (!secret) {
    throw new Error('RECEIPT_WA_APP_SECRET no está definido en el entorno');
  }
  return {
    fileName,
    phone: phoneArg ?? process.env['RECEIPT_SIMULATE_PHONE'] ?? DEFAULT_PHONE,
    baseUrl: process.env['RECEIPT_SIMULATE_BASE_URL'] ?? DEFAULT_BASE_URL,
    secret,
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
            messages: [
              {
                id: `wamid.sim.${Date.now()}`,
                from: args.phone,
                timestamp: String(
                  Math.floor(Date.now() * SECONDS_PER_MILLISECOND),
                ),
                type: 'image',
                image: { id: args.fileName, mime_type: 'image/jpeg' },
              },
            ],
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
