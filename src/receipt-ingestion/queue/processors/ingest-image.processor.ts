import { Inject, Injectable, Logger } from '@nestjs/common';
import { ReceiptGroupService } from '../../groups/receipt-group.service.js';
import { ImageProcessorService } from '../../media/image-processor.service.js';
import { ReceiptGroupsRepository } from '../../repository/receipt-groups.repository.js';
import { ReceiptImagesRepository } from '../../repository/receipt-images.repository.js';
import { ReceiptStorageService } from '../../storage/receipt-storage.service.js';
import { buildStoragePath } from '../../utils/storage-path.js';
import { maskPhone } from '../../utils/mask-phone.js';
import {
  WHATSAPP_MEDIA_CLIENT,
  type WhatsAppMediaClient,
} from '../../whatsapp/whatsapp-media.client.js';
import type { IngestImageJobPayload } from '../receipt-queue.constants.js';

export type IngestImageResult =
  | { outcome: 'stored'; imageId: string; groupId: string }
  | { outcome: 'duplicate_message' }
  | { outcome: 'duplicate_content' };

@Injectable()
export class IngestImageProcessor {
  private readonly logger = new Logger(IngestImageProcessor.name);

  constructor(
    @Inject(WHATSAPP_MEDIA_CLIENT)
    private readonly media: WhatsAppMediaClient,
    private readonly images: ImageProcessorService,
    private readonly storage: ReceiptStorageService,
    private readonly groupService: ReceiptGroupService,
    private readonly groupsRepo: ReceiptGroupsRepository,
    private readonly imagesRepo: ReceiptImagesRepository,
  ) {}

  async process(payload: IngestImageJobPayload): Promise<IngestImageResult> {
    if (await this.imagesRepo.existsByMessageId(payload.waMessageId)) {
      return { outcome: 'duplicate_message' };
    }

    const downloaded = await this.media.download(payload.mediaId);
    const processed = await this.images.toWebp(downloaded.buffer);

    if (
      await this.imagesRepo.existsBySha256(payload.coupleId, processed.sha256)
    ) {
      this.logger.log(
        `image_duplicate_content phone=${maskPhone(payload.senderPhoneE164)}`,
      );
      return { outcome: 'duplicate_content' };
    }

    const receivedAt = new Date(payload.receivedAtIso);
    const group = await this.groupService.resolveOpenGroup({
      senderPhoneE164: payload.senderPhoneE164,
      coupleId: payload.coupleId,
      userId: payload.senderUserId,
      receivedAt,
    });
    const pageIndex = (await this.imagesRepo.countByGroup(group.id)) + 1;
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
      waMessageId: payload.waMessageId,
      senderPhoneE164: payload.senderPhoneE164,
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
    return { outcome: 'stored', imageId: image.id, groupId: group.id };
  }
}
