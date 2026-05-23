import { IsString, MinLength } from 'class-validator';

export class UpdatePasswordDto {
  @IsString({ message: 'La contraseña actual debe ser un texto' })
  @MinLength(1, { message: 'La contraseña actual es requerida' })
  current_password!: string;

  @IsString({ message: 'La nueva contraseña debe ser un texto' })
  @MinLength(12, {
    message: 'La nueva contraseña debe tener al menos 12 caracteres',
  })
  new_password!: string;
}
