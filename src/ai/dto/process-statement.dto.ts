import { IsOptional, IsString, IsUUID } from 'class-validator';

export class ProcessStatementDto {
  @IsOptional()
  @IsString()
  batch_name?: string;

  @IsOptional()
  @IsString()
  target_date?: string;

  @IsOptional()
  @IsUUID()
  paid_by?: string;

  @IsOptional()
  @IsUUID()
  assigned_user_id?: string;
}
