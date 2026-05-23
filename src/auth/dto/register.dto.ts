import {
  IsEmail,
  IsNotEmpty,
  IsOptional,
  IsString,
  MinLength,
} from 'class-validator';

export class RegisterDto {
  @IsEmail({}, { message: 'El correo electrónico no es válido' })
  @IsNotEmpty({ message: 'El correo electrónico es requerido' })
  email!: string;

  @IsString({ message: 'La contraseña debe ser un texto' })
  @MinLength(12, { message: 'La contraseña debe tener al menos 12 caracteres' })
  @IsNotEmpty({ message: 'La contraseña es requerida' })
  password!: string;

  @IsString({ message: 'El nombre completo debe ser un texto' })
  @IsNotEmpty({ message: 'El nombre completo es requerido' })
  full_name!: string;

  @IsString({ message: 'El código de invitación debe ser un texto' })
  @IsOptional()
  invite_code?: string;
}
