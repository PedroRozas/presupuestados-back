import { Module } from '@nestjs/common';
import { SecurityModule } from '../security/security.module.js';
import { ReceiptConfigService } from './receipt.config.js';
import { WebhookController } from './webhook/webhook.controller.js';
import { TelegramWebhookController } from './telegram/telegram-webhook.controller.js';
import { ReceiptsController } from './api/receipts.controller.js';
import { ReceiptsService } from './api/receipts.service.js';
import { ReceiptQueryRepository } from './repository/receipt-query.repository.js';
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
import { AnswerQueryProcessor } from './queue/processors/answer-query.processor.js';
import { ReceiptQueryTools } from './query/receipt-query-tools.js';
import { ReceiptQueryService } from './query/receipt-query.service.js';
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
  LLM_QUERY_PROVIDER,
} from './llm/llm.interfaces.js';
import { OpenAiLlmProvider } from './llm/openai-llm.provider.js';
import { MEDIA_CLIENT } from './channels/media.client.js';
import { MediaRouter } from './channels/media.router.js';
import { TelegramMediaClient } from './channels/telegram/telegram-media.client.js';
import { TelegramMessagingClient } from './channels/telegram/telegram-messaging.client.js';
import { MetaWhatsAppMediaClient } from './channels/whatsapp/meta-whatsapp-media.client.js';
import { LocalMediaClient } from './channels/local/local-media.client.js';
import { MESSAGING_CLIENT } from './channels/messaging.client.js';
import { MessagingRouter } from './channels/messaging.router.js';
import { MetaWhatsAppMessagingClient } from './channels/whatsapp/meta-whatsapp-messaging.client.js';
import { LocalMessagingClient } from './channels/local/local-messaging.client.js';

@Module({
  imports: [SecurityModule],
  controllers: [
    WebhookController,
    TelegramWebhookController,
    ReceiptsController,
  ],
  providers: [
    ReceiptsService,
    ReceiptQueryRepository,
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
    AnswerQueryProcessor,
    ReceiptQueryTools,
    ReceiptQueryService,
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
    { provide: LLM_QUERY_PROVIDER, useExisting: OpenAiLlmProvider },
    {
      provide: MEDIA_CLIENT,
      inject: [ReceiptConfigService],
      useFactory: (config: ReceiptConfigService): MediaRouter => {
        if (config.mediaSource === 'local') {
          const local = new LocalMediaClient(config);
          return new MediaRouter(local, local);
        }
        return new MediaRouter(
          new MetaWhatsAppMediaClient(config),
          new TelegramMediaClient(config),
        );
      },
    },
    {
      provide: MESSAGING_CLIENT,
      inject: [ReceiptConfigService],
      useFactory: (config: ReceiptConfigService): MessagingRouter => {
        if (config.messagingSource === 'local') {
          const local = new LocalMessagingClient();
          return new MessagingRouter(local, local);
        }
        return new MessagingRouter(
          new MetaWhatsAppMessagingClient(config),
          new TelegramMessagingClient(config),
        );
      },
    },
  ],
})
export class ReceiptIngestionModule {}
