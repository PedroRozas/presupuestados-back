import {
  Body,
  Controller,
  HttpCode,
  Logger,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  extractTelegramMessages,
  telegramUpdateSchema,
} from '../schemas/telegram-update.schema.js';
import { WebhookDispatchService } from '../webhook/webhook-dispatch.service.js';
import { TelegramSecretGuard } from './telegram-secret.guard.js';

const HTTP_OK = 200;

@Controller('receipts/telegram/webhook')
export class TelegramWebhookController {
  private readonly logger = new Logger(TelegramWebhookController.name);

  constructor(private readonly dispatchService: WebhookDispatchService) {}

  @Post()
  @HttpCode(HTTP_OK)
  @UseGuards(TelegramSecretGuard)
  async receive(@Body() body: unknown): Promise<{ ok: true }> {
    const parsed = telegramUpdateSchema.safeParse(body);
    if (!parsed.success) {
      this.logger.warn('telegram_update_unrecognized');
      return { ok: true };
    }

    this.logger.log('telegram_update_received');
    await this.dispatchService.dispatch(extractTelegramMessages(parsed.data));
    return { ok: true };
  }
}
