import { IsNotEmpty, IsString } from 'class-validator';

export class RefreshDto {
  @IsString({ message: 'El refresh_token debe ser un texto' })
  @IsNotEmpty({ message: 'El refresh_token es requerido' })
  refresh_token!: string;
}
