import { Module } from '@nestjs/common';
import { SecurityModule } from '../security/security.module.js';
import { ReceiptConfigService } from './receipt.config.js';
import { WebhookController } from './webhook/webhook.controller.js';
import { WebhookDispatchService } from './webhook/webhook-dispatch.service.js';
import { WebhookSignatureGuard } from './webhook/webhook-signature.guard.js';
import { AllowedSendersRepository } from './repository/allowed-senders.repository.js';
import { ReceiptQueueService } from './queue/receipt-queue.service.js';

@Module({
  imports: [SecurityModule],
  controllers: [WebhookController],
  providers: [
    ReceiptConfigService,
    WebhookSignatureGuard,
    WebhookDispatchService,
    AllowedSendersRepository,
    ReceiptQueueService,
  ],
})
export class ReceiptIngestionModule {}
