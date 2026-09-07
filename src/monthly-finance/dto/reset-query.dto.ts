import { Type } from 'class-transformer'
import { IsIn, IsInt, IsOptional, Max, Min } from 'class-validator'

export class ResetQueryDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(12)
  month!: number

  @Type(() => Number)
  @IsInt()
  year!: number

  @IsOptional()
  @IsIn(['incomes', 'deductions', 'both'])
  type?: 'incomes' | 'deductions' | 'both'
}
