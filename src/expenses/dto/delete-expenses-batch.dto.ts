import { IsArray, IsUUID } from 'class-validator';

export class DeleteExpensesBatchDto {
  @IsArray()
  @IsUUID(undefined, { each: true })
  p_expense_ids!: string[];
}
