import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  HttpCode,
  Logger,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ReceiptConfigService } from '../receipt.config.js';
import { metaWebhookSchema } from '../schemas/meta-webhook.schema.js';
import { WebhookDispatchService } from './webhook-dispatch.service.js';
import { WebhookSignatureGuard } from './webhook-signature.guard.js';

const HUB_MODE_SUBSCRIBE = 'subscribe';

@Controller('receipts/webhook')
export class WebhookController {
  private readonly logger = new Logger(WebhookController.name);

  constructor(
    private readonly config: ReceiptConfigService,
    private readonly dispatchService: WebhookDispatchService,
  ) {}

  @Get()
  verify(
    @Query('hub.mode') mode: string | undefined,
    @Query('hub.verify_token') token: string | undefined,
    @Query('hub.challenge') challenge: string | undefined,
  ): string {
    if (
      mode !== HUB_MODE_SUBSCRIBE ||
      token !== this.config.whatsappVerifyToken ||
      !challenge
    ) {
      throw new ForbiddenException();
    }
    return challenge;
  }

  @Post()
  @HttpCode(200)
  @UseGuards(WebhookSignatureGuard)
  async receive(@Body() body: unknown): Promise<{ received: true }> {
    const parsed = metaWebhookSchema.safeParse(body);
    if (!parsed.success) {
      this.logger.warn('webhook_payload_unrecognized');
      return { received: true };
    }

    await this.dispatchService.dispatch(parsed.data);
    return { received: true };
  }
}
