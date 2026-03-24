import { IsDateString, IsUUID } from 'class-validator';

export class StopRecurringExpenseDto {
  @IsUUID()
  p_expense_id!: string;

  @IsDateString()
  p_end_date!: string;
}
