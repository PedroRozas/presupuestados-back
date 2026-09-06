import {
  IsDateString,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  Min,
} from 'class-validator';

const RECEIPT_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const MERCHANT_RAW_MAX_LENGTH = 200;
const UPDATABLE_GROUP_STATUSES = ['ready', 'discarded'] as const;

export type UpdatableGroupStatus = (typeof UPDATABLE_GROUP_STATUSES)[number];

export class UpdateGroupDto {
  @IsOptional()
  @Matches(RECEIPT_DATE_PATTERN)
  @IsDateString({ strict: true })
  receiptDate?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(MERCHANT_RAW_MAX_LENGTH)
  merchantRaw?: string | null;

  @IsOptional()
  @IsInt()
  @Min(0)
  totalDeclared?: number | null;

  @IsOptional()
  @IsIn(UPDATABLE_GROUP_STATUSES)
  status?: UpdatableGroupStatus;
}
