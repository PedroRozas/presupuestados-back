import { IsNumber, IsOptional, IsString, IsUUID, Min } from 'class-validator';

export class CreateIncomeDto {
  @IsOptional()
  @IsUUID()
  id?: string;

  @IsUUID()
  user_id!: string;

  @IsNumber()
  @Min(0)
  amount!: number;

  @IsOptional()
  @IsString()
  description?: string;

  @IsString()
  date!: string;
}
