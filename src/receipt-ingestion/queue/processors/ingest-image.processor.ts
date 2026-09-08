import { Inject, Injectable, Logger } from '@nestjs/common';
import { ReceiptGroupService } from '../../groups/receipt-group.service.js';
import {
  ImageProcessorService,
  type ProcessedImage,
} from '../../media/image-processor.service.js';
import { ReceiptConfigService } from '../../receipt.config.js';
import { ReceiptGroupsRepository } from '../../repository/receipt-groups.repository.js';
import { ReceiptImagesRepository } from '../../repository/receipt-images.repository.js';
import { ReceiptStorageService } from '../../storage/receipt-storage.service.js';
import { buildStoragePath } from '../../utils/storage-path.js';
import { maskSenderAddress } from '../../utils/sender-address.js';
import { MEDIA_CLIENT, type MediaClient } from '../../channels/media.client.js';
import { ReceiptQueueService } from '../receipt-queue.service.js';
import type { IngestImageJobPayload } from '../receipt-queue.constants.js';
import type {
  ReceiptGroup,
  ReceiptImage,
} from '../../../database/schema/index.js';

const MILLISECONDS_PER_SECOND = 1000;

export type IngestImageResult =
  | { outcome: 'stored'; imageId: string; groupId: string }
  | { outcome: 'duplicate_message' }
  | { outcome: 'duplicate_content' };

@Injectable()
export class IngestImageProcessor {
  private readonly logger = new Logger(IngestImageProcessor.name);

  constructor(
    @Inject(MEDIA_CLIENT)
    private readonly media: MediaClient,
    private readonly images: ImageProcessorService,
    private readonly storage: ReceiptStorageService,
    private readonly groupService: ReceiptGroupService,
    private readonly groupsRepo: ReceiptGroupsRepository,
    private readonly imagesRepo: ReceiptImagesRepository,
    private readonly queue: ReceiptQueueService,
    private readonly config: ReceiptConfigService,
  ) {}

  async process(payload: IngestImageJobPayload): Promise<IngestImageResult> {
    if (await this.imagesRepo.existsByMessageId(payload.channelMessageId)) {
      return { outcome: 'duplicate_message' };
    }

    const downloaded = await this.media.download(
      payload.mediaId,
      payload.senderAddress,
    );
    const processed = await this.images.toWebp(downloaded.buffer);

    if (
      await this.imagesRepo.existsBySha256(payload.coupleId, processed.sha256)
    ) {
      this.logger.log(
        `image_duplicate_content sender=${maskSenderAddress(payload.senderAddress)}`,
      );
      return { outcome: 'duplicate_content' };
    }

    const receivedAt = new Date(payload.receivedAtIso);
    const group = await this.groupService.resolveOpenGroup({
      senderAddress: payload.senderAddress,
      coupleId: payload.coupleId,
      userId: payload.senderUserId,
      receivedAt,
    });
    const image = await this.storeImage(payload, group, processed, receivedAt);

    await this.queue.enqueueCloseGroup(
      { kind: 'window', groupId: group.id, pageIndex: image.pageIndex },
      this.config.groupWindowSeconds * MILLISECONDS_PER_SECOND,
    );

    return { outcome: 'stored', imageId: image.id, groupId: group.id };
  }

  private async storeImage(
    payload: IngestImageJobPayload,
    group: ReceiptGroup,
    processed: ProcessedImage,
    receivedAt: Date,
  ): Promise<ReceiptImage> {
    const pageIndex = await this.imagesRepo.nextPageIndex(group.id);
    const storagePath = buildStoragePath({
      coupleId: payload.coupleId,
      groupId: group.id,
      receivedAt,
      pageIndex,
    });

    await this.storage.upload(storagePath, processed.buffer);

    const image = await this.imagesRepo.create({
      groupId: group.id,
      coupleId: payload.coupleId,
      channelMessageId: payload.channelMessageId,
      senderAddress: payload.senderAddress,
      senderUserId: payload.senderUserId,
      receivedAt,
      storageBucket: this.storage.bucket,
      storagePath,
      sha256: processed.sha256,
      width: processed.width,
      height: processed.height,
      bytes: processed.bytes,
      pageIndex,
    });
    await this.groupsRepo.touchLastImageAt(group.id, receivedAt);

    this.logger.log(
      `image_stored group=${group.id} page=${pageIndex} bytes=${processed.bytes}`,
    );
    return image;
  }
}
