import { Injectable, Logger } from '@nestjs/common';
import {
  NormalizationService,
  type NormalizationOutcome,
} from '../../normalization/normalization.service.js';
import type { NormalizeGroupJobPayload } from '../receipt-queue.constants.js';

@Injectable()
export class NormalizeGroupProcessor {
  private readonly logger = new Logger(NormalizeGroupProcessor.name);

  constructor(private readonly normalization: NormalizationService) {}

  async process(
    payload: NormalizeGroupJobPayload,
  ): Promise<NormalizationOutcome> {
    const outcome = await this.normalization.normalizeGroup({
      groupId: payload.groupId,
      coupleId: payload.coupleId,
    });
    if (outcome.outcome === 'skipped') {
      this.logger.log(
        `normalize_group_skipped group=${payload.groupId} reason=${outcome.reason}`,
      );
    } else {
      this.logger.log(
        `normalize_group_done group=${payload.groupId} merchant=${outcome.merchant} matched=${outcome.items.matched} created=${outcome.items.created}`,
      );
    }
    return outcome;
  }
}
