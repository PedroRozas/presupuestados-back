import { IsString, MinLength } from 'class-validator';

export class ResetPasswordDto {
  @IsString({ message: 'El access token debe ser un texto' })
  @MinLength(10, { message: 'El access token es requerido' })
  access_token!: string;

  @IsString({ message: 'La nueva contraseña debe ser un texto' })
  @MinLength(12, {
    message: 'La nueva contraseña debe tener al menos 12 caracteres',
  })
  new_password!: string;
}
