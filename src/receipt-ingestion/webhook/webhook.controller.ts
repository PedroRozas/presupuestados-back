import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  Header,
  HttpCode,
  Logger,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { timingSafeEqual } from 'node:crypto';
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
  @Header('Content-Type', 'text/plain')
  verify(
    @Query('hub.mode') mode: string | undefined,
    @Query('hub.verify_token') token: string | undefined,
    @Query('hub.challenge') challenge: string | undefined,
  ): string {
    if (
      mode !== HUB_MODE_SUBSCRIBE ||
      !challenge ||
      !this.isVerifyTokenValid(token)
    ) {
      throw new ForbiddenException();
    }
    return challenge;
  }

  private isVerifyTokenValid(token: string | undefined): boolean {
    if (token === undefined) return false;

    const expected = Buffer.from(this.config.whatsappVerifyToken);
    const received = Buffer.from(token);
    if (expected.length !== received.length) return false;

    return timingSafeEqual(expected, received);
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
