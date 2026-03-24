import {
  IsString,
  IsNumber,
  IsBoolean,
  IsOptional,
  IsDateString,
  IsUUID,
} from 'class-validator';

export class CreateExpenseDto {
  @IsUUID()
  p_expense_id!: string;

  @IsNumber()
  p_amount!: number;

  @IsOptional()
  @IsUUID()
  p_assigned_user_id?: string;

  @IsOptional()
  @IsString()
  p_batch_id?: string;

  @IsOptional()
  @IsString()
  p_batch_name?: string;

  @IsOptional()
  @IsString()
  p_budget_id?: string;

  @IsOptional()
  @IsNumber()
  p_category_id?: number;

  @IsDateString()
  p_date!: string;

  @IsString()
  p_description!: string;

  @IsOptional()
  @IsBoolean()
  p_is_credit?: boolean;

  @IsOptional()
  @IsBoolean()
  p_is_recurring?: boolean;

  @IsUUID()
  p_paid_by!: string;

  @IsOptional()
  @IsDateString()
  p_recurrence_end_date?: string;

  @IsOptional()
  @IsString()
  p_recurrence_interval?: string;

  @IsString()
  p_split_method!: string;
}
