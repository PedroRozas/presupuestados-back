import { IsEmail, IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class InitializeUserDto {
  @IsEmail({}, { message: 'El correo electrónico no es válido' })
  @IsNotEmpty({ message: 'El correo electrónico es requerido' })
  p_email!: string;

  @IsString({ message: 'El nombre completo debe ser un texto' })
  @IsNotEmpty({ message: 'El nombre completo es requerido' })
  p_full_name!: string;

  @IsString({ message: 'El código de invitación debe ser un texto' })
  @IsOptional()
  p_invite_code?: string;
}
