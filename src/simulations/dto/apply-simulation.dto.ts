import { Type } from 'class-transformer';
import {
  IsArray,
  IsDateString,
  IsUUID,
  ValidateNested,
} from 'class-validator';
import { CreateIncomeDto } from '../../incomes/dto/create-income.dto.js';
import { CreateDeductionDto } from '../../deductions/dto/create-deduction.dto.js';
import { CreateBudgetDto } from '../../budgets/dto/create-budget.dto.js';
import { CreateExpenseDto } from '../../expenses/dto/create-expense.dto.js';

class IncomeChangesDto {
  @ValidateNested({ each: true })
  @Type(() => CreateIncomeDto)
  created!: CreateIncomeDto[];

  @ValidateNested({ each: true })
  @Type(() => CreateIncomeDto)
  updated!: CreateIncomeDto[];

  @IsArray()
  @IsUUID(undefined, { each: true })
  deletedIds!: string[];
}

class DeductionChangesDto {
  @ValidateNested({ each: true })
  @Type(() => CreateDeductionDto)
  created!: CreateDeductionDto[];

  @ValidateNested({ each: true })
  @Type(() => CreateDeductionDto)
  updated!: CreateDeductionDto[];

  @IsArray()
  @IsUUID(undefined, { each: true })
  deletedIds!: string[];
}

class BudgetChangesDto {
  @ValidateNested({ each: true })
  @Type(() => CreateBudgetDto)
  created!: CreateBudgetDto[];

  @ValidateNested({ each: true })
  @Type(() => CreateBudgetDto)
  updated!: CreateBudgetDto[];

  @IsArray()
  @IsUUID(undefined, { each: true })
  deletedIds!: string[];
}

class ExpenseSplitDto {
  @IsUUID()
  p_old_expense_id!: string;

  @ValidateNested()
  @Type(() => CreateExpenseDto)
  p_new_expense!: CreateExpenseDto;
}

class ExpenseStopDto {
  @IsUUID()
  p_expense_id!: string;

  @IsDateString()
  p_end_date!: string;
}

class ExpenseChangesDto {
  @ValidateNested({ each: true })
  @Type(() => CreateExpenseDto)
  created!: CreateExpenseDto[];

  @ValidateNested({ each: true })
  @Type(() => CreateExpenseDto)
  updated!: CreateExpenseDto[];

  @ValidateNested({ each: true })
  @Type(() => ExpenseSplitDto)
  split!: ExpenseSplitDto[];

  @IsArray()
  @IsUUID(undefined, { each: true })
  deletedIds!: string[];

  @ValidateNested({ each: true })
  @Type(() => ExpenseStopDto)
  stopped!: ExpenseStopDto[];
}

export class ApplySimulationDto {
  @ValidateNested()
  @Type(() => IncomeChangesDto)
  incomes!: IncomeChangesDto;

  @ValidateNested()
  @Type(() => DeductionChangesDto)
  deductions!: DeductionChangesDto;

  @ValidateNested()
  @Type(() => BudgetChangesDto)
  budgets!: BudgetChangesDto;

  @ValidateNested()
  @Type(() => ExpenseChangesDto)
  expenses!: ExpenseChangesDto;
}

export {
  IncomeChangesDto,
  DeductionChangesDto,
  BudgetChangesDto,
  ExpenseChangesDto,
  ExpenseSplitDto,
  ExpenseStopDto,
};
