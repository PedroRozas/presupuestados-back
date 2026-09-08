const DEFAULT_API_BASE_URL = 'https://api.telegram.org';
const WEBHOOK_PATH = '/receipts/telegram/webhook';
const USAGE =
  'Uso: npm run receipts:telegram:set-webhook -- <https://dominio-publico>  (o RECEIPT_PUBLIC_BASE_URL)';

interface WebhookArgs {
  publicBaseUrl: string;
  apiBaseUrl: string;
  botToken: string;
  secret: string;
}

interface TelegramApiResponse {
  ok: boolean;
  description?: string;
  result?: unknown;
}

const requireEnv = (name: string): string => {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} no está definido en el entorno`);
  }
  return value;
};

const readArgs = (): WebhookArgs => {
  const publicBaseUrl =
    process.argv[2] ?? process.env['RECEIPT_PUBLIC_BASE_URL'];
  if (!publicBaseUrl) {
    throw new Error(USAGE);
  }
  return {
    publicBaseUrl: publicBaseUrl.replace(/\/+$/, ''),
    apiBaseUrl:
      process.env['RECEIPT_TELEGRAM_API_BASE_URL'] ?? DEFAULT_API_BASE_URL,
    botToken: requireEnv('RECEIPT_TELEGRAM_BOT_TOKEN'),
    secret: requireEnv('RECEIPT_TELEGRAM_WEBHOOK_SECRET'),
  };
};

const callApi = async (
  args: WebhookArgs,
  method: string,
  payload?: Record<string, unknown>,
): Promise<TelegramApiResponse> => {
  const response = await fetch(
    `${args.apiBaseUrl}/bot${args.botToken}/${method}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload ?? {}),
    },
  );
  const parsed = (await response.json()) as TelegramApiResponse;
  if (!response.ok || !parsed.ok) {
    throw new Error(
      `${method} falló: status=${response.status} ${parsed.description ?? ''}`,
    );
  }
  return parsed;
};

const main = async (): Promise<void> => {
  const args = readArgs();
  await callApi(args, 'setWebhook', {
    url: `${args.publicBaseUrl}${WEBHOOK_PATH}`,
    secret_token: args.secret,
    allowed_updates: ['message'],
    drop_pending_updates: true,
  });
  const info = await callApi(args, 'getWebhookInfo');
  process.stdout.write(
    `webhook registrado\n${JSON.stringify(info.result, null, 2)}\n`,
  );
};

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
});
