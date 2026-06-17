import { IsIn, IsInt, IsOptional, Max, Min } from 'class-validator'

export class PersonalizeDto {
  @IsInt()
  @Min(1)
  @Max(12)
  month!: number

  @IsInt()
  year!: number

  @IsOptional()
  @IsIn(['incomes', 'deductions', 'both'])
  type?: 'incomes' | 'deductions' | 'both'
}
