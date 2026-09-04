import { Module } from '@nestjs/common';
import { SecurityModule } from '../security/security.module.js';
import { ReceiptConfigService } from './receipt.config.js';
import { WebhookController } from './webhook/webhook.controller.js';
import { WebhookDispatchService } from './webhook/webhook-dispatch.service.js';
import { WebhookSignatureGuard } from './webhook/webhook-signature.guard.js';
import { AllowedSendersRepository } from './repository/allowed-senders.repository.js';
import { ReceiptGroupsRepository } from './repository/receipt-groups.repository.js';
import { ReceiptImagesRepository } from './repository/receipt-images.repository.js';
import { ReceiptQueueService } from './queue/receipt-queue.service.js';
import { ReceiptWorkerService } from './queue/receipt-worker.service.js';
import { IngestImageProcessor } from './queue/processors/ingest-image.processor.js';
import { ImageProcessorService } from './media/image-processor.service.js';
import { ReceiptStorageService } from './storage/receipt-storage.service.js';
import { ReceiptGroupService } from './groups/receipt-group.service.js';
import { WHATSAPP_MEDIA_CLIENT } from './whatsapp/whatsapp-media.client.js';
import { MetaWhatsAppMediaClient } from './whatsapp/meta-whatsapp-media.client.js';
import { LocalWhatsAppMediaClient } from './whatsapp/local-whatsapp-media.client.js';

@Module({
  imports: [SecurityModule],
  controllers: [WebhookController],
  providers: [
    ReceiptConfigService,
    WebhookSignatureGuard,
    WebhookDispatchService,
    AllowedSendersRepository,
    ReceiptGroupsRepository,
    ReceiptImagesRepository,
    ReceiptQueueService,
    ReceiptWorkerService,
    IngestImageProcessor,
    ImageProcessorService,
    ReceiptStorageService,
    ReceiptGroupService,
    {
      provide: WHATSAPP_MEDIA_CLIENT,
      inject: [ReceiptConfigService],
      useFactory: (config: ReceiptConfigService) =>
        config.mediaSource === 'local'
          ? new LocalWhatsAppMediaClient(config)
          : new MetaWhatsAppMediaClient(config),
    },
  ],
})
export class ReceiptIngestionModule {}
