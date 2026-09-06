import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { RECEIPT_PRODUCT_CATEGORIES } from '../../receipt.constants.js';
import type { ReceiptProductCategory } from '../../receipt.constants.js';

const DESCRIPTION_RAW_MAX_LENGTH = 300;
const MAX_ITEMS_PER_GROUP = 300;

export class ReplaceItemDto {
  @IsString()
  @MaxLength(DESCRIPTION_RAW_MAX_LENGTH)
  descriptionRaw!: string;

  @IsIn(RECEIPT_PRODUCT_CATEGORIES)
  category!: ReceiptProductCategory;

  @IsOptional()
  @IsNumber()
  @Min(0)
  qty?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  unitPrice?: number;

  @IsInt()
  @Min(0)
  amount!: number;

  @IsOptional()
  @IsUUID()
  productId?: string;
}

export class ReplaceItemsDto {
  @IsArray()
  @ArrayMaxSize(MAX_ITEMS_PER_GROUP)
  @ValidateNested({ each: true })
  @Type(() => ReplaceItemDto)
  items!: ReplaceItemDto[];
}
