import {
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Min,
  ValidateIf,
} from 'class-validator';

export enum BudgetType {
  JOINT = 'joint',
  INDIVIDUAL = 'individual',
}

export class CreateBudgetDto {
  @IsOptional()
  @IsUUID()
  id?: string;

  @IsString()
  name!: string;

  @IsEnum(BudgetType)
  type!: BudgetType;

  @IsOptional()
  @IsNumber()
  @Min(0)
  limit?: number;

  @ValidateIf((o: CreateBudgetDto) => o.type === BudgetType.INDIVIDUAL)
  @IsUUID()
  user_id?: string;

  @IsOptional()
  @IsString()
  associated_card?: string;

  @IsOptional()
  @IsString()
  default_split_method?: string;
}
