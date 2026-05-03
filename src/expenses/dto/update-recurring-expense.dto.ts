import { Type } from 'class-transformer';
import {
  IsDateString,
  IsOptional,
  IsUUID,
  ValidateNested,
} from 'class-validator';
import { CreateExpenseDto } from './create-expense.dto.js';

export class UpdateRecurringExpenseDto {
  @IsUUID()
  p_old_expense_id!: string;

  @IsOptional()
  @IsDateString()
  p_cutoff_date!: string;

  @ValidateNested()
  @Type(() => CreateExpenseDto)
  p_new_expense!: CreateExpenseDto;
}
