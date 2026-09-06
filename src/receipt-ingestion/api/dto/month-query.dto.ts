import { Type } from 'class-transformer';
import { IsInt, Max, Min } from 'class-validator';

const MIN_YEAR = 2000;
const MAX_YEAR = 2100;

export class MonthQueryDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(12)
  month!: number;

  @Type(() => Number)
  @IsInt()
  @Min(MIN_YEAR)
  @Max(MAX_YEAR)
  year!: number;
}
