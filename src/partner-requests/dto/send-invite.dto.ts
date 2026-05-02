import { IsEmail, IsNotEmpty } from 'class-validator';

export class SendInviteDto {
  @IsEmail({}, { message: 'El email del receptor no es válido' })
  @IsNotEmpty({ message: 'El email del receptor no puede estar vacío' })
  receiver_email!: string;
}
