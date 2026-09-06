import { Module } from '@nestjs/common';
import { SecurityModule } from '../security/security.module.js';
import { ReceiptConfigService } from './receipt.config.js';
import { WebhookController } from './webhook/webhook.controller.js';
import { WebhookDispatchService } from './webhook/webhook-dispatch.service.js';
import { WebhookSignatureGuard } from './webhook/webhook-signature.guard.js';
import { AllowedSendersRepository } from './repository/allowed-senders.repository.js';
import { ReceiptGroupsRepository } from './repository/receipt-groups.repository.js';
import { ReceiptImagesRepository } from './repository/receipt-images.repository.js';
import { ReceiptExtractionsRepository } from './repository/receipt-extractions.repository.js';
import { ReceiptItemsRepository } from './repository/receipt-items.repository.js';
import { ReceiptProductsRepository } from './repository/receipt-products.repository.js';
import { ReceiptMerchantsRepository } from './repository/receipt-merchants.repository.js';
import { ReceiptQueueService } from './queue/receipt-queue.service.js';
import { ReceiptWorkerService } from './queue/receipt-worker.service.js';
import { IngestImageProcessor } from './queue/processors/ingest-image.processor.js';
import { CloseGroupProcessor } from './queue/processors/close-group.processor.js';
import { NotifyUserProcessor } from './queue/processors/notify-user.processor.js';
import { ExtractGroupProcessor } from './queue/processors/extract-group.processor.js';
import { NormalizeGroupProcessor } from './queue/processors/normalize-group.processor.js';
import { ImageProcessorService } from './media/image-processor.service.js';
import { ReceiptStorageService } from './storage/receipt-storage.service.js';
import { ReceiptGroupService } from './groups/receipt-group.service.js';
import { StaleGroupSweeperService } from './groups/stale-group-sweeper.service.js';
import { ExtractionService } from './extraction/extraction.service.js';
import { ExtractionUsageRepository } from './extraction/extraction-usage.repository.js';
import { NormalizationService } from './normalization/normalization.service.js';
import {
  LLM_EXTRACTION_PROVIDER,
  LLM_NORMALIZATION_PROVIDER,
} from './llm/llm.interfaces.js';
import { OpenAiLlmProvider } from './llm/openai-llm.provider.js';
import { WHATSAPP_MEDIA_CLIENT } from './whatsapp/whatsapp-media.client.js';
import { MetaWhatsAppMediaClient } from './whatsapp/meta-whatsapp-media.client.js';
import { LocalWhatsAppMediaClient } from './whatsapp/local-whatsapp-media.client.js';
import { WHATSAPP_MESSAGING_CLIENT } from './whatsapp/whatsapp-messaging.client.js';
import { MetaWhatsAppMessagingClient } from './whatsapp/meta-whatsapp-messaging.client.js';
import { LocalWhatsAppMessagingClient } from './whatsapp/local-whatsapp-messaging.client.js';

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
    ReceiptExtractionsRepository,
    ReceiptItemsRepository,
    ReceiptProductsRepository,
    ReceiptMerchantsRepository,
    ReceiptQueueService,
    ReceiptWorkerService,
    IngestImageProcessor,
    CloseGroupProcessor,
    NotifyUserProcessor,
    ExtractGroupProcessor,
    NormalizeGroupProcessor,
    ImageProcessorService,
    ReceiptStorageService,
    ReceiptGroupService,
    StaleGroupSweeperService,
    ExtractionService,
    ExtractionUsageRepository,
    NormalizationService,
    OpenAiLlmProvider,
    { provide: LLM_EXTRACTION_PROVIDER, useExisting: OpenAiLlmProvider },
    { provide: LLM_NORMALIZATION_PROVIDER, useExisting: OpenAiLlmProvider },
    {
      provide: WHATSAPP_MEDIA_CLIENT,
      inject: [ReceiptConfigService],
      useFactory: (config: ReceiptConfigService) =>
        config.mediaSource === 'local'
          ? new LocalWhatsAppMediaClient(config)
          : new MetaWhatsAppMediaClient(config),
    },
    {
      provide: WHATSAPP_MESSAGING_CLIENT,
      inject: [ReceiptConfigService],
      useFactory: (config: ReceiptConfigService) =>
        config.messagingSource === 'local'
          ? new LocalWhatsAppMessagingClient()
          : new MetaWhatsAppMessagingClient(config),
    },
  ],
})
export class ReceiptIngestionModule {}
