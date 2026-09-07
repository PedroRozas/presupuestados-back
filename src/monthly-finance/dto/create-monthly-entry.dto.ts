import { IsInt, IsNumber, IsOptional, IsString, IsUUID, Max, Min } from 'class-validator'

export class CreateMonthlyEntryDto {
  @IsUUID()
  user_id!: string

  @IsNumber()
  @Min(0)
  amount!: number

  @IsOptional()
  @IsString()
  description?: string

  @IsInt()
  @Min(1)
  @Max(12)
  month!: number

  @IsInt()
  year!: number
}
